// 左侧面板物料/图层、面板布局与宿主分组（含 Blueprint 跨模式）
// 由 5 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import { readFileSync } from 'node:fs';
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
      // 场景区是宿主可选的一等区块：有则必须紧贴列头，其后的索引整体后移一位。
      sceneIndex: railChildren.indexOf('scenes'),
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
      // 卡片几何是公共令牌（--designer-card-min-width / --bs-host-card-*）：物料卡与宿主
      // 素材卡同宽同比例。这里只锁下限，不锁列数——列数随面板宽度自适应。
      cardMinWidth: first?.getBoundingClientRect().width ?? 0,
      thumbAspect:
        (first?.querySelector('.material-thumb')?.getBoundingClientRect().width ?? 0) /
        (first?.querySelector('.material-thumb')?.getBoundingClientRect().height ?? 1),
      thumbsHaveIcons: cards
        .slice(0, 4)
        .every((card) => card.querySelector('.material-thumb svg') !== null),
      hueSet: firstHue !== '',
      sameCategoryHue,
    };
  });
  const sceneOffset = ia.sceneIndex === 1 ? 1 : 0;
  if (
    (ia.sceneIndex !== 1 && ia.sceneIndex !== -1) ||
    ia.tabIndex !== 1 + sceneOffset ||
    ia.blueprintIndex !== 2 + sceneOffset ||
    ia.viewIndex !== 3 + sceneOffset ||
    ia.viewCount !== 3 ||
    !ia.materialsToolsInsideView ||
    ia.materialsPanelInlineGutter !== 0 ||
    ia.gridDisplay !== 'grid' ||
    new Set(ia.columnValues).size !== 1 ||
    !ia.cardsEqualWidth ||
    ia.cardMinWidth < 108 ||
    Math.abs(ia.thumbAspect - 1.6) > 0.02 ||
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
  // R5：图层树增强（嵌套文档独立实例验证：前置图层顺序、六项工具栏、
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
      blueprint: { relations: [] },
    };
    probe.style.cssText = 'position:fixed;inset:0;z-index:99;width:1024px;height:640px;';
    document.body.appendChild(probe);
  });
  const probe = page.locator('base-screen-designer[data-layer-probe]');
  await probe.locator('[data-panel-tab="layers"]').click();
  const layerProbe = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const panel = root.querySelector('[data-layers]');
    const groupRow = root.querySelector('[data-layer-id="probe-group"]');
    const childRow = root.querySelector('[data-layer-id="probe-a"]');
    const lock = childRow?.querySelector('[data-layer-toggle="locked"]');
    const eye = childRow?.querySelector('[data-layer-toggle="hidden"]');
    return {
      heading: panel?.querySelector(':scope > .list-heading')?.textContent,
      childDepth: childRow?.style.getPropertyValue('--layer-depth'),
      childIndent: childRow?.style.paddingInlineStart,
      childOrder: [
        ...root.querySelectorAll(
          '.layer-row[data-layer-id="probe-a"], .layer-row[data-layer-id="probe-b"]',
        ),
      ].map((row) => row.dataset.layerId),
      // 行内不再渲染拖拽抓手：整行就是把手。分组行保留折叠箭头。
      leafGrip: childRow?.querySelector('.layer-grip') === null,
      rowDraggable: childRow?.getAttribute('draggable'),
      groupCollapse: groupRow?.querySelector('.layer-collapse') !== null,
      groupExpanded: groupRow?.querySelector('.layer-collapse')?.getAttribute('aria-expanded'),
      stateToggleCount: childRow?.querySelectorAll('[data-layer-toggle]').length ?? 0,
      lockOpacity: lock === null || lock === undefined ? '' : getComputedStyle(lock).opacity,
      // 显隐/锁定开关常态收起（可见是默认态，常驻只是每行一道灰点），只为隐藏/锁定项常驻。
      eyeOpacity: eye === null || eye === undefined ? '' : getComputedStyle(eye).opacity,
      lockIcon: lock?.querySelector('svg') !== null,
      eyeIcon: eye?.querySelector('svg') !== null,
      rowHeight: childRow?.offsetHeight ?? 0,
      // 层级操作条常驻在标题与搜索之间：置顶/上移/下移/置底 + 成组/解组，顺序固定。
      toolbar: (() => {
        const toolbar = root.querySelector('[data-layer-toolbar]');
        if (toolbar === null) return null;
        const search = root.querySelector('[data-layer-search]');
        return {
          role: toolbar.getAttribute('role'),
          groups: panel?.querySelector(':scope > .layer-toolbar') === toolbar,
          beforeSearch:
            search !== null &&
            (toolbar.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          arrange: [...toolbar.querySelectorAll('[data-layer-arrange]')].map(
            (button) => button.dataset.layerArrange,
          ),
          groupActions: [...toolbar.querySelectorAll('[data-layer-group-action]')].map(
            (button) => button.dataset.layerGroupAction,
          ),
          labels: [...toolbar.querySelectorAll('button')].map(
            (button) => button.getAttribute('aria-label') ?? '',
          ),
        };
      })(),
      hasSearch: root.querySelector('[data-layer-search]') !== null,
    };
  });
  if (
    layerProbe.heading !== '\u753b\u5e03\u56fe\u5c42 \u00b7 \u4ece\u4e0a\u5230\u4e0b' ||
    // 缩进模型：18px 折叠位 + 每级 16px（箭头绝对定位在折叠位内，叶子/分组图标因此对齐）。
    layerProbe.childDepth !== '1' ||
    layerProbe.childIndent !== '34px' ||
    JSON.stringify(layerProbe.childOrder) !== JSON.stringify(['probe-b', 'probe-a']) ||
    !layerProbe.leafGrip ||
    layerProbe.rowDraggable !== 'true' ||
    !layerProbe.groupCollapse ||
    layerProbe.groupExpanded !== 'true' ||
    layerProbe.stateToggleCount !== 2 ||
    layerProbe.lockOpacity !== '0' ||
    layerProbe.eyeOpacity !== '0' ||
    !layerProbe.lockIcon ||
    !layerProbe.eyeIcon ||
    layerProbe.rowHeight !== 40 ||
    !layerProbe.hasSearch
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_TREE_DESIGN_FAILED:${JSON.stringify(layerProbe)}`);
  }
  // 层级操作条回到面板顶部（标题与搜索之间）：四个层级动作 + 成组/解组，全部带可读名称。
  const layerToolbar = layerProbe.toolbar;
  if (
    layerToolbar === null ||
    layerToolbar.role !== 'toolbar' ||
    !layerToolbar.groups ||
    !layerToolbar.beforeSearch ||
    JSON.stringify(layerToolbar.arrange) !== JSON.stringify(['front', 'up', 'down', 'back']) ||
    JSON.stringify(layerToolbar.groupActions) !== JSON.stringify(['group', 'ungroup']) ||
    layerToolbar.labels.length !== 6 ||
    layerToolbar.labels.some((label) => label.trim() === '')
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_TOOLBAR_FAILED:${JSON.stringify(layerProbe)}`);
  }
  // 显隐/锁定状态开关直接落在行上：隐藏后保留行并压暗，锁定后开关常驻。
  const stateEye = probe.locator('[data-layer-id="probe-a"] [data-layer-toggle="hidden"]');
  await stateEye.click();
  await page.waitForTimeout(80);
  const hiddenState = await probe.evaluate((element) => {
    const row = element.shadowRoot.querySelector('[data-layer-id="probe-a"]');
    return {
      hidden: row?.dataset.hidden,
      pressed: row?.querySelector('[data-layer-toggle="hidden"]')?.getAttribute('aria-pressed'),
      componentHidden: element.document.components.find((component) => component.id === 'probe-a')
        ?.status.hidden,
    };
  });
  if (
    hiddenState.hidden !== 'true' ||
    hiddenState.pressed !== 'true' ||
    hiddenState.componentHidden !== true
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_HIDE_FAILED:${JSON.stringify(hiddenState)}`);
  }
  await probe.locator('[data-layer-id="probe-a"] [data-layer-toggle="hidden"]').click();
  await page.waitForTimeout(80);
  const lockToggle = probe.locator('[data-layer-id="probe-a"] [data-layer-toggle="locked"]');
  await probe.locator('.layer-row[data-layer-id="probe-a"]').hover();
  await page.waitForTimeout(220);
  const hoverLockOpacity = await lockToggle.evaluate((button) => getComputedStyle(button).opacity);
  await lockToggle.click();
  await page.waitForTimeout(80);
  const lockedState = await probe.evaluate((element) => {
    const row = element.shadowRoot.querySelector('[data-layer-id="probe-a"]');
    return {
      locked: row?.dataset.locked,
      pressed: row?.querySelector('[data-layer-toggle="locked"]')?.getAttribute('aria-pressed'),
      componentLocked: element.document.components.find((component) => component.id === 'probe-a')
        ?.status.locked,
      selectable: row?.querySelector('[data-layer-select]')?.disabled === false,
    };
  });
  if (
    hoverLockOpacity !== '1' ||
    lockedState.locked !== 'true' ||
    lockedState.pressed !== 'true' ||
    lockedState.componentLocked !== true ||
    !lockedState.selectable
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_LOCK_FAILED:${JSON.stringify({ hoverLockOpacity, lockedState })}`,
    );
  }
  await probe.locator('[data-layer-id="probe-a"] [data-layer-toggle="locked"]').click();
  await page.waitForTimeout(80);
  const childRow = probe.locator('.layer-row[data-layer-id="probe-a"]');
  const childHeightBefore = await childRow.evaluate((element) => element.offsetHeight);
  // 高亮整行必须都是有效选择命中区（操作按钮除外）；先点缩进空白，再点名称按钮，
  // 两条路径都不得误触隐藏/锁定或改变 36px 紧凑行高。
  await childRow.click({ position: { x: 1, y: childHeightBefore / 2 } });
  await childRow.locator('[data-layer-select="probe-a"]').click();
  // 指针离开行再读色：悬停档会向文字色偏一档，读到的就不是基准强调色了。
  await page.mouse.move(600, 400);
  await page.waitForTimeout(80);
  const selectedState = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const row = root.querySelector('[data-layer-id="probe-a"]');
    const style = row === null ? undefined : getComputedStyle(row);
    // 选中色是中性令牌算出来的：把令牌值折成 rgb 再比对，主题切换也不会让断言失配。
    const asColor = (value) => {
      const swatch = document.createElement('span');
      swatch.style.color = value;
      document.body.appendChild(swatch);
      const resolved = getComputedStyle(swatch).color;
      swatch.remove();
      return resolved;
    };
    // 选中块与面板底的距离必须大于划过档与面板底的距离 —— 浅色主题变深、深色主题变浅，
    // 所以不能写死"比 hover 更深"，只能写"离面板底更远"。
    // 选中底色来自 color-mix(in oklab, ...)，Chrome 会按插值空间回读成 oklab(...)；
    // 面板底是 rgb。两侧统一折成线性 sRGB 亮度再比较，避免把 oklab 三元组当 0-255 通道。
    const linearChannel = (channel) => {
      const scaled = channel / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const luminanceFromOklab = ([lightness = 0, a = 0, b = 0]) => {
      const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return (
        0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
        0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
        0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
      );
    };
    const luminance = (value) => {
      const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      if (value.startsWith('oklab(')) return luminanceFromOklab(channels);
      const [r = 0, g = 0, b = 0] = channels.map(linearChannel);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const gaps = (value, panel) => Math.abs(luminance(value) - luminance(panel));
    const hoverSurface =
      style === undefined
        ? ''
        : asColor(style.getPropertyValue('--designer-surface-control-hover'));
    const panelSurface =
      style === undefined ? '' : asColor(style.getPropertyValue('--designer-surface-panel'));
    return {
      selected: row?.getAttribute('aria-selected'),
      hidden: row?.dataset.hidden ?? 'false',
      height: row?.offsetHeight ?? 0,
      cursor: style?.cursor,
      backgroundColor: style?.backgroundColor,
      color: style?.color,
      shadow: style?.boxShadow,
      accent: style === undefined ? '' : asColor(style.getPropertyValue('--designer-accent')),
      primaryText:
        style === undefined ? '' : asColor(style.getPropertyValue('--designer-text-primary')),
      border:
        style === undefined ? '' : asColor(style.getPropertyValue('--designer-border-default')),
      panelSurface,
      standsOutFromHover:
        style !== undefined &&
        gaps(style.backgroundColor, panelSurface) > gaps(hoverSurface, panelSurface),
      nameText: row?.querySelector('.layer-name')?.textContent,
      metaText: row?.querySelector('.layer-meta')?.textContent,
    };
  });
  if (
    selectedState.selected !== 'true' ||
    selectedState.hidden !== 'false' ||
    // 行高随原型对齐 40px；选中 = 比划过更实的中性灰块 + 1px 中性收边（与蓝图库共用同一份配方）。
    // 整行即拖拽把手，所以行光标是 grab（可拖）而不是 pointer；两者都表明整行可命中。
    selectedState.height !== 40 ||
    selectedState.cursor !== 'grab' ||
    selectedState.panelSurface === '' ||
    selectedState.primaryText === '' ||
    selectedState.border === '' ||
    // 中性块：不着强调色（禁止出现 accent），文字回到 primary 档。
    selectedState.backgroundColor === 'rgba(0, 0, 0, 0)' ||
    selectedState.backgroundColor === selectedState.accent ||
    selectedState.color !== selectedState.primaryText ||
    // 选中必须比划过更"实"：离面板底的距离严格大于 hover 档，否则两态在列表里分不开。
    !selectedState.standsOutFromHover ||
    !selectedState.shadow.includes('inset') ||
    !selectedState.shadow.includes(selectedState.border) ||
    selectedState.shadow.includes(selectedState.accent) ||
    selectedState.nameText !== '\u5b50\u9879\u7532' ||
    // 副行用物料清单的可读名称（文本）而不是技术 id（base.text），尺寸读数单独成段。
    selectedState.metaText !== '\u6587\u672c \u00b7 80 \u00d7 32'
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SELECT_HIT_TARGET_FAILED:${JSON.stringify(selectedState)}`,
    );
  }
  // 相邻多选连成一块：连续选中的行只保留最上/最下的外圆角、外轮廓只描整块边界，
  // 块内无行距、内部不画线，视觉上是一个整体而不是几个并排的方块。
  // 前面的两次连续点击可能被识别为双击而进入重命名：先点分区标签让焦点离开输入框，
  // 否则 Ctrl+点击会被重渲染打断（行节点在 click 之前就被替换）。
  await probe.locator('.list-heading').click();
  await page.waitForTimeout(120);
  await probe.locator('[data-layer-select="probe-a"]').click();
  await page.waitForTimeout(120);
  await probe.locator('[data-layer-select="probe-b"]').click({ modifiers: ['Control'] });
  const adjacentRun = await probe.evaluate((element) => {
    const read = (id) => {
      const row = element.shadowRoot.querySelector(`.layer-row[data-layer-id="${id}"]`);
      if (row === null) return null;
      const style = getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      return {
        run: row.dataset.layerSelectedRun ?? null,
        startRadius: style.borderStartStartRadius,
        endRadius: style.borderEndStartRadius,
        marginBottom: style.marginBottom,
        shadow: style.boxShadow,
        // 连段只在整块外轮廓画线：首行有上边、末行有下边，中间行两侧各一条。
        edgeCount: (style.boxShadow.match(/inset/g) ?? []).length,
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      };
    };
    return { first: read('probe-b'), last: read('probe-a') };
  });
  if (
    adjacentRun.first?.run !== 'first' ||
    adjacentRun.last?.run !== 'last' ||
    adjacentRun.first.startRadius !== '6px' ||
    adjacentRun.first.endRadius !== '0px' ||
    adjacentRun.last.startRadius !== '0px' ||
    adjacentRun.last.endRadius !== '6px' ||
    adjacentRun.first.marginBottom !== '0px' ||
    adjacentRun.first.bottom !== adjacentRun.last?.top ||
    // 首行三条边（上 + 左右），末行三条边（左右 + 下）：内部不重复描线。
    adjacentRun.first.edgeCount !== 3 ||
    adjacentRun.last.edgeCount !== 3
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_SELECTED_RUN_FAILED:${JSON.stringify(adjacentRun)}`);
  }
  // 取消其中一项后回到孤立选中：四角恢复圆角，不再伪装成连段。
  await probe.locator('[data-layer-select="probe-b"]').click({ modifiers: ['Control'] });
  const isolatedSelection = await probe.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.layer-row[data-layer-id="probe-a"]');
    if (row === null) return null;
    const style = getComputedStyle(row);
    return {
      run: row.dataset.layerSelectedRun ?? null,
      radius: style.borderRadius,
      selected: row.getAttribute('aria-selected'),
    };
  });
  if (
    isolatedSelection?.run !== null ||
    isolatedSelection.radius !== '6px' ||
    isolatedSelection.selected !== 'true'
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_SELECTED_ISOLATED_FAILED:${JSON.stringify(isolatedSelection)}`,
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
  // 拖拽排序：真实鼠标把底行拖到顶行上缘，中途行上出现落点指示线，松手后按 zIndex 落位。
  // 覆盖 HTML5 拖拽的两处易错点——dragover 必须 preventDefault（否则拖拽被浏览器中止），
  // 且拖拽期间不得重渲染图层树（否则拖拽源被替换，同样中止）。
  const dragSource = await probe.locator('.layer-row[data-layer-id="probe-a"]').boundingBox();
  const dragTarget = await probe.locator('.layer-row[data-layer-id="probe-b"]').boundingBox();
  if (dragSource === null || dragTarget === null) {
    throw new Error('BROWSER_HARNESS_LAYER_DRAG_NO_BOX');
  }
  // 拖拽幽灵：dragstart 期间自绘一张不透明的浮起行卡片交给 setDragImage。
  // 这里在派发前替换 dataTransfer.setDragImage，抓取幽灵的计算样式与排版内容。
  const dragGhost = await probe.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.layer-row[data-layer-id="probe-a"]');
    const dataTransfer = new DataTransfer();
    let snapshot = null;
    const original = dataTransfer.setDragImage.bind(dataTransfer);
    dataTransfer.setDragImage = (image, x, y) => {
      const style = getComputedStyle(image);
      snapshot = {
        className: image.className,
        opacity: style.opacity,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        offsetX: x,
        name: image.querySelector('.layer-name')?.textContent,
        hasGlyph: image.querySelector('.layer-glyph') !== null,
        width: Math.round(image.getBoundingClientRect().width),
      };
      return original(image, x, y);
    };
    row.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
    );
    row.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
    return {
      snapshot,
      // dragend 之后幽灵必须移除，否则视口外会一直挂着一个隐藏节点。
      leftover: element.shadowRoot.querySelector('.layer-drag-image') !== null,
    };
  });
  if (
    dragGhost.snapshot === null ||
    dragGhost.snapshot.className !== 'layer-drag-image' ||
    dragGhost.snapshot.opacity !== '1' ||
    dragGhost.snapshot.backgroundColor === 'rgba(0, 0, 0, 0)' ||
    dragGhost.snapshot.boxShadow === 'none' ||
    dragGhost.snapshot.name !== '\u5b50\u9879\u7532' ||
    !dragGhost.snapshot.hasGlyph ||
    dragGhost.snapshot.width <= 0 ||
    dragGhost.leftover
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_DRAG_GHOST_FAILED:${JSON.stringify(dragGhost)}`);
  }
  // 整行即把手：起手点落在行的名称区中部。
  await page.mouse.move(dragSource.x + 60, dragSource.y + dragSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragSource.x + 60, dragSource.y + dragSource.height / 2 - 14, { steps: 6 });
  await page.mouse.move(dragTarget.x + 70, dragTarget.y + 4, { steps: 12 });
  await page.mouse.move(dragTarget.x + 71, dragTarget.y + 5, { steps: 3 });
  await page.waitForTimeout(260);
  const dragIndicator = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const marked = root.querySelector('.layer-row[data-drop-target]');
    const dragging = root.querySelector('.layer-row[data-dragging="true"]');
    const line = marked === null ? null : getComputedStyle(marked, '::after');
    return {
      row: marked?.dataset.layerId,
      edge: marked?.dataset.dropTarget,
      dragging: dragging?.dataset.layerId,
      lineHeight: line?.height,
      lineBackground: line?.backgroundColor,
    };
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragResult = await probe.evaluate((element) => {
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
      leftoverIndicator: root.querySelector('.layer-row[data-drop-target]') !== null,
      leftoverDragging: root.querySelector('.layer-row[data-dragging="true"]') !== null,
    };
  });
  if (
    dragIndicator.row !== 'probe-b' ||
    dragIndicator.edge !== 'before' ||
    dragIndicator.dragging !== 'probe-a' ||
    dragIndicator.lineHeight !== '2px' ||
    dragIndicator.lineBackground === 'rgba(0, 0, 0, 0)' ||
    JSON.stringify(dragResult.childOrder) !== JSON.stringify(['probe-a', 'probe-b']) ||
    dragResult.zIndexes['probe-a'] <= dragResult.zIndexes['probe-b'] ||
    dragResult.leftoverIndicator ||
    dragResult.leftoverDragging
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_DRAG_REORDER_FAILED:${JSON.stringify({ dragIndicator, dragResult })}`,
    );
  }
  // 把拖拽造成的层序变化还原，后续断言（快捷键 / 重命名）依赖 probe-a 在前、probe-b 在后。
  // 还原同样走真实拖拽路径，顺带验证反向落点（下缘 = 插到该行之后）。
  const restoreSource = await probe.locator('.layer-row[data-layer-id="probe-b"]').boundingBox();
  const restoreTarget = await probe.locator('.layer-row[data-layer-id="probe-a"]').boundingBox();
  if (restoreSource === null || restoreTarget === null) {
    throw new Error('BROWSER_HARNESS_LAYER_DRAG_RESTORE_NO_BOX');
  }
  await page.mouse.move(restoreSource.x + 60, restoreSource.y + restoreSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(restoreSource.x + 60, restoreSource.y + restoreSource.height / 2 - 14, {
    steps: 6,
  });
  await page.mouse.move(restoreTarget.x + 70, restoreTarget.y + restoreTarget.height * 0.1, {
    steps: 12,
  });
  await page.mouse.move(restoreTarget.x + 71, restoreTarget.y + restoreTarget.height * 0.1 + 1, {
    steps: 3,
  });
  await page.waitForTimeout(300);
  const restoreIndicator = await probe.evaluate((element) => {
    const row = element.shadowRoot.querySelector('.layer-row[data-drop-target]');
    return { row: row?.dataset.layerId, edge: row?.dataset.dropTarget };
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const restored = await probe.evaluate((element) => {
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
    };
  });
  if (
    restoreIndicator.row !== 'probe-a' ||
    restoreIndicator.edge !== 'before' ||
    JSON.stringify(restored.childOrder) !== JSON.stringify(['probe-b', 'probe-a']) ||
    restored.zIndexes['probe-a'] >= restored.zIndexes['probe-b']
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_DRAG_RESTORE_FAILED:${JSON.stringify({ restoreIndicator, restored })}`,
    );
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
  // 行悬停只让锁按钮浮现，不改变行高；这是图层行唯一的 hover 几何风险。
  await childRow.hover();
  await page.waitForTimeout(250);
  const hoverState = await childRow.evaluate((element) => ({
    height: element.offsetHeight,
    lockOpacity: getComputedStyle(element.querySelector('[data-layer-toggle="locked"]')).opacity,
    eyeOpacity: getComputedStyle(element.querySelector('[data-layer-toggle="hidden"]')).opacity,
  }));
  if (
    hoverState.lockOpacity !== '1' ||
    hoverState.eyeOpacity !== '1' ||
    hoverState.height !== childHeightBefore
  ) {
    throw new Error(
      `BROWSER_HARNESS_LAYER_HOVER_REVEAL_FAILED:${JSON.stringify({ hoverState, childHeightBefore })}`,
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
  // 搜索是即时重渲染：外壳（标题/输入框）必须复用，逐字输入时焦点与已输入内容都不能丢。
  const layerSearch = probe.locator('[data-layer-search]');
  await layerSearch.click();
  await page.keyboard.type('\u5b50\u9879', { delay: 70 });
  const typedSearch = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const input = root.querySelector('[data-layer-search]');
    return {
      value: input?.value ?? '',
      focused: root.activeElement === input,
      clearVisible: root.querySelector('.layer-search-clear')?.hidden === false,
      rows: root.querySelectorAll('.layer-row').length,
    };
  });
  if (
    typedSearch.value !== '\u5b50\u9879' ||
    !typedSearch.focused ||
    !typedSearch.clearVisible ||
    typedSearch.rows < 1
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_SEARCH_TYPING_FAILED:${JSON.stringify(typedSearch)}`);
  }
  // Escape 清空查询并保持焦点；清除按钮与空结果页的“清除搜索”共用同一条路径。
  await page.keyboard.press('Escape');
  const escapedSearch = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const input = root.querySelector('[data-layer-search]');
    return {
      value: input?.value ?? '',
      focused: root.activeElement === input,
      clearHidden: root.querySelector('.layer-search-clear')?.hidden === true,
      rows: root.querySelectorAll('.layer-row').length,
    };
  });
  if (
    escapedSearch.value !== '' ||
    !escapedSearch.focused ||
    !escapedSearch.clearHidden ||
    escapedSearch.rows < 1
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_SEARCH_ESCAPE_FAILED:${JSON.stringify(escapedSearch)}`);
  }
  // 截图前让焦点离开搜索框：产物快照要呈现常态图层列表，而不是聚焦态输入框。
  await probe.locator('.list-heading').click();
  await page.mouse.move(viewport.width - 8, 8);
  await page.waitForTimeout(200);
  await probe.locator('[data-left-panel]').screenshot({
    path: `${screenshotDirectory}/layers-panel-${viewport.width}x${viewport.height}.png`,
  });
  await page.evaluate(() =>
    document.querySelector('base-screen-designer[data-layer-probe]')?.remove(),
  );
}

