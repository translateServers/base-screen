import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/**
 * Vanilla 前端冒烟：起已构建的共享后端 + 本前端产物，走真实浏览器断言。
 *
 * 前置（需先构建，README 有说明）：
 *   pnpm --filter @base-screen-example/host-api build
 *   pnpm --filter @base-screen-example/host-app-vanilla build
 *
 * 断言覆盖 §4.7：就绪探针、种子列表、设计器挂载、host-resource 数据绑定
 * （指标读数渲染后端数值）、查看器播放、指标确定性、无未捕获页面错误。
 */

const ROOT = resolve(import.meta.dirname, '../../../');
const APP_DIR = resolve(ROOT, 'examples/host-app-vanilla');
const BACKEND_ENTRY = resolve(ROOT, 'examples/host-api/dist/main.js');
const FRONTEND_DIST = resolve(APP_DIR, 'dist');
const BACKEND_PORT = 3210;
const PREVIEW_PORT = 3222;
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}/api`;

function fail(message) {
  throw new Error(`HOST_APP_VANILLA_SMOKE_FAILED: ${message}`);
}

function requireArtifacts() {
  if (!existsSync(BACKEND_ENTRY)) {
    fail(
      `缺少后端构建产物 ${BACKEND_ENTRY}；请先执行 pnpm --filter @base-screen-example/host-api build`,
    );
  }
  if (!existsSync(FRONTEND_DIST)) {
    fail(
      `缺少前端构建产物 ${FRONTEND_DIST}；请先执行 pnpm --filter @base-screen-example/host-app-vanilla build`,
    );
  }
}

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) return;
    } catch {
      // 后端尚未就绪，继续轮询。
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  fail('后端未在超时时间内就绪');
}

async function main() {
  requireArtifacts();

  const backend = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: resolve(ROOT, 'examples/host-api'),
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const backendLogs = [];
  backend.stdout.on('data', (chunk) => backendLogs.push(String(chunk)));
  backend.stderr.on('data', (chunk) => backendLogs.push(String(chunk)));

  const server = await preview({
    root: APP_DIR,
    preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
  });
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    backend.kill();
    await server.close();
    fail('vite preview URL missing');
  }

  const browser = await chromium.launch();
  const pageErrors = [];
  try {
    await waitForHealth();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // 运行时注入后端地址：同一产物切换后端，无需重新构建。
    await page.addInitScript((apiBaseUrl) => {
      window.__HOST_APP_CONFIG__ = { apiBaseUrl };
    }, API_BASE);

    // 1) 列表页渲染种子大屏。
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.body.textContent?.includes('默认销售大屏') === true,
      undefined,
      { timeout: 20_000 },
    );
    const cards = await page.locator('.screen-card').count();
    if (cards < 2) fail(`列表至少应渲染 2 条种子大屏，实际 ${cards}`);

    // 2) 编辑页：设计器元素注册并挂载，文档已加载。
    await page.locator('.screen-card', { hasText: '默认销售大屏' }).getByText('编辑').click();
    await page.waitForFunction(
      // 等到文档真的载入再断言：设计器节点出现在 load() 解析之前，只等节点会读到 0 个组件。
      () => {
        const designer = document.querySelector('base-screen-designer');
        return designer !== null && (designer.document?.components.length ?? 0) > 0;
      },
      undefined,
      { timeout: 20_000 },
    );
    const designerState = await page.evaluate(() => {
      const designer = document.querySelector('base-screen-designer');
      return {
        defined: customElements.get('base-screen-designer') !== undefined,
        metricDefined: customElements.get('host-app-metric-value') !== undefined,
        connected: designer?.isConnected === true,
        componentCount: designer?.document?.components.length ?? 0,
      };
    });
    if (!designerState.defined || !designerState.connected)
      fail(`设计器未就绪：${JSON.stringify(designerState)}`);
    if (!designerState.metricDefined) fail('宿主指标读数物料未注册');
    if (designerState.componentCount < 3)
      fail(`种子文档应有至少 3 个组件，实际 ${designerState.componentCount}`);

    // 3) host-resource 数据绑定端到端：指标读数渲染出后端数值（而非占位 --）。
    await page.waitForFunction(
      () => {
        const metric = document
          .querySelector('base-screen-designer')
          ?.shadowRoot?.querySelector('host-app-metric-value');
        const text = metric?.shadowRoot?.textContent ?? metric?.textContent ?? '';
        return /\d/.test(text) && !text.includes('--');
      },
      undefined,
      { timeout: 20_000 },
    );

    // 4) 指标确定性：同一路径两次响应一致。
    const deterministic = await page.evaluate(async (apiBase) => {
      const first = await fetch(`${apiBase}/metrics/series?metric=cpu_usage&points=3`);
      const second = await fetch(`${apiBase}/metrics/series?metric=cpu_usage&points=3`);
      return (await first.text()) === (await second.text());
    }, API_BASE);
    if (!deterministic) fail('指标接口不满足确定性');

    // 5) 查看页：查看器注册并渲染种子文档。
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.locator('.screen-card', { hasText: '默认销售大屏' }).getByText('查看').click();
    await page.waitForFunction(
      () => document.querySelector('base-screen-viewer') !== null,
      undefined,
      { timeout: 20_000 },
    );
    await page.waitForFunction(
      () => {
        const viewer = document.querySelector('base-screen-viewer');
        const text = viewer?.shadowRoot?.textContent ?? '';
        return text.includes('销售运营大屏');
      },
      undefined,
      { timeout: 20_000 },
    );

    if (pageErrors.length > 0) fail(`页面存在未捕获错误：${JSON.stringify(pageErrors)}`);
    console.log('Vanilla 前端冒烟通过：列表 / 设计器 / 数据绑定 / 查看器 / 指标确定性。');
  } finally {
    await browser.close();
    await server.close();
    backend.kill();
    if (backendLogs.length > 0 && process.env.SMOKE_DEBUG === '1') {
      console.log(backendLogs.join(''));
    }
  }
}

await main();
