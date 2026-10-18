import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/**
 * Vue 前端冒烟：起已构建的共享后端 + 本前端产物，走真实浏览器断言。
 * 断言集合与 React / Vanilla 两端一致（见 examples/README.md 的对等矩阵）。
 *
 * 前置（需先构建）：
 *   pnpm --filter @base-screen-example/shared-backend build
 *   pnpm --filter @base-screen-example/vue-host build
 *
 * 数据库使用独立的 smoke-vue.db：每次先删文件再跑 migrate deploy，避免
 * 「本地旧库导致新种子永远不出现」以及干净检出时缺表的假失败。
 */

const ROOT = resolve(import.meta.dirname, '../../../');
const APP_DIR = resolve(ROOT, 'examples/vue-host');
const BACKEND_DIR = resolve(ROOT, 'examples/shared-backend');
const BACKEND_ENTRY = resolve(BACKEND_DIR, 'dist/main.js');
const PRISMA_CLI = resolve(BACKEND_DIR, 'node_modules/prisma/build/index.js');
const FRONTEND_DIST = resolve(APP_DIR, 'dist');
const SMOKE_DB = resolve(BACKEND_DIR, 'data/smoke-vue.db');
const SMOKE_DATABASE_URL = 'file:../data/smoke-vue.db';
const BACKEND_PORT = 3210;
const PREVIEW_PORT = 3221;
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}/api`;

function fail(message) {
  throw new Error(`HOST_APP_VUE_SMOKE_FAILED: ${message}`);
}

function requireArtifacts() {
  if (!existsSync(BACKEND_ENTRY)) {
    fail(
      `缺少后端构建产物 ${BACKEND_ENTRY}；请先执行 pnpm --filter @base-screen-example/shared-backend build`,
    );
  }
  if (!existsSync(FRONTEND_DIST)) {
    fail(
      `缺少前端构建产物 ${FRONTEND_DIST}；请先执行 pnpm --filter @base-screen-example/vue-host build`,
    );
  }
  if (!existsSync(PRISMA_CLI)) {
    fail(`缺少 Prisma CLI ${PRISMA_CLI}；请先在仓库根执行 pnpm install`);
  }
}

function prepareDatabase() {
  rmSync(SMOKE_DB, { force: true });
  rmSync(`${SMOKE_DB}-journal`, { force: true });
  const migrated = spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: SMOKE_DATABASE_URL },
    stdio: 'inherit',
  });
  if (migrated.status !== 0) fail(`smoke 数据库迁移失败（exit ${migrated.status}）`);
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

async function openEditor(page, name) {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.locator('.screen-card', { hasText: name }).getByText('编辑').click();
  await page.waitForFunction(
    () => {
      const designer = document.querySelector('base-screen-designer');
      return designer !== null && (designer.document?.components.length ?? 0) > 0;
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function main() {
  requireArtifacts();
  prepareDatabase();

  const backend = spawn(process.execPath, [BACKEND_ENTRY], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(BACKEND_PORT), DATABASE_URL: SMOKE_DATABASE_URL },
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

    // 1) 列表页渲染两条种子大屏。
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () =>
        document.body.textContent?.includes('默认销售大屏') === true &&
        document.body.textContent?.includes('系统监控大屏') === true,
      undefined,
      { timeout: 20_000 },
    );
    const cards = await page.locator('.screen-card').count();
    if (cards < 2) fail(`列表至少应渲染 2 条种子大屏，实际 ${cards}`);

    // 2) DataV 成品大屏：插件元素全部注册，文档含 40+ 组件。
    await openEditor(page, '默认销售大屏');
    const dataVState = await page.evaluate(() => {
      const designer = document.querySelector('base-screen-designer');
      const root = designer?.shadowRoot ?? null;
      const tag = (name) => customElements.get(name) !== undefined;
      return {
        components: designer?.document?.components.length ?? 0,
        tags: {
          designer: tag('base-screen-designer'),
          borderBox: tag('base-screen-datav-border-box'),
          digitalFlop: tag('base-screen-datav-digital-flop'),
          waterLevel: tag('base-screen-datav-water-level'),
          scrollBoard: tag('base-screen-datav-scroll-board'),
          capsule: tag('base-screen-datav-capsule-progress'),
          marquee: tag('base-screen-datav-marquee'),
          echarts: tag('base-screen-plugin-echarts'),
        },
        rendered: {
          flops: root?.querySelectorAll('base-screen-datav-digital-flop').length ?? 0,
          charts: root?.querySelectorAll('base-screen-plugin-echarts').length ?? 0,
          capsules: root?.querySelectorAll('base-screen-datav-capsule-progress').length ?? 0,
        },
      };
    });
    if (dataVState.components < 40) {
      fail(`DataV 种子应有 40+ 组件，实际 ${dataVState.components}`);
    }
    const missingTag = Object.entries(dataVState.tags).find(([, defined]) => !defined);
    if (missingTag !== undefined) fail(`插件/设计器元素未注册：${missingTag[0]}`);
    if (dataVState.rendered.flops !== 4)
      fail(`应渲染 4 个翻牌器，实际 ${dataVState.rendered.flops}`);
    if (dataVState.rendered.charts !== 3)
      fail(`应渲染 3 个图表，实际 ${dataVState.rendered.charts}`);
    if (dataVState.rendered.capsules !== 3) {
      fail(`应渲染 3 个胶囊进度，实际 ${dataVState.rendered.capsules}`);
    }

    // 3) 数据绑定端到端：翻牌器拿到后端数值，ECharts 在 shadow 内画出 canvas。
    await page.waitForFunction(
      () => {
        const designer = document.querySelector('base-screen-designer');
        const root = designer?.shadowRoot ?? null;
        const flops = [...(root?.querySelectorAll('base-screen-datav-digital-flop') ?? [])];
        return flops.length === 4 && flops.every((item) => /\d/.test(item.textContent ?? ''));
      },
      undefined,
      { timeout: 20_000 },
    );
    const chartCanvases = await page.evaluate(() => {
      const designer = document.querySelector('base-screen-designer');
      const root = designer?.shadowRoot ?? null;
      return [...(root?.querySelectorAll('base-screen-plugin-echarts') ?? [])].map(
        (item) => item.querySelectorAll('canvas').length,
      );
    });
    if (chartCanvases.length !== 3 || chartCanvases.some((count) => count === 0)) {
      fail(`ECharts 图表未画出 canvas：${JSON.stringify(chartCanvases)}`);
    }

    // 4) 旧卡片文档仍可用：host-app.metric-value 经 demo_metric 渲染出数字。
    await openEditor(page, '系统监控大屏');
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

    // 5) 查看页：DataV 文档完整渲染，frame 按视口等比缩放且不溢出。
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.locator('.screen-card', { hasText: '默认销售大屏' }).getByText('查看').click();
    await page.waitForFunction(
      () => {
        const viewer = document.querySelector('base-screen-viewer');
        const text = viewer?.shadowRoot?.textContent ?? '';
        return text.includes('区域销售运营中心');
      },
      undefined,
      { timeout: 20_000 },
    );
    const fit = await page.evaluate(() => {
      const frame = document.querySelector('.viewer-stage__frame');
      const rect = frame?.getBoundingClientRect();
      return {
        transform: frame?.style.transform ?? '',
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        boards:
          document
            .querySelector('base-screen-viewer')
            ?.shadowRoot?.querySelectorAll('base-screen-datav-scroll-board').length ?? 0,
      };
    });
    if (!fit.transform.includes('scale(')) fail(`查看器未应用缩放：${fit.transform}`);
    if (fit.width > fit.viewportWidth + 1 || fit.height > fit.viewportHeight + 1) {
      fail(`缩放后的舞台溢出视口：${JSON.stringify(fit)}`);
    }
    if (fit.boards !== 1) fail(`查看器应渲染 1 个轮播列表，实际 ${fit.boards}`);

    // 6) 指标与排行接口确定性。
    const deterministic = await page.evaluate(async (apiBase) => {
      const first = await fetch(`${apiBase}/metrics/series?metric=sales_total&points=3`);
      const second = await fetch(`${apiBase}/metrics/series?metric=sales_total&points=3`);
      const rankFirst = await fetch(`${apiBase}/metrics/ranking?dimension=region&limit=4`);
      const rankSecond = await fetch(`${apiBase}/metrics/ranking?dimension=region&limit=4`);
      return (
        (await first.text()) === (await second.text()) &&
        (await rankFirst.text()) === (await rankSecond.text())
      );
    }, API_BASE);
    if (!deterministic) fail('指标/排行接口不满足确定性');

    if (pageErrors.length > 0) fail(`页面存在未捕获错误：${JSON.stringify(pageErrors)}`);
    console.log(
      'Vue 前端冒烟通过：列表 / DataV 编辑 / 插件物料 / 数据绑定 / 缩放查看器 / 指标与排行确定性。',
    );
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