// ---- 源模块：assert-left-panel-context-menu.mjs ----
// 图层行右键复用画布同一张菜单：菜单项一致、选区按行同步、浮层能盖到面板上（不被工作区裁剪）。
export async function assertLeftPanelContextMenu(page) {
  await page.evaluate(() => {
    const { catalog, materialManifests } = window.baseScreenHarness;
    const textManifest = materialManifests.text;
    const probe = document.createElement('base-screen-designer');
    probe.setAttribute('data-layer-context-probe', 'true');
    probe.catalog = catalog;
    probe.document = {
      canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
      components: [
        {
          id: 'menu-a',
          type: 'base.text',
          name: '\u53f3\u952e\u7532',
          parentId: null,
          position: { x: 0, y: 0 },
          size: { width: 160, height: 32 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: null,
        },
        {
          id: 'menu-b',
          type: 'base.text',
          name: '\u53f3\u952e\u4e59',
          parentId: null,
          position: { x: 0, y: 60 },
          size: { width: 160, height: 32 },
          rotation: 0,
          zIndex: 1,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: null,
        },
      ],
      variables: [],
      blueprint: { relations: [] },
    };
    probe.style.cssText = 'position:fixed;inset:0;z-index:99;width:1024px;height:640px;';
    document.body.appendChild(probe);
  });
  const probe = page.locator('base-screen-designer[data-layer-context-probe]');
  await probe.locator('[data-panel-tab="layers"]').click();
  const readMenu = () =>
    probe.evaluate((host) => {
      const root = host.shadowRoot;
      const menu = root.querySelector('[data-context-menu]');
      const layout = root.querySelector('.designer').getBoundingClientRect();
      const rail = root.querySelector('[data-left-panel]').getBoundingClientRect();
      const box = menu.getBoundingClientRect();
      return {
        hidden: menu.hidden,
        actions: [...menu.querySelectorAll('[data-menu-action]')].map(
          (item) => item.dataset.menuAction,
        ),
        heading: menu.querySelector('[data-context-menu-heading]')?.textContent?.trim() ?? null,
        iconCount: menu.querySelectorAll('[data-menu-action] .menu-item-icon').length,
        selected: [...root.querySelectorAll('[data-layer-selectable="true"]')]
          .filter((row) => row.ariaSelected === 'true')
          .map((row) => row.dataset.layerId),
        // 菜单要么整体落在设计器内（不被裁切），要么就是被裁了——这里两种都如实记录。
        insideLayout:
          box.left >= layout.left - 0.5 &&
          box.right <= layout.right + 0.5 &&
          box.top >= layout.top - 0.5 &&
          box.bottom <= layout.bottom + 0.5,
        overPanel: box.left < rail.right && box.width > 0,
      };
    });

  // 单行右键：菜单与画布单组件菜单同源，且右键先把选区落到这一行。
  await probe.locator('.layer-row[data-layer-id="menu-b"]').click({ button: 'right' });
  const single = await readMenu();
  if (
    single.hidden ||
    !single.actions.includes('copy') ||
    !single.actions.includes('delete') ||
    single.actions.includes('align-left') ||
    single.actions.includes('select-all') ||
    single.heading !== null ||
    single.iconCount !== single.actions.length ||
    !single.selected.includes('menu-b') ||
    !single.insideLayout ||
    !single.overPanel
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_CONTEXT_MENU_FAILED:${JSON.stringify(single)}`);
  }

  // 多选内的行右键：菜单升级为多选菜单，选区保持不变。
  await page.keyboard.press('Escape');
  await probe
    .locator('.layer-row[data-layer-id="menu-a"] [data-layer-select]')
    .click({ modifiers: ['Control'] });
  await probe.locator('.layer-row[data-layer-id="menu-b"]').click({ button: 'right' });
  const multi = await readMenu();
  if (
    multi.hidden ||
    !multi.actions.includes('align-left') ||
    !multi.actions.includes('distribute-horizontal') ||
    multi.actions.includes('select-all') ||
    multi.heading !== '已选 2 个组件' ||
    multi.iconCount !== multi.actions.length ||
    multi.selected.length !== 2 ||
    !multi.insideLayout ||
    !multi.overPanel
  ) {
    throw new Error(`BROWSER_HARNESS_LAYER_CONTEXT_MENU_MULTI_FAILED:${JSON.stringify(multi)}`);
  }
  await page.keyboard.press('Escape');
  if (!(await readMenu()).hidden) {
    throw new Error('BROWSER_HARNESS_LAYER_CONTEXT_MENU_ESCAPE_FAILED');
  }
  await page.evaluate(() =>
    document.querySelector('base-screen-designer[data-layer-context-probe]')?.remove(),
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
    // 把手中央是悬停浮现的折叠胶囊钮（只切换折叠，不启动拖拽）；拖拽从把手其余区域起手。
    const startY = box.y + box.height * 0.25;
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
    // 折叠入口已迁到面板把手上的胶囊钮（原型 .panel-handle .handle-btn），不在面板内部；
    // 右向另有顶栏按钮，故按把手作用域取值，避免命中顶栏那一个。
    const selector = `[data-panel-handle="${side}"] [data-panel-collapse]`;
    await page.evaluate((query) => {
      window.baseScreenHarness.designer.shadowRoot.querySelector(query).click();
    }, selector);
    // 等待折叠过渡（--designer-motion 0.16s）结束后再读箭头 transform。
    await new Promise((resolve) => setTimeout(resolve, 220));
    return page.evaluate((query) => {
      const button = window.baseScreenHarness.designer.shadowRoot.querySelector(query);
      return {
        arrow: getComputedStyle(button.querySelector('svg')).transform,
        buttonWidth: Math.round(button.getBoundingClientRect().width),
      };
    }, selector);
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
    collapsedLeft.buttonWidth < 16
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
    collapsedRight.buttonWidth < 16
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
    result.selected.fallback !== '此分组暂无内容。' ||
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

// ---- 源模块：assert-host-public-tokens.mjs ----
// ADR-0095：宿主公共令牌层必须与引擎同源。把生成物注入宿主 document，按深/浅两个主题逐项比对。
// 只断言「名字存在」不够——值漂了、浅色块漏了某个令牌，肉眼要切主题才看得见。
const HOST_TOKENS_CSS = readFileSync(
  new URL('../../../../packages/engine/src/browser/styles/host/host-tokens.css', import.meta.url),
  'utf8',
);

const HOST_TOKEN_PROBES = [
  'surface-panel',
  'surface-control',
  'text-primary',
  'text-muted',
  'border-default',
  'accent',
  'focus-ring',
  'control-height',
  'space-4',
  'radius-3',
  'font-size-base',
];

export async function assertHostPublicTokens(designer) {
  const result = await designer.evaluate(
    async (element, { cssText, probes }) => {
      const doc = element.ownerDocument;
      const style = doc.createElement('style');
      style.textContent = cssText;
      doc.head.append(style);

      // 探针挂在 document.body：设计器 light DOM 子节点若未被具名 slot 分配就不渲染，
      // 未渲染节点读不到自定义属性。主题用探针自身的 theme 属性切换——与宿主动态对话框
      // 走的是同一条路径；引擎侧则改 <base-screen-designer theme> 读 --designer-*。
      const probe = doc.createElement('div');
      probe.className = 'bs-host';
      doc.body.append(probe);

      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await frame();
      await frame();

      const readPublic = (name) =>
        getComputedStyle(probe).getPropertyValue(`--bs-host-${name}`).trim();
      const readEngine = (name) =>
        getComputedStyle(element).getPropertyValue(`--designer-${name}`).trim();
      const capture = (read) => Object.fromEntries(probes.map((name) => [name, read(name)]));
      const scheme = () => getComputedStyle(probe).getPropertyValue('color-scheme').trim();

      const dark = capture(readPublic);
      const darkEngine = capture(readEngine);
      const darkScheme = scheme();

      const previousTheme = element.getAttribute('theme');
      element.setAttribute('theme', 'light');
      probe.setAttribute('theme', 'light');
      await frame();
      await frame();

      const light = capture(readPublic);
      const lightEngine = capture(readEngine);
      const lightScheme = scheme();

      // 跟随设计器主题是便利档：只有当 .bs-host 是设计器的 light DOM 后代时，
      // `base-screen-designer[theme="light"] .bs-host` 才可能命中。这里断言 DOM 关系成立；
      // 选择器文本本身由 tooling/checks/host-tokens.mjs 静态守住。
      const nested = doc.createElement('div');
      nested.className = 'bs-host';
      element.append(nested);
      const followsDesignerTheme =
        nested.closest('base-screen-designer') === element &&
        element.getAttribute('theme') === 'light';

      if (previousTheme === null) element.removeAttribute('theme');
      else element.setAttribute('theme', previousTheme);
      probe.removeAttribute('theme');
      nested.remove();
      probe.remove();
      style.remove();
      await frame();

      return {
        dark,
        darkEngine,
        light,
        lightEngine,
        darkScheme,
        lightScheme,
        followsDesignerTheme,
      };
    },
    { cssText: HOST_TOKENS_CSS, probes: HOST_TOKEN_PROBES },
  );

  const mismatches = [];
  for (const name of HOST_TOKEN_PROBES) {
    if (result.dark[name] !== result.darkEngine[name]) {
      mismatches.push(`dark:${name}:${result.dark[name]}!=${result.darkEngine[name]}`);
    }
    if (result.light[name] !== result.lightEngine[name]) {
      mismatches.push(`light:${name}:${result.light[name]}!=${result.lightEngine[name]}`);
    }
  }
  if (result.darkScheme !== 'dark') mismatches.push(`dark-scheme:${result.darkScheme}`);
  if (result.lightScheme !== 'light') mismatches.push(`light-scheme:${result.lightScheme}`);
  // 浅色块整体失效时，两侧会各自退回深色值而仍然「相等」，必须额外要求主题真的换了值。
  if (result.light['surface-panel'] === result.dark['surface-panel']) {
    mismatches.push('light-theme-not-applied');
  }
  if (!result.followsDesignerTheme) mismatches.push('designer-theme-anchor');

  if (mismatches.length > 0) {
    throw new Error(`BROWSER_HARNESS_HOST_PUBLIC_TOKENS_FAILED:${mismatches.join(';')}`);
  }
}
