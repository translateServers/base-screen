import { screenshotDirectory } from './constants.mjs';

export async function assertLeftPanelLayers(page, viewport) {
  // R5：图层树增强（嵌套文档独立实例验证：DataV 前置图层顺序、六项工具栏、
  // 引导线变量、子项计数、定位入口与 hover/focus 展开操作簇）。
  await page.evaluate(() => {
    const { catalog } = window.baseScreenHarness;
    const textManifest = window.baseScreenHarness.materialManifests.text;
    const probe = document.createElement('base-screen-designer');
    probe.setAttribute('data-layer-probe', 'true');
    probe.catalog = catalog;
    probe.document = {
      canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
      components: [
        {
          id: 'probe-group',
          type: 'base.text',
          name: '\u5bb9\u5668',
          parentId: null,
          position: { x: 0, y: 0 },
          size: { width: 200, height: 160 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: null,
        },
        {
          id: 'probe-a',
          type: 'base.text',
          name: '\u5b50\u9879\u7532',
          parentId: 'probe-group',
          position: { x: 0, y: 0 },
          size: { width: 80, height: 32 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: null,
        },
        {
          id: 'probe-b',
          type: 'base.text',
          name: '\u5b50\u9879\u4e59',
          parentId: 'probe-group',
          position: { x: 0, y: 40 },
          size: { width: 80, height: 32 },
          rotation: 0,
          zIndex: 1,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { rules: [] },
    };
    probe.style.cssText = 'position:fixed;inset:0;z-index:99;width:1024px;height:640px;';
    document.body.appendChild(probe);
  });
  const probe = page.locator('base-screen-designer[data-layer-probe]');
  await probe.locator('[data-panel-tab="layers"]').click();
  const layerProbe = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const groupRow = root.querySelector('[data-layer-id="probe-group"]');
    const childRow = root.querySelector('[data-layer-id="probe-a"]');
    const actions = childRow?.querySelector('.layer-actions');
    const toolbar = root.querySelector('[data-layer-toolbar]');
    // 显隐已下沉到按钮级，测量操作按钮本体。
    const actionButton = childRow?.querySelector(
      '.layer-actions [data-layer-locate], .layer-actions [data-layer-toggle], .layer-actions [data-layer-move]',
    );
    return {
      childDepth: childRow?.style.getPropertyValue('--layer-depth'),
      childIndent: childRow?.style.paddingInlineStart,
      count: groupRow?.querySelector('.layer-count')?.textContent,
      childOrder: [
        ...root.querySelectorAll(
          '.layer-row[data-layer-id="probe-a"], .layer-row[data-layer-id="probe-b"]',
        ),
      ].map((row) => row.dataset.layerId),
      toolbarButtons: toolbar?.querySelectorAll('button').length ?? 0,
      toolbarButtonMinimum: Math.min(
        ...[...(toolbar?.querySelectorAll('button') ?? [])].map((button) =>
          Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height),
        ),
      ),
      actionButtons:
        actions === null || actions === undefined
          ? 0
          : actions.querySelectorAll('[data-layer-locate], [data-layer-toggle], [data-layer-move]')
              .length,
      actionButtonOpacity:
        actionButton === null || actionButton === undefined
          ? ''
          : getComputedStyle(actionButton).opacity,
      iconButtons: [
        ...(groupRow?.querySelectorAll(
          '[data-layer-locate] svg, [data-layer-toggle] svg, [data-layer-move] svg',
        ) ?? []),
      ].length,
    };
  });
  if (
    layerProbe.childDepth !== '1' ||
    layerProbe.childIndent !== '20px' ||
    layerProbe.count !== '2' ||
    JSON.stringify(layerProbe.childOrder) !== JSON.stringify(['probe-b', 'probe-a']) ||
    layerProbe.toolbarButtons !== 6 ||
    layerProbe.toolbarButtonMinimum < 24 ||
    layerProbe.actionButtons !== 5 ||
    layerProbe.actionButtonOpacity !== '0' ||
    layerProbe.iconButtons !== 5
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_TREE_DESIGN_FAILED:${JSON.stringify(layerProbe)}`);
  }
  const childRow = probe.locator('.layer-row[data-layer-id="probe-a"]');
  const childHeightBefore = await childRow.evaluate((element) => element.offsetHeight);
  // 高亮整行必须都是有效选择命中区（操作按钮除外）；先点缩进空白，再点名称按钮，
  // 两条路径都不得误触隐藏/锁定或改变 36px 紧凑行高。
  await childRow.click({ position: { x: 1, y: childHeightBefore / 2 } });
  await childRow.locator('[data-layer-select="probe-a"]').click();
  const selectedState = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const row = root.querySelector('[data-layer-id="probe-a"]');
    const style = row === null ? undefined : getComputedStyle(row);
    return {
      selected: row?.getAttribute('aria-selected'),
      hidden: row?.dataset.hidden ?? 'false',
      height: row?.offsetHeight ?? 0,
      cursor: style?.cursor,
      backgroundColor: style?.backgroundColor,
      boxShadow: style?.boxShadow,
      frontDisabled: root.querySelector('[data-layer-arrange="front"]')?.disabled,
      upDisabled: root.querySelector('[data-layer-arrange="up"]')?.disabled,
      downDisabled: root.querySelector('[data-layer-arrange="down"]')?.disabled,
      backDisabled: root.querySelector('[data-layer-arrange="back"]')?.disabled,
    };
  });
  if (
    selectedState.selected !== 'true' ||
    selectedState.hidden !== 'false' ||
    selectedState.height !== 36 ||
    selectedState.cursor !== 'pointer' ||
    selectedState.backgroundColor === 'rgba(0, 0, 0, 0)' ||
    selectedState.boxShadow === 'none' ||
    selectedState.frontDisabled !== false ||
    selectedState.upDisabled !== false ||
    selectedState.downDisabled !== true ||
    selectedState.backDisabled !== true
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SELECT_HIT_TARGET_FAILED:${JSON.stringify(selectedState)}`,
    );
  }
  await probe.locator('[data-viewport]').focus();
  await page.keyboard.press(']');
  await page.waitForTimeout(50);
  const shortcutUp = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      childOrder: [
        ...root.querySelectorAll(
          '.layer-row[data-layer-id="probe-a"], .layer-row[data-layer-id="probe-b"]',
        ),
      ].map((row) => row.dataset.layerId),
      zIndexes: Object.fromEntries(
        element.document.components
          .filter((component) => component.id === 'probe-a' || component.id === 'probe-b')
          .map((component) => [component.id, component.zIndex]),
      ),
      selectedIds: [...root.querySelectorAll('.layer-row[aria-selected="true"]')].map(
        (row) => row.dataset.layerId,
      ),
    };
  });
  if (
    JSON.stringify(shortcutUp.childOrder) !== JSON.stringify(['probe-a', 'probe-b']) ||
    shortcutUp.zIndexes['probe-a'] <= shortcutUp.zIndexes['probe-b'] ||
    JSON.stringify(shortcutUp.selectedIds) !== JSON.stringify(['probe-a'])
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_SHORTCUT_UP_FAILED:${JSON.stringify(shortcutUp)}`);
  }
  await page.keyboard.press('[');
  await page.waitForTimeout(50);
  const shortcutDown = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      childOrder: [
        ...root.querySelectorAll(
          '.layer-row[data-layer-id="probe-a"], .layer-row[data-layer-id="probe-b"]',
        ),
      ].map((row) => row.dataset.layerId),
      zIndexes: Object.fromEntries(
        element.document.components
          .filter((component) => component.id === 'probe-a' || component.id === 'probe-b')
          .map((component) => [component.id, component.zIndex]),
      ),
      selectedIds: [...root.querySelectorAll('.layer-row[aria-selected="true"]')].map(
        (row) => row.dataset.layerId,
      ),
    };
  });
  if (
    JSON.stringify(shortcutDown.childOrder) !== JSON.stringify(['probe-b', 'probe-a']) ||
    shortcutDown.zIndexes['probe-a'] >= shortcutDown.zIndexes['probe-b'] ||
    JSON.stringify(shortcutDown.selectedIds) !== JSON.stringify(['probe-a'])
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_SHORTCUT_DOWN_FAILED:${JSON.stringify(shortcutDown)}`);
  }
  // 首次单击会重绘图层树；使用真实鼠标双击验证第二次点击跨新 DOM 行仍进入重命名，
  // 且输入框立即获得焦点并保留原名称，而不是仅直接派发一个不可达的 dblclick。
  await childRow.dblclick({ position: { x: 80, y: childHeightBefore / 2 }, delay: 60 });
  const renameInput = probe.locator('[data-layer-rename="probe-a"]');
  await renameInput.waitFor({ state: 'visible' });
  const renameState = await renameInput.evaluate((input) => ({
    focused: input.getRootNode().activeElement === input,
    value: input.value,
  }));
  if (!renameState.focused || renameState.value !== '\u5b50\u9879\u7532') {
    throw new Error(`BROWSER_HARNESS_LAYER_RENAME_FOCUS_FAILED:${JSON.stringify(renameState)}`);
  }
  await renameInput.press('End');
  await renameInput.press(']');
  const editableRightBracket = await probe.evaluate((element) => ({
    value: element.shadowRoot?.querySelector('[data-layer-rename="probe-a"]')?.value,
    zIndexes: Object.fromEntries(
      element.document.components
        .filter((component) => component.id === 'probe-a' || component.id === 'probe-b')
        .map((component) => [component.id, component.zIndex]),
    ),
  }));
  if (
    editableRightBracket.value !== '\u5b50\u9879\u7532]' ||
    editableRightBracket.zIndexes['probe-a'] >= editableRightBracket.zIndexes['probe-b']
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SHORTCUT_EDITABLE_RIGHT_FAILED:${JSON.stringify(editableRightBracket)}`,
    );
  }
  await renameInput.press('[');
  const editableLeftBracket = await probe.evaluate((element) => ({
    value: element.shadowRoot?.querySelector('[data-layer-rename="probe-a"]')?.value,
    zIndexes: Object.fromEntries(
      element.document.components
        .filter((component) => component.id === 'probe-a' || component.id === 'probe-b')
        .map((component) => [component.id, component.zIndex]),
    ),
  }));
  if (
    editableLeftBracket.value !== '\u5b50\u9879\u7532][' ||
    editableLeftBracket.zIndexes['probe-a'] >= editableLeftBracket.zIndexes['probe-b']
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SHORTCUT_EDITABLE_LEFT_FAILED:${JSON.stringify(editableLeftBracket)}`,
    );
  }
  await renameInput.fill('\u5b50\u9879\u7532\u5df2\u91cd\u547d\u540d');
  await renameInput.press('Enter');
  const renamedLayer = await probe.evaluate((element) => ({
    documentName: element.document.components.find((component) => component.id === 'probe-a')?.name,
    visibleName: element.shadowRoot
      ?.querySelector('[data-layer-id="probe-a"] .layer-name')
      ?.textContent?.trim(),
    editing: element.shadowRoot?.querySelector('[data-layer-rename="probe-a"]') !== null,
  }));
  if (
    renamedLayer.documentName !== '\u5b50\u9879\u7532\u5df2\u91cd\u547d\u540d' ||
    renamedLayer.visibleName !== '\u5b50\u9879\u7532\u5df2\u91cd\u547d\u540d' ||
    renamedLayer.editing
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_RENAME_COMMIT_FAILED:${JSON.stringify(renamedLayer)}`);
  }
  await probe.evaluate((element) => {
    element.dataset.layerChangeCount = '0';
    element.dataset.layerDiagnosticCodes = '';
    element.dataset.layerClickedAction = '';
    element.addEventListener('base-screen-change', () => {
      element.dataset.layerChangeCount = String(Number(element.dataset.layerChangeCount) + 1);
    });
    element.addEventListener('base-screen-diagnostic', (event) => {
      element.dataset.layerDiagnosticCodes = (event.detail?.diagnostics ?? [])
        .map((diagnostic) => diagnostic.code)
        .join(',');
    });
    element.shadowRoot.addEventListener('click', (event) => {
      element.dataset.layerClickedAction =
        event.target.closest?.('[data-layer-arrange]')?.dataset.layerArrange ?? '';
    });
  });
  await probe.locator('[data-layer-arrange="up"]').click();
  await page.waitForTimeout(100);
  const arrangedState = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      childOrder: [
        ...root.querySelectorAll(
          '.layer-row[data-layer-id="probe-a"], .layer-row[data-layer-id="probe-b"]',
        ),
      ].map((row) => row.dataset.layerId),
      zIndexes: Object.fromEntries(
        element.document.components
          .filter((component) => component.id === 'probe-a' || component.id === 'probe-b')
          .map((component) => [component.id, component.zIndex]),
      ),
      changeCount: element.dataset.layerChangeCount,
      diagnosticCodes: element.dataset.layerDiagnosticCodes,
      clickedAction: element.dataset.layerClickedAction,
      selectedIds: [...root.querySelectorAll('.layer-row[aria-selected="true"]')].map(
        (row) => row.dataset.layerId,
      ),
    };
  });
  if (
    JSON.stringify(arrangedState.childOrder) !== JSON.stringify(['probe-a', 'probe-b']) ||
    arrangedState.zIndexes['probe-a'] <= arrangedState.zIndexes['probe-b'] ||
    arrangedState.changeCount !== '1' ||
    arrangedState.diagnosticCodes !== '' ||
    arrangedState.clickedAction !== 'up' ||
    JSON.stringify(arrangedState.selectedIds) !== JSON.stringify(['probe-a'])
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_TOOLBAR_ARRANGE_FAILED:${JSON.stringify(arrangedState)}`,
    );
  }
  const canvasTransformBeforeLocate = await probe
    .locator('[data-canvas]')
    .evaluate((element) => element.style.transform);
  await probe.locator('[data-layer-locate="probe-a"]').click();
  const locateState = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      transform: root.querySelector('[data-canvas]')?.style.transform ?? '',
      viewportFocused: root.activeElement === root.querySelector('[data-viewport]'),
    };
  });
  if (locateState.transform === canvasTransformBeforeLocate || !locateState.viewportFocused) {
    throw new Error(`BROWSER_HARNESS_LAYER_LOCATE_FAILED:${JSON.stringify(locateState)}`);
  }
  await childRow.hover();
  await page.waitForTimeout(250);
  const childHeightAfter = await childRow.evaluate((element) => element.offsetHeight);
  const actionsOpacity = await childRow
    .locator('.layer-actions .designer-button')
    .first()
    .evaluate((element) => getComputedStyle(element).opacity);
  if (actionsOpacity !== '1' || childHeightBefore !== childHeightAfter) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_ACTIONS_REVEAL_FAILED:${JSON.stringify({ actionsOpacity, childHeightBefore, childHeightAfter })}`,
    );
  }
  const actionCluster = childRow.locator('.layer-actions');
  await actionCluster.hover();
  await page.waitForTimeout(250);
  const expandedActions = await actionCluster.evaluate((element) => ({
    width: Math.round(element.getBoundingClientRect().width),
    visibleButtons: [...element.querySelectorAll('button')].filter(
      (button) => Number(getComputedStyle(button).opacity) > 0,
    ).length,
    rowHeight: element.closest('[data-layer-id]')?.offsetHeight ?? 0,
  }));
  if (
    expandedActions.width < 120 ||
    expandedActions.visibleButtons !== 5 ||
    expandedActions.rowHeight !== childHeightBefore
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_ACTIONS_EXPAND_FAILED:${JSON.stringify(expandedActions)}`,
    );
  }
  // Alt+[] 只切换选区：顺序复用完整图层树，跳过有效隐藏项，但保留锁定项；
  // 多选以焦点项为锚点并收敛为单选，首尾不循环，文档与历史保持不变。
  await probe.evaluate((element) => {
    const [group, childA, childB] = element.document.components;
    element.document = {
      ...element.document,
      components: [
        { ...group, zIndex: 2, status: { locked: false, hidden: false } },
        { ...childA, zIndex: 0, status: { locked: false, hidden: false } },
        { ...childB, zIndex: 1, status: { locked: true, hidden: false } },
        {
          ...childA,
          id: 'probe-hidden',
          name: 'Hidden',
          parentId: null,
          zIndex: 3,
          status: { locked: false, hidden: true },
        },
        {
          ...childA,
          id: 'probe-back',
          name: 'Back',
          parentId: null,
          zIndex: 0,
          status: { locked: false, hidden: false },
        },
      ],
    };
  });
  await page.waitForTimeout(50);
  const layerSelectionDocument = await probe.evaluate((element) =>
    JSON.stringify(element.document),
  );
  const layerSelectionViewport = probe.locator('[data-viewport]');
  await layerSelectionViewport.focus();
  await page.keyboard.press('Alt+]');
  await page.waitForTimeout(50);
  const firstLayerSelection = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      selectedIds: [...root.querySelectorAll('.layer-row[aria-selected="true"]')].map(
        (row) => row.dataset.layerId,
      ),
      focused: root.activeElement === root.querySelector('[data-viewport]'),
      upDisabled: root.querySelector('[data-menu-action="select-layer-up"]')?.disabled,
      downDisabled: root.querySelector('[data-menu-action="select-layer-down"]')?.disabled,
      helpUp: root.querySelector('[data-help-operation="select-layer-up"] kbd')?.textContent,
      helpDown: root.querySelector('[data-help-operation="select-layer-down"] kbd')?.textContent,
    };
  });
  if (
    JSON.stringify(firstLayerSelection.selectedIds) !== JSON.stringify(['probe-group']) ||
    !firstLayerSelection.focused ||
    firstLayerSelection.upDisabled !== true ||
    firstLayerSelection.downDisabled !== false ||
    firstLayerSelection.helpUp !== 'Alt+]' ||
    firstLayerSelection.helpDown !== 'Alt+['
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SELECTION_FIRST_FAILED:${JSON.stringify(firstLayerSelection)}`,
    );
  }
  const selectionModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await probe.locator('[data-layer-select="probe-a"]').click({ modifiers: [selectionModifier] });
  await layerSelectionViewport.focus();
  await page.keyboard.press('Alt+]');
  await page.waitForTimeout(50);
  const focusedMultiStep = await probe.evaluate((element) => ({
    selectedIds: [...element.shadowRoot.querySelectorAll('.layer-row[aria-selected="true"]')].map(
      (row) => row.dataset.layerId,
    ),
    document: JSON.stringify(element.document),
    lockedSelected:
      element.shadowRoot
        .querySelector('[data-layer-id="probe-b"]')
        ?.getAttribute('aria-selected') === 'true',
  }));
  if (
    JSON.stringify(focusedMultiStep.selectedIds) !== JSON.stringify(['probe-b']) ||
    !focusedMultiStep.lockedSelected ||
    focusedMultiStep.document !== layerSelectionDocument
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SELECTION_MULTI_FAILED:${JSON.stringify(focusedMultiStep)}`,
    );
  }
  await page.keyboard.press('Alt+]');
  await page.keyboard.press('Alt+]');
  await page.waitForTimeout(50);
  const boundarySelection = await probe.evaluate((element) => ({
    selectedIds: [...element.shadowRoot.querySelectorAll('.layer-row[aria-selected="true"]')].map(
      (row) => row.dataset.layerId,
    ),
    document: JSON.stringify(element.document),
  }));
  if (
    JSON.stringify(boundarySelection.selectedIds) !== JSON.stringify(['probe-group']) ||
    boundarySelection.document !== layerSelectionDocument
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SELECTION_BOUNDARY_FAILED:${JSON.stringify(boundarySelection)}`,
    );
  }
  await page.mouse.move(viewport.width - 8, 8);
  await page.waitForTimeout(200);
  await probe.locator('[data-left-panel]').screenshot({
    path: `${screenshotDirectory}/layers-panel-${viewport.width}x${viewport.height}.png`,
  });
  await page.evaluate(() =>
    document.querySelector('base-screen-designer[data-layer-probe]')?.remove(),
  );
}
