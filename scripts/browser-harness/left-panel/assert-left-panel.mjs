// 左侧面板物料/图层、面板布局与宿主分组（含 Blueprint 跨模式）
// 由 5 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { screenshotDirectory } from '../shared/constants.mjs';
import { componentCount } from '../shared/harness-utils.mjs';

// ---- 源模块：assert-left-panel-materials.mjs ----
export async function assertLeftPanelMaterials(designer, page) {
  const ia = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const rail = root.querySelector('[data-left-panel]');
    const railChildren = [...rail.children].map((child) => child.className || '');
    const materialsPanel = root.querySelector('[data-materials]');
    const grid = root.querySelector('[data-material-grid]');
    const columns = grid === null ? '' : getComputedStyle(grid).gridTemplateColumns;
    const cards = [...root.querySelectorAll('[data-material-card]:not([hidden])')];
    const first = cards[0];
    const second = cards[1];
    const firstHue =
      first?.querySelector('.material-thumb')?.style.getPropertyValue('--material-hue') ?? '';
    const firstCategory = first?.dataset.materialCategory ?? '';
    const sameCategoryHue = cards
      .filter((card) => card.dataset.materialCategory === firstCategory)
      .every(
        (card) =>
          card.querySelector('.material-thumb')?.style.getPropertyValue('--material-hue') ===
          firstHue,
      );
    return {
      railChildren,
      railWidth: Math.round(rail.getBoundingClientRect().width),
      tabIndex: railChildren.indexOf('rail-tabs'),
      blueprintIndex: railChildren.indexOf('blueprint-library'),
      viewIndex: railChildren.indexOf('rail-view'),
      viewCount: railChildren.filter((name) => name === 'rail-view').length,
      materialsToolsInsideView:
        root.querySelector('[data-materials] [data-material-search]') !== null,
      materialsPanelInlineGutter:
        materialsPanel === null ? -1 : materialsPanel.offsetWidth - materialsPanel.clientWidth,
      gridDisplay: grid === null ? '' : getComputedStyle(grid).display,
      // 列数随面板宽度变化（auto-fill，窄面板单列、宽面板两列）：只断言列宽一致与
      // 卡片等宽，不硬编码列数/同列关系。
      columnValues: columns.split(' '),
      cardsEqualWidth:
        first !== undefined &&
        second !== undefined &&
        Math.abs(first.getBoundingClientRect().width - second.getBoundingClientRect().width) < 1,
      thumbsHaveIcons: cards
        .slice(0, 4)
        .every((card) => card.querySelector('.material-thumb svg') !== null),
      hueSet: firstHue !== '',
      sameCategoryHue,
    };
  });
  if (
    ia.tabIndex !== 1 ||
    ia.blueprintIndex !== 2 ||
    ia.viewIndex !== 3 ||
    ia.viewCount !== 3 ||
    !ia.materialsToolsInsideView ||
    ia.materialsPanelInlineGutter !== 0 ||
    ia.gridDisplay !== 'grid' ||
    new Set(ia.columnValues).size !== 1 ||
    !ia.cardsEqualWidth ||
    !ia.thumbsHaveIcons ||
    !ia.hueSet ||
    !ia.sameCategoryHue
  ) {
    throw new Error(`BROWSER_HARNESS_LEFT_PANEL_IA_FAILED:${JSON.stringify(ia)}`);
  }

  // R2：hover 仅改变阴影，不改变布局几何（offset 与兄弟元素矩形不变）。
  const card = designer.locator('[data-material-card]:not([hidden]) .material-card').first();
  const beforeHover = await card.evaluate((element) => ({
    shadow: getComputedStyle(element).boxShadow,
    offset: {
      top: element.offsetTop,
      left: element.offsetLeft,
      width: element.offsetWidth,
      height: element.offsetHeight,
    },
    sibling: element.nextElementSibling?.getBoundingClientRect().toJSON(),
  }));
  await card.hover();
  await page.waitForTimeout(250);
  const afterHover = await card.evaluate((element) => ({
    shadow: getComputedStyle(element).boxShadow,
    offset: {
      top: element.offsetTop,
      left: element.offsetLeft,
      width: element.offsetWidth,
      height: element.offsetHeight,
    },
    sibling: element.nextElementSibling?.getBoundingClientRect().toJSON(),
  }));
  if (
    JSON.stringify(beforeHover.offset) !== JSON.stringify(afterHover.offset) ||
    JSON.stringify(beforeHover.sibling) !== JSON.stringify(afterHover.sibling) ||
    beforeHover.shadow === afterHover.shadow
  ) {
    throw new Error('BROWSER_HARNESS_LEFT_PANEL_HOVER_JITTER_FAILED');
  }

  // R3：搜索清除按钮与 Escape 清空（保持焦点）。
  const search = designer.locator('[data-material-search]');
  await search.fill('语义');
  const clear = designer.locator('[data-material-search-clear]');
  // ADR-0042：搜索渲染经 120ms 防抖，等待 clear 按钮随过滤渲染出现。
  await clear.waitFor({ state: 'visible', timeout: 5000 });
  await clear.click();
  const cleared = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const input = root.querySelector('[data-material-search]');
    return {
      value: input?.value ?? 'x',
      focused: root.activeElement === input,
      clearHidden: root.querySelector('[data-material-search-clear]')?.hidden,
      visible: root.querySelectorAll('[data-material-card]:not([hidden])').length,
      total: root.querySelectorAll('[data-material-card]').length,
    };
  });
  if (
    cleared.value !== '' ||
    !cleared.focused ||
    cleared.clearHidden !== true ||
    cleared.visible !== cleared.total
  ) {
    throw new Error(`BROWSER_HARNESS_LEFT_PANEL_CLEAR_FAILED:${JSON.stringify(cleared)}`);
  }
  await search.fill('\u56fe\u8868');
  await page.keyboard.press('Escape');
  const escaped = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const input = root.querySelector('[data-material-search]');
    return {
      value: input?.value ?? 'x',
      focused: root.activeElement === input,
      clearHidden: root.querySelector('[data-material-search-clear]')?.hidden,
    };
  });
  if (escaped.value !== '' || !escaped.focused || escaped.clearHidden !== true) {
    throw new Error(`BROWSER_HARNESS_LEFT_PANEL_ESCAPE_FAILED:${JSON.stringify(escaped)}`);
  }

  // R3：方向键 roving focus 与 Enter 添加、撤销恢复。
  const visibleTypes = await designer.evaluate((element) =>
    [
      ...element.shadowRoot.querySelectorAll(
        '[data-material-card]:not([hidden]) [data-material-type]',
      ),
    ]
      .filter((button) => !button.disabled)
      .map((button) => button.dataset.materialType),
  );
  const firstCard = designer
    .locator('[data-material-card]:not([hidden]) [data-material-type]')
    .first();
  await firstCard.focus();
  await page.keyboard.press('ArrowRight');
  const secondType = await designer.evaluate(
    (element) => element.shadowRoot.activeElement?.dataset?.materialType,
  );
  await page.keyboard.press('End');
  const lastType = await designer.evaluate(
    (element) => element.shadowRoot.activeElement?.dataset?.materialType,
  );
  await page.keyboard.press('Home');
  const firstType = await designer.evaluate(
    (element) => element.shadowRoot.activeElement?.dataset?.materialType,
  );
  if (
    secondType !== visibleTypes[1] ||
    lastType !== visibleTypes.at(-1) ||
    firstType !== visibleTypes[0]
  ) {
    throw new Error(
      `BROWSER_HARNESS_LEFT_PANEL_KEYBOARD_FAILED:${JSON.stringify({
        visibleTypes,
        secondType,
        lastType,
        firstType,
      })}`,
    );
  }
  const countBeforeAdd = await componentCount(page);
  await page.keyboard.press('Enter');
  if ((await componentCount(page)) !== countBeforeAdd + 1) {
    throw new Error('BROWSER_HARNESS_LEFT_PANEL_ENTER_ADD_FAILED');
  }
  await designer.locator('[data-canvas-local-toolbar] [data-action="undo"]').first().click();
  if ((await componentCount(page)) !== countBeforeAdd) {
    throw new Error('BROWSER_HARNESS_LEFT_PANEL_UNDO_RESTORE_FAILED');
  }

  // R4：折叠为 48px 图标轨，点击图标 Tab 展开并切换；展开/折叠不引起工作区几何跳动。
  const workspaceBefore = await designer.locator('.workspace').boundingBox();
  await designer.locator('[data-panel-collapse="left"]').click();
  const collapsed = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const rail = root.querySelector('[data-left-panel]');
    const tabs = [...rail.querySelectorAll('[data-panel-tab]')];
    return {
      state: root.querySelector('.designer').dataset.leftCollapsed,
      railWidth: rail.getBoundingClientRect().width,
      tabsVisible: tabs.every((tab) => {
        const rect = tab.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }),
      labelsHidden: tabs.every(
        (tab) => getComputedStyle(tab.querySelector('.rail-tab-label')).display === 'none',
      ),
      materialsHidden: getComputedStyle(root.querySelector('[data-materials]')).display === 'none',
    };
  });
  if (
    collapsed.state !== 'true' ||
    collapsed.railWidth !== 48 ||
    !collapsed.tabsVisible ||
    !collapsed.labelsHidden ||
    !collapsed.materialsHidden
  ) {
    throw new Error(`BROWSER_HARNESS_LEFT_PANEL_RAIL_FAILED:${JSON.stringify(collapsed)}`);
  }
  await designer.locator('[data-panel-tab="layers"]').click();
  const expanded = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      state: root.querySelector('.designer').dataset.leftCollapsed,
      layersSelected: root.querySelector('[data-panel-tab="layers"]').getAttribute('aria-selected'),
      layersVisible: !root.querySelector('[data-layers]').hidden,
      materialsHidden: root.querySelector('[data-materials]').hidden,
    };
  });
  if (
    expanded.state !== 'false' ||
    expanded.layersSelected !== 'true' ||
    !expanded.layersVisible ||
    !expanded.materialsHidden
  ) {
    throw new Error(`BROWSER_HARNESS_LEFT_PANEL_RAIL_EXPAND_FAILED:${JSON.stringify(expanded)}`);
  }
  const workspaceAfter = await designer.locator('.workspace').boundingBox();
  if (
    workspaceBefore === null ||
    workspaceAfter === null ||
    Math.abs(workspaceBefore.x - workspaceAfter.x) > 1 ||
    workspaceBefore.width !== workspaceAfter.width
  ) {
    throw new Error('BROWSER_HARNESS_LEFT_PANEL_RAIL_JITTER_FAILED');
  }

  await assertPanelLayout(designer, page);
}

