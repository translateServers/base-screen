import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const screenshotDirectory = 'test-results/vue-harness';
mkdirSync(screenshotDirectory, { recursive: true });

const server = await createServer({
  root: 'examples/vue-harness',
  optimizeDeps: { force: true },
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
});

const NAIVE_TYPES = ['harness-vue-chart-naive'];
const FIXED_TYPES = ['harness-vue-chart-fixed'];

function assertSurfaceCharts(surface, label) {
  const naive = surface.materials.filter((row) => NAIVE_TYPES.includes(row.type));
  const fixed = surface.materials.filter((row) => FIXED_TYPES.includes(row.type));
  if (naive.length === 0 || fixed.length === 0) {
    throw new Error(`VUE_HARNESS_${label}_SURFACE_MATERIALS_MISSING: ${JSON.stringify(surface)}`);
  }
  // 桥接层把匹配组件根标签的全局规则传播进宿主 shadow root 并重挂组件：
  // 朴素桥接（直接桥接 VChart）与对照桥接（内联显式尺寸）都必须渲染出画面。
  for (const [kind, rows] of [
    ['NAIVE', naive],
    ['FIXED', fixed],
  ]) {
    const broken = rows.some(
      (row) =>
        !row.hasChart ||
        row.canvas === undefined ||
        row.canvas.width === 0 ||
        row.canvas.height === 0 ||
        row.chartHost.width === 0 ||
        row.chartHost.height === 0 ||
        !row.initialized ||
        !row.contentRendered,
    );
    if (broken) {
      throw new Error(`VUE_HARNESS_${label}_${kind}_CHART_FAILED: ${JSON.stringify(rows)}`);
    }
  }
  return { naive, fixed };
}

function assertSurfaceBaseline(surface, label) {
  const baseline = surface.materials.filter((row) => row.type === 'harness-vue-text');
  if (
    baseline.length === 0 ||
    baseline.some((row) => row.hasChart || !row.contentRendered || row.host.width === 0)
  ) {
    throw new Error(`VUE_HARNESS_${label}_BASELINE_FAILED: ${JSON.stringify(baseline)}`);
  }
}

try {
  await server.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle' });
    if (pageErrors.length > 0) {
      throw pageErrors[0];
    }
    await page.waitForFunction(() => window.vueHarness !== undefined);
    await page.waitForFunction(
      () =>
        window.vueHarness.designer.shadowRoot?.querySelectorAll('[data-base-screen-component-id]')
          .length === 3,
    );
    await page.waitForFunction(
      () =>
        window.vueHarness.viewer.shadowRoot?.querySelectorAll('[data-base-screen-component-id]')
          .length === 3,
    );

    // 设计器物料面板（大屏设计器内 Vue 桥接物料必须出现在物料库中）。
    const paletteTypes = await page.evaluate(() =>
      [...window.vueHarness.designer.shadowRoot.querySelectorAll('[data-material-type]')].map(
        (element) => element.getAttribute('data-material-type'),
      ),
    );
    for (const expected of [
      'harness.vue-text',
      'harness.vue-chart-naive',
      'harness.vue-chart-fixed',
    ]) {
      if (!paletteTypes.includes(expected)) {
        throw new Error(`VUE_HARNESS_PALETTE_MISSING_${expected}: ${JSON.stringify(paletteTypes)}`);
      }
    }

    const surfaces = await page.evaluate(() => window.vueHarness.runDiagnostics());
    const designerSurface = surfaces.find((surface) => surface.surface === 'designer');
    const viewerSurface = surfaces.find((surface) => surface.surface === 'viewer');
    if (designerSurface === undefined || viewerSurface === undefined) {
      throw new Error(`VUE_HARNESS_SURFACES_MISSING: ${JSON.stringify(surfaces)}`);
    }
    // 桥接层样式传播：vue-echarts 依赖注入到 document 的全局样式撑开宿主，
    // 桥接层把匹配组件根标签的规则传播进宿主 shadow root，朴素/对照桥接都必须可见。
    const designerCharts = assertSurfaceCharts(designerSurface, 'DESIGNER');
    const viewerCharts = assertSurfaceCharts(viewerSurface, 'VIEWER');
    assertSurfaceBaseline(designerSurface, 'DESIGNER');
    assertSurfaceBaseline(viewerSurface, 'VIEWER');
    await page.screenshot({ path: `${screenshotDirectory}/charts-rendered.png` });

    // 设计器内把 Vue 桥接物料从物料库拖到画布：新增一个朴素图表组件并渲染。
    const beforePlace = await page.evaluate(
      () => window.vueHarness.designer.document.components.length,
    );
    const paletteCard = page.locator(
      '[data-material-card="harness.vue-chart-naive"] [data-material-type="harness.vue-chart-naive"]',
    );
    await paletteCard.click();
    await page.waitForFunction(
      (count) => window.vueHarness.designer.document.components.length === count + 1,
      beforePlace,
    );
    await page.waitForFunction(
      () =>
        [
          ...window.vueHarness.designer.shadowRoot.querySelectorAll(
            '[data-base-screen-component-id]',
          ),
        ].length === 4,
    );

    const baselineText = await page.evaluate(() => {
      const root = window.vueHarness.designer.shadowRoot;
      return [...root.querySelectorAll('[data-base-screen-component-id]')].find(
        (element) => element.getAttribute('data-base-screen-component-id') === 'baseline',
      )?.textContent;
    });
    if (baselineText === undefined || !baselineText.includes('Vue \u6865\u63a5\u57fa\u7ebf')) {
      throw new Error(`VUE_HARNESS_BASELINE_TEXT_FAILED: ${baselineText}`);
    }

    const before = await page.evaluate(() => window.vueHarness.hostEvents.length);
    await page.locator('base-screen-viewer').locator('harness-vue-text button').click();
    await page.waitForFunction(
      (count) => window.vueHarness.hostEvents.length === count + 1,
      before,
    );
    const event = await page.evaluate(() => window.vueHarness.hostEvents.at(-1));
    if (event?.payload?.framework !== 'vue' || event?.name !== 'valueClick') {
      throw new Error(`VUE_HARNESS_BRIDGE_EVENT_FAILED: ${JSON.stringify(event)}`);
    }

    await page.evaluate(() => window.vueHarness.render(100));
    await page.waitForFunction(
      () => window.vueHarness.getDocument().components.at(-1)?.props?.data?.[0] === 220,
    );
    const afterRerender = await page.evaluate(() => window.vueHarness.runDiagnostics());
    const rerenderedDesigner = afterRerender.find(
      (surface) => surface.surface === 'designer',
    )?.materials;
    const rerenderedFixed = rerenderedDesigner?.find((row) => row.id === 'chart-fixed');
    if (
      rerenderedFixed?.canvas === undefined ||
      rerenderedFixed.canvas.width === 0 ||
      rerenderedFixed.canvas.height === 0
    ) {
      throw new Error(`VUE_HARNESS_RERENDER_CHART_FAILED: ${JSON.stringify(rerenderedFixed)}`);
    }

    await page.screenshot({ path: `${screenshotDirectory}/vue-harness.png` });
    console.log(
      `vue-harness ok: designer naive=${JSON.stringify(designerCharts.naive[0]?.canvas)} fixed=${JSON.stringify(designerCharts.fixed[0]?.canvas)}; viewer naive=${JSON.stringify(viewerCharts.naive[0]?.canvas)} fixed=${JSON.stringify(viewerCharts.fixed[0]?.canvas)}; palette=${paletteTypes.length}`,
    );
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
