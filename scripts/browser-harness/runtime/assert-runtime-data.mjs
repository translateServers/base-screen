// 运行时取数与画布内容裁剪联动
// 由 1 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { assertCanvasContentClipping } from '../canvas/assert-canvas.mjs';

// ---- 源模块：assert-runtime-data.mjs ----
export async function assertRuntimeData(page, viewer) {
  await assertCanvasContentClipping(page);
  await page.evaluate(() => {
    delete document.body.dataset.layout;
    document.body.style.padding = '';
    document.querySelector('base-screen-designer').style.height = '';
  });
  await viewer.locator('[data-base-screen-component-id=host-data]').waitFor();
  const resourceState = await page.evaluate(
    () =>
      window.baseScreenHarness.viewer.shadowRoot.querySelector(
        '[data-base-screen-component-id=host-data]',
      ).model.dataState.status,
  );
  if (resourceState !== 'ready') {
    throw new Error('BROWSER_HARNESS_RESOURCE_FAILED');
  }
  const resourceDomState = await viewer
    .locator('[data-base-screen-component-id=host-data]')
    .getAttribute('data-base-screen-data-state');
  if (resourceDomState !== 'ready') {
    throw new Error('BROWSER_HARNESS_RESOURCE_DOM_STATE_FAILED');
  }
  const variableExamples = await page.evaluate(() => {
    const harness = window.baseScreenHarness;
    const readValue = (componentId) =>
      harness.viewer.shadowRoot.querySelector(`[data-base-screen-component-id="${componentId}"]`)
        ?.model.dataState.value;
    return {
      dataSourceValue: readValue('host-data'),
      urlQueryValue: readValue('subtitle'),
      runtimeSourceTypes: [
        ...new Set(
          harness.variableRequests
            .filter((request) => request.purpose === 'runtime')
            .map((request) => request.sourceType),
        ),
      ].sort(),
    };
  });
  if (
    variableExamples.dataSourceValue !== 'north' ||
    variableExamples.urlQueryValue !== 'browser-harness' ||
    variableExamples.runtimeSourceTypes.join(',') !== 'data-source,url-query'
  ) {
    throw new Error(
      `BROWSER_HARNESS_VARIABLE_TYPE_EXAMPLES_FAILED:${JSON.stringify(variableExamples)}`,
    );
  }
  // 条件样式规则（ADR-0058）：阈值双向穿越——命中变红加粗、回落恢复基础样式。
  await viewer.locator('[data-base-screen-component-id=metric-warning]').waitFor();
  const metricStyle = () =>
    page.evaluate(
      () =>
        window.baseScreenHarness.viewer.shadowRoot.querySelector(
          '[data-base-screen-component-id=metric-warning]',
        ).model.style,
    );
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.viewer.shadowRoot.querySelector(
        '[data-base-screen-component-id=metric-warning]',
      )?.model.dataState.status === 'ready',
  );
  const baseStyle = await metricStyle();
  if (baseStyle.color !== '#9fb1c9' || baseStyle.fontWeight !== '400') {
    throw new Error('BROWSER_HARNESS_STYLE_RULE_BASE_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.setMetricValue(160));
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.viewer.shadowRoot.querySelector(
        '[data-base-screen-component-id=metric-warning]',
      )?.model.style.color === '#ff4d4f',
  );
  const warnedStyle = await metricStyle();
  if (warnedStyle.color !== '#ff4d4f' || warnedStyle.fontWeight !== '700') {
    throw new Error('BROWSER_HARNESS_STYLE_RULE_TRIGGER_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.setMetricValue(20));
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.viewer.shadowRoot.querySelector(
        '[data-base-screen-component-id=metric-warning]',
      )?.model.style.color === '#9fb1c9',
  );
  const restoredStyle = await metricStyle();
  if (restoredStyle.color !== '#9fb1c9' || restoredStyle.fontWeight !== '400') {
    throw new Error('BROWSER_HARNESS_STYLE_RULE_RESTORE_FAILED');
  }
  // 条件样式端口（ADR-0059）：同一指标驱动宿主端口映射——命中变橙加粗、回落恢复，
  // 文档对 port-warning 零告警知识（无 styleRules）。
  const portStyle = () =>
    page.evaluate(
      () =>
        window.baseScreenHarness.viewer.shadowRoot.querySelector(
          '[data-base-screen-component-id=port-warning]',
        ).model.style,
    );
  const designerPortStyle = () =>
    page.evaluate(
      () =>
        window.baseScreenHarness.designer.shadowRoot.querySelector(
          '[data-base-screen-component-id=port-warning]',
        ).model.style,
    );
  await page.waitForFunction(() =>
    [window.baseScreenHarness.viewer, window.baseScreenHarness.designer].every(
      (element) =>
        element.shadowRoot.querySelector('[data-base-screen-component-id=port-warning]')?.model
          .dataState.status === 'ready',
    ),
  );
  const portBase = await portStyle();
  const designerPortBase = await designerPortStyle();
  if (
    portBase.color !== '#9fb1c9' ||
    portBase.fontWeight !== '400' ||
    designerPortBase.color !== '#9fb1c9' ||
    designerPortBase.fontWeight !== '400'
  ) {
    throw new Error('BROWSER_HARNESS_STYLE_PORT_BASE_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.setMetricValue(160));
  await page.waitForFunction(() =>
    [window.baseScreenHarness.viewer, window.baseScreenHarness.designer].every(
      (element) =>
        element.shadowRoot.querySelector('[data-base-screen-component-id=port-warning]')?.model
          .style.color === '#ffa940',
    ),
  );
  const portWarned = await portStyle();
  const designerPortWarned = await designerPortStyle();
  if (
    portWarned.color !== '#ffa940' ||
    portWarned.fontWeight !== '700' ||
    designerPortWarned.color !== '#ffa940' ||
    designerPortWarned.fontWeight !== '700'
  ) {
    throw new Error('BROWSER_HARNESS_STYLE_PORT_TRIGGER_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.setMetricValue(20));
  await page.waitForFunction(() =>
    [window.baseScreenHarness.viewer, window.baseScreenHarness.designer].every(
      (element) =>
        element.shadowRoot.querySelector('[data-base-screen-component-id=port-warning]')?.model
          .style.color === '#9fb1c9',
    ),
  );
  const portRestored = await portStyle();
  const designerPortRestored = await designerPortStyle();
  if (
    portRestored.color !== '#9fb1c9' ||
    portRestored.fontWeight !== '400' ||
    designerPortRestored.color !== '#9fb1c9' ||
    designerPortRestored.fontWeight !== '400'
  ) {
    throw new Error('BROWSER_HARNESS_STYLE_PORT_RESTORE_FAILED');
  }
  await page.evaluate(() => window.baseScreenHarness.createDatasetDemo());
  const datasetDemo = page.locator('base-screen-viewer[data-dataset-demo]');
  await datasetDemo.locator('[data-base-screen-component-id=table-demo]').waitFor();
  await page.waitForFunction(() => {
    const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
    return (
      demo?.shadowRoot
        ?.querySelector('[data-base-screen-component-id=table-demo]')
        ?.getAttribute('data-base-screen-data-state') === 'ready'
    );
  });
  const datasetRender = await page.evaluate(() => {
    const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
    const table = demo?.shadowRoot?.querySelector('[data-base-screen-component-id=table-demo]');
    const chart = demo?.shadowRoot?.querySelector('[data-base-screen-component-id=chart-demo]');
    return {
      tableReady: table?.getAttribute('data-base-screen-data-state') === 'ready',
      tableRows: table?.querySelectorAll('tbody tr').length ?? 0,
      chartReady: chart?.getAttribute('data-base-screen-data-state') === 'ready',
      chartLines: chart?.querySelectorAll('polyline').length ?? 0,
    };
  });
  if (
    !datasetRender.tableReady ||
    datasetRender.tableRows !== 2 ||
    !datasetRender.chartReady ||
    datasetRender.chartLines !== 1
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_RENDER_FAILED:${JSON.stringify(datasetRender)}`);
  }
  const beforeDatasetRequests = await page.evaluate(
    () => window.baseScreenHarness.datasetRequests.length,
  );
  await page.evaluate(() => {
    window.baseScreenHarness.setDatasetRegion('south');
    window.baseScreenHarness.bumpDatasetVersion();
    document.querySelector('base-screen-viewer[data-dataset-demo]').refreshData('table-demo');
  });
  await page.waitForFunction(
    (before) =>
      window.baseScreenHarness.datasetRequests.length > before &&
      window.baseScreenHarness.datasetRequests.at(-1)?.params?.region === 'south',
    beforeDatasetRequests,
  );
  await page.waitForFunction(() => {
    const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
    return (
      demo?.shadowRoot
        ?.querySelector('[data-base-screen-component-id=table-demo]')
        ?.getAttribute('data-base-screen-data-state') === 'ready'
    );
  });
  await page.evaluate(() => {
    window.baseScreenHarness.setDatasetDelay(true);
    document.querySelector('base-screen-viewer[data-dataset-demo]').refreshData('table-demo');
  });
  await page.waitForFunction(() => {
    const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
    const table = demo?.shadowRoot?.querySelector('[data-base-screen-component-id=table-demo]');
    return (
      table?.getAttribute('data-base-screen-data-state') === 'error' &&
      table?.model?.dataState?.code === 'HOST_RESOURCE_TIMEOUT'
    );
  });
  await page.evaluate(() => window.baseScreenHarness.setDatasetDelay(false));
  await page.evaluate(() => {
    window.baseScreenHarness.setDatasetRegion('error');
    document.querySelector('base-screen-viewer[data-dataset-demo]').refreshData('table-demo');
  });
  await page.waitForFunction(() => {
    const demo = document.querySelector('base-screen-viewer[data-dataset-demo]');
    return (
      demo?.shadowRoot
        ?.querySelector('[data-base-screen-component-id=table-demo]')
        ?.getAttribute('data-base-screen-data-state') === 'error'
    );
  });
  await page.evaluate(() => {
    document.querySelector('base-screen-viewer[data-dataset-demo]')?.remove();
    window.baseScreenHarness.setDatasetRegion('north');
  });
  await viewer.locator('[data-base-screen-component-id=title]').click();
  const hostEventCount = await page.evaluate(() => window.baseScreenHarness.hostEvents.length);
  if (hostEventCount !== 1) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_FAILED');
  }
  await page.evaluate(() => {
    window.baseScreenHarness.viewer.addEventListener('base-screen-material-event', (event) => {
      window.baseScreenHarness.hostEvents.push(event.detail);
    });
  });
  await viewer.locator('[data-base-screen-component-id=react-bridge] button').click();
  await viewer.locator('[data-base-screen-component-id=vue-bridge] button').click();
  const bridgeEvents = await page.evaluate(
    () =>
      window.baseScreenHarness.hostEvents.filter(
        (event) => event?.payload?.framework === 'react' || event?.payload?.framework === 'vue',
      ).length,
  );
  if (bridgeEvents !== 2) {
    throw new Error('BROWSER_HARNESS_FRAMEWORK_BRIDGE_FAILED');
  }
  await page.evaluate(() => {
    document.body.dataset.layout = 'designer';
    document.body.style.padding = '0';
    document.querySelector('base-screen-designer').style.height = '100vh';
  });
}