// ---- 源模块：assert-left-panel-layers.mjs ----
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

// ---- 源模块：assert-panel-layout.mjs ----
export async function assertPanelLayout(designer, page) {
  // ADR-0037：真实鼠标拖宽后折叠必须收敛到 48px 图标轨，展开恢复拖拽宽度；折叠态箭头 180°
  // 旋转、折叠按钮不被压扁（此前按钮被压缩到约 2px）；折叠态拖拽有展开阈值（48+24，参考
  // VSCode）：阈值内保持折叠，越过阈值才展开。完成后把左右面板拖回默认宽度恢复现场。
  const layoutBox = await designer.locator('.designer').boundingBox();
  if (layoutBox === null) {
    throw new Error('BROWSER_HARNESS_PANEL_HANDLE_MISSING');
  }
  const dragTo = async (side, targetX) => {
    const box = await designer.locator(`[data-panel-handle="${side}"]`).boundingBox();
    if (box === null) throw new Error('BROWSER_HARNESS_PANEL_HANDLE_MISSING');
    const startY = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, startY, { steps: 4 });
    await page.mouse.up();
  };
  // 宽度 = clientX - bounds.left - 边框1px - 列中线(2.5px)；右面板为 bounds.right 反向。
  // 读取面板 CSS 默认宽度（不硬编码具体默认值），供最后拖回默认宽度恢复现场。
  const defaultWidths = await page.evaluate(() => {
    const style = getComputedStyle(
      window.baseScreenHarness.designer.shadowRoot.querySelector('.designer'),
    );
    return {
      left: parseFloat(style.getPropertyValue('--left-panel-width')),
      right: parseFloat(style.getPropertyValue('--right-panel-width')),
    };
  });
  await dragTo('left', layoutBox.x + 1 + 380 + 2.5);
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 360 - 2.5);
  const readPanel = () =>
    page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      return {
        left: Math.round(root.querySelector('[data-left-panel]').getBoundingClientRect().width),
        right: Math.round(root.querySelector('.properties').getBoundingClientRect().width),
        leftState: root.querySelector('.designer').dataset.leftCollapsed,
        rightState: root.querySelector('.designer').dataset.rightCollapsed,
      };
    });
  const collapseEvaluate = async (side) => {
    await page.evaluate((panelSide) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const panel = root.querySelector(
        panelSide === 'left' ? '[data-left-panel]' : '[data-right-panel]',
      );
      panel.querySelector(`[data-panel-collapse="${panelSide}"]`).click();
    }, side);
    // 等待折叠过渡（--designer-motion 0.16s）结束后再读箭头 transform。
    await new Promise((resolve) => setTimeout(resolve, 220));
    return page.evaluate((panelSide) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const panel = root.querySelector(
        panelSide === 'left' ? '[data-left-panel]' : '[data-right-panel]',
      );
      const button = panel.querySelector(`[data-panel-collapse="${panelSide}"]`);
      return {
        arrow: getComputedStyle(button.querySelector('svg')).transform,
        buttonWidth: Math.round(button.getBoundingClientRect().width),
      };
    }, side);
  };

  const dragged = await readPanel();
  const expectedDraggedRight = Math.max(
    288,
    Math.min(360, Math.round(layoutBox.width - 380 - 10 - 360)),
  );
  const collapsedLeft = { ...(await collapseEvaluate('left')), ...(await readPanel()) };
  if (
    dragged.left !== 380 ||
    dragged.right !== expectedDraggedRight ||
    collapsedLeft.leftState !== 'true' ||
    collapsedLeft.left !== 48 ||
    collapsedLeft.arrow !== 'matrix(-1, 0, 0, -1, 0, 0)' ||
    collapsedLeft.buttonWidth < 28
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_COLLAPSE_ROUNDTRIP_FAILED:${JSON.stringify({
        dragged,
        collapsedLeft,
      })}`,
    );
  }
  // 折叠态拖拽阈值：宽度 58 < 48+24 → 保持折叠；拖到 380 → 展开并应用宽度。
  await dragTo('left', layoutBox.x + 1 + 58 + 2.5);
  const underThreshold = await readPanel();
  await dragTo('left', layoutBox.x + 1 + 380 + 2.5);
  const expandedLeft = await readPanel();

  const collapsedRight = { ...(await collapseEvaluate('right')), ...(await readPanel()) };
  if (
    collapsedRight.rightState !== 'true' ||
    collapsedRight.right !== 48 ||
    collapsedRight.arrow !== 'matrix(-1, 0, 0, -1, 0, 0)' ||
    collapsedRight.buttonWidth < 28
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_COLLAPSE_ROUNDTRIP_FAILED:${JSON.stringify({ collapsedRight })}`,
    );
  }
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 58 - 2.5);
  const underThresholdRight = await readPanel();
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 360 - 2.5);
  const expandedRight = await readPanel();
  if (
    underThreshold.leftState !== 'true' ||
    underThreshold.left !== 48 ||
    expandedLeft.leftState !== 'false' ||
    expandedLeft.left !== 380 ||
    underThresholdRight.rightState !== 'true' ||
    underThresholdRight.right !== 48 ||
    expandedRight.rightState !== 'false' ||
    expandedRight.right !== expectedDraggedRight
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_COLLAPSE_THRESHOLD_FAILED:${JSON.stringify({
        underThreshold,
        expandedLeft,
        underThresholdRight,
        expandedRight,
      })}`,
    );
  }
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 288 - 2.5);
  const inspectorMinimum = await readPanel();
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 480 - 2.5);
  const inspectorMaximum = await readPanel();
  const expectedInspectorMaximum = Math.max(
    288,
    Math.min(480, Math.round(layoutBox.width - 380 - 10 - 360)),
  );
  if (inspectorMinimum.right !== 288 || inspectorMaximum.right !== expectedInspectorMaximum) {
    throw new Error(
      `BROWSER_HARNESS_INSPECTOR_WIDTH_RANGE_FAILED:${JSON.stringify({ inspectorMinimum, inspectorMaximum })}`,
    );
  }
  // 拖回默认宽度，恢复后续断言的现场。
  await dragTo('left', layoutBox.x + 1 + defaultWidths.left + 2.5);
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - defaultWidths.right - 2.5);
  const restored = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      left: Math.round(root.querySelector('[data-left-panel]').getBoundingClientRect().width),
      right: Math.round(root.querySelector('.properties').getBoundingClientRect().width),
    };
  });
  const expectedRestoredRight = Math.max(
    288,
    Math.min(defaultWidths.right, Math.round(layoutBox.width - defaultWidths.left - 10 - 360)),
  );
  if (restored.left !== defaultWidths.left || restored.right !== expectedRestoredRight) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_WIDTH_RESTORE_FAILED:${JSON.stringify({ restored, defaultWidths, expectedRestoredRight })}`,
    );
  }

  // 分隔条必须同时具备真实键盘调整能力与 WAI-ARIA separator 数值投影。
  const readHandle = (side) =>
    designer.evaluate((element, panelSide) => {
      const root = element.shadowRoot;
      const handle = root.querySelector(`[data-panel-handle="${panelSide}"]`);
      const panel =
        panelSide === 'left'
          ? root.querySelector('[data-left-panel]')
          : root.querySelector('.properties');
      return {
        controls: handle.getAttribute('aria-controls'),
        focused: root.activeElement === handle,
        label: handle.getAttribute('aria-label'),
        maximum: Number(handle.getAttribute('aria-valuemax')),
        minimum: Number(handle.getAttribute('aria-valuemin')),
        orientation: handle.getAttribute('aria-orientation'),
        role: handle.getAttribute('role'),
        state: root.querySelector('.designer').dataset[`${panelSide}Collapsed`],
        value: Number(handle.getAttribute('aria-valuenow')),
        width: Math.round(panel.getBoundingClientRect().width),
      };
    }, side);

  const leftHandle = designer.locator('[data-panel-handle="left"]');
  await leftHandle.focus();
  const leftInitial = await readHandle('left');
  await page.keyboard.press('ArrowRight');
  const leftStep = await readHandle('left');
  await page.keyboard.press('Shift+ArrowRight');
  const leftLargeStep = await readHandle('left');
  await page.keyboard.press('End');
  const leftEnd = await readHandle('left');
  await designer.locator('[data-panel-collapse="left"]').click();
  await leftHandle.focus();
  await page.keyboard.press('Home');
  const leftExpandedByKeyboard = await readHandle('left');
  if (
    leftInitial.role !== 'separator' ||
    leftInitial.orientation !== 'vertical' ||
    leftInitial.controls !== 'designer-left-panel' ||
    !leftInitial.label ||
    !leftInitial.focused ||
    leftStep.value !== Math.min(480, leftInitial.value + 8) ||
    leftLargeStep.value !== Math.min(480, leftStep.value + 32) ||
    leftEnd.value !== 480 ||
    leftExpandedByKeyboard.state !== 'false' ||
    leftExpandedByKeyboard.value !== 200 ||
    leftExpandedByKeyboard.width !== 200
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_KEYBOARD_LEFT_FAILED:${JSON.stringify({ leftInitial, leftStep, leftLargeStep, leftEnd, leftExpandedByKeyboard })}`,
    );
  }
  await dragTo('left', layoutBox.x + 1 + defaultWidths.left + 2.5);

  const rightHandle = designer.locator('[data-panel-handle="right"]');
  await rightHandle.focus();
  const rightInitial = await readHandle('right');
  await page.keyboard.press('ArrowRight');
  const rightStep = await readHandle('right');
  await page.keyboard.press('Shift+ArrowLeft');
  const rightLargeStep = await readHandle('right');
  await page.keyboard.press('Home');
  const rightHome = await readHandle('right');
  await page.keyboard.press('End');
  const rightEnd = await readHandle('right');
  if (
    rightInitial.role !== 'separator' ||
    rightInitial.controls !== 'designer-right-panel' ||
    !rightInitial.focused ||
    rightStep.value !== Math.max(rightInitial.minimum, rightInitial.value - 8) ||
    rightLargeStep.value !== Math.min(rightInitial.maximum, rightStep.value + 32) ||
    rightHome.value !== rightInitial.minimum ||
    rightEnd.value !== rightEnd.maximum ||
    rightEnd.width !== rightEnd.value
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_KEYBOARD_RIGHT_FAILED:${JSON.stringify({ rightInitial, rightStep, rightLargeStep, rightHome, rightEnd })}`,
    );
  }
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - defaultWidths.right - 2.5);

  // XJ Data Hub 的路由加载态通过 v-show 先以 display:none 挂载设计器。验证右侧宽度在
  // 0px 宿主中初始化后仍保持持久化值，并在宿主显示时直接生效。
  const hiddenHostInspectorWidth = await page.evaluate(async () => {
    const storageKey = 'base-screen.designer.inspector-width';
    const previous = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, '420');
    const host = document.createElement('div');
    host.style.cssText = 'display:none;width:1600px;height:900px';
    const probe = document.createElement('base-screen-designer');
    probe.catalog = window.baseScreenHarness.catalog;
    probe.style.cssText = 'display:block;width:100%;height:800px';
    host.append(probe);
    document.body.append(host);
    await Promise.resolve();
    host.style.display = 'block';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const width = Math.round(
      probe.shadowRoot.querySelector('.properties').getBoundingClientRect().width,
    );
    host.remove();
    if (previous === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, previous);
    return width;
  });
  if (hiddenHostInspectorWidth !== 420) {
    throw new Error(
      `BROWSER_HARNESS_HIDDEN_HOST_INSPECTOR_WIDTH_RESTORE_FAILED:${hiddenHostInspectorWidth}`,
    );
  }
  await designer.locator('[data-panel-tab="materials"]').click();
}

