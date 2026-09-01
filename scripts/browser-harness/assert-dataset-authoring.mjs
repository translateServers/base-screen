import { screenshotDirectory } from './constants.mjs';

export async function assertDatasetAuthoring(designer, page) {
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  await dataPanel
    .locator('[data-dataset-action="select-step"][data-dataset-workbench-target="source"]')
    .click();
  const notificationSurface = designer.locator('[data-notifications]');
  await notificationSurface.evaluate((surface) => {
    surface.style.display = 'none';
  });
  await dataPanel
    .locator('[data-dataset-action="select-step"][data-dataset-workbench-target="preview"]')
    .click();
  await dataPanel.locator('[data-dataset-action="test"]').click();
  await dataPanel.locator('[data-workbench-section="preview"] [data-status="ready"]').waitFor();
  const responsePreview = await dataPanel.evaluate((panel) => ({
    rowCount: panel.querySelectorAll('.designer-data-preview-table-wrap tbody tr').length,
    columnCount: panel.querySelectorAll('.designer-data-preview-table-wrap thead th').length,
    status: panel.querySelector('[data-workbench-section="preview"] [data-status]')?.textContent,
    paneScrollTop: panel.scrollTop,
    workbenchVisible: !panel.closest('.designer')?.querySelector('[data-data-workbench]')?.hidden,
  }));
  if (
    responsePreview.rowCount !== 2 ||
    responsePreview.columnCount !== 2 ||
    !responsePreview.status?.includes('\u8bf7\u6c42\u6210\u529f') ||
    responsePreview.paneScrollTop !== 0 ||
    responsePreview.workbenchVisible
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_RESPONSE_PREVIEW_FAILED:${JSON.stringify(responsePreview)}`,
    );
  }
  const consumerTab = dataPanel.locator('[data-dataset-preview-tab="consumer"]');
  await consumerTab.click();
  await dataPanel.locator('[data-dataset-preview-tab="consumer"][aria-selected="true"]').waitFor();
  const consumerPreview = await dataPanel.locator('.designer-data-preview-content').textContent();
  if (!consumerPreview?.includes('label') || !consumerPreview.includes('value')) {
    throw new Error(`BROWSER_HARNESS_DATASET_CONSUMER_PREVIEW_FAILED:${consumerPreview}`);
  }
  const requestTab = dataPanel.locator('[data-dataset-preview-tab="request"]');
  await requestTab.click();
  await dataPanel.locator('[data-dataset-preview-tab="request"][aria-selected="true"]').waitFor();
  const requestPreview = await dataPanel.locator('.designer-data-preview-content').textContent();
  if (!requestPreview?.includes('tabular-orders') || !requestPreview.includes('params')) {
    throw new Error(`BROWSER_HARNESS_DATASET_REQUEST_PREVIEW_FAILED:${requestPreview}`);
  }
  await dataPanel.screenshot({
    path: `${screenshotDirectory}/data-panel-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await notificationSurface.evaluate((surface) => {
    surface.style.removeProperty('display');
  });
  await dataPanel
    .locator('[data-dataset-action="select-step"][data-dataset-workbench-target="source"]')
    .click();
  const region = dataPanel.locator('[data-dataset-parameter="region"]');
  await region.fill('north');
  await region.dispatchEvent('change');
  await dataPanel
    .locator('[data-dataset-action="select-step"][data-dataset-workbench-target="mapping"]')
    .click();
  const mappingSurface = await dataPanel.evaluate((panel) => ({
    bindingCount: panel.querySelectorAll('[data-dataset-binding-role]').length,
    applyCount: panel.querySelectorAll('[data-dataset-action="apply"]').length,
    activeStep: panel.querySelector('.designer-datav-data-flow')?.dataset.activeStep,
  }));
  if (
    mappingSurface.bindingCount !== 4 ||
    mappingSurface.applyCount !== 1 ||
    mappingSurface.activeStep !== 'mapping'
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_MAPPING_SURFACE_FAILED:${JSON.stringify(mappingSurface)}`,
    );
  }
  await dataPanel.locator('[data-dataset-action="apply"]').click();
  await page.waitForFunction(() => {
    const source = window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'dataset-ranking-demo',
    )?.dataSource;
    return (
      source?.type === 'host-resource' &&
      source.resourceType === 'dataset' &&
      source.resourceId === 'tabular-orders' &&
      source.params.region?.kind === 'literal'
    );
  });
  const appliedDatasetSource = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'dataset-ranking-demo',
      )?.dataSource,
  );
  if (
    appliedDatasetSource?.type !== 'host-resource' ||
    appliedDatasetSource.binding?.fields.dimension?.[0] !== 'category' ||
    appliedDatasetSource.binding.fields.measures?.[0] !== 'amount' ||
    appliedDatasetSource.params.region?.kind !== 'literal'
  ) {
    throw new Error('BROWSER_HARNESS_DATASET_TRANSACTION_FAILED');
  }
  const authoringSurface = await dataPanel.evaluate((panel) => ({
    present: panel.querySelector('[data-dataset-authoring]') !== null,
    editorModes: panel.querySelectorAll('[data-dataset-editor-mode]').length,
    filterAction:
      panel.querySelector('[data-dataset-authoring-action="configure-filter"]') !== null,
    copyAction: panel.querySelector('[data-dataset-authoring-action="copy-data"]') !== null,
    copyActionDisabled:
      panel.querySelector('[data-dataset-authoring-action="copy-data"]')?.disabled === true,
    fullscreenAction:
      panel.querySelector('[data-dataset-authoring-action="fullscreen-edit"]') !== null,
    settingCount: panel.querySelectorAll('[data-dataset-authoring-setting]').length,
    refreshStrategy:
      panel.querySelector('[data-dataset-authoring-setting="refreshStrategy"]') !== null,
    horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
  }));
  if (
    !authoringSurface.present ||
    authoringSurface.editorModes !== 2 ||
    !authoringSurface.filterAction ||
    !authoringSurface.copyAction ||
    !authoringSurface.copyActionDisabled ||
    !authoringSurface.fullscreenAction ||
    authoringSurface.settingCount !== 4 ||
    !authoringSurface.refreshStrategy ||
    authoringSurface.horizontalOverflow
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_AUTHORING_SURFACE_FAILED:${JSON.stringify(authoringSurface)}`,
    );
  }
  await dataPanel.locator('[data-dataset-action="test"]').click();
  await dataPanel.locator('[data-dataset-authoring-action="copy-data"]:not(:disabled)').waitFor();
  await designer.locator('button[data-inspector-density="all"]').click();
  await page.evaluate(() => {
    window.__baseScreenDatasetAuthoringActions = [];
    window.__baseScreenCopiedDataset = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__baseScreenCopiedDataset = value;
        },
      },
    });
    document
      .querySelector('base-screen-designer')
      .addEventListener('base-screen-dataset-authoring-action', (event) =>
        window.__baseScreenDatasetAuthoringActions.push(event.detail),
      );
  });
  await dataPanel.locator('[data-dataset-editor-mode="code"]').click();
  await dataPanel.locator('[data-dataset-authoring-action="configure-filter"]').click();
  await dataPanel.locator('[data-dataset-authoring-action="copy-data"]').click();
  await dataPanel
    .locator('[data-dataset-feedback]')
    .filter({ hasText: '\u6570\u636e\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f' })
    .waitFor();
  await dataPanel.locator('[data-dataset-authoring-setting="loadingDisabled"]').check();
  await dataPanel.locator('[data-dataset-authoring-setting="controlled"]').check();
  await dataPanel
    .locator('[data-dataset-authoring-setting="refreshStrategy"]')
    .selectOption('auto');
  await dataPanel.locator('[data-dataset-authoring-action="fullscreen-edit"]').click();
  const datasetWorkbench = designer.locator('[data-data-workbench]');
  await datasetWorkbench.waitFor({ state: 'visible' });
  const fullscreenSurface = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const host = root.querySelector('[data-data-workbench]');
    const layout = root.querySelector('.designer');
    const close = host?.querySelector('[data-dataset-action="close-workbench"]');
    return {
      role: host?.getAttribute('role'),
      modal: host?.getAttribute('aria-modal'),
      shell: host?.querySelector('.designer-data-workbench-shell[data-kind="dataset"]') !== null,
      layoutOpen: layout?.dataset.dataWorkbenchOpen,
      topbarHidden: getComputedStyle(root.querySelector('.designer-topbar')).display === 'none',
      closeFocused: root.activeElement === close,
    };
  });
  if (
    fullscreenSurface.role !== 'dialog' ||
    fullscreenSurface.modal !== 'true' ||
    !fullscreenSurface.shell ||
    fullscreenSurface.layoutOpen !== 'true' ||
    !fullscreenSurface.topbarHidden ||
    !fullscreenSurface.closeFocused
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_FULLSCREEN_OPEN_FAILED:${JSON.stringify(fullscreenSurface)}`,
    );
  }
  await datasetWorkbench.screenshot({
    path: `${screenshotDirectory}/data-workbench-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await datasetWorkbench.locator('[data-dataset-action="close-workbench"]').click();
  await datasetWorkbench.waitFor({ state: 'hidden' });
  const fullscreenClosed = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      layoutOpen: root.querySelector('.designer')?.dataset.dataWorkbenchOpen,
      returnFocus: root.activeElement?.dataset.datasetAuthoringAction === 'fullscreen-edit',
      propertiesVisible: getComputedStyle(root.querySelector('.properties')).display !== 'none',
    };
  });
  if (
    fullscreenClosed.layoutOpen !== undefined ||
    !fullscreenClosed.returnFocus ||
    !fullscreenClosed.propertiesVisible
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_FULLSCREEN_CLOSE_FAILED:${JSON.stringify(fullscreenClosed)}`,
    );
  }
  const authoringActions = await page.evaluate(() => ({
    actions: window.__baseScreenDatasetAuthoringActions.map((item) => item.action),
    copiedDataset: window.__baseScreenCopiedDataset,
    settings: window.__baseScreenDatasetAuthoringActions
      .filter((item) => item.action === 'update-settings')
      .map((item) => ({ setting: item.setting, value: item.value })),
    autoIntervalEnabled: !window.baseScreenHarness.designer.shadowRoot
      .querySelector('[data-dataset-authoring-setting="refreshInterval"]')
      .hasAttribute('disabled'),
  }));
  if (
    JSON.stringify(authoringActions.actions) !==
      JSON.stringify([
        'open-code-editor',
        'configure-filter',
        'copy-data',
        'update-settings',
        'update-settings',
        'update-settings',
        'fullscreen-edit',
      ]) ||
    JSON.parse(authoringActions.copiedDataset).rows?.length !== 2 ||
    JSON.stringify(authoringActions.settings) !==
      JSON.stringify([
        { setting: 'loadingDisabled', value: true },
        { setting: 'controlled', value: true },
        { setting: 'refreshStrategy', value: 'auto' },
      ]) ||
    !authoringActions.autoIntervalEnabled
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_AUTHORING_ACTION_FAILED:${JSON.stringify(authoringActions)}`,
    );
  }
  const notifications = designer.locator('[data-notification-tone="error"]');
  const notificationCount = await notifications.count();
  const notification = notifications.last();
  if (notificationCount === 0 || (await notification.getAttribute('role')) !== 'alert') {
    throw new Error('BROWSER_HARNESS_NOTIFICATION_FAILED');
  }
  await notification.getByRole('button', { name: '\u5173\u95ed\u901a\u77e5' }).click();
  if ((await notifications.count()) !== notificationCount - 1) {
    throw new Error('BROWSER_HARNESS_NOTIFICATION_DISMISS_FAILED');
  }
  await designer.getByRole('tab', { name: '\u9ad8\u7ea7' }).click();
  const interaction = designer.locator('[data-inspector-pane=interaction]');
  const interactionText = await interaction.textContent();
  if (
    interactionText === null ||
    !['\u8c03\u6574\u5927\u5c0f', '\u9884\u89c8', 'itemClick'].every((value) =>
      interactionText.includes(value),
    )
  ) {
    throw new Error(`BROWSER_HARNESS_INTERACTION_CAPABILITY_FAILED:${interactionText}`);
  }
  const events = designer.locator('[data-events-panel]');
  const requestButton = events.locator('[data-action="locate-blueprint"]');
  if (
    (await requestButton.isDisabled()) ||
    (await events.textContent())?.includes('\u4e0d\u53ef\u7528')
  ) {
    throw new Error('BROWSER_HARNESS_BLUEPRINT_CAPABILITY_FAILED');
  }
  await designer.locator('[data-inspector-pane=interaction]').screenshot({
    path: `${screenshotDirectory}/interaction-summary-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await designer.locator('[data-base-screen-component-id=title]').click({
    position: { x: 6, y: 7 },
  });
  const hostEventCount = await page.evaluate(() => window.baseScreenHarness.hostEvents.length);
  return hostEventCount;
}
