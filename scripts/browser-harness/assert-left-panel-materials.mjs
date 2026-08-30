import { assertPanelLayout } from './assert-panel-layout.mjs';
import { componentCount } from './harness-utils.mjs';

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
  await search.fill('echarts');
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
