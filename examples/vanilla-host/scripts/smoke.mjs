import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/**
 * Vanilla 前端冒烟：起已构建的共享后端 + 本前端产物，走真实浏览器断言。
 * 断言集合与 React / Vue 两端一致（见 examples/README.md 的对等矩阵）。
 *
 * 前置（需先构建）：
 *   pnpm --filter @base-screen-example/shared-backend build
 *   pnpm --filter @base-screen-example/vanilla-host build
 *
 * 数据库使用独立的 smoke-vanilla.db：每次先删文件再跑 migrate deploy，避免
 * 「本地旧库导致新种子永远不出现」以及干净检出时缺表的假失败。
 */

const ROOT = resolve(import.meta.dirname, '../../../');
const APP_DIR = resolve(ROOT, 'examples/vanilla-host');
const BACKEND_DIR = resolve(ROOT, 'examples/shared-backend');
const BACKEND_ENTRY = resolve(BACKEND_DIR, 'dist/main.js');
const PRISMA_CLI = resolve(BACKEND_DIR, 'node_modules/prisma/build/index.js');
const FRONTEND_DIST = resolve(APP_DIR, 'dist');
const SMOKE_DB = resolve(BACKEND_DIR, 'data/smoke-vanilla.db');
const SMOKE_DATABASE_URL = 'file:../data/smoke-vanilla.db';
const BACKEND_PORT = 3210;
const PREVIEW_PORT = 3222;
const API_BASE = `http://127.0.0.1:${BACKEND_PORT}/api`;

function fail(message) {
  throw new Error(`HOST_APP_VANILLA_SMOKE_FAILED: ${message}`);
}

