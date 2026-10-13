// 数据集作者流与数据面渲染
// 由 2 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';

// ---- 源模块：assert-dataset-authoring.mjs ----
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
  // 日期参数：输入框 + 触发器 + 自绘日历（设计原型 .datefield）；选日写回输入并派发 change。
  const dateInput = dataPanel.locator('[data-dataset-parameter="rangeStart"]');
  const dateField = dataPanel.locator(
    '.designer-date-field:has([data-dataset-parameter="rangeStart"])',
  );
  await dateField.locator('.designer-date-field-trigger').click();
  const calendar = await dateField.evaluate((anchor) => {
    const popover = anchor.querySelector('.designer-calendar-popover');
    const days = [...(popover?.querySelectorAll('[data-calendar-day]') ?? [])];
    return {
      hidden: popover?.hidden,
      title: popover?.querySelector('.designer-calendar-title')?.textContent,
      dayCount: days.length,
      selected: days.find((day) => day.dataset.selected === 'true')?.dataset.calendarDay,
      weekdays: [...(popover?.querySelectorAll('.designer-calendar-weekdays span') ?? [])]
        .map((cell) => cell.textContent)
        .join(''),
      side: popover?.dataset.side,
      triggerLabel: anchor
        .querySelector('.designer-date-field-trigger')
        ?.getAttribute('aria-label'),
    };
  });
  if (
    calendar.hidden !== false ||
    calendar.title !== '2026 \u5e74 10 \u6708' ||
    calendar.dayCount !== 42 ||
    calendar.selected !== '2026-10-01' ||
    calendar.weekdays !== '\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5' ||
    calendar.triggerLabel !== '\u6253\u5f00\u8d77\u59cb\u65e5\u671f\u65e5\u5386'
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_DATE_FIELD_FAILED:${JSON.stringify(calendar)}`);
  }
  await dateField.locator('[data-calendar-day="2026-10-15"]').click();
  const picked = await dateInput.inputValue();
  if (picked !== '2026-10-15') {
    throw new Error(`BROWSER_HARNESS_DATASET_DATE_COMMIT_FAILED:${picked}`);
  }
  // 还原默认值，保持后续断言与请求预览稳定。
  await dateInput.fill('2026-10-01');
  await dateInput.dispatchEvent('change');
  await dataPanel
    .locator('[data-dataset-action="select-step"][data-dataset-workbench-target="mapping"]')
    .click();
  const mappingSurface = await dataPanel.evaluate((panel) => ({
    // 2 个角色分区 + 1 个单选 select（measures 改为限额多选后走 bind-field 触发器，不再有 select）。
    bindingCount: panel.querySelectorAll('[data-dataset-binding-role]').length,
    applyCount: panel.querySelectorAll('[data-dataset-action="apply"]').length,
    activeStep: panel.querySelector('.designer-datav-data-flow')?.dataset.activeStep,
  }));
  if (
    mappingSurface.bindingCount !== 3 ||
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
      source?.type === 'dataset' &&
      source.datasetId === 'tabular-orders' &&
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
    appliedDatasetSource?.type !== 'dataset' ||
    appliedDatasetSource.binding?.fields.dimension?.[0] !== 'category' ||
    appliedDatasetSource.binding.fields.measures?.[0] !== 'amount' ||
    appliedDatasetSource.params.region?.kind !== 'literal'
  ) {
    throw new Error('BROWSER_HARNESS_DATASET_TRANSACTION_FAILED');
  }
  // 绑定字段选择器：触发器芯片 + 计数 + 自绘弹层（设计原型 .bind-field）；芯片 × 与选项切换共用绑定动作。
  const bindShell = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-dataset-binding-trigger="measures"]');
    const menu = panel.querySelector('[data-dataset-binding-menu="measures"]');
    const options = [...(menu?.querySelectorAll('[data-dataset-binding-field]') ?? [])];
    return {
      chips: [...(trigger?.querySelectorAll('.designer-bind-chip') ?? [])].map((chip) =>
        chip.textContent.trim(),
      ),
      count: trigger?.querySelector('[data-dataset-binding-count]')?.textContent,
      expanded: trigger?.getAttribute('aria-expanded'),
      menuHidden: menu?.hidden,
      optionTypes: options.map(
        (option) => option.querySelector('.designer-bind-type')?.textContent,
      ),
      optionSelected: options.map((option) => option.getAttribute('aria-selected')),
      foot: menu?.querySelector('.designer-bind-foot')?.textContent,
    };
  });
  if (
    bindShell.chips.join('|') !== '\u91d1\u989d' ||
    bindShell.count !== '1 / 2' ||
    bindShell.expanded !== 'false' ||
    bindShell.menuHidden !== true ||
    bindShell.optionTypes.join('|') !== 'number' ||
    bindShell.optionSelected.join('|') !== 'true' ||
    bindShell.foot !== '\u6700\u591a\u53ef\u7ed1\u5b9a 2 \u9879'
  ) {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_FIELD_FAILED:${JSON.stringify(bindShell)}`);
  }
  await dataPanel.locator('[data-dataset-binding-trigger="measures"]').click();
  await dataPanel.locator('.designer-bind-chip-x').click();
  const bindRemoved = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-dataset-binding-trigger="measures"]');
    const menu = panel.querySelector('[data-dataset-binding-menu="measures"]');
    return {
      chips: [...(trigger?.querySelectorAll('.designer-bind-chip') ?? [])].length,
      count: trigger?.querySelector('[data-dataset-binding-count]')?.textContent,
      open: menu?.hidden === false,
    };
  });
  if (bindRemoved.chips !== 0 || bindRemoved.count !== '0 / 2' || bindRemoved.open !== true) {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_REMOVE_FAILED:${JSON.stringify(bindRemoved)}`);
  }
  // 还原绑定（草稿回到已应用状态），并验证 Esc 关闭弹层。
  await dataPanel.locator('[data-dataset-binding-field="amount"]').click();
  const bindRestored = await dataPanel.evaluate((panel) => {
    const trigger = panel.querySelector('[data-dataset-binding-trigger="measures"]');
    return {
      chips: [...(trigger?.querySelectorAll('.designer-bind-chip') ?? [])].map((chip) =>
        chip.textContent.trim(),
      ),
      count: trigger?.querySelector('[data-dataset-binding-count]')?.textContent,
    };
  });
  if (bindRestored.chips.join('|') !== '\u91d1\u989d' || bindRestored.count !== '1 / 2') {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_RESTORE_FAILED:${JSON.stringify(bindRestored)}`);
  }
  await page.keyboard.press('Escape');
  const bindClosed = await dataPanel.evaluate((panel) => ({
    expanded: panel
      .querySelector('[data-dataset-binding-trigger="measures"]')
      ?.getAttribute('aria-expanded'),
    menuHidden: panel.querySelector('[data-dataset-binding-menu="measures"]')?.hidden,
  }));
  if (bindClosed.expanded !== 'false' || bindClosed.menuHidden !== true) {
    throw new Error(`BROWSER_HARNESS_DATASET_BIND_CLOSE_FAILED:${JSON.stringify(bindClosed)}`);
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

// ---- 源模块：assert-dataset-surface.mjs ----
export async function assertDatasetSurface(designer, page) {
  await designer.locator('[data-tool="select"]').click();
  const targetClickProbe = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const canvasBox = canvas.getBoundingClientRect();
    const positions = window.baseScreenHarness.designer.document.components.map((item) => ({
      id: item.id,
      position: item.position,
      size: item.size,
      zIndex: item.zIndex,
    }));
    const target = positions.find((item) => item.id === 'dataset-ranking-demo');
    const overlapped = positions.filter((item) => {
      if (item.id === target.id || item.zIndex <= target.zIndex) return false;
      return (
        item.position.x < target.position.x + target.size.width &&
        item.position.x + item.size.width > target.position.x &&
        item.position.y < target.position.y + target.size.height &&
        item.position.y + item.size.height > target.position.y
      );
    });
    return {
      canvasTransform: canvas.style.transform,
      canvasBox: { x: canvasBox.x, y: canvasBox.y },
      zoom: root.querySelector('[data-zoom]')?.textContent,
      target,
      overlapped,
    };
  });
  try {
    await designer.locator('[data-base-screen-component-id=dataset-ranking-demo]').click({
      position: { x: 6, y: 7 },
    });
  } catch (error) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_TARGET_CLICK_FAILED:${JSON.stringify(targetClickProbe)}:${error}`,
    );
  }
  await designer.getByRole('tab', { name: '\u6570\u636e\u6e90', exact: true }).click();
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  const sourceMode = dataPanel.locator('[data-data-source-mode-select]');
  await sourceMode.selectOption('dataset');
  const datasetQuery = dataPanel.locator('[data-dataset-query]');
  const datasetItem = dataPanel.locator('[data-dataset-resource-id="tabular-orders"]');
  if ((await datasetQuery.count()) === 0) {
    await dataPanel.locator('[data-dataset-change]').click();
  }
  if ((await datasetQuery.count()) !== 1) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SEARCH_SURFACE_FAILED:${await dataPanel.textContent()}`,
    );
  }
  await datasetItem.waitFor();
  await datasetItem.click();
  await dataPanel.locator('[data-dataset-descriptor]').waitFor();
  const descriptorSurface = await dataPanel.evaluate((panel) => {
    const layout = panel.closest('.designer');
    const properties = panel.closest('.properties');
    const flow = panel.querySelector('.designer-datav-data-flow');
    const content = panel.querySelector('.designer-datav-data-flow-content');
    const sourceStep = panel.querySelector('[data-dataset-workbench-target="source"]');
    const mappingStep = panel.querySelector('[data-dataset-workbench-target="mapping"]');
    const previewStep = panel.querySelector('[data-dataset-workbench-target="preview"]');
    const progress = panel.querySelector('.designer-datav-data-flow-progress');
    const sourceSection = panel.querySelector('[data-workbench-section="source"]');
    const mappingSection = panel.querySelector('[data-workbench-section="mapping"]');
    const previewSection = panel.querySelector('[data-workbench-section="preview"]');
    const advancedSection = panel.querySelector('.designer-datav-advanced-settings');
    const bindingSummary = panel.querySelector('.designer-dataset-binding-summary');
    const authoringSettings = panel.querySelector('.designer-dataset-authoring-settings');
    const workbench = layout?.querySelector('[data-data-workbench]');
    const flowBox = flow?.getBoundingClientRect();
    const contentBox = content?.getBoundingClientRect();
    const sourceBox = sourceStep?.getBoundingClientRect();
    const mappingBox = mappingStep?.getBoundingClientRect();
    const previewBox = previewStep?.getBoundingClientRect();
    const sourceSectionBox = sourceSection?.getBoundingClientRect();
    const mappingSectionBox = mappingSection?.getBoundingClientRect();
    const previewSectionBox = previewSection?.getBoundingClientRect();
    const advancedSectionBox = advancedSection?.getBoundingClientRect();
    return {
      parameterCount: panel.querySelectorAll('[data-dataset-parameter]').length,
      unlabelledParameterControls: [
        ...panel.querySelectorAll('[data-dataset-parameter], [data-dataset-parameter-mode]'),
      ].filter((control) => control.getAttribute('aria-label') === null).length,
      bindingCount: panel.querySelectorAll('[data-dataset-binding-role]').length,
      bindingSummaryEmpty:
        bindingSummary?.querySelector('.designer-dataset-binding-summary-empty') !== null,
      bindingSummaryItemCount: bindingSummary?.querySelectorAll(
        '.designer-dataset-binding-summary-item',
      ).length,
      authoringSettingsGroup: authoringSettings?.getAttribute('role') === 'group',
      authoringCheckboxCount: authoringSettings?.querySelectorAll(
        '.designer-dataset-authoring-checkbox',
      ).length,
      authoringSettingRowCount: authoringSettings?.querySelectorAll(
        '.designer-dataset-authoring-setting-row',
      ).length,
      authoringSettingsHorizontalOverflow:
        authoringSettings !== null &&
        authoringSettings.scrollWidth > authoringSettings.clientWidth + 1,
      copyActionDisabled:
        panel.querySelector('[data-dataset-authoring-action="copy-data"]')?.disabled === true,
      sourceMode: panel.querySelector('[data-data-source-mode-select]')?.value,
      activeStep: flow?.dataset.activeStep,
      layout: flow?.dataset.dataFlowLayout,
      stepCount: panel.querySelectorAll('[data-dataset-action="select-step"]').length,
      applyCount: panel.querySelectorAll('[data-dataset-action="apply"]').length,
      workbenchVisible:
        workbench !== null && !workbench.hidden && getComputedStyle(workbench).display !== 'none',
      propertiesVisible:
        properties !== null &&
        getComputedStyle(properties).display !== 'none' &&
        properties.clientWidth > 0,
      panelInlineGutter: panel.offsetWidth - panel.clientWidth,
      horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
      continuous:
        progress !== null &&
        flowBox !== undefined &&
        contentBox !== undefined &&
        sourceBox !== undefined &&
        mappingBox !== undefined &&
        previewBox !== undefined &&
        Math.abs(sourceBox.top - mappingBox.top) <= 1 &&
        Math.abs(mappingBox.top - previewBox.top) <= 1 &&
        Math.abs(contentBox.width - flowBox.width) <= 1,
      ordered:
        sourceSectionBox !== undefined &&
        mappingSectionBox !== undefined &&
        previewSectionBox !== undefined &&
        advancedSectionBox !== undefined &&
        sourceSectionBox.top < mappingSectionBox.top &&
        mappingSectionBox.top < previewSectionBox.top &&
        previewSectionBox.top < advancedSectionBox.top,
      fullscreenAction:
        panel.querySelector('[data-dataset-authoring-action="fullscreen-edit"]') !== null,
    };
  });
  if (
    descriptorSurface.parameterCount < 2 ||
    descriptorSurface.unlabelledParameterControls !== 0 ||
    descriptorSurface.bindingCount !== 3 ||
    descriptorSurface.bindingSummaryEmpty ||
    descriptorSurface.bindingSummaryItemCount !== 2 ||
    !descriptorSurface.authoringSettingsGroup ||
    descriptorSurface.authoringCheckboxCount !== 2 ||
    descriptorSurface.authoringSettingRowCount !== 2 ||
    descriptorSurface.authoringSettingsHorizontalOverflow ||
    !descriptorSurface.copyActionDisabled ||
    descriptorSurface.sourceMode !== 'dataset' ||
    descriptorSurface.activeStep !== 'source' ||
    descriptorSurface.layout !== 'continuous' ||
    descriptorSurface.stepCount !== 3 ||
    descriptorSurface.applyCount !== 1 ||
    descriptorSurface.workbenchVisible ||
    !descriptorSurface.propertiesVisible ||
    descriptorSurface.panelInlineGutter !== 0 ||
    descriptorSurface.horizontalOverflow ||
    !descriptorSurface.continuous ||
    !descriptorSurface.ordered ||
    !descriptorSurface.fullscreenAction
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_DESCRIPTOR_SURFACE_FAILED:${JSON.stringify(descriptorSurface)}`,
    );
  }
  await dataPanel.locator('[data-dataset-parameter-mode="region"]').selectOption('literal');
  const scrollContinuity = await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    const parameter = panel.querySelector('[data-dataset-parameter="region"]');
    if (!(content instanceof HTMLElement) || !(parameter instanceof HTMLInputElement)) {
      return { available: false, after: 0, before: 0, max: 0 };
    }
    const max = content.scrollHeight - content.clientHeight;
    content.scrollTop = Math.min(80, max);
    const before = content.scrollTop;
    parameter.value = 'scroll-probe';
    parameter.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    const replacement = panel.querySelector('.designer-datav-data-flow-content');
    return {
      available: replacement instanceof HTMLElement,
      after: replacement instanceof HTMLElement ? replacement.scrollTop : 0,
      before,
      max,
    };
  });
  if (
    !scrollContinuity.available ||
    scrollContinuity.max <= 0 ||
    scrollContinuity.before <= 0 ||
    scrollContinuity.after !== scrollContinuity.before
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_FORM_SCROLL_CONTINUITY_FAILED:${JSON.stringify(scrollContinuity)}`,
    );
  }
  await dataPanel
    .locator('[data-dataset-action="select-step"][data-dataset-workbench-target="mapping"]')
    .click();
  await page.waitForTimeout(400);
  const stepNavigation = await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    const mapping = panel.querySelector('[data-workbench-section="mapping"]');
    const contentBox = content?.getBoundingClientRect();
    const mappingBox = mapping?.getBoundingClientRect();
    const markerBackgrounds = Object.fromEntries(
      [...panel.querySelectorAll('[data-dataset-workbench-target]')].map((button) => [
        button.dataset.datasetWorkbenchTarget,
        getComputedStyle(button.querySelector('.designer-data-summary-step-marker'))
          .backgroundColor,
      ]),
    );
    return {
      activeStep: panel.querySelector('.designer-datav-data-flow')?.dataset.activeStep,
      markerBackgrounds,
      scrollTop: content?.scrollTop,
      mappingVisible:
        contentBox !== undefined &&
        mappingBox !== undefined &&
        mappingBox.top >= contentBox.top - 1 &&
        mappingBox.top < contentBox.bottom,
    };
  });
  if (
    stepNavigation.activeStep !== 'mapping' ||
    stepNavigation.markerBackgrounds.mapping === stepNavigation.markerBackgrounds.source ||
    stepNavigation.markerBackgrounds.mapping === stepNavigation.markerBackgrounds.preview ||
    stepNavigation.markerBackgrounds.source !== stepNavigation.markerBackgrounds.preview ||
    stepNavigation.scrollTop <= 0 ||
    !stepNavigation.mappingVisible
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_STEP_NAVIGATION_FAILED:${JSON.stringify(stepNavigation)}`,
    );
  }
  await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    if (content instanceof HTMLElement) content.scrollTop = 0;
  });
  await dataPanel
    .locator(
      '[data-dataset-action="select-step"][data-dataset-workbench-target="source"][aria-current="step"]',
    )
    .waitFor({ timeout: 5_000 });
  const scrollSyncedSourceBeforePreview = await dataPanel.evaluate((panel) => ({
    markerBackgrounds: Object.fromEntries(
      [...panel.querySelectorAll('[data-dataset-workbench-target]')].map((button) => [
        button.dataset.datasetWorkbenchTarget,
        getComputedStyle(button.querySelector('.designer-data-summary-step-marker'))
          .backgroundColor,
      ]),
    ),
  }));
  if (
    scrollSyncedSourceBeforePreview.markerBackgrounds.source ===
      scrollSyncedSourceBeforePreview.markerBackgrounds.mapping ||
    scrollSyncedSourceBeforePreview.markerBackgrounds.source ===
      scrollSyncedSourceBeforePreview.markerBackgrounds.preview ||
    scrollSyncedSourceBeforePreview.markerBackgrounds.mapping !==
      scrollSyncedSourceBeforePreview.markerBackgrounds.preview
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SCROLL_SYNC_SOURCE_MARKER_FAILED:${JSON.stringify(scrollSyncedSourceBeforePreview)}`,
    );
  }
  await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    if (content instanceof HTMLElement) content.scrollTop = content.scrollHeight;
  });
  await dataPanel
    .locator(
      '[data-dataset-action="select-step"][data-dataset-workbench-target="preview"][aria-current="step"]',
    )
    .waitFor({ timeout: 5_000 });
  const scrollSyncedPreview = await dataPanel.evaluate((panel) => ({
    activeStep: panel.querySelector('.designer-datav-data-flow')?.dataset.activeStep,
    currentTargets: [
      ...panel.querySelectorAll('[data-dataset-action="select-step"][aria-current="step"]'),
    ].map((button) => button.dataset.datasetWorkbenchTarget),
    overwrittenStates: [
      ...panel.querySelectorAll('[data-dataset-action="select-step"][data-state="current"]'),
    ].map((button) => button.dataset.datasetWorkbenchTarget),
    markerBackgrounds: Object.fromEntries(
      [...panel.querySelectorAll('[data-dataset-workbench-target]')].map((button) => [
        button.dataset.datasetWorkbenchTarget,
        getComputedStyle(button.querySelector('.designer-data-summary-step-marker'))
          .backgroundColor,
      ]),
    ),
  }));
  if (
    scrollSyncedPreview.activeStep !== 'preview' ||
    scrollSyncedPreview.currentTargets.join(',') !== 'preview' ||
    scrollSyncedPreview.overwrittenStates.length !== 0 ||
    scrollSyncedPreview.markerBackgrounds.preview ===
      scrollSyncedPreview.markerBackgrounds.source ||
    scrollSyncedPreview.markerBackgrounds.preview ===
      scrollSyncedPreview.markerBackgrounds.mapping ||
    scrollSyncedPreview.markerBackgrounds.source !== scrollSyncedPreview.markerBackgrounds.mapping
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SCROLL_SYNC_PREVIEW_FAILED:${JSON.stringify(scrollSyncedPreview)}`,
    );
  }
  await dataPanel.evaluate((panel) => {
    const content = panel.querySelector('.designer-datav-data-flow-content');
    if (content instanceof HTMLElement) content.scrollTop = 0;
  });
  await dataPanel
    .locator(
      '[data-dataset-action="select-step"][data-dataset-workbench-target="source"][aria-current="step"]',
    )
    .waitFor({ timeout: 5_000 });
  const scrollSyncedSource = await dataPanel.evaluate((panel) => ({
    activeStep: panel.querySelector('.designer-datav-data-flow')?.dataset.activeStep,
    currentTargets: [
      ...panel.querySelectorAll('[data-dataset-action="select-step"][aria-current="step"]'),
    ].map((button) => button.dataset.datasetWorkbenchTarget),
  }));
  if (
    scrollSyncedSource.activeStep !== 'source' ||
    scrollSyncedSource.currentTargets.join(',') !== 'source'
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATASET_SCROLL_SYNC_SOURCE_FAILED:${JSON.stringify(scrollSyncedSource)}`,
    );
  }
}
