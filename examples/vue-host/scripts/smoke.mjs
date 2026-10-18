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

    // 7) 生产监控大屏：数据层六条断言（三端同构，口径见 examples/README.md「数据层接入」）。
    const monitorList = await fetch(`${API_BASE}/screens`).then((response) => response.json());
    const monitorScreen = monitorList.screens.find((item) => item.name === '生产监控大屏');
    if (monitorScreen === undefined) fail('种子列表里没有「生产监控大屏」');

    const datasetQueries = [];
    const openMonitor = async (query) => {
      const target = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      target.on('pageerror', (error) => pageErrors.push(`monitor:${query}: ${error.message}`));
      target.on('request', (request) => {
        const requestUrl = request.url();
        if (requestUrl.includes('/api/datasets/') && requestUrl.includes('/query')) {
          datasetQueries.push(requestUrl);
        }
      });
      await target.addInitScript((apiBaseUrl) => {
        window.__HOST_APP_CONFIG__ = { apiBaseUrl };
      }, API_BASE);
      await target.goto(`${url}#/screens/${monitorScreen.id}/view?${query}`, {
        waitUntil: 'domcontentloaded',
      });
      return target;
    };
    const readMonitorDom = (target) =>
      target.evaluate(() => {
        const root = document.querySelector('base-screen-viewer')?.shadowRoot ?? null;
        const legend = root?.querySelector('[data-datav-status-legend] [data-state="fault"]');
        const board = root?.querySelector('[data-datav-board-viewport]');
        return {
          tiles: root?.querySelectorAll('[data-datav-status-tile]').length ?? 0,
          faultLegend: legend?.getAttribute('data-count') ?? null,
          nodes: root?.querySelectorAll('[data-datav-pipeline-node]').length ?? 0,
          connectors: root?.querySelectorAll('[data-datav-pipeline-connector]').length ?? 0,
          boardRows: root?.querySelectorAll('[data-datav-board-row]').length ?? 0,
          visibleRows: board?.getAttribute('data-datav-board-visible-rows') ?? null,
          emptyNodes: root?.querySelectorAll('[data-datav-status-empty]').length ?? 0,
          badges: root?.querySelectorAll('[data-datav-degraded-badge]').length ?? 0,
          chip: document.querySelector('[data-viewer-status]')?.textContent ?? '',
          host: window.__baseScreenHost?.status() ?? null,
        };
      });
    const waitTiles = (target, count) =>
      target.waitForFunction(
        (expected) =>
          (document
            .querySelector('base-screen-viewer')
            ?.shadowRoot?.querySelectorAll('[data-datav-status-tile]').length ?? 0) === expected,
        count,
        { timeout: 30_000 },
      );

    // A. 首屏：48 格 / 图例故障 3 / 工序 6 节点 5 连线 / 告警可见 8 行 / 在线
    const first = await openMonitor('smoke=1');
    await waitTiles(first, 48);
    await first.waitForTimeout(1200);
    const firstState = await readMonitorDom(first);
    if (firstState.tiles !== 48) fail(`首屏灯阵应 48 格，实际 ${firstState.tiles}`);
    if (firstState.faultLegend !== '3') fail(`图例故障数应 3，实际 ${firstState.faultLegend}`);
    if (firstState.nodes !== 6) fail(`工序节点应 6，实际 ${firstState.nodes}`);
    if (firstState.connectors !== 5) fail(`连接线应 5，实际 ${firstState.connectors}`);
    if (firstState.visibleRows !== '8') fail(`告警可见行应 8，实际 ${firstState.visibleRows}`);
    if (firstState.boardRows < 8) fail(`告警行数应 ≥8，实际 ${firstState.boardRows}`);
    if (!firstState.chip.includes('在线')) fail(`首屏 chip 不是在线：${firstState.chip}`);
    if (firstState.badges !== 0) fail(`首屏不应出现降级角标，实际 ${firstState.badges}`);
    if (firstState.host === null || firstState.host.failures !== 0) {
      fail(`首屏 status().failures 应为 0：${JSON.stringify(firstState.host)}`);
    }
    await first.close();

    // B. URL 播种：?line=LINE-B → 36 格 / 1 台故障，且数据集 query 串带 line=LINE-B
    const seededFrom = datasetQueries.length;
    const seededPage = await openMonitor('line=LINE-B&smoke=1');
    await waitTiles(seededPage, 36);
    await seededPage.waitForTimeout(1200);
    const seededState = await readMonitorDom(seededPage);
    const seededQueries = datasetQueries.slice(seededFrom);
    if (seededState.tiles !== 36) fail(`LINE-B 灯阵应 36 格，实际 ${seededState.tiles}`);
    if (seededState.faultLegend !== '1') fail(`LINE-B 故障数应 1，实际 ${seededState.faultLegend}`);
    const seededLineQueries = seededQueries.filter((item) => item.includes('line=LINE-B'));
    if (seededLineQueries.length < 3) {
      fail(
        `LINE-B 应产生 ≥3 条带 line=LINE-B 的 query，实际 ${seededLineQueries.length}/${seededQueries.length}`,
      );
    }
    await seededPage.close();

    // C. 变量联动：点产线选择器第 2 行 → 蓝图 set-variable(line) → 灯阵变 36 格
    const clickFrom = datasetQueries.length;
    const clickPage = await openMonitor('smoke=1');
    await waitTiles(clickPage, 48);
    await clickPage
      .locator('base-screen-datav-scroll-board', { hasText: 'B 线·焊装' })
      .locator('[data-datav-board-row]', { hasText: 'B 线·焊装' })
      .click();
    await waitTiles(clickPage, 36);
    await clickPage.waitForTimeout(1200);
    const clickQueries = datasetQueries
      .slice(clickFrom)
      .filter((item) => item.includes('line=LINE-B'));
    if (clickQueries.length === 0) {
      fail('点击产线选择器后没有出现带 line=LINE-B 的新 query（蓝图链路未生效）');
    }

    // D. 空结果不是失败：LINE-C → 0 格 + 空文案 + 无角标 + 仍在线
    const emptyPage = await openMonitor('line=LINE-C&smoke=1');
    await emptyPage.waitForFunction(
      () =>
        (document
          .querySelector('base-screen-viewer')
          ?.shadowRoot?.querySelectorAll('[data-datav-status-empty]').length ?? 0) === 1,
      undefined,
      { timeout: 30_000 },
    );
    await emptyPage.waitForTimeout(1200);
    const emptyState = await readMonitorDom(emptyPage);
    if (emptyState.tiles !== 0) fail(`LINE-C 应 0 格，实际 ${emptyState.tiles}`);
    if (emptyState.emptyNodes !== 1) fail('LINE-C 应出现空数据文案节点');
    if (emptyState.badges !== 0) fail(`LINE-C 不应有降级角标，实际 ${emptyState.badges}`);
    if (!emptyState.chip.includes('在线')) fail(`LINE-C chip 应仍在线：${emptyState.chip}`);
    if (emptyState.host === null || emptyState.host.failures !== 0) {
      fail('LINE-C 不应计入失败');
    }
    await emptyPage.close();

    // E. 失败保留上一帧：成功之后把 query 打成 500，再 tick 一次
    const tilesBeforeFailure = (await readMonitorDom(clickPage)).tiles;
    await clickPage.route('**/api/datasets/*/query*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INJECTED_FAILURE', message: 'injected' }),
      }),
    );
    await clickPage.evaluate(() => window.__baseScreenHost?.tickNow());
    await clickPage.waitForFunction(
      () =>
        (document
          .querySelector('base-screen-viewer')
          ?.shadowRoot?.querySelectorAll('[data-datav-degraded-badge]').length ?? 0) >= 1,
      undefined,
      { timeout: 20_000 },
    );
    await clickPage.waitForFunction(
      () => (document.querySelector('[data-viewer-status]')?.textContent ?? '').includes('离线'),
      undefined,
      { timeout: 20_000 },
    );
    const failedState = await readMonitorDom(clickPage);
    if (failedState.tiles !== tilesBeforeFailure) {
      fail(`降级后应保留上一帧 ${tilesBeforeFailure} 格，实际 ${failedState.tiles}`);
    }
    if (failedState.badges < 1) fail('降级后未出现角标');
    if (!failedState.chip.includes('离线')) fail(`降级后 chip 应显示离线：${failedState.chip}`);
    if (failedState.host === null || failedState.host.failures < 1) {
      fail('降级后 status().failures 应 > 0');
    }
    await clickPage.close();

    // F. 后台暂停：hidden 时 tick 不发请求，恢复 visible 后补一次
    const visibilityPage = await openMonitor('smoke=1');
    await waitTiles(visibilityPage, 48);
    const hiddenBefore = await visibilityPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return window.__baseScreenHost.status().requests;
    });
    await visibilityPage.evaluate(() => {
      window.__baseScreenHost.tickNow();
      window.__baseScreenHost.tickNow();
      window.__baseScreenHost.tickNow();
    });
    await visibilityPage.waitForTimeout(900);
    const hiddenAfter = await visibilityPage.evaluate(
      () => window.__baseScreenHost.status().requests,
    );
    if (hiddenAfter !== hiddenBefore) {
      fail(`hidden 期间 tick 不应产生请求（${hiddenBefore} → ${hiddenAfter}）`);
    }
    await visibilityPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await visibilityPage.waitForTimeout(1200);
    const visibleAfter = await visibilityPage.evaluate(
      () => window.__baseScreenHost.status().requests,
    );
    if (!(visibleAfter > hiddenAfter)) {
      fail(`恢复 visible 后应补一次刷新（${hiddenAfter} → ${visibleAfter}）`);
    }
    await visibilityPage.close();

    if (pageErrors.length > 0) fail(`页面存在未捕获错误：${JSON.stringify(pageErrors)}`);
    console.log(
      'Vue 前端冒烟通过：列表 / DataV 编辑 / 插件物料 / 数据绑定 / 缩放查看器 / 指标与排行确定性 / 生产监控数据层（灯阵·工序链·告警流水·变量联动·降级·暂停）。',
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
