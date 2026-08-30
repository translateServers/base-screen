export async function assertDatasetSurface(designer, page) {
  await designer.getByTitle('\u9009\u62e9').click();
  const titleClickProbe = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    const canvasBox = canvas.getBoundingClientRect();
    const positions = window.baseScreenHarness.designer.document.components.map((item) => ({
      id: item.id,
      position: item.position,
      size: item.size,
      zIndex: item.zIndex,
    }));
    const title = positions.find((item) => item.id === 'title');
    const overlapped = positions.filter((item) => {
      if (item.id === 'title' || item.zIndex <= title.zIndex) return false;
      return (
        item.position.x < title.position.x + title.size.width &&
        item.position.x + item.size.width > title.position.x &&
        item.position.y < title.position.y + title.size.height &&
        item.position.y + item.size.height > title.position.y
      );
    });
    return {
      canvasTransform: canvas.style.transform,
      canvasBox: { x: canvasBox.x, y: canvasBox.y },
      zoom: root.querySelector('[data-zoom]')?.textContent,
      title,
      overlapped,
    };
  });
  try {
    // 前序物料面板添加的组件（base-text-6 等）与 title 重叠，点击左上角未被遮挡的区域。
    await designer.locator('[data-base-screen-component-id=title]').click({
      position: { x: 6, y: 7 },
    });
  } catch (error) {
    throw new Error(
      `BROWSER_HARNESS_TITLE_CLICK_FAILED:${JSON.stringify(titleClickProbe)}:${error}`,
    );
  }
  await designer.getByRole('tab', { name: '\u6570\u636e\u6e90', exact: true }).click();
  const dataPanel = designer.locator('[data-inspector-pane=data]');
  const sourceMode = dataPanel.locator('[data-data-source-mode-select]');
  await sourceMode.selectOption('dataset');
  const datasetQuery = dataPanel.locator('[data-dataset-query]');
  const datasetItem = dataPanel.locator('[data-dataset-resource-id="tabular-orders"]');
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
    descriptorSurface.bindingCount !== 0 ||
    !descriptorSurface.bindingSummaryEmpty ||
    descriptorSurface.bindingSummaryItemCount !== 0 ||
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
