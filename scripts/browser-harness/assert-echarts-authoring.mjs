import { screenshotDirectory } from './constants.mjs';

export async function assertEchartsAuthoring(designer, page) {
  const events = designer.locator('[data-events-panel]');
  // AE-ED-C01/AE-EC-C01 ECharts 语义面板：受限 Descriptor 完成常见配置，无需 raw option。
  await designer.getByRole('tab', { name: '\u6837\u5f0f' }).click();
  await designer.locator('[data-base-screen-component-id=echarts-demo]').click();
  await page.waitForFunction(
    () => {
      const material = document
        .querySelector('base-screen-designer')
        ?.shadowRoot?.querySelector('[data-base-screen-component-id="echarts-demo"]');
      return (
        material?.getAttribute('data-base-screen-data-state') === 'ready' &&
        material.querySelector('svg') !== null &&
        material.querySelector('circle') !== null
      );
    },
    undefined,
    { timeout: 5000 },
  );
  const appearance = designer.locator('[data-properties]');
  const contextActions = designer.locator('[data-inspector-context] .inspector-context-toggle');
  const statusActions = appearance.locator(
    'input[data-property="locked"], input[data-property="hidden"]',
  );
  if ((await contextActions.count()) !== 0 || (await statusActions.count()) !== 2) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_CONTEXT_ACTIONS_FAILED');
  }
  await designer.locator('[data-inspector-density="basic"]').click();
  const datavChrome = await designer.locator('[data-right-panel]').evaluate((panel) => {
    const search = panel.querySelector('[data-inspector-search-launch]');
    const density = panel.querySelector('.inspector-density');
    const quickStyle = panel.querySelector('[data-quick-style-section]');
    const xField = panel.querySelector('[data-property="x"]')?.closest('[data-property-symbol]');
    const yField = panel.querySelector('[data-property="y"]')?.closest('[data-property-symbol]');
    const zField = panel.querySelector('[data-property-symbol="Z"]');
    const subtitle = panel.querySelector('.inspector-context-subtitle');
    const panelRect = panel.getBoundingClientRect();
    const contextRect = panel.querySelector('.inspector-context')?.getBoundingClientRect();
    const toolbarRect = panel.querySelector('.inspector-toolbar')?.getBoundingClientRect();
    const xRect = xField?.getBoundingClientRect();
    const yRect = yField?.getBoundingClientRect();
    return {
      searchWidth: search?.getBoundingClientRect().width,
      toolbarInsideContext:
        contextRect !== undefined &&
        toolbarRect !== undefined &&
        toolbarRect.top >= contextRect.top &&
        toolbarRect.bottom <= contextRect.bottom,
      geometryTopOffset: xRect === undefined ? undefined : xRect.top - panelRect.top,
      geometryControlHeight: xRect?.height,
      geometryColumnGap:
        xRect === undefined || yRect === undefined ? undefined : yRect.left - xRect.right,
      zHiddenInBasic: zField?.hidden,
      hasNameProperty: panel.querySelector('[data-property="name"]') !== null,
      densityDisplay: density === null ? undefined : getComputedStyle(density).display,
      quickStyleSections: panel.querySelectorAll('[data-quick-style-section]').length,
      quickStyleOpen: quickStyle?.querySelector('details')?.open,
      quickStyleHasPresets: quickStyle?.querySelector('.designer-quick-style-grid') !== null,
      quickStyleHasConfig: quickStyle?.querySelector('.designer-quick-config-row') !== null,
      xSymbolRight: xField === null ? undefined : getComputedStyle(xField, '::before').right,
      xInputAlign:
        xField === null
          ? undefined
          : getComputedStyle(xField.querySelector('[data-property="x"]')).textAlign,
      subtitle: subtitle?.textContent,
      hasMaterialIcon:
        panel.querySelector('.inspector-context-material-icon svg')?.getAttribute('aria-hidden') ===
        'true',
    };
  });
  if (
    datavChrome.searchWidth !== 28 ||
    !datavChrome.toolbarInsideContext ||
    datavChrome.geometryTopOffset < 127 ||
    datavChrome.geometryTopOffset > 133 ||
    datavChrome.geometryControlHeight !== 28 ||
    datavChrome.geometryColumnGap !== 14 ||
    datavChrome.zHiddenInBasic !== true ||
    datavChrome.hasNameProperty ||
    datavChrome.densityDisplay === 'none' ||
    datavChrome.quickStyleSections !== 1 ||
    datavChrome.quickStyleOpen !== true ||
    !datavChrome.quickStyleHasPresets ||
    !datavChrome.quickStyleHasConfig ||
    datavChrome.xSymbolRight !== '8px' ||
    datavChrome.xInputAlign !== 'left' ||
    !datavChrome.subtitle?.includes('base.echarts') ||
    !datavChrome.hasMaterialIcon
  ) {
    throw new Error(`BROWSER_HARNESS_DATAV_INSPECTOR_CHROME_FAILED:${JSON.stringify(datavChrome)}`);
  }
  await designer.locator('[data-inspector-density="all"]').click();
  if (!(await appearance.locator('[data-property="zIndex"]').isVisible())) {
    throw new Error('BROWSER_HARNESS_DATAV_FULL_GEOMETRY_FAILED');
  }
  await designer.locator('[data-inspector-density="basic"]').click();
  if (await appearance.locator('[data-property="zIndex"]').isVisible()) {
    throw new Error('BROWSER_HARNESS_DATAV_BASIC_GEOMETRY_FAILED');
  }
  const flipLabels = await appearance
    .locator('[data-geometry-action]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  if (
    JSON.stringify(flipLabels) !==
    JSON.stringify(['\u6c34\u5e73\u7ffb\u8f6c', '\u5782\u76f4\u7ffb\u8f6c'])
  ) {
    throw new Error(`BROWSER_HARNESS_DATAV_FLIP_LABELS_FAILED:${JSON.stringify(flipLabels)}`);
  }
  const quickPresets = appearance.locator('[data-quick-style]');
  const colorCapabilities = await appearance.evaluate((panel) => ({
    backgroundModes: panel.querySelectorAll(
      '[data-descriptor-field-id="backgroundColor"][data-color-palette-field="mode"]',
    ).length,
    textModes: panel.querySelectorAll(
      '[data-descriptor-field-id="textColor"][data-color-palette-field="mode"]',
    ).length,
    titleModes: panel.querySelectorAll(
      '[data-descriptor-field-id="titleColor"][data-color-palette-field="mode"]',
    ).length,
  }));
  if (
    colorCapabilities.backgroundModes !== 3 ||
    colorCapabilities.textModes !== 0 ||
    colorCapabilities.titleModes !== 0
  ) {
    throw new Error(
      `BROWSER_HARNESS_COLOR_CAPABILITIES_FAILED:${JSON.stringify(colorCapabilities)}`,
    );
  }
  await appearance.evaluate((panel) => {
    const linear = panel.querySelector(
      '[data-descriptor-field-id="backgroundColor"][data-color-palette-field="mode"][value="linear-gradient"]',
    );
    if (!(linear instanceof HTMLInputElement)) {
      throw new Error('BROWSER_HARNESS_ECHARTS_BACKGROUND_GRADIENT_CONTROL_MISSING');
    }
    linear.checked = true;
    linear.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (candidate) => candidate.id === 'echarts-demo',
    );
    const material = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '[data-base-screen-component-id="echarts-demo"]',
    );
    return (
      component?.style.backgroundColor?.startsWith('linear-gradient(') &&
      material?.style.backgroundImage.startsWith('linear-gradient(') &&
      material.style.backgroundColor === 'transparent'
    );
  });
  await quickPresets.nth(1).click();
  await page.waitForFunction(() => {
    const style = window.baseScreenHarness.designer.document.components.find(
      (component) => component.id === 'echarts-demo',
    )?.style;
    return (
      style?.backgroundColor === '#0f172a' &&
      style?.color === '#e2e8f0' &&
      style?.gridColor === '#334155'
    );
  });
  const presetStates = await appearance
    .locator('[data-quick-style]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
  if (
    presetStates[1] !== 'true' ||
    presetStates.some((state, index) => index !== 1 && state === 'true')
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_QUICK_PRESET_STATE_FAILED:${JSON.stringify(presetStates)}`,
    );
  }
  const quickColors = appearance.locator('[data-quick-config="colors"]');
  const quickColorLabels = await quickColors.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  );
  if (
    JSON.stringify(quickColorLabels) !==
    JSON.stringify([
      '\u56fe\u8868\u989c\u8272 #38BDF8',
      '\u56fe\u8868\u989c\u8272 #4ADE80',
      '\u56fe\u8868\u989c\u8272 #F97316',
      '\u56fe\u8868\u989c\u8272 #A78BFA',
      '\u56fe\u8868\u989c\u8272 #FACC15',
      '\u56fe\u8868\u989c\u8272 #FB7185',
    ])
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_QUICK_COLOR_LABELS_FAILED:${JSON.stringify(quickColorLabels)}`,
    );
  }
  const quickColorPresentation = await quickColors.evaluateAll((buttons) =>
    buttons.map((button) => ({
      value: button.getAttribute('data-quick-config-value'),
      backgroundColor: getComputedStyle(button).backgroundColor,
    })),
  );
  const expectedQuickColorPresentation = [
    { value: '#38bdf8', backgroundColor: 'rgb(56, 189, 248)' },
    { value: '#4ade80', backgroundColor: 'rgb(74, 222, 128)' },
    { value: '#f97316', backgroundColor: 'rgb(249, 115, 22)' },
    { value: '#a78bfa', backgroundColor: 'rgb(167, 139, 250)' },
    { value: '#facc15', backgroundColor: 'rgb(250, 204, 21)' },
    { value: '#fb7185', backgroundColor: 'rgb(251, 113, 133)' },
  ];
  if (JSON.stringify(quickColorPresentation) !== JSON.stringify(expectedQuickColorPresentation)) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_QUICK_COLOR_PRESENTATION_FAILED:${JSON.stringify(quickColorPresentation)}`,
    );
  }
  await quickColors.nth(1).click();
  await page.waitForFunction(() => {
    const component = window.baseScreenHarness.designer.document.components.find(
      (candidate) => candidate.id === 'echarts-demo',
    );
    return (
      component?.style.color === '#4ade80' &&
      component.style.gridColor === '#4ade80' &&
      component.props.series?.every((series) => series.color === '#4ade80')
    );
  });
  const quickColorStates = await appearance
    .locator('[data-quick-config="colors"]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
  if (
    quickColorStates[1] !== 'true' ||
    quickColorStates.some((state, index) => index !== 1 && state === 'true')
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_QUICK_COLOR_STATE_FAILED:${JSON.stringify(quickColorStates)}`,
    );
  }
  const sectionNames = await appearance
    .locator('.designer-descriptor-group-summary')
    .allTextContents();
  if (
    ![
      '\u6807\u9898',
      '\u56fe\u4f8b',
      '\u7f51\u683c',
      '\u5750\u6807\u8f74',
      '\u7cfb\u5217',
      '\u9ad8\u7ea7',
    ].every((name) => sectionNames.includes(name))
  ) {
    throw new Error(`BROWSER_HARNESS_ECHARTS_SECTIONS_FAILED:${sectionNames.join(',')}`);
  }
  const advancedDetails = appearance
    .locator('details.designer-descriptor-group')
    .filter({ hasText: '\u9ad8\u7ea7' });
  if (await advancedDetails.getAttribute('open')) {
    throw new Error('BROWSER_HARNESS_ECHARTS_ADVANCED_COLLAPSED_FAILED');
  }
  await designer.locator('[data-inspector-search-launch]').click();
  const inspectorSearch = designer.locator('[data-inspector-search]');
  const expandedSearch = await designer.locator('[data-right-panel]').evaluate((panel) => ({
    width: panel.querySelector('[data-inspector-search]')?.getBoundingClientRect().width,
    workspaceDisplay: getComputedStyle(panel.querySelector('[data-inspector-search-workspace]'))
      .display,
    contextDisplay: getComputedStyle(panel.querySelector('[data-inspector-context]')).display,
    toolbarDisplay: getComputedStyle(panel.querySelector('.inspector-toolbar')).display,
    open: panel.hasAttribute('data-inspector-search-open'),
  }));
  if (
    (expandedSearch.width ?? 0) < 260 ||
    expandedSearch.workspaceDisplay !== 'grid' ||
    expandedSearch.contextDisplay !== 'none' ||
    expandedSearch.toolbarDisplay !== 'none' ||
    !expandedSearch.open
  ) {
    throw new Error(
      `BROWSER_HARNESS_DATAV_INSPECTOR_SEARCH_EXPANSION_FAILED:${JSON.stringify(expandedSearch)}`,
    );
  }
  await inspectorSearch.fill('\u6807\u7b7e\u65cb\u8f6c');
  const advancedSearchResult = designer.locator('.inspector-search-result').filter({
    hasText: '\u8f74\u6807\u7b7e\u65cb\u8f6c',
  });
  if (
    (await advancedSearchResult.count()) !== 1 ||
    !(await advancedSearchResult.textContent())?.includes('\u9ad8\u7ea7')
  ) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_ADVANCED_SEARCH_FAILED');
  }
  const searchEditor = advancedSearchResult.locator('[data-descriptor-field-id="axisLabelRotate"]');
  await searchEditor.fill('18');
  await searchEditor.press('Enter');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props.advanced?.axisLabelRotate === 18,
  );
  await advancedSearchResult.click({ button: 'right' });
  const searchContextMenu = advancedSearchResult.locator('[data-inspector-search-menu]');
  if (
    !(await searchContextMenu.isVisible()) ||
    (await searchContextMenu.locator('[data-inspector-search-copy-target]').count()) !== 1 ||
    (await searchContextMenu.locator('[data-inspector-search-paste-target]').count()) !== 1
  ) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_SEARCH_CONTEXT_MENU_FAILED');
  }
  await searchContextMenu.locator('[data-inspector-search-copy-target]').click();
  await designer.locator('[data-right-panel]').screenshot({
    path: `${screenshotDirectory}/inspector-search-${page.viewportSize()?.width ?? 'desktop'}.png`,
  });
  await advancedSearchResult.locator('[data-inspector-search-target]').click();
  if ((await designer.locator('[data-descriptor-field-id="axisLabelRotate"]').count()) !== 1) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_SEARCH_FOCUS_FAILED');
  }
  await designer.locator('button[data-inspector-density="all"]').click();
  await advancedDetails.locator('summary').click();
  for (const componentId of ['title', 'echarts-demo']) {
    await page.evaluate((id) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      root
        .querySelector(`[data-layer-select="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    }, componentId);
  }
  if ((await advancedDetails.getAttribute('open')) === null) {
    throw new Error('BROWSER_HARNESS_INSPECTOR_GROUP_PERSISTENCE_FAILED');
  }
  await advancedDetails.locator('summary').click();
  await designer.locator('button[data-inspector-density="basic"]').click();
  const titleText = appearance.locator('[data-descriptor-field-id="titleText"]');
  await titleText.fill('\u9500\u552e\u8d8b\u52bf');
  await titleText.press('Enter');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props?.title?.text === '\u9500\u552e\u8d8b\u52bf',
  );
  // 条件字段：次 Y 轴名称仅在“显示次 Y 轴”为 true 时渲染。
  const yAxis2Name = appearance.locator('[data-descriptor-field-id="yAxis2Name"]');
  if ((await yAxis2Name.count()) !== 0) {
    throw new Error('BROWSER_HARNESS_ECHARTS_CONDITION_HIDDEN_FAILED');
  }
  await appearance.locator('[data-descriptor-field-id="yAxis2Show"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props?.yAxis2?.show === true,
  );
  await appearance.locator('[data-descriptor-field-id="yAxis2Name"]').waitFor();
  // 重复系列数组：添加一个 series（reorderable-array primitive）。
  await appearance.locator('[data-descriptor-array-action="add"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.props?.series?.length === 2,
  );
  // AE-ED-C04 数据 tab：字段选择器投影到宿主数据集字段。
  await designer.getByRole('tab', { name: '\u6570\u636e' }).click();
  await designer
    .locator(
      '[data-inspector-pane=data] [data-dataset-action="select-step"][data-dataset-workbench-target="mapping"]',
    )
    .click();
  const fieldSelector = designer.locator(
    '[data-inspector-pane=data] [data-descriptor-field-id="dimensionField"]',
  );
  await fieldSelector.waitFor();
  if ((await fieldSelector.locator('option').count()) < 2) {
    throw new Error('BROWSER_HARNESS_ECHARTS_FIELD_SELECTOR_FAILED');
  }
  await fieldSelector.selectOption('amount');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.dataSource?.binding?.fields?.dimension?.[0] === 'amount',
  );
  await fieldSelector.selectOption('category');
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'echarts-demo',
      )?.dataSource?.binding?.fields?.dimension?.[0] === 'category',
  );
  // AE-ED-C05 事件 tab：结构化事件声明 label 与能力提示。
  await designer.getByRole('tab', { name: '\u9ad8\u7ea7' }).click();
  const eventText = await events.textContent();
  if (
    eventText === null ||
    !eventText.includes('\u7cfb\u5217\u70b9\u51fb') ||
    !eventText.includes('\u80fd\u529b\u53ef\u7528')
  ) {
    throw new Error(`BROWSER_HARNESS_ECHARTS_EVENT_DECLARATION_FAILED:${eventText}`);
  }
}