// ---- 源模块：assert-host-left-panel-groups.mjs ----
// ADR-0062 宿主左侧分组：严格描述生成 Tab/tabpanel，命名 slot 投影宿主 light DOM；
// 键盘切换、公开选择方法、动态移除回退和外部工作台几何均保持稳定。
async function assertHostLeftPanelGroups(designer) {
  const result = await designer.evaluate(async (element) => {
    const root = element.shadowRoot;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const rects = () => ({
      rail: root.querySelector('[data-left-panel]')?.getBoundingClientRect().toJSON(),
      workspace: root.querySelector('.workspace')?.getBoundingClientRect().toJSON(),
      inspector: root.querySelector('[data-right-panel]')?.getBoundingClientRect().toJSON(),
    });
    const before = rects();
    const changes = [];
    const onChange = (event) => changes.push(event.detail.groupId);
    element.addEventListener('base-screen-designer-left-panel-group-change', onChange);

    element.leftPanelGroups = [{ id: 'assets', label: 'Host assets', icon: 'image' }];
    await frame();
    const tab = root.querySelector('[data-panel-tab="host:assets"]');
    const panel = root.querySelector('.host-left-panel-view[data-host-left-panel-group="assets"]');
    const slot = panel?.querySelector('slot');
    const content = document.createElement('section');
    content.slot = 'base-screen-designer-left-panel-assets';
    content.dataset.hostLeftPanelProbe = 'assets';
    content.textContent = 'Host asset content';
    const collisionButton = document.createElement('button');
    collisionButton.type = 'button';
    collisionButton.dataset.panelCollapse = 'left';
    collisionButton.textContent = 'Host action';
    let hostClicks = 0;
    collisionButton.addEventListener('click', () => hostClicks++);
    content.append(collisionButton);
    element.append(content);
    await frame();

    const variablesTab = root.querySelector('[data-panel-tab="variables"]');
    variablesTab?.focus();
    variablesTab?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }),
    );
    await frame();
    const keyboardSelected =
      tab?.getAttribute('aria-selected') === 'true' && root.activeElement === tab;
    const selected = {
      keyboardSelected,
      panelVisible: panel?.hidden === false,
      materialHidden: root.querySelector('[data-materials]')?.hidden === true,
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      countHidden: root.querySelector('[data-left-panel-count]')?.hidden === true,
      assigned: slot?.assignedElements().includes(content) === true,
      fallback: slot?.textContent?.trim(),
      icon: tab?.querySelector('.rail-tab-glyph svg') !== null,
      controls: tab?.getAttribute('aria-controls') === panel?.id,
      labelled: panel?.getAttribute('aria-labelledby') === tab?.id,
    };
    collisionButton.click();
    const eventIsolated =
      hostClicks === 1 && root.querySelector('.designer')?.dataset.leftCollapsed === 'false';

    tab?.focus();
    element.leftPanelGroups = [{ id: 'assets', label: 'Host assets updated', icon: 'image' }];
    await frame();
    const updatedTab = root.querySelector('[data-panel-tab="host:assets"]');
    const hotUpdate = {
      focusRetained: root.activeElement === updatedTab,
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      contentRetained:
        root
          .querySelector('.host-left-panel-view[data-host-left-panel-group="assets"] slot')
          ?.assignedElements()
          .includes(content) === true,
    };

    const configured = element.leftPanelGroups;
    element.leftPanelGroups = [{ id: 'materials', label: 'Reserved' }];
    const invalidRetained = element.leftPanelGroups === configured;
    root.querySelector('[data-panel-tab="materials"]')?.click();
    const selectedByMethod = element.selectLeftPanelGroup('assets');
    const missingRejected = element.selectLeftPanelGroup('missing') === false;
    await frame();
    const during = rects();

    collisionButton.focus();
    element.leftPanelGroups = [];
    await frame();
    const fallback = {
      materialsSelected:
        root.querySelector('[data-panel-tab="materials"]')?.getAttribute('aria-selected') ===
        'true',
      materialVisible: root.querySelector('[data-materials]')?.hidden === false,
      countVisible: root.querySelector('[data-left-panel-count]')?.hidden === false,
      hostTabs: root.querySelectorAll('[data-host-left-panel-group]').length,
      focusRestored: root.activeElement === root.querySelector('[data-panel-tab="materials"]'),
    };
    const after = rects();
    element.leftPanelGroups = undefined;
    content.remove();
    element.removeEventListener('base-screen-designer-left-panel-group-change', onChange);
    return {
      before,
      during,
      after,
      selected,
      eventIsolated,
      hotUpdate,
      fallback,
      invalidRetained,
      selectedByMethod,
      missingRejected,
      changes,
    };
  });

  const stableGeometry =
    JSON.stringify(result.before) === JSON.stringify(result.during) &&
    JSON.stringify(result.before) === JSON.stringify(result.after);
  if (
    !result.selected.keyboardSelected ||
    !result.selected.panelVisible ||
    !result.selected.materialHidden ||
    result.selected.title !== 'Host assets' ||
    !result.selected.countHidden ||
    !result.selected.assigned ||
    result.selected.fallback !== '宿主尚未提供此分组的内容。' ||
    !result.selected.icon ||
    !result.selected.controls ||
    !result.selected.labelled ||
    !result.eventIsolated ||
    !result.hotUpdate.focusRetained ||
    result.hotUpdate.title !== 'Host assets updated' ||
    !result.hotUpdate.contentRetained ||
    !result.invalidRetained ||
    !result.selectedByMethod ||
    !result.missingRejected ||
    !result.fallback.materialsSelected ||
    !result.fallback.materialVisible ||
    !result.fallback.countVisible ||
    result.fallback.hostTabs !== 0 ||
    !result.fallback.focusRestored ||
    JSON.stringify(result.changes) !== JSON.stringify(['assets', null, 'assets', null]) ||
    !stableGeometry
  ) {
    throw new Error(`BROWSER_HARNESS_HOST_LEFT_PANEL_GROUP_FAILED:${JSON.stringify(result)}`);
  }
}