function requireArtifacts() {
  if (!existsSync(BACKEND_ENTRY)) {
    fail(
      `缺少后端构建产物 ${BACKEND_ENTRY}；请先执行 pnpm --filter @base-screen-example/shared-backend build`,
    );
  }
  if (!existsSync(FRONTEND_DIST)) {
    fail(
      `缺少前端构建产物 ${FRONTEND_DIST}；请先执行 pnpm --filter @base-screen-example/vanilla-host build`,
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
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      DATABASE_URL: SMOKE_DATABASE_URL,
      // 故障注入默认关闭（见 datasets.controller.ts）：冒烟显式打开，E 段才有 500 可注入。
      DATASET_FAIL_INJECTION: '1',
    },
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
    const first = await openMonitor('smoke=1&poll=0');
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

    // A2. 实时告警：SSE 推送 → conditionalStylePort + refreshConditionalStyles。
    //     poll=0 关闭数据轮询，确保样式变化期间 datasetQueries 不增长。
    const readAlarmStyles = (target) =>
      target.evaluate(() => {
        const root = document.querySelector('base-screen-viewer')?.shadowRoot ?? null;
        const alarm = root?.querySelector('[data-base-screen-component-id="kpi-alarm-value"]');
        const notice = root?.querySelector('[data-base-screen-component-id="top-notice"]');
        const component = document
          .querySelector('base-screen-viewer')
          ?.document?.components.find((item) => item.id === 'kpi-alarm-value');
        return {
          alarmColor: alarm?.model?.style?.color,
          noticeColor: notice?.model?.style?.color,
          noticeWeight: notice?.model?.style?.fontWeight,
          chip: document.querySelector('[data-alarm-status]')?.dataset.alarmStatus ?? null,
          documentStyle: JSON.stringify(component?.style ?? null),
          host: window.__baseScreenHost?.alarmStatus() ?? null,
        };
      });
    const waitAlarmColor = (target, color) =>
      target.waitForFunction(
        (expected) =>
          document
            .querySelector('base-screen-viewer')
            ?.shadowRoot?.querySelector('[data-base-screen-component-id="kpi-alarm-value"]')?.model
            ?.style?.color === expected,
        color,
        { timeout: 20_000 },
      );
    const postAlarm = async (action, body) => {
      const response = await fetch(`${API_BASE}/demo/alarms/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) fail(`告警端点 ${action} 返回 ${response.status}`);
      return response.json();
    };

    await postAlarm('reset', {});
    await first.waitForFunction(
      () => document.querySelector('[data-alarm-status]')?.dataset.alarmStatus === 'live',
      undefined,
      { timeout: 20_000 },
    );
    await waitAlarmColor(first, '#fa8c16');
    const alarmWarning = await readAlarmStyles(first);
    if (alarmWarning.noticeColor !== '#fa8c16' || alarmWarning.noticeWeight !== '700') {
      fail(`告警 warning 样式未命中：${JSON.stringify(alarmWarning)}`);
    }

    const queriesBeforeAlarmPush = datasetQueries.length;
    await postAlarm('raise', { key: 'alarm.open', level: 'critical', message: '冒烟告警' });
    await waitAlarmColor(first, '#f5222d');
    const alarmCritical = await readAlarmStyles(first);
    if (alarmCritical.noticeColor !== '#f5222d' || alarmCritical.noticeWeight !== '700') {
      fail(`告警 critical 样式未命中：${JSON.stringify(alarmCritical)}`);
    }
    if (alarmCritical.documentStyle !== alarmWarning.documentStyle) {
      fail('告警样式写入了 canonical 文档');
    }
    if (datasetQueries.length !== queriesBeforeAlarmPush) {
      fail(`告警推送不应重新取数：${queriesBeforeAlarmPush} -> ${datasetQueries.length}`);
    }
    if (alarmCritical.host?.activeCount !== 1) {
      fail(`alarmStatus().activeCount 应为 1：${JSON.stringify(alarmCritical.host)}`);
    }

    await postAlarm('clear', { key: 'alarm.open' });
    await waitAlarmColor(first, '#7ff0ff');
    const alarmCleared = await readAlarmStyles(first);
    if (alarmCleared.noticeColor !== '#ffd591') {
      fail(`告警解除后 top-notice 未恢复基础样式：${JSON.stringify(alarmCleared)}`);
    }
    if (alarmCleared.documentStyle !== alarmWarning.documentStyle) {
      fail('告警解除写入了 canonical 文档');
    }
    await postAlarm('reset', {});
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

    // E. 失败保留上一帧：成功之后把 query 打成 500，再 tick 一次。
    // 断言写成**稳定态**而不是"某一瞬间出现离线"：chip 由 1s 节拍刷新，B1 修好后
    // 只要仍有组件失败就一直是离线；连续两次采样都为离线才算成立（避免抓瞬时窗口）。
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
    const chipSamples = [];
    // chip 由 1s 节拍刷新：先等它反映失败（最多 5s），再连续两次采样确认不是瞬时闪现。
    await clickPage.waitForFunction(
      () => (document.querySelector('[data-viewer-status]')?.textContent ?? '').includes('离线'),
      undefined,
      { timeout: 5000 },
    );
    for (let index = 0; index < 2; index += 1) {
      chipSamples.push(
        await clickPage.evaluate(
          () => document.querySelector('[data-viewer-status]')?.textContent ?? '',
        ),
      );
      await clickPage.waitForTimeout(300);
    }
    const failedState = await readMonitorDom(clickPage);
    if (chipSamples.some((sample) => !sample.includes('离线'))) {
      fail(`失败态 chip 两次采样都应显示离线：${JSON.stringify(chipSamples)}`);
    }
    if (failedState.tiles !== tilesBeforeFailure) {
      fail(`降级后应保留上一帧 ${tilesBeforeFailure} 格，实际 ${failedState.tiles}`);
    }
    if (failedState.badges < 1) fail('降级后未出现角标');
    if (failedState.host === null || failedState.host.failedComponents.length < 1) {
      fail(`status().failedComponents 应 ≥1：${JSON.stringify(failedState.host)}`);
    }
    if (failedState.host.failures < 1) fail('降级后 status().failures 应 > 0');
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

    // ===================== G–L：数据源后台管理（A25–A36） =====================
    //
    // 纪律：**用 API 造数据、用 UI 断言**。深层数据源面板（设计器里的树）不进 smoke，
    // 那部分由根测试 A37/A39 用真实响应样例覆盖；这里只走"人真的会点的那几步"。
    // 每个断言都带段号，失败信息写清期望与实际。

    const dsFetch = async (path, init = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        ...(init.body === undefined ? {} : { headers: { 'content-type': 'application/json' } }),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    };

    // 以「生产监控大屏」为模板：它的文档 53 个组件全部可渲染。手工拼"最小文档"会被
    // canonical 解析器拒掉（实测 viewer 渲染 0 组件），所以克隆后只改数据源绑定。
    const dsTemplates = (await dsFetch('/screens')).body.screens;
    const dsTemplate = dsTemplates.find((item) => item.name === '生产监控大屏');
    if (dsTemplate === undefined) fail('G: 缺少「生产监控大屏」模板屏');
    const dsTemplateDocument = (await dsFetch(`/screens/${dsTemplate.id}`)).body.screen.document;

    /** 把模板里的状态灯阵改绑到指定数据源（模板里恰好有 1 个）。 */
    const dsPatchGrid = (document, datasetId, fields, params) => {
      let patched = 0;
      for (const component of document.components) {
        if (component.dataSource?.datasetId !== 'monitor.devices') continue;
        component.dataSource = {
          type: 'dataset',
          datasetId,
          params,
          binding: { fields: { items: fields } },
        };
        patched += 1;
      }
      if (patched !== 1) fail(`模板里应恰好 1 个状态灯阵，实际 ${patched}`);
    };

    const dsScreens = [];
    const dsMakeScreen = async (name, patch) => {
      const created = await dsFetch('/screens', { method: 'POST', body: JSON.stringify({ name }) });
      if (created.status !== 201) fail(`造屏失败（${name}）：HTTP ${created.status}`);
      const screen = created.body.screen;
      dsScreens.push(screen.id);
      const document = JSON.parse(JSON.stringify(dsTemplateDocument));
      patch(document);
      const updated = await dsFetch(`/screens/${screen.id}`, {
        method: 'PUT',
        body: JSON.stringify({ document, revision: screen.revision }),
      });
      if (updated.status !== 200) {
        fail(`写屏失败（${name}）：HTTP ${updated.status} ${JSON.stringify(updated.body)}`);
      }
      return screen.id;
    };

    const dsOpenView = async (screenId) => {
      const target = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      target.on('pageerror', (error) => pageErrors.push(`ds-view:${screenId}: ${error.message}`));
      await target.addInitScript((apiBaseUrl) => {
        window.__HOST_APP_CONFIG__ = { apiBaseUrl };
      }, API_BASE);
      await target.goto(`${url}#/screens/${screenId}/view`, { waitUntil: 'domcontentloaded' });
      return target;
    };
    const dsReadViewer = (target) =>
      target.evaluate(() => {
        const root = document.querySelector('base-screen-viewer')?.shadowRoot ?? null;
        return {
          tiles: root?.querySelectorAll('[data-datav-status-tile]').length ?? 0,
          badges: root?.querySelectorAll('[data-datav-degraded-badge]').length ?? 0,
          empty: root?.querySelectorAll('[data-datav-status-empty]').length ?? 0,
          text: root?.textContent ?? '',
        };
      });
    const dsWaitTiles = (target, count) =>
      target.waitForFunction(
        (expected) =>
          (document
            .querySelector('base-screen-viewer')
            ?.shadowRoot?.querySelectorAll('[data-datav-status-tile]').length ?? 0) === expected,
        count,
        { timeout: 30_000 },
      );

    const dsGotoList = async () => {
      await page.evaluate(() => {
        window.location.hash = '#/datasources';
      });
      await page.waitForSelector('[data-ds-row]', { timeout: 25_000 });
      // 已经在列表页时改 hash 不会触发重渲染（三端都是 hash 路由）：显式点一次「刷新」，
      // 否则"用 API 造完数据再看列表"会一直看到旧快照。
      const refresh = page.locator('.ds-toolbar button', { hasText: '刷新' });
      if ((await refresh.count()) > 0) {
        await refresh.first().click();
        await page.waitForTimeout(400);
      }
    };
    /** 等列表行数；超时时把实际行数与页面文案带进错误，便于定位（不要只报 timeout）。 */
    const dsWaitRows = async (count) => {
      try {
        await page.waitForFunction(
          (expected) => document.querySelectorAll('[data-ds-row]').length === expected,
          count,
          { timeout: 20_000 },
        );
      } catch {
        const actual = await page.locator('[data-ds-row]').count();
        const text = await page.evaluate(() => document.body.innerText.slice(0, 160));
        fail(`列表应有 ${count} 行，实际 ${actual}；页面文案：${text.replace(/\s+/g, ' ')}`);
      }
    };
    /** 等抽屉里的预览表格出现；超时时把抽屉内的错误文案带进消息（不要只报 timeout）。 */
    const dsWaitPreviewRows = async (expectedRowCount, label) => {
      try {
        await page.waitForSelector('[data-ds-preview] table tbody tr', { timeout: 25_000 });
        const actual = await page.locator('[data-ds-preview] table tbody tr').count();
        if (expectedRowCount !== undefined && actual !== expectedRowCount) {
          fail(`${label}: 预览应 ${expectedRowCount} 行，实际 ${actual}`);
        }
        return actual;
      } catch (error) {
        const errorText = await page
          .locator('[data-ds-form-error], [data-ds-preview]')
          .first()
          .innerText()
          .catch(() => '(读不到)');
        fail(
          `${label}: 预览没有出表；抽屉内文案：${String(errorText).replace(/\s+/g, ' ').slice(0, 160)}`,
        );
      }
    };

    const dsRow = (datasetId) => page.locator(`[data-ds-row][data-dataset-id="${datasetId}"]`);
    const dsOpenDrawer = async (datasetId, action = 'edit') => {
      await dsRow(datasetId).locator(`[data-ds-action="${action}"]`).click();
      await page.waitForSelector('[data-ds-form]', { timeout: 15_000 });
      await page.waitForSelector('[data-ds-field="name"]', { timeout: 20_000 });
    };
    const dsCloseDrawer = async () => {
      const form = page.locator('[data-ds-form]');
      if ((await form.count()) === 0) return;
      await form.locator('button', { hasText: '关闭' }).first().click();
      await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 15_000 });
    };

    // ---------- G. 台账列表与筛选（A25 / A26 / A27 / A34） ----------
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.waitForSelector('.shell__tab', { timeout: 20_000 });
    await page.locator('.shell__tab', { hasText: '数据源' }).click();
    await page.waitForFunction(() => window.location.hash === '#/datasources', undefined, {
      timeout: 10_000,
    });
    await page.waitForSelector('[data-ds-row]', { timeout: 25_000 });
    const activeTab = (await page.locator('.shell__tab[aria-current="page"]').innerText()).trim();
    if (activeTab !== '数据源') fail(`G: 顶栏高亮应为「数据源」，实际「${activeTab}」`);

    await page.locator('.shell__tab', { hasText: '大屏' }).click();
    await page.waitForFunction(() => window.location.hash === '#/', undefined, { timeout: 10_000 });
    // 等列表页真的渲染完再跳走：连续两次导航会让 hash 路由出现并发渲染
    await page.waitForSelector('.screen-card', { timeout: 25_000 });
    // 直接访问可达（不经过点击）
    await page.goto(`${url}#/datasources`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-ds-row]', { timeout: 25_000 });
    await dsWaitRows(9);
    const dsColumns = await page.locator('.ds-table thead th').count();
    if (dsColumns !== 7) fail(`G: 表头应 7 列，实际 ${dsColumns}`);

    const pressSeed = dsRow('custom.example-press');
    const pressSeedStatus = await pressSeed.getAttribute('data-status');
    if (pressSeedStatus !== 'draft') {
      fail(`G: 播种 REST 状态应为 draft，实际 ${pressSeedStatus}`);
    }
    const pressSeedBadge = (await pressSeed.locator('.ds-badge').innerText()).trim();
    if (pressSeedBadge !== '草稿') fail(`G: 播种 REST 徽标应为「草稿」，实际「${pressSeedBadge}」`);
    const rosterSeedStatus = await dsRow('custom.example-roster').getAttribute('data-status');
    if (rosterSeedStatus !== 'ready') {
      fail(`G: 播种静态状态应为 ready，实际 ${rosterSeedStatus}`);
    }

    const types = await page
      .locator('[data-ds-row]')
      .evaluateAll((list) => list.map((row) => row.getAttribute('data-type')));
    const builtinTypes = types.filter((item) => item === 'builtin').length;
    if (builtinTypes !== 4) fail(`G: 内置应 4 行，实际 ${builtinTypes}`);
    if (types.slice(-4).some((item) => item !== 'builtin')) {
      fail(`G: 内置应排在末尾，实际顺序 ${types.join(',')}`);
    }
    for (const builtinId of ['monitor.devices', 'monitor.alarms']) {
      const builtinRow = dsRow(builtinId);
      for (const action of ['edit', 'delete']) {
        const count = await builtinRow.locator(`[data-ds-action="${action}"]`).count();
        if (count !== 0) fail(`G: 内置行 ${builtinId} 不应有 ${action} 按钮`);
      }
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 0) fail(`G: 页面横向溢出 ${overflow}px`);

    await page.locator('[data-ds-search]').fill('示例');
    await dsWaitRows(2);
    await page.locator('[data-ds-search]').fill('');
    await page.locator('[data-ds-filter="builtin"]').click();
    await dsWaitRows(4);
    await page.locator('[data-ds-filter="sqlite"]').click();
    await page.locator('[data-ds-search]').fill('不存在');
    await page.waitForSelector('[data-ds-empty]', { timeout: 15_000 });
    await page.locator('[data-ds-empty] button', { hasText: '清空筛选' }).click();
    await dsWaitRows(9);

    // A34：内置行「测试连接」→ 内置数据集，无需连接
    await dsRow('monitor.devices').locator('[data-ds-action="test"]').click();
    await page.waitForSelector('[data-ds-result="ok"]', { timeout: 20_000 });
    const builtinTestText = await page.locator('[data-ds-result]').first().innerText();
    if (!builtinTestText.includes('内置数据集，无需连接')) {
      fail(`G: 内置测试文案不对：${builtinTestText}`);
    }

    // ---------- H. REST 闭环（A28） ----------
    await page.locator('[data-ds-create]').click();
    await page.waitForSelector('[data-ds-form]', { timeout: 15_000 });
    await page.locator('[data-ds-field="name"]').fill('冒烟 REST');
    await page.locator('[data-ds-form] input[name="ds-type"][value="rest"]').check();
    await page.locator('[data-ds-field="url"]').fill(`${API_BASE}/demo/press`);
    await page.locator('[data-ds-test-run]').click();
    await page.waitForSelector('[data-ds-form] [data-ds-result="ok"]', { timeout: 25_000 });
    const restTestText = await page.locator('[data-ds-form] [data-ds-result]').innerText();
    if (!restTestText.includes('12 行')) fail(`H: REST 测试应 12 行：${restTestText}`);
    await page.locator('[data-ds-save]').click();
    await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 25_000 });
    await dsWaitRows(10);

    const restList = await dsFetch(`/datasources?query=${encodeURIComponent('冒烟 REST')}`);
    const restItem = restList.body.items.find((item) => item.name === '冒烟 REST');
    if (restItem === undefined) fail('H: 台账里没有「冒烟 REST」');
    if (restItem.status !== 'ready') fail(`H: 保存后应为 ready，实际 ${restItem.status}`);
    const restDetail = await dsFetch(`/datasources/${encodeURIComponent(restItem.datasetId)}`);
    const restFields = restDetail.body.fields.map((field) => field.id);
    if (restFields.join(',') !== 't,device,value') {
      fail(`H: REST 字段应为 t,device,value，实际 ${restFields.join(',')}`);
    }
    if (restDetail.body.fields.find((field) => field.id === 'value')?.valueType !== 'number') {
      fail('H: value 字段应为 number');
    }
    const catalogForRest = await dsFetch(`/datasets?query=${encodeURIComponent('冒烟')}`);
    if (catalogForRest.body.items.some((item) => item.datasetId === restItem.datasetId) === false) {
      fail('H: 设计器目录里没有「冒烟 REST」');
    }
    // A28 后半句的替代验证：用 API 造一张绑定了该数据源的屏，查看页断言真出数（12 行 = 12 格）
    const restScreenId = await dsMakeScreen('冒烟屏 · REST', (document) => {
      dsPatchGrid(document, restItem.datasetId, ['device', 'value'], {});
    });
    const restView = await dsOpenView(restScreenId);
    await dsWaitTiles(restView, 12);
    const restViewDom = await dsReadViewer(restView);
    if (!restViewDom.text.includes('生产监控')) fail('H: 查看页标题不可见');
    await restView.close();

    // ---------- I. SQLite 表模式 + SQL 模式（A29 / A30） ----------
    await dsGotoList();
    await page.locator('[data-ds-create]').click();
    await page.waitForSelector('[data-ds-form]', { timeout: 15_000 });
    await page.locator('[data-ds-field="name"]').fill('冒烟 SQLite');
    await page
      .locator('[data-ds-field="file"] option[value="workshop.db"]')
      .waitFor({ state: 'attached', timeout: 25_000 });
    await page.locator('[data-ds-field="file"]').selectOption('workshop.db');
    await page
      .locator('[data-ds-field="table"] option[value="devices"]')
      .waitFor({ state: 'attached', timeout: 25_000 });
    await page.locator('[data-ds-field="table"]').selectOption('devices');
    await page.waitForSelector('[data-ds-columns]', { timeout: 15_000 });
    for (const column of ['id', 'name', 'status']) {
      await page.locator(`[data-ds-column="${column}"]`).check();
    }
    await page.locator('[data-ds-preview-run]').click();
    await dsWaitPreviewRows(20, 'I: 表模式预览');
    await page.locator('[data-ds-save]').click();
    await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 25_000 });
    await dsWaitRows(11);
    const sqliteList = await dsFetch(`/datasources?query=${encodeURIComponent('冒烟 SQLite')}`);
    const sqliteItem = sqliteList.body.items.find((item) => item.name === '冒烟 SQLite');
    if (sqliteItem === undefined) fail('I: 台账里没有「冒烟 SQLite」');
    if (sqliteItem.status !== 'ready') fail(`I: 表模式保存后应为 ready，实际 ${sqliteItem.status}`);
    if (sqliteItem.configSummary !== 'workshop.db · devices') {
      fail(`I: 摘要应为 workshop.db · devices，实际「${sqliteItem.configSummary}」`);
    }
    const catalogForSqlite = await dsFetch(`/datasets?query=${encodeURIComponent('冒烟 SQLite')}`);
    const sqliteCatalogItem = catalogForSqlite.body.items.find(
      (item) => item.datasetId === sqliteItem.datasetId,
    );
    if (sqliteCatalogItem === undefined || sqliteCatalogItem.groupId !== 'custom') {
      fail(`I: 目录条目缺失或 groupId 不是 custom：${JSON.stringify(sqliteCatalogItem)}`);
    }
    const sqliteQuery = await dsFetch(
      `/datasets/${encodeURIComponent(sqliteItem.datasetId)}/query`,
    );
    if (sqliteQuery.status !== 200) fail(`I: 契约查询失败 HTTP ${sqliteQuery.status}`);
    if (String(sqliteQuery.body.rows[0]?.id ?? '') === '') fail('I: 首行 id 为空');
    const sqliteScreenId = await dsMakeScreen('冒烟屏 · SQLite', (document) => {
      dsPatchGrid(document, sqliteItem.datasetId, ['name', 'status'], {});
    });
    const sqliteView = await dsOpenView(sqliteScreenId);
    await dsWaitTiles(sqliteView, 24);
    await sqliteView.close();

    // A30：SQL 模式 + :status 参数
    await page.locator('[data-ds-create]').click();
    await page.waitForSelector('[data-ds-form]', { timeout: 15_000 });
    await page.locator('[data-ds-field="name"]').fill('冒烟 SQL');
    await page
      .locator('[data-ds-field="file"] option[value="workshop.db"]')
      .waitFor({ state: 'attached', timeout: 25_000 });
    await page.locator('[data-ds-field="file"]').selectOption('workshop.db');
    await page.locator('[data-ds-mode="sql"]').click();
    await page
      .locator('[data-ds-field="sql"]')
      .fill('SELECT id, name, status FROM devices WHERE status = :status');
    await page.locator('[data-ds-add-param]').click();
    await page.waitForSelector('[data-ds-param-row]', { timeout: 10_000 });
    const paramRow = page.locator('[data-ds-param-row]').first();
    await paramRow.locator('input').nth(0).fill('status');
    await paramRow.locator('input').nth(1).fill('状态');
    await paramRow.locator('input[type="checkbox"]').check();
    await paramRow.locator('input').last().fill('fault');
    await page.locator('[data-ds-preview-run]').click();
    await dsWaitPreviewRows(6, 'I: SQL 预览（:status=fault）');
    const sqlPreviewStatuses = await page
      .locator('[data-ds-preview] table tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.querySelectorAll('td')[2]?.textContent ?? ''));
    if (sqlPreviewStatuses.some((status) => status.trim() !== 'fault')) {
      fail(`I: SQL 预览应全为 fault，实际 ${sqlPreviewStatuses.join(',')}`);
    }
    await page.locator('[data-ds-save]').click();
    await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 25_000 });
    await dsWaitRows(12);
    const sqlList = await dsFetch(`/datasources?query=${encodeURIComponent('冒烟 SQL')}`);
    const sqlItem = sqlList.body.items.find((item) => item.name === '冒烟 SQL');
    if (sqlItem === undefined) fail('I: 台账里没有「冒烟 SQL」');
    const literalScreenId = await dsMakeScreen('冒烟屏 · 固定值', (document) => {
      dsPatchGrid(document, sqlItem.datasetId, ['id', 'status'], {
        status: { kind: 'literal', value: 'running' },
      });
    });
    const literalView = await dsOpenView(literalScreenId);
    await dsWaitTiles(literalView, 12);
    await literalView.close();
    const variableScreenId = await dsMakeScreen('冒烟屏 · 变量', (document) => {
      document.variables.push({
        id: 'dsStatus',
        name: 'dsStatus',
        description: '状态参数',
        type: 'static',
        initialValue: 'fault',
      });
      dsPatchGrid(document, sqlItem.datasetId, ['id', 'status'], {
        status: { kind: 'variable', variableId: 'dsStatus' },
      });
    });
    const variableView = await dsOpenView(variableScreenId);
    await dsWaitTiles(variableView, 6);
    await variableView.close();
    const runningQuery = await dsFetch(
      `/datasets/${encodeURIComponent(sqlItem.datasetId)}/query?status=running`,
    );
    if (runningQuery.status !== 200) fail(`I: 固定值查询失败 HTTP ${runningQuery.status}`);
    if (runningQuery.body.rows.every((row) => row.status === 'running') === false) {
      fail('I: 固定值 running 的查询结果混入了其它状态');
    }

    // ---------- J. 失败态与预览截断（A31 / A32） ----------
    await dsGotoList();
    await page.locator('[data-ds-create]').click();
    await page.waitForSelector('[data-ds-form]', { timeout: 15_000 });
    await page.locator('[data-ds-field="name"]').fill('冒烟 不可达');
    await page.locator('[data-ds-form] input[name="ds-type"][value="rest"]').check();
    await page.locator('[data-ds-field="url"]').fill('http://127.0.0.1:9/none');
    await page.locator('[data-ds-test-run]').click();
    await page.waitForSelector('[data-ds-form] [data-ds-result="error"]', { timeout: 25_000 });
    const unreachableText = await page.locator('[data-ds-form] [data-ds-result]').innerText();
    if (!unreachableText.includes('地址不可达') || !unreachableText.includes('检查 URL')) {
      fail(`J: 不可达文案不含行动提示：${unreachableText}`);
    }
    await page.locator('[data-ds-save]').click();
    await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 25_000 });
    await dsWaitRows(13);
    const unreachableList = await dsFetch(
      `/datasources?query=${encodeURIComponent('冒烟 不可达')}`,
    );
    const unreachableItem = unreachableList.body.items.find((item) => item.name === '冒烟 不可达');
    if (unreachableItem?.status !== 'error') {
      fail(`J: 不可达保存后应为 error，实际 ${unreachableItem?.status}`);
    }
    const unreachableRow = dsRow(unreachableItem.datasetId);
    if ((await unreachableRow.getAttribute('data-status')) !== 'error') {
      fail('J: 列表里未显示「异常」行');
    }
    // PRD §10.2 / A31 的文案是「异常」：徽标文字也要一起断言，避免口径回退
    const unreachableBadge = (await unreachableRow.locator('.ds-badge').innerText()).trim();
    if (unreachableBadge !== '异常') {
      fail(`J: 状态徽标应为「异常」，实际「${unreachableBadge}」`);
    }

    // A32a：静态 30 行（API 造数据，UI 断言预览 20 行 + 「共 30 行」）
    const staticRows = Array.from({ length: 30 }, (_unused, index) => [`crew-${index}`, index]);
    const staticCreated = await dsFetch('/datasources', {
      method: 'POST',
      body: JSON.stringify({
        name: '冒烟 静态三十',
        description: null,
        type: 'static',
        config: { v: 1, columns: ['crew', 'output'], rows: staticRows },
      }),
    });
    if (staticCreated.status !== 201) fail(`J: 静态数据源创建失败 HTTP ${staticCreated.status}`);
    await dsGotoList();
    await dsWaitRows(14);
    await dsOpenDrawer(staticCreated.body.datasetId, 'preview');
    await dsWaitPreviewRows(20, 'J: 静态预览');
    const staticPreviewText = await page.locator('[data-ds-preview]').innerText();
    if (!staticPreviewText.includes('共 30 行')) {
      fail(`J: 静态预览应显示「共 30 行」：${staticPreviewText.slice(0, 80)}`);
    }
    await dsCloseDrawer();

    // A32b：work_logs 600 行 → 已截断至 500 行
    const logsCreated = await dsFetch('/datasources', {
      method: 'POST',
      body: JSON.stringify({
        name: '冒烟 工作日志',
        description: null,
        type: 'sqlite',
        config: {
          v: 1,
          mode: 'table',
          file: 'workshop.db',
          table: 'work_logs',
          columns: [
            { name: 'id', declaredType: 'TEXT' },
            { name: 'throughput', declaredType: 'INTEGER' },
          ],
          params: [],
        },
      }),
    });
    if (logsCreated.status !== 201) fail(`J: 工作日志数据源创建失败 HTTP ${logsCreated.status}`);
    await dsGotoList();
    await dsWaitRows(15);
    await dsOpenDrawer(logsCreated.body.datasetId, 'preview');
    await dsWaitPreviewRows(undefined, 'J: 工作日志预览');
    const logsPreviewText = await page.locator('[data-ds-preview]').innerText();
    if (!logsPreviewText.includes('已截断至 500 行')) {
      fail(`J: 工作日志预览应显示截断提示：${logsPreviewText.slice(0, 80)}`);
    }
    await dsCloseDrawer();

    // ---------- K. 删除保护（A33） ----------
    await dsGotoList();
    await dsRow(sqliteItem.datasetId).locator('[data-ds-action="delete"]').click();
    await page.waitForSelector('[data-ds-dialog="delete-blocked"]', { timeout: 20_000 });
    const blockedText = await page.locator('[data-ds-dialog="delete-blocked"]').innerText();
    if (!blockedText.includes('无法删除')) fail(`K: 弹层标题不对：${blockedText.slice(0, 40)}`);
    if (!blockedText.includes('冒烟屏 · SQLite')) {
      fail(`K: 弹层未列出引用屏：${blockedText.slice(0, 120)}`);
    }
    await page.locator('[data-ds-ref-list] a').first().click();
    await page.waitForFunction(
      (screenId) => window.location.hash === `#/screens/${screenId}/edit`,
      sqliteScreenId,
      { timeout: 20_000 },
    );
    await page.waitForFunction(
      () => {
        const designer = document.querySelector('base-screen-designer');
        return designer !== null && (designer.document?.components.length ?? 0) > 0;
      },
      undefined,
      { timeout: 25_000 },
    );
    // 先关弹层再回列表：Vanilla 的弹层挂在 document.body 上，换视图不会销毁它，
    // 留着会挡住列表上的点击（Playwright 报 "ds-overlay intercepts pointer events"）。
    if ((await page.locator('[data-ds-dialog="delete-blocked"]').count()) > 0) {
      await page.locator('[data-ds-confirm="ok"]').click();
      await page.waitForSelector('[data-ds-dialog="delete-blocked"]', { state: 'detached' });
    }
    await dsGotoList();
    if ((await dsRow(sqliteItem.datasetId).count()) !== 1) {
      fail('K: 被引用的数据源不应被删除');
    }

    // ---------- L. 掩码与字段变化（A35 / A36） ----------
    await dsGotoList();
    await page.locator('[data-ds-create]').click();
    await page.waitForSelector('[data-ds-form]', { timeout: 15_000 });
    await page.locator('[data-ds-field="name"]').fill('冒烟 Header');
    await page.locator('[data-ds-form] input[name="ds-type"][value="rest"]').check();
    await page.locator('[data-ds-field="url"]').fill(`${API_BASE}/demo/press`);
    await page.locator('[data-ds-add-header]').click();
    await page.waitForSelector('[data-ds-header-row]', { timeout: 10_000 });
    const headerRow = page.locator('[data-ds-header-row]').first();
    await headerRow.locator('input').nth(0).fill('X-API-Key');
    await headerRow.locator('input').nth(1).fill('super-secret-token-123');
    await page.locator('[data-ds-save]').click();
    await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 25_000 });
    await dsWaitRows(16);
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('super-secret-token-123')) fail('L: 页面文本泄露了 header 明文');
    const headerList = await dsFetch(`/datasources?query=${encodeURIComponent('冒烟 Header')}`);
    const headerItem = headerList.body.items.find((item) => item.name === '冒烟 Header');
    if (headerItem === undefined) fail('L: 台账里没有「冒烟 Header」');
    await dsOpenDrawer(headerItem.datasetId, 'edit');
    await page.waitForSelector('[data-ds-header-row]', { timeout: 20_000 });
    const maskedHeader = page.locator('[data-ds-header-row]').first();
    const maskedValue = await maskedHeader.locator('input').nth(1).inputValue();
    const maskedPlaceholder = await maskedHeader
      .locator('input')
      .nth(1)
      .getAttribute('placeholder');
    if (maskedValue !== '') fail(`L: 编辑态 header 值应留空，实际「${maskedValue}」`);
    if (maskedPlaceholder !== '••••••••') {
      fail(`L: 编辑态 header 应显示掩码占位，实际「${maskedPlaceholder}」`);
    }
    await dsCloseDrawer();
    const sqliteRowSummary = await dsRow(sqliteItem.datasetId).locator('.ds-summary').innerText();
    if (sqliteRowSummary.includes('data/') || /[A-Za-z]:\\/.test(sqliteRowSummary)) {
      fail(`L: SQLite 摘要泄露了路径：${sqliteRowSummary}`);
    }

    // A36：改被引用数据源的勾选（去掉 status）→ 字段变化确认 → 仍然保存 → 屏不白屏
    await dsOpenDrawer(sqliteItem.datasetId, 'edit');
    await page.locator('[data-ds-column="status"]').uncheck();
    await page.locator('[data-ds-save]').click();
    await page.waitForSelector('[data-ds-dialog="fields"]', { timeout: 20_000 });
    const fieldsText = await page.locator('[data-ds-dialog="fields"]').innerText();
    if (!fieldsText.includes('字段变化会影响')) {
      fail(`L: 字段变化弹层标题不对：${fieldsText.slice(0, 40)}`);
    }
    if (!fieldsText.includes('冒烟屏 · SQLite')) {
      fail('L: 字段变化弹层没列出受影响的大屏');
    }
    if (/\d{4}\/\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}/.test(fieldsText) === false) {
      fail(`L: 字段变化弹层应显示受影响大屏的更新时间：${fieldsText.slice(0, 160)}`);
    }
    await page.locator('[data-ds-confirm="fields"]').click();
    await page.waitForSelector('[data-ds-form]', { state: 'detached', timeout: 25_000 });

    const degradedView = await dsOpenView(sqliteScreenId);
    // 绑定失效后灯阵不该再画格子（新开的页面没有"上一帧"可保留）
    await degradedView.waitForFunction(
      () =>
        (document
          .querySelector('base-screen-viewer')
          ?.shadowRoot?.querySelectorAll('[data-datav-status-tile]').length ?? 0) === 0,
      undefined,
      { timeout: 30_000 },
    );
    await degradedView.waitForTimeout(1500);
    const degradedDom = await degradedView.evaluate(() => {
      const root = document.querySelector('base-screen-viewer')?.shadowRoot ?? null;
      const host = window.__baseScreenHost?.status() ?? null;
      return {
        tiles: root?.querySelectorAll('[data-datav-status-tile]').length ?? 0,
        badges: root?.querySelectorAll('[data-datav-degraded-badge]').length ?? 0,
        empty: root?.querySelectorAll('[data-datav-status-empty]').length ?? 0,
        text: root?.textContent ?? '',
        failures: host?.failures ?? 0,
        failedComponents: host?.failedComponents?.length ?? 0,
      };
    });
    // 不白屏：模板屏的标题仍在
    if (!degradedDom.text.includes('生产监控')) {
      fail('L: 字段变化后查看页标题不可见（疑似白屏）');
    }
    if (degradedDom.tiles !== 0) {
      fail(`L: 绑定失效后不应继续画 ${degradedDom.tiles} 格`);
    }
    // 降级信号：引擎在组件内打出 "Host dataset binding is invalid."（实测落点），
    // 或者角标 / 空态文案 / 宿主失败计数——任一即可，避免把实现细节焊死在断言里。
    const bindingHint = /binding is invalid/i.test(degradedDom.text);
    if (
      bindingHint === false &&
      degradedDom.badges === 0 &&
      degradedDom.empty === 0 &&
      degradedDom.failures + degradedDom.failedComponents === 0
    ) {
      fail(`L: 绑定失效后没有任何降级信号：${JSON.stringify(degradedDom).slice(0, 200)}`);
    }
    await degradedView.close();

    // L2（Minor-7 前端侧）：已存配置测试现在可能返回 4xx——列表行内「测试」必须把
    // 错误体 `{error,message}` 也渲染进结果条，而不是只在 200 分支里读 `body.ok`。
    const brokenCreated = await dsFetch('/datasources', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Smoke Broken Sql',
        description: null,
        type: 'sqlite',
        // 指向不存在的表：保存能过（SQL 模式只做词法校验），随后行内「测试」会得到 4xx
        config: {
          v: 1,
          mode: 'sql',
          file: 'workshop.db',
          sql: 'SELECT id FROM not_a_table',
          params: [],
        },
      }),
    });
    if (brokenCreated.status !== 201) {
      fail(`L2: 坏 SQL 数据源创建失败 HTTP ${brokenCreated.status}`);
    }
    await dsGotoList();
    await dsWaitRows(17);
    await dsRow(brokenCreated.body.datasetId).locator('[data-ds-action="test"]').click();
    // 结果条上一条是 J 段的「地址不可达」，这里等文案真的换成"表不存在"
    await page.waitForFunction(
      () => (document.querySelector('[data-ds-result]')?.textContent ?? '').includes('不存在'),
      undefined,
      { timeout: 20_000 },
    );

    // 清理：删掉本次 smoke 造的屏与数据源（保持可重复；库本身每次重建）
    for (const screenId of dsScreens) {
      await dsFetch(`/screens/${screenId}`, { method: 'DELETE' });
    }
    for (const item of [restItem, sqliteItem, sqlItem, headerItem]) {
      await dsFetch(`/datasources/${encodeURIComponent(item.datasetId)}`, { method: 'DELETE' });
    }
    for (const datasetId of [
      unreachableItem.datasetId,
      staticCreated.body.datasetId,
      logsCreated.body.datasetId,
    ]) {
      await dsFetch(`/datasources/${encodeURIComponent(datasetId)}`, { method: 'DELETE' });
    }

    if (pageErrors.length > 0) fail(`页面存在未捕获错误：${JSON.stringify(pageErrors)}`);
    console.log(
      'Vanilla 前端冒烟通过：列表 / DataV 编辑 / 插件物料 / 数据绑定 / 缩放查看器 / 指标与排行确定性 / 生产监控数据层（灯阵·工序链·告警流水·变量联动·降级·暂停）/ 数据源管理（台账·筛选·REST 闭环·SQLite 表与 SQL 模式·引用保护·掩码·字段变化）。',
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
