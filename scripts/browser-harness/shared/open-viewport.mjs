import { screenshotDirectory } from './constants.mjs';

export async function openViewport({ baseUrl, browser, viewport }) {
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto(`${baseUrl}/?campaign=browser-harness`, { waitUntil: 'networkidle' });
  if (pageErrors.length > 0) {
    throw pageErrors[0];
  }
  await page.waitForFunction(() => window.customElements.get('base-screen-designer') !== undefined);
  const managerRegistry = await page.evaluate(() => ({
    active: window.baseScreenHarness.pluginManager.status,
    matches: [
      ['base.text', 'base-screen-text'],
      ['base.rectangle', 'base-screen-rectangle'],
      ['base.ellipse', 'base-screen-ellipse'],
      ['base.image', 'base-screen-image'],
      ['base.container', 'base-screen-container'],
    ].every(
      ([type, tagName]) =>
        window.baseScreenHarness.pluginManager.snapshot?.materials.get(type)?.constructor ===
        window.customElements.get(tagName),
    ),
  }));
  if (managerRegistry.active !== 'active' || !managerRegistry.matches) {
    throw new Error('BROWSER_HARNESS_PLUGIN_MANAGER_REGISTRY_FAILED');
  }
  const designer = page.locator('base-screen-designer');
  const viewer = page.locator('base-screen-viewer').first();
  const materialCount = await designer.locator('[data-base-screen-component-id]').count();
  const viewerMaterialCount = await viewer.locator('[data-base-screen-component-id]').count();
  const screenshot = await page.screenshot();
  if (materialCount !== 9 || viewerMaterialCount !== 9 || screenshot.byteLength < 10_000) {
    throw new Error(`BROWSER_HARNESS_RENDER_FAILED: ${viewport.width}x${viewport.height}`);
  }
  await page.waitForFunction(() => {
    const viewer = document.querySelector('base-screen-viewer');
    const material = viewer?.shadowRoot?.querySelector(
      'harness-dataset-ranking[data-base-screen-component-id=dataset-ranking-demo]',
    );
    return material?.querySelectorAll('button').length === 2;
  });
  const datasetMaterialBestPractice = await viewer.evaluate((element) => {
    const material = element.shadowRoot?.querySelector(
      'harness-dataset-ranking[data-base-screen-component-id=dataset-ranking-demo]',
    );
    const probe = document.createElement('harness-dataset-ranking');
    document.body.appendChild(probe);
    const baseModel = {
      componentId: 'dataset-ranking-state-probe',
      mode: 'preview',
      interactive: true,
      props: { title: '状态探针', unit: '个', maxItems: 5, showRank: true },
      style: {
        backgroundColor: '#0b1324',
        textColor: '#e5eefb',
        mutedColor: '#8ea3bd',
        accentColor: '#31d7eb',
        trackColor: '#1b2b42',
      },
      size: { width: 420, height: 220 },
    };
    probe.model = { ...baseModel, dataState: { status: 'loading' } };
    const loading = probe.textContent ?? '';
    probe.model = { ...baseModel, dataState: { status: 'ready', value: { items: [] } } };
    const empty = probe.textContent ?? '';
    probe.model = {
      ...baseModel,
      dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'hidden' },
    };
    const error = probe.textContent ?? '';
    probe.remove();
    return {
      state: material?.model?.dataState?.status,
      buttons: material?.querySelectorAll('button').length ?? 0,
      text: material?.textContent ?? '',
      registered: window.customElements.get('harness-dataset-ranking') !== undefined,
      loading,
      empty,
      error,
    };
  });
  if (
    datasetMaterialBestPractice.state !== 'ready' ||
    datasetMaterialBestPractice.buttons !== 2 ||
    !datasetMaterialBestPractice.text.includes('A') ||
    !datasetMaterialBestPractice.text.includes('2万元') ||
    !datasetMaterialBestPractice.registered ||
    !datasetMaterialBestPractice.loading.includes('正在加载数据') ||
    !datasetMaterialBestPractice.empty.includes('暂无可展示数据') ||
    !datasetMaterialBestPractice.error.includes('数据加载失败')
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_MATERIAL_BEST_PRACTICE_FAILED:${JSON.stringify(datasetMaterialBestPractice)}`,
    );
  }
  if (viewport.width > 800) {
    await page.evaluate(() => {
      document.body.dataset.layout = 'designer';
      document.body.style.padding = '0';
      document.querySelector('base-screen-designer').style.height = '100vh';
    });
  }
  if (viewport.width <= 800) {
    const compact = await designer.evaluate((element) => {
      const warning = element.shadowRoot.querySelector('.small-screen-warning');
      return {
        text: warning?.textContent?.trim(),
        visible:
          warning !== null &&
          warning !== undefined &&
          getComputedStyle(warning).display !== 'none' &&
          warning.getBoundingClientRect().width > 0 &&
          warning.getBoundingClientRect().height > 0,
        overflows: element.scrollWidth > element.clientWidth,
      };
    });
    if (
      compact.text !==
        '\u7f16\u8f91\u5927\u5c4f\u9700\u8981\u81f3\u5c11 1024 \u00d7 640 \u7684\u53ef\u7528\u7a7a\u95f4\u3002' ||
      !compact.visible ||
      compact.overflows
    ) {
      throw new Error('BROWSER_HARNESS_COMPACT_WORKBENCH_FAILED');
    }
    await page.screenshot({
      path: `${screenshotDirectory}/${viewport.width}x${viewport.height}.png`,
    });
  }
  return { designer, page, viewer };
}