export { assertHostLeftPanelGroups };

// ---- 源模块：verify-browser-blueprint-host-left-panel-groups.mjs ----
// ADR-0062/0063：模式感知宿主 rail tab 在 Canvas/Blueprint 间共享同一 tabpanel/slot，
// 两侧独立保留选择，键盘导航、动态回退和工作台几何保持稳定。
export async function assertBlueprintHostLeftPanelGroups(designer) {
  const result = await designer.evaluate(async (element) => {
    const root = element.shadowRoot;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const rects = () => ({
      rail: root.querySelector('[data-left-panel]')?.getBoundingClientRect().toJSON(),
      workspace: root.querySelector('.workspace')?.getBoundingClientRect().toJSON(),
      inspector: root.querySelector('[data-right-panel]')?.getBoundingClientRect().toJSON(),
    });
    const before = rects();
    const changes = [];
    const onChange = (event) => changes.push(event.detail.groupId);
    element.addEventListener('base-screen-designer-left-panel-group-change', onChange);

    const content = document.createElement('section');
    content.slot = 'base-screen-designer-left-panel-assets';
    const input = document.createElement('input');
    input.value = 'retained';
    content.append(input);
    element.append(content);
    element.leftPanelGroups = [
      {
        id: 'assets',
        label: 'Host assets',
        icon: 'image',
        workbenchModes: ['canvas', 'blueprint'],
      },
    ];
    await frame();

    const canvasSelectedByMethod = element.selectLeftPanelGroup('assets');
    await frame();
    const panel = root.querySelector('.host-left-panel-view[data-host-left-panel-group="assets"]');
    const slot = panel?.querySelector('slot');
    const canvasTab = root.querySelector('[data-panel-tab="host:assets"]');
    const canvasSelected = {
      selectedByMethod: canvasSelectedByMethod,
      tabSelected: canvasTab?.getAttribute('aria-selected') === 'true',
      panelVisible: panel?.hidden === false,
      assigned: slot?.assignedElements().includes(content) === true,
      labelled: panel?.getAttribute('aria-labelledby') === canvasTab?.id,
    };

    const toBlueprint = element.setWorkbenchMode('blueprint');
    await frame();
    const selectedBlueprintByMethod = element.selectLeftPanelGroup('assets');
    await frame();
    const blueprintTab = root.querySelector('[data-blueprint-library-tab="host:assets"]');
    const blueprintSelected = {
      modeChanged: toBlueprint.ok,
      selectedByMethod: selectedBlueprintByMethod,
      tabSelected: blueprintTab?.getAttribute('aria-selected') === 'true',
      panelIdentityRetained:
        root.querySelector('.host-left-panel-view[data-host-left-panel-group="assets"]') === panel,
      panelVisible: panel?.hidden === false,
      slotIdentityRetained: panel?.querySelector('slot') === slot,
      contentRetained:
        slot?.assignedElements().includes(content) === true && input.value === 'retained',
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      countHidden: root.querySelector('[data-left-panel-count]')?.hidden === true,
      builtinHidden: root.querySelector('.blueprint-library-main')?.hidden === true,
      canvasTabNotRendered: canvasTab?.getClientRects().length === 0,
      labelled: panel?.getAttribute('aria-labelledby') === blueprintTab?.id,
    };

    root.querySelector('[data-blueprint-library-tab="components"]')?.click();
    const builtinRestored = {
      panelHidden: panel?.hidden === true,
      title: root.querySelector('[data-left-panel-title]')?.textContent,
      countVisible: root.querySelector('[data-left-panel-count]')?.hidden === false,
      count: root.querySelector('[data-left-panel-count]')?.textContent,
    };
    const variablesTab = root.querySelector('[data-blueprint-library-tab="variables"]');
    variablesTab?.focus();
    variablesTab?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true }),
    );
    await frame();
    const refreshedBlueprintTab = root.querySelector('[data-blueprint-library-tab="host:assets"]');
    const blueprintKeyboard = {
      selected: refreshedBlueprintTab?.getAttribute('aria-selected') === 'true',
      focused: root.activeElement === refreshedBlueprintTab,
      panelVisible: panel?.hidden === false,
    };

    const toCanvas = element.setWorkbenchMode('canvas');
    await frame();
    const canvasRestored = {
      modeChanged: toCanvas.ok,
      tabSelected:
        root.querySelector('[data-panel-tab="host:assets"]')?.getAttribute('aria-selected') ===
        'true',
      panelVisible: panel?.hidden === false,
      labelled:
        panel?.getAttribute('aria-labelledby') ===
        root.querySelector('[data-panel-tab="host:assets"]')?.id,
    };
    element.setWorkbenchMode('blueprint');
    await frame();
    const blueprintRestored =
      root
        .querySelector('[data-blueprint-library-tab="host:assets"]')
        ?.getAttribute('aria-selected') === 'true';

    const during = rects();
    element.leftPanelGroups = [];
    await frame();
    const fallback = {
      componentsSelected:
        root
          .querySelector('[data-blueprint-library-tab="components"]')
          ?.getAttribute('aria-selected') === 'true',
      builtinVisible: root.querySelector('.blueprint-library-main')?.hidden === false,
      hostTabs: root.querySelectorAll('[data-blueprint-library-tab^="host:"]').length,
      hostPanels: root.querySelectorAll('[data-host-left-panel-group]').length,
    };
    const after = rects();

    element.setWorkbenchMode('canvas');
    element.leftPanelGroups = undefined;
    content.remove();
    element.removeEventListener('base-screen-designer-left-panel-group-change', onChange);
    return {
      before,
      during,
      after,
      canvasSelected,
      blueprintSelected,
      builtinRestored,
      blueprintKeyboard,
      canvasRestored,
      blueprintRestored,
      fallback,
      changes,
    };
  });

  const stableGeometry =
    JSON.stringify(result.before) === JSON.stringify(result.during) &&
    JSON.stringify(result.before) === JSON.stringify(result.after);
  if (
    !result.canvasSelected.selectedByMethod ||
    !result.canvasSelected.tabSelected ||
    !result.canvasSelected.panelVisible ||
    !result.canvasSelected.assigned ||
    !result.canvasSelected.labelled ||
    !result.blueprintSelected.modeChanged ||
    !result.blueprintSelected.selectedByMethod ||
    !result.blueprintSelected.tabSelected ||
    !result.blueprintSelected.panelIdentityRetained ||
    !result.blueprintSelected.panelVisible ||
    !result.blueprintSelected.slotIdentityRetained ||
    !result.blueprintSelected.contentRetained ||
    result.blueprintSelected.title !== 'Host assets' ||
    !result.blueprintSelected.countHidden ||
    !result.blueprintSelected.builtinHidden ||
    !result.blueprintSelected.canvasTabNotRendered ||
    !result.blueprintSelected.labelled ||
    !result.builtinRestored.panelHidden ||
    result.builtinRestored.title !== '蓝图节点库' ||
    !result.builtinRestored.countVisible ||
    Number(result.builtinRestored.count) < 1 ||
    !result.blueprintKeyboard.selected ||
    !result.blueprintKeyboard.focused ||
    !result.blueprintKeyboard.panelVisible ||
    !result.canvasRestored.modeChanged ||
    !result.canvasRestored.tabSelected ||
    !result.canvasRestored.panelVisible ||
    !result.canvasRestored.labelled ||
    !result.blueprintRestored ||
    !result.fallback.componentsSelected ||
    !result.fallback.builtinVisible ||
    result.fallback.hostTabs !== 0 ||
    result.fallback.hostPanels !== 0 ||
    JSON.stringify(result.changes) !==
      JSON.stringify(['assets', null, 'assets', null, 'assets', null]) ||
    !stableGeometry
  ) {
    throw new Error(
      `BROWSER_HARNESS_BLUEPRINT_HOST_LEFT_PANEL_GROUP_FAILED:${JSON.stringify(result)}`,
    );
  }
}
