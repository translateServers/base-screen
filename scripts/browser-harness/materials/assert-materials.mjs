// 物料分组、物料库宿主状态、封面与渲染规模
// 由 8 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。

import { expect } from '@playwright/test';
import { screenshotDirectory } from '../shared/constants.mjs';
import { rectWithin } from '../shared/layout-assertions.mjs';

// ---- 源模块：assert-material-group-navigation.mjs ----
export async function assertMaterialGroupNavigation(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer&material-group-stress`, { waitUntil: 'networkidle' });
    const designer = page.locator('base-screen-designer');
    const canvas = await designer.locator('[data-canvas]').elementHandle();
    const materials = await designer.locator('[data-base-screen-component-id]').elementHandles();
    const documentBefore = await designer.evaluate((element) => JSON.stringify(element.document));
    const roots = designer.locator('[data-material-group-list="roots"]');
    // 压力分组含 7 个根：基础/图形/媒体/数据可视化图表组件超长名称/大屏组件超长分组名称/跨框架桥接物料/宿主数据集最佳实践。
    if ((await roots.locator('[data-material-group]').count()) !== 7) {
      throw new Error('MATERIAL_GROUP_STRESS_FIXTURE_INVALID');
    }

    const initial = await measure(designer);
    const railGutter = initial.rail.width - initial.content.width;
    for (const width of [
      200,
      248,
      336,
      480,
      railGutter + 263,
      railGutter + 264,
      railGutter + 265,
    ]) {
      await resizePanel(page, designer, width);
      await frames(page);
      const before = await measure(designer);
      const compact = before.content.width < 264;
      const trigger = designer.locator('[data-material-group-toggle]');
      if (
        (await trigger.isVisible()) !== compact ||
        before.rail.width !== width ||
        before.horizontalOverflow
      ) {
        throw new Error(`MATERIAL_GROUP_RESPONSIVE_FAILED:${JSON.stringify({ width, before })}`);
      }
      if (!compact && before.navigation.width !== 108) {
        throw new Error(`MATERIAL_GROUP_COLUMN_WIDTH_FAILED:${JSON.stringify(before)}`);
      }
      if (compact) {
        await trigger.click();
        const opened = await measure(designer);
        assertSameBox(before.grid, opened.grid, 'MATERIAL_GROUP_POPUP_GRID_REFLOW');
        if (opened.overlayHidden || opened.navigation.width !== 286 || !opened.popupWithinBounds) {
          throw new Error(`MATERIAL_GROUP_POPUP_BOUNDS_FAILED:${JSON.stringify(opened)}`);
        }
      }
      await designer.locator('[data-material-group="data"]').click();
      await designer.locator('[data-material-group="advanced"]').click();
      if (compact && (await measure(designer)).overlayHidden)
        throw new Error('MATERIAL_GROUP_BRANCH_CLOSED');
      await designer.locator('[data-material-group="semantic-chart"]').click();
      const leaf = await measure(designer);
      assertSameBox(before.grid, leaf.grid, 'MATERIAL_GROUP_SELECTION_REFLOW');
      if (
        !leaf.overlayHidden ||
        leaf.visible.join(',') !== 'harness.semantic-chart' ||
        leaf.triggerLabel !== '语义图表' ||
        !leaf.path.endsWith('/ 高级图表 / 语义图表')
      ) {
        throw new Error(`MATERIAL_GROUP_LEAF_FAILED:${JSON.stringify(leaf)}`);
      }
      if (compact && !leaf.triggerFocused) throw new Error('MATERIAL_GROUP_COMMIT_FOCUS_FAILED');
      if (compact) await trigger.click();
      await designer.locator('[data-material-group-action="back"]').click();
      if (!(await designer.locator('[data-material-group="tables"]').isVisible())) {
        throw new Error('MATERIAL_GROUP_BACK_SIBLING_FAILED');
      }
      await designer.locator('[data-material-group-all]').click();
    }

    await resizePanel(page, designer, 248);
    await assertDismissal(page, designer);
    const themeBackgrounds = [];
    for (const theme of ['dark', 'light']) {
      await designer.evaluate((element, value) => {
        element.setAttribute('theme', value);
      }, theme);
      await designer.locator('[data-material-group-toggle]').click();
      await designer.locator('[data-material-group="data"]').click();
      await frames(page);
      const themeState = await measure(designer);
      themeBackgrounds.push(
        await designer
          .locator('[data-material-group-popover]')
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      );
      const button = designer.locator('[data-material-group="data"]');
      const bounds = await button.boundingBox();
      await button.hover();
      await frames(page);
      assertSameBox(bounds, await button.boundingBox(), 'MATERIAL_GROUP_THEME_HOVER_JITTER');
      if (!themeState.popupWithinBounds || themeState.horizontalOverflow) {
        throw new Error(`MATERIAL_GROUP_THEME_OVERFLOW:${theme}`);
      }
      await page.screenshot({
        path: `${screenshotDirectory}/material-groups-${theme}-compact.png`,
      });
      await page.keyboard.press('Escape');
    }
    if (new Set(themeBackgrounds).size !== 2) throw new Error('MATERIAL_GROUP_THEME_NOT_APPLIED');

    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await designer.locator('[data-material-group-toggle]').click();
    const accessibility = await designer
      .locator('[data-material-group="data"]')
      .evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          outline: style.outlineStyle,
          transition: style.transitionDuration,
          glyphWidth: button.querySelector('.material-group-glyph svg').getBoundingClientRect()
            .width,
          height: button.getBoundingClientRect().height,
          title: button.getAttribute('data-tip'),
          description: button.getAttribute('aria-description'),
          countWidth: button
            .getRootNode()
            .querySelector('.material-group-children .material-group-count')
            .getBoundingClientRect().width,
        };
      });
    if (
      accessibility.outline === 'none' ||
      accessibility.transition !== '0s' ||
      accessibility.glyphWidth !== 16 ||
      accessibility.height !== 28 ||
      // data 分组含子孙：base.chart + plugin.echarts（charts）、
      // harness.semantic-chart（advanced）、base.table（tables），共 4 个。
      !accessibility.title.endsWith('（4 个物料）') ||
      accessibility.description !== accessibility.title ||
      accessibility.countWidth !== 24
    ) {
      throw new Error(`MATERIAL_GROUP_ACCESSIBILITY_FAILED:${JSON.stringify(accessibility)}`);
    }
    await page.keyboard.press('Escape');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await designer.evaluate((element) => {
      element.setAttribute('theme', 'dark');
    });
    await resizePanel(page, designer, 336);
    await assertMaterialGroupUsability(page, designer);
    await assertMaterialGroupUpdates(page, designer);
    await page.screenshot({ path: `${screenshotDirectory}/material-groups-wide.png` });

    if (
      !(await canvas.evaluate((node) => node.isConnected)) ||
      !(
        await Promise.all(materials.map((handle) => handle.evaluate((node) => node.isConnected)))
      ).every(Boolean) ||
      documentBefore !== (await designer.evaluate((element) => JSON.stringify(element.document)))
    ) {
      throw new Error('MATERIAL_GROUP_RECREATED_CANVAS_OR_CHANGED_DOCUMENT');
    }
    if (errors.length > 0) throw new Error(`MATERIAL_GROUP_PAGE_ERRORS:${JSON.stringify(errors)}`);
  } finally {
    await page.close();
  }
}

async function assertDismissal(page, designer) {
  const trigger = designer.locator('[data-material-group-toggle]');
  await trigger.click();
  await page.keyboard.press('Escape');
  if (!(await measure(designer)).triggerFocused)
    throw new Error('MATERIAL_GROUP_ESCAPE_FOCUS_FAILED');
  await trigger.click();
  await designer
    .locator('[data-material-group-popover] [data-material-group-action="close"]')
    .click();
  if (!(await measure(designer)).triggerFocused)
    throw new Error('MATERIAL_GROUP_CLOSE_FOCUS_FAILED');
  await trigger.click();
  await designer.locator('.material-group-backdrop').click({ position: { x: 900, y: 400 } });
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_OUTSIDE_CLICK_FAILED');
  await trigger.click();
  // Normal Tab order can leave the non-modal popup; it must not create a focus trap.
  await page.keyboard.press('Tab');
  await frames(page);
  if (!(await measure(designer)).overlayHidden) throw new Error('MATERIAL_GROUP_TAB_EXIT_FAILED');

  await trigger.click();
  await designer.evaluate((element) =>
    element.shadowRoot.querySelector('[data-panel-tab="layers"]').click(),
  );
  await frames(page);
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_PANEL_SWITCH_FAILED');
  await designer.locator('[data-panel-tab="materials"]').click();
  await trigger.click();
  await designer.evaluate((element) =>
    element.shadowRoot.querySelector('[data-panel-collapse="left"]').click(),
  );
  await frames(page);
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_PANEL_COLLAPSE_FAILED');
  await designer.locator('[data-panel-tab="materials"]').click();
  await trigger.click();
  await designer.evaluate((element) =>
    element.shadowRoot.querySelector('[data-workbench-mode-tab="blueprint"]').click(),
  );
  await frames(page);
  if (!(await measure(designer)).overlayHidden)
    throw new Error('MATERIAL_GROUP_BLUEPRINT_SWITCH_FAILED');
  await designer.locator('[data-workbench-mode-tab="canvas"]').click();
}

async function resizePanel(page, designer, width) {
  const layout = await designer.locator('.designer').boundingBox();
  const handle = await designer.locator('[data-panel-handle="left"]').boundingBox();
  // 把手中央是悬停浮现的折叠胶囊钮（点击折叠、不启动拖拽）；拖拽从把手其余区域起手。
  const y = handle.y + handle.height * 0.25;
  await page.mouse.move(handle.x + handle.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(layout.x + 1 + width + 2.5, y, { steps: 4 });
  await page.mouse.up();
}

function assertSameBox(before, after, code) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(`${code}:${JSON.stringify({ before, after })}`);
}

function frames(page) {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

function measure(designer) {
  return designer.evaluate((element) => {
    const root = element.shadowRoot;
    const node = (selector) => root.querySelector(selector);
    const box = (selector) => node(selector).getBoundingClientRect().toJSON();
    const popup = box('[data-material-group-popover]');
    const layout = box('.designer');
    const trigger = node('[data-material-group-toggle]');
    return {
      rail: box('[data-left-panel]'),
      content: box('[data-material-library-content]'),
      grid: box('[data-material-grid]'),
      navigation: box('[data-material-groups]'),
      overlayHidden: node('[data-material-group-overlay]').hidden,
      triggerFocused: root.activeElement === trigger,
      path: trigger.getAttribute('data-tip'),
      triggerLabel: node('[data-material-group-toggle-label]').textContent,
      visible: [...root.querySelectorAll('[data-material-card]:not([hidden])')].map(
        (card) => card.dataset.materialCard,
      ),
      horizontalOverflow: [
        '[data-material-library-content]',
        '[data-material-grid]',
        '.material-group-roots',
        '.material-group-children',
      ].some((selector) => {
        const target = node(selector);
        return target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
      }),
      popupWithinBounds:
        popup.left >= Math.max(layout.left, 0) &&
        popup.top >= Math.max(layout.top, 0) &&
        popup.right <= Math.min(layout.right, innerWidth) &&
        popup.bottom <= Math.min(layout.bottom, innerHeight),
    };
  });
}

// ---- 源模块：assert-material-group-updates.mjs ----
export async function assertMaterialGroupUpdates(page, designer) {
  await designer.evaluate((element) => {
    const types = element.catalog
      .list()
      .filter((entry) => entry.manifest.libraryVisible !== false)
      .map((entry) => entry.manifest.type);
    let branch = { id: 'level8', label: '深层分类'.repeat(24), materialTypes: [types[0]] };
    for (let depth = 7; depth > 0; depth--)
      branch = { id: `level${depth}`, label: `Level ${depth}`, children: [branch] };
    element.materialLibraryGrouping = {
      groups: [
        branch,
        ...types
          .slice(1)
          .map((type, index) => ({ id: `extra${index}`, label: type, materialTypes: [type] })),
      ],
    };
  });
  for (let depth = 1; depth <= 8; depth++)
    await designer.locator(`[data-material-group="level${depth}"]`).click();
  const deep = await designer.locator('[data-material-group="level8"]').evaluate((button) => ({
    label: button.querySelector('.material-group-label').textContent,
    title: button.getAttribute('data-tip'),
    selected: button.ariaPressed,
    count: button.querySelector('.material-group-count').textContent,
  }));
  if (
    deep.label.length !== 96 ||
    !deep.title.startsWith('Level 1 / Level 2') ||
    deep.selected !== 'true' ||
    deep.count !== '1'
  ) {
    throw new Error(`MATERIAL_GROUP_MAX_DEPTH_FAILED:${JSON.stringify(deep)}`);
  }
  await designer.evaluate((element) => {
    element.materialLibraryGrouping = {
      groups: [...element.materialLibraryGrouping.groups].reverse(),
    };
  });
  if (
    (await designer.locator('[data-material-group="level8"]').getAttribute('aria-pressed')) !==
    'true'
  ) {
    throw new Error('MATERIAL_GROUP_VALID_SELECTION_LOST');
  }
  await designer.evaluate((element) => {
    const groups = element.materialLibraryGrouping.groups;
    let leaf = groups.at(-1);
    while (leaf.children !== undefined) leaf = leaf.children[0];
    element.materialLibraryGrouping = {
      groups: [
        ...groups.slice(0, -1),
        { id: 'replacement', label: 'Replacement', materialTypes: leaf.materialTypes },
      ],
    };
  });
  if (
    (await designer.locator('[data-material-group-all]').getAttribute('aria-pressed')) !== 'true'
  ) {
    throw new Error('MATERIAL_GROUP_REMOVED_SELECTION_NOT_RESET');
  }

  // Many siblings use a real, validated catalog projection (every visible type exactly once).
  await page.setViewportSize({ width: 1440, height: 640 });
  await designer.evaluate((element) => {
    document.body.style.padding = '0';
    element.style.height = '100vh';
  });
  // Compact rows fit the full-height rail; use the bounded popup to exercise real overflow.
  const resizeHandle = designer.locator('[data-panel-handle="left"]');
  const trigger = designer.locator('[data-material-group-toggle]');
  await resizeHandle.press('Home');
  await trigger.click();
  const roots = designer.locator('[data-material-group-list="roots"]');
  await designer.locator('[data-material-group-all]').focus();
  await page.keyboard.press('End');
  const end = await roots.evaluate((list) => ({
    scrollTop: list.scrollTop,
    overflow: list.scrollHeight > list.clientHeight,
    lastFocused: list.getRootNode().activeElement === list.lastElementChild,
  }));
  if (!end.overflow || end.scrollTop <= 0 || !end.lastFocused)
    throw new Error(`MATERIAL_GROUP_ROOT_SCROLL_FAILED:${JSON.stringify(end)}`);
  await page.keyboard.press('Enter');
  await trigger.click();
  await roots.locator('[data-material-group="replacement"]').focus();
  const stableScroll = await roots.evaluate((list) => list.scrollTop);
  await page.keyboard.press('ArrowUp');
  const focusOnly = await designer.evaluate((element) => ({
    selected: element.shadowRoot.querySelector('[data-material-group="replacement"]').ariaPressed,
    focused: element.shadowRoot.activeElement?.dataset.materialGroup,
  }));
  if (focusOnly.selected !== 'true' || focusOnly.focused === 'replacement' || stableScroll <= 0) {
    throw new Error(`MATERIAL_GROUP_ROVING_FILTERED_EARLY:${JSON.stringify(focusOnly)}`);
  }

  await designer.evaluate((element) => {
    element.materialLibraryGrouping = {
      groups: [
        { id: 'library', label: 'Library', children: element.materialLibraryGrouping.groups },
      ],
    };
  });
  await trigger.click();
  await designer.locator('[data-material-group="library"]').click();
  await designer.locator('[data-material-group-current="library"]').focus();
  await page.keyboard.press('End');
  const independent = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      rootsTop: root.querySelector('.material-group-roots').scrollTop,
      childrenTop: root.querySelector('.material-group-children').scrollTop,
      selected: root.querySelector('[data-material-group-current="library"]').ariaPressed,
    };
  });
  if (
    independent.rootsTop !== 0 ||
    independent.childrenTop <= 0 ||
    independent.selected !== 'true'
  ) {
    throw new Error(`MATERIAL_GROUP_INDEPENDENT_SCROLL_FAILED:${JSON.stringify(independent)}`);
  }
  await page.keyboard.press('Escape');
  // Restore the default wide rail for item/search/empty-state assertions.
  for (let step = 0; step < 4; step++) await resizeHandle.press('Shift+ArrowRight');
  await resizeHandle.press('ArrowRight');

  await designer.evaluate((element) => {
    element.materialLibraryItems = [
      { id: 'text:one', materialType: 'base.text', name: 'Alpha' },
      { id: 'text:two', materialType: 'base.text', name: 'Beta' },
      ...element.catalog
        .list()
        .filter(
          (entry) => entry.manifest.libraryVisible !== false && entry.manifest.type !== 'base.text',
        )
        .map((entry) => ({ id: entry.manifest.type, materialType: entry.manifest.type })),
    ];
  });
  const count = () =>
    designer.locator('[data-material-group-current="library"] .material-group-count').textContent();
  // 分组计数按 canonical 物料类型算，卡片按条目算：两条 base.text 条目只贡献一个类型，
  // 所以卡片数 = 类型数 + 1。目录新增物料时两处一起加一。
  if ((await count()) !== '16' || (await designer.locator('[data-material-card]').count()) !== 17)
    throw new Error('MATERIAL_GROUP_TYPE_VS_ITEM_COUNT_FAILED');
  await designer.locator('[data-material-search]').fill('Alpha');
  await designer.locator('[data-material-search-clear]').waitFor({ state: 'visible' });
  if (
    (await designer.locator('[data-material-card]:not([hidden])').count()) !== 1 ||
    (await count()) !== '16'
  )
    throw new Error('MATERIAL_GROUP_SEARCH_CHANGED_COUNT');
  await designer.locator('[data-material-favorite="text:one"]').click();
  await designer.locator('[data-material-filter="favorite"]').click();
  if ((await count()) !== '16') throw new Error('MATERIAL_GROUP_FAVORITE_CHANGED_COUNT');
  await designer.locator('[data-material-search-clear]').click();
  await designer.locator('[data-material-filter="recent"]').click();
  const empty = designer.locator('[data-material-search-empty]');
  if (!(await empty.isVisible()) || (await count()) !== '16')
    throw new Error('MATERIAL_GROUP_EMPTY_STATE_FAILED');
  const emptyBounds = await empty.boundingBox();
  const resultsBounds = await designer.locator('.material-library-results').boundingBox();
  if (
    emptyBounds.x < resultsBounds.x ||
    emptyBounds.x + emptyBounds.width > resultsBounds.x + resultsBounds.width
  )
    throw new Error('MATERIAL_GROUP_EMPTY_OVERLAPS_NAVIGATION');

  await designer.locator('[data-material-filter="all"]').click();
  await designer.evaluate((element) => {
    element.materialLibraryItems = undefined;
    element.materialLibraryGrouping = undefined;
  });
  if (
    (await designer.locator('[data-material-group-toggle]').isVisible()) ||
    (await designer.locator('[data-material-groups]').isVisible()) ||
    !(await designer.locator('[data-material-categories]').isVisible())
  ) {
    throw new Error('MATERIAL_GROUP_FLAT_CATEGORIES_NOT_RESTORED');
  }
  await designer.evaluate((element) => {
    element.materialLibraryGrouping = window.baseScreenHarness.materialLibraryGrouping;
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await designer.evaluate((element) => {
    document.body.style.removeProperty('padding');
    element.style.removeProperty('height');
  });
  await designer.locator('[data-material-group="data"]').click();
}

// ---- 源模块：assert-material-group-usability.mjs ----
export async function assertMaterialGroupUsability(page, designer) {
  const rootData = designer.locator('.material-group-roots [data-material-group="data"]');
  const children = designer.locator('.material-group-children');
  const back = designer.locator('[data-material-group-action="back"]');
  const grid = designer.locator('[data-material-grid]');
  await rootData.click();
  const before = await grid.boundingBox();
  const rootBounds = await rootData.boundingBox();
  if (
    (await back.isVisible()) ||
    (await designer.locator('.material-group-heading').count()) !== 0 ||
    (await children
      .locator('[data-material-group-current] .material-group-label')
      .textContent()) !== '全部' ||
    rootBounds.width < 31 ||
    rootBounds.height !== 28
  ) {
    throw new Error(
      `MATERIAL_GROUP_COMPACT_HIERARCHY_FAILED:${JSON.stringify({
        backVisible: await back.isVisible(),
        headingCount: await designer.locator('.material-group-heading').count(),
        currentLabel: await children
          .locator('[data-material-group-current] .material-group-label')
          .textContent(),
        rootBounds,
      })}`,
    );
  }

  // A selected category stays selected on hover; keyboard focus is a separate visual state.
  const paint = () =>
    rootData.evaluate((button) => {
      const style = getComputedStyle(button);
      return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow };
    });
  await designer.locator('[data-material-search]').hover();
  await page.waitForTimeout(250);
  const selectedPaint = await paint();
  await rootData.hover();
  await page.waitForTimeout(250);
  if (JSON.stringify(selectedPaint) !== JSON.stringify(await paint()))
    throw new Error('MATERIAL_GROUP_SELECTED_HOVER_LOST');

  await rootData.press('ArrowRight');
  await expectFocus(designer, '[data-material-group-current="data"]');
  const advanced = children.locator('[data-material-group="advanced"]');
  await advanced.press('ArrowRight');
  await expectFocus(designer, '[data-material-group-current="advanced"]');
  const backBounds = await back.boundingBox();
  const secondaryBounds = await designer.locator('.material-group-secondary').boundingBox();
  if (
    backBounds === null ||
    backBounds.height !== 28 ||
    backBounds.width < secondaryBounds.width - 1 ||
    !(await back.getAttribute('data-tip')).includes('数据可视化')
  ) {
    throw new Error('MATERIAL_GROUP_BACK_TARGET_FAILED');
  }
  await children.locator('[data-material-group-current="advanced"]').press('ArrowLeft');
  await expectFocus(designer, '[data-material-group="advanced"]');
  await advanced.press('ArrowLeft');
  await expectFocus(designer, '.material-group-roots [data-material-group="data"]');
  const charts = children.locator('[data-material-group="charts"]');
  await charts.click();
  await charts.press('ArrowLeft');
  await rootData.press('ArrowRight');
  await expectFocus(designer, '[data-material-group="charts"]');
  if ((await charts.getAttribute('aria-pressed')) !== 'true')
    throw new Error('MATERIAL_GROUP_FOCUS_ROUND_TRIP_CHANGED_FILTER');
  if (JSON.stringify(before) !== JSON.stringify(await grid.boundingBox()))
    throw new Error('MATERIAL_GROUP_KEYBOARD_LAYOUT_SHIFT');

  // Search, favorites and category filters can intersect to empty; recovery clears constraints,
  // not favorites or the authored document, and focuses the search field instead of a removed row.
  await designer.locator('[data-material-filter="favorite"]').click();
  const search = designer.locator('[data-material-search]');
  await search.fill('no-matching-material');
  await designer.locator('[data-material-search-clear]').waitFor({ state: 'visible' });
  await assertSearchClear(page, designer, search);
  await search.fill('no-matching-material');
  await designer.locator('[data-material-search-clear]').waitFor({ state: 'visible' });
  await designer.locator('[data-material-library-reset]').click();
  await expectFocus(designer, '[data-material-search]');
  const reset = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      query: root.querySelector('[data-material-search]').value,
      allGroups: root.querySelector('[data-material-group-all]').ariaPressed,
      allItems: root.querySelector('[data-material-filter="all"]').ariaPressed,
      visible: root.querySelectorAll('[data-material-card]:not([hidden])').length,
      emptyHidden: root.querySelector('[data-material-search-empty]').hidden,
    };
  });
  if (
    reset.query !== '' ||
    reset.allGroups !== 'true' ||
    reset.allItems !== 'true' ||
    reset.visible !== 16 ||
    !reset.emptyHidden
  )
    throw new Error(`MATERIAL_GROUP_EMPTY_RECOVERY_FAILED:${JSON.stringify(reset)}`);
}

async function assertSearchClear(page, designer, search) {
  const clear = designer.locator('[data-material-search-clear]');
  const inputBounds = await search.boundingBox();
  const bounds = await clear.boundingBox();
  if (
    bounds.width !== 24 ||
    bounds.height !== 24 ||
    bounds.x < inputBounds.x ||
    bounds.x + bounds.width > inputBounds.x + inputBounds.width ||
    bounds.y + bounds.height / 2 !== inputBounds.y + inputBounds.height / 2
  )
    throw new Error('MATERIAL_SEARCH_CLEAR_NOT_CENTERED');
  await clear.hover();
  await page.mouse.down();
  try {
    await page.waitForTimeout(250);
    if (JSON.stringify(bounds) !== JSON.stringify(await clear.boundingBox()))
      throw new Error('MATERIAL_SEARCH_CLEAR_PRESSED_JITTER');
  } finally {
    await page.mouse.up();
  }
  await expectFocus(designer, '[data-material-search]');
  if ((await search.inputValue()) !== '') throw new Error('MATERIAL_SEARCH_CLEAR_NOT_APPLIED');
}

async function expectFocus(designer, selector) {
  const focused = await designer.evaluate(
    (element, selector) =>
      element.shadowRoot.activeElement === element.shadowRoot.querySelector(selector),
    selector,
  );
  if (!focused) throw new Error(`MATERIAL_GROUP_HIERARCHY_FOCUS_FAILED:${selector}`);
}

// ---- 源模块：assert-material-library-grouping.mjs ----
async function assertMaterialLibraryGrouping(page, designer) {
  const trigger = designer.locator('[data-material-group-toggle]');
  const compact = await trigger.isVisible();
  const openNavigation = async () => {
    if (compact && (await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  };
  const gridBeforePopup = await designer.locator('[data-material-grid]').boundingBox();
  await openNavigation();
  const rootState = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const rail = root.querySelector('[data-left-panel]');
    if (rail instanceof HTMLElement) rail.scrollTop = 0;
    return {
      navigationHidden: root.querySelector('[data-material-groups]')?.hidden,
      categoriesHidden: root.querySelector('[data-material-categories]')?.hidden,
      groups: [
        ...root.querySelectorAll('[data-material-group-list="roots"] [data-material-group]'),
      ].map((group) => group.dataset.materialGroup),
      cards: [...root.querySelectorAll('[data-material-card]')].map(
        (card) => card.dataset.materialCard,
      ),
      gridTop: root.querySelector('[data-material-grid]')?.getBoundingClientRect().top,
      visual: (() => {
        const navigation = root.querySelector('[data-material-groups]');
        const heading = navigation?.querySelector('.material-group-back');
        const roots = navigation?.querySelector('.material-group-roots');
        const children = navigation?.querySelector('.material-group-children');
        const group = navigation?.querySelector('[data-material-group]');
        const glyph = group?.querySelector('.material-group-glyph svg');
        const count = children?.querySelector('.material-group-count');
        const selectedFilter = root.querySelector('[data-material-filter="all"]');
        const card = root.querySelector('[data-material-card] .material-card');
        const thumb = card?.querySelector('.material-thumb');
        const toolbar = root.querySelector('[data-material-library-toolbar]');
        const grid = root.querySelector('[data-material-grid]');
        const meta = card?.querySelector('.material-card-meta');
        const name = card?.querySelector('.material-name');
        const type = card?.querySelector('.material-type');
        const favorite = root.querySelector('[data-material-card] [data-material-favorite]');
        const panelCount = root.querySelector('[data-left-panel-count]');
        const materialSearch = root.querySelector('[data-material-search]');
        return {
          navigationHeight: navigation?.getBoundingClientRect().height,
          navigationWidth: navigation?.getBoundingClientRect().width,
          headingHeight: heading?.getBoundingClientRect().height,
          rootsWidth: roots?.getBoundingClientRect().width,
          rootHeight: group?.getBoundingClientRect().height,
          rootGlyphWidth: glyph?.getBoundingClientRect().width,
          rootLabelDisplay: getComputedStyle(group.querySelector('.material-group-label')).display,
          rootTitle: group?.getAttribute('data-tip'),
          childrenHeight: children?.getBoundingClientRect().height,
          countWidth: count?.getBoundingClientRect().width,
          groupDisplay:
            group === null || group === undefined ? '' : getComputedStyle(group).display,
          countDisplay:
            count === null || count === undefined ? '' : getComputedStyle(count).display,
          // 筛选条与统一分段控件同形：选中 = 底色档（原型 .segmented 不再用投影表达按下）。
          selectedFilterBackground:
            selectedFilter === null || selectedFilter === undefined
              ? ''
              : getComputedStyle(selectedFilter).backgroundColor,
          unselectedFilterBackground:
            selectedFilter === null ||
            selectedFilter === undefined ||
            selectedFilter.nextElementSibling === null
              ? ''
              : getComputedStyle(selectedFilter.nextElementSibling).backgroundColor,
          cardMinHeight:
            card === null || card === undefined ? '' : getComputedStyle(card).minHeight,
          thumbAspectRatio:
            thumb === null || thumb === undefined ? '' : getComputedStyle(thumb).aspectRatio,
          thumbBackgroundColor:
            thumb === null || thumb === undefined ? '' : getComputedStyle(thumb).backgroundColor,
          thumbInsetShadow:
            thumb === null || thumb === undefined ? '' : getComputedStyle(thumb).boxShadow,
          toolbarDisplay:
            toolbar === null || toolbar === undefined ? '' : getComputedStyle(toolbar).display,
          gridOverflowY:
            grid === null || grid === undefined ? '' : getComputedStyle(grid).overflowY,
          metaDisplay: meta === null || meta === undefined ? '' : getComputedStyle(meta).display,
          nameTip: name?.getAttribute('data-tip'),
          typeTip: type?.getAttribute('data-tip'),
          favoriteWidth:
            favorite === null || favorite === undefined
              ? 0
              : favorite.getBoundingClientRect().width,
          firstRowCardCount:
            grid === null || grid === undefined
              ? 0
              : [...grid.children].filter(
                  (entry) =>
                    !entry.hidden &&
                    entry.getBoundingClientRect().top ===
                      grid.firstElementChild?.getBoundingClientRect().top,
                ).length,
          panelCountRole: panelCount?.getAttribute('role'),
          panelCountLive: panelCount?.getAttribute('aria-live'),
          panelCountLabel: panelCount?.getAttribute('aria-label'),
          searchDescribedBy: materialSearch?.getAttribute('aria-describedby'),
        };
      })(),
    };
  });
  const expectedCards = [
    'base.text',
    'base.rectangle',
    'base.ellipse',
    'base.image',
    'base.rule',
    'base.chart',
    'harness.semantic-chart',
    // 外围插件贡献的物料也进目录与物料库，故与官方/宿主物料同列断言。
    'plugin.echarts',
    'base.table',
    // plugin-datav-materials 贡献的四个大屏物料。
    'datav.digital-flop',
    'datav.scroll-board',
    'datav.water-level',
    'datav.border-box',
    'harness.react-button',
    'harness.vue-button',
    'harness.dataset-ranking',
  ];
  if (
    rootState.navigationHidden ||
    !rootState.categoriesHidden ||
    rootState.groups.join(',') !== 'foundation,data,datav,bridges,best-practices' ||
    rootState.cards.join(',') !== expectedCards.join(',') ||
    rootState.visual.navigationHeight < 150 ||
    rootState.visual.navigationWidth !== (compact ? 286 : 108) ||
    rootState.visual.headingHeight !== 0 ||
    rootState.visual.rootsWidth !== 32 ||
    rootState.visual.rootHeight !== 28 ||
    rootState.visual.rootGlyphWidth !== 16 ||
    rootState.visual.rootLabelDisplay !== 'none' ||
    rootState.visual.rootTitle !== '基础（5 个物料）' ||
    rootState.visual.childrenHeight !== rootState.visual.navigationHeight ||
    rootState.visual.countWidth !== (compact ? 24 : 0) ||
    rootState.visual.groupDisplay !== 'flex' ||
    rootState.visual.countDisplay !== (compact ? 'grid' : 'none') ||
    rootState.visual.selectedFilterBackground === '' ||
    rootState.visual.selectedFilterBackground === rootState.visual.unselectedFilterBackground ||
    // 卡片继承 .designer-button 的控件高度下限（控件基座 30px）。
    rootState.visual.cardMinHeight !== '30px' ||
    rootState.visual.thumbAspectRatio !== '16 / 10' ||
    // 缩略图为中性底（token 派生）+ inset 收边；色相驱动的渐变已退役。
    rootState.visual.thumbBackgroundColor === '' ||
    !rootState.visual.thumbInsetShadow.includes('inset') ||
    rootState.visual.toolbarDisplay !== 'block' ||
    rootState.visual.gridOverflowY !== 'auto' ||
    rootState.visual.metaDisplay !== 'grid' ||
    rootState.visual.nameTip !== null ||
    rootState.visual.typeTip !== 'base.text' ||
    rootState.visual.favoriteWidth !== 28 ||
    // 200–480px 面板中卡片根据分类分栏或浮层模式自适应列数。
    ![1, 2, 3].includes(rootState.visual.firstRowCardCount) ||
    rootState.visual.panelCountRole !== 'status' ||
    rootState.visual.panelCountLive !== 'polite' ||
    rootState.visual.panelCountLabel !== '\u7269\u6599\uff1a16 \u9879' ||
    rootState.visual.searchDescribedBy !== 'designer-left-panel-count'
  ) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_GROUPING_ROOT_FAILED:${JSON.stringify(rootState)}`);
  }
  const gridWithPopup = await designer.locator('[data-material-grid]').boundingBox();
  if (JSON.stringify(gridBeforePopup) !== JSON.stringify(gridWithPopup)) {
    throw new Error(
      `BROWSER_HARNESS_MATERIAL_GROUP_POPUP_REFLOW:${JSON.stringify({ gridBeforePopup, gridWithPopup })}`,
    );
  }

  const dataGroupButton = designer.locator('[data-material-group="data"]');
  const groupBeforeHover = await dataGroupButton.boundingBox();
  await dataGroupButton.hover();
  await page.waitForTimeout(250);
  const groupAfterHover = await dataGroupButton.boundingBox();
  if (JSON.stringify(groupBeforeHover) !== JSON.stringify(groupAfterHover)) {
    throw new Error(
      `BROWSER_HARNESS_MATERIAL_GROUP_HOVER_JITTER_FAILED:${JSON.stringify({ groupBeforeHover, groupAfterHover })}`,
    );
  }

  await dataGroupButton.click();
  const dataGroup = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      selected: root.querySelector('[data-material-group="data"]')?.ariaPressed,
      children: [
        ...root.querySelectorAll('[data-material-group-list="children"] [data-material-group]'),
      ].map((group) => group.dataset.materialGroup),
      visible: [...root.querySelectorAll('[data-material-card]:not([hidden])')].map(
        (card) => card.dataset.materialCard,
      ),
      gridTop: root.querySelector('[data-material-grid]')?.getBoundingClientRect().top,
    };
  });
  if (
    dataGroup.selected !== 'true' ||
    dataGroup.children.join(',') !== 'charts,tables' ||
    dataGroup.visible.join(',') !== 'base.chart,harness.semantic-chart,plugin.echarts,base.table' ||
    dataGroup.gridTop !== rootState.gridTop
  ) {
    throw new Error(
      `BROWSER_HARNESS_MATERIAL_GROUPING_DATA_FAILED:${JSON.stringify({ dataGroup, rootGridTop: rootState.gridTop })}`,
    );
  }
  if (compact) await page.keyboard.press('Escape');

  const groupSearch = designer.locator('[data-material-search]');
  await groupSearch.fill('语义');
  // ADR-0042：搜索渲染经 120ms 防抖，等待过滤结果生效后再断言。
  await page.waitForFunction(
    () => {
      const designer = document.querySelector('base-screen-designer');
      const visible = [
        ...(designer?.shadowRoot?.querySelectorAll('[data-material-card]:not([hidden])') ?? []),
      ].map((card) => card.dataset.materialCard);
      return visible.join(',') === 'harness.semantic-chart';
    },
    undefined,
    { timeout: 5000 },
  );
  const searchScoped = await designer.evaluate((element) =>
    [...element.shadowRoot.querySelectorAll('[data-material-card]:not([hidden])')].map(
      (card) => card.dataset.materialCard,
    ),
  );
  if (searchScoped.join(',') !== 'harness.semantic-chart') {
    throw new Error(`BROWSER_HARNESS_MATERIAL_GROUPING_SEARCH_FAILED:${searchScoped.join(',')}`);
  }
  await groupSearch.fill('');

  const favorite = designer.locator('[data-material-card="base.chart"] [data-material-favorite]');
  await favorite.click();
  await designer.locator('[data-material-filter="favorite"]').click();
  const favoriteScoped = await designer.evaluate((element) =>
    [...element.shadowRoot.querySelectorAll('[data-material-card]:not([hidden])')].map(
      (card) => card.dataset.materialCard,
    ),
  );
  if (favoriteScoped.join(',') !== 'base.chart') {
    throw new Error(
      `BROWSER_HARNESS_MATERIAL_GROUPING_FAVORITE_FAILED:${favoriteScoped.join(',')}`,
    );
  }
  await favorite.click();
  await designer.locator('[data-material-filter="all"]').click();

  await openNavigation();
  await designer.locator('[data-material-group="charts"]').click();
  const chartsGroup = await designer.evaluate((element) => ({
    visible: [...element.shadowRoot.querySelectorAll('[data-material-card]:not([hidden])')].map(
      (card) => card.dataset.materialCard,
    ),
    parent: element.shadowRoot.querySelector('[data-material-group="data"]')?.ariaPressed,
    sibling: element.shadowRoot.querySelector('[data-material-group="tables"]') !== null,
  }));
  if (
    chartsGroup.visible.join(',') !== 'base.chart,harness.semantic-chart,plugin.echarts' ||
    chartsGroup.parent !== 'true' ||
    !chartsGroup.sibling
  ) {
    throw new Error(
      `BROWSER_HARNESS_MATERIAL_GROUPING_CHILD_FAILED:${JSON.stringify(chartsGroup)}`,
    );
  }

  await openNavigation();
  await designer.locator('[data-material-group-current="data"]').click();
  await openNavigation();
  await designer.locator('[data-material-group-all]').click();

  const dynamic = await page.evaluate(() => {
    const { designer, materialLibraryGrouping } = window.baseScreenHarness;
    const root = designer.shadowRoot;
    const canvas = root.querySelector('[data-canvas]');
    // 全量重排（顺序改为 bridges → best-practices → datav → foundation → data）：
    // 分组校验要求覆盖每个可见物料，漏一组会让赋值整体被拒，测不出重排是否生效。
    const byId = new Map(materialLibraryGrouping.groups.map((group) => [group.id, group]));
    designer.materialLibraryGrouping = {
      groups: ['bridges', 'best-practices', 'datav', 'foundation', 'data'].map((id) =>
        byId.get(id),
      ),
    };
    return {
      sameCanvas: root.querySelector('[data-canvas]') === canvas,
      groups: [
        ...root.querySelectorAll('[data-material-group-list="roots"] [data-material-group]'),
      ].map((group) => group.dataset.materialGroup),
      cards: [...root.querySelectorAll('[data-material-card]')].map(
        (card) => card.dataset.materialCard,
      ),
    };
  });
  if (
    !dynamic.sameCanvas ||
    dynamic.groups.join(',') !== 'bridges,best-practices,datav,foundation,data' ||
    dynamic.cards.join(',') !==
      'harness.react-button,harness.vue-button,harness.dataset-ranking,datav.digital-flop,datav.scroll-board,datav.water-level,datav.border-box,base.text,base.rectangle,base.ellipse,base.image,base.rule,base.chart,harness.semantic-chart,plugin.echarts,base.table'
  ) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_GROUPING_UPDATE_FAILED:${JSON.stringify(dynamic)}`);
  }

  const invalid = await page.evaluate(() => {
    const { designer } = window.baseScreenHarness;
    const before = designer.materialLibraryGrouping;
    designer.materialLibraryGrouping = {
      groups: [{ id: 'only', label: 'Only', materialTypes: ['base.text'] }],
    };
    return { unchanged: designer.materialLibraryGrouping === before };
  });
  if (!invalid.unchanged) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_GROUPING_ATOMIC_FAILED:${JSON.stringify(invalid)}`);
  }

  await page.evaluate(async () => {
    window.baseScreenHarness.designer.materialLibraryGrouping =
      window.baseScreenHarness.materialLibraryGrouping;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

export { assertMaterialLibraryGrouping };

// ---- 源模块：assert-material-library-host-state.mjs ----
async function assertMaterialLibraryHostState(page, designer, viewport) {
  const state = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const status = root.querySelector('[data-material-library-status]');
    const console = root.querySelector('[data-error-console]');
    const materials = root.querySelector('[data-materials]');
    const trigger = root.querySelector('[data-error-console-toggle]');
    const draft = root.querySelector('[data-material-card="harness.semantic-chart"]');
    const unavailable = root.querySelector(
      '[data-material-card="base.table"] [data-material-type]',
    );
    return {
      status: status?.getAttribute('data-status'),
      text: status?.textContent?.trim(),
      statusHidden: status?.hidden,
      statusRole: status?.getAttribute('role'),
      statusInsideMaterials: materials?.contains(status) ?? false,
      statusInsideConsole: console?.contains(status) ?? false,
      consoleHidden: console?.hidden,
      consoleCount: trigger?.querySelector('[data-error-console-count]')?.textContent,
      consoleWidth: trigger?.getBoundingClientRect().width,
      gridTop: root.querySelector('[data-material-grid]')?.getBoundingClientRect().top,
      canvas: root.querySelector('[data-canvas]')?.getBoundingClientRect().toJSON(),
      categoryCount: root.querySelectorAll('[data-material-category-filter]').length,
      groupCount: root.querySelectorAll('[data-material-group]').length,
      draft: draft?.hasAttribute('data-material-draft'),
      unavailable: unavailable?.disabled,
      draggable: unavailable?.draggable,
    };
  });
  if (
    state.status !== 'partial' ||
    !state.text?.includes('1 个物料加载失败') ||
    state.statusHidden !== false ||
    state.statusRole !== 'alert' ||
    state.statusInsideMaterials ||
    !state.statusInsideConsole ||
    state.consoleHidden !== true ||
    state.consoleCount !== '1' ||
    // 顶栏图标按钮随设计值 28px（此前 32px）。
    (state.consoleWidth ?? 0) < 28 ||
    state.categoryCount !== 0 ||
    state.groupCount !== 5 ||
    state.draft !== true ||
    state.unavailable !== true ||
    state.draggable !== false
  ) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_LIBRARY_STATE_FAILED:${JSON.stringify(state)}`);
  }

  const consoleTrigger = designer.locator('[data-error-console-toggle]');
  await designer.locator('.statusbar').screenshot({
    path: `${screenshotDirectory}/error-console-trigger-${viewport.width}x${viewport.height}.png`,
  });
  await consoleTrigger.click();
  const consoleOpen = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      hidden: root.querySelector('[data-error-console]')?.hidden,
      expanded: root.querySelector('[data-error-console-toggle]')?.getAttribute('aria-expanded'),
      focusedClose: root.activeElement?.hasAttribute('data-error-console-close'),
      entryCount: root.querySelectorAll('[data-error-console-entry]').length,
      currentHeading: root.querySelector('.error-console-section-title')?.textContent?.trim(),
      historyHeading: root.querySelector('.error-console-history-heading h3')?.textContent?.trim(),
      historySummary: root
        .querySelector('[data-error-console-history-summary]')
        ?.textContent?.trim(),
      historyOrder: root
        .querySelector('[data-error-console-list]')
        ?.getAttribute('data-error-console-order'),
      gridTop: root.querySelector('[data-material-grid]')?.getBoundingClientRect().top,
      canvas: root.querySelector('[data-canvas]')?.getBoundingClientRect().toJSON(),
    };
  });
  if (
    consoleOpen.hidden !== false ||
    consoleOpen.expanded !== 'true' ||
    !consoleOpen.focusedClose ||
    consoleOpen.entryCount !== 1 ||
    consoleOpen.currentHeading !== '当前状态' ||
    consoleOpen.historyHeading !== '历史记录' ||
    consoleOpen.historySummary !== '1 条记录' ||
    consoleOpen.historyOrder !== 'newest-first' ||
    Math.abs((consoleOpen.gridTop ?? 0) - (state.gridTop ?? 0)) > 2 ||
    !rectWithin(consoleOpen.canvas, state.canvas)
  ) {
    throw new Error(
      `BROWSER_HARNESS_ERROR_CONSOLE_OPEN_FAILED:${JSON.stringify({ baseline: state, open: consoleOpen })}`,
    );
  }
  await designer.locator('[data-error-console]').screenshot({
    path: `${screenshotDirectory}/error-console-${viewport.width}x${viewport.height}.png`,
  });

  await page.keyboard.press('Shift+Tab');
  const focusBeforeWrap = await designer.evaluate(
    (element) =>
      element.shadowRoot.activeElement?.hasAttribute('data-error-console-clear') ?? false,
  );
  await page.keyboard.press('Shift+Tab');
  const focusAfterWrap = await designer.evaluate(
    (element) =>
      element.shadowRoot.activeElement?.getAttribute('data-material-library-action') ?? null,
  );
  if (!focusBeforeWrap || focusAfterWrap !== 'details') {
    throw new Error(
      `BROWSER_HARNESS_ERROR_CONSOLE_FOCUS_LOOP_FAILED:${JSON.stringify({ focusBeforeWrap, focusAfterWrap })}`,
    );
  }

  await designer.locator('[data-material-library-action="retry"]').click();
  await designer.locator('[data-material-library-action="details"]').click();
  const actions = await page.evaluate(() => window.baseScreenHarness.materialLibraryActions);
  if (actions.join(',') !== 'retry,details') {
    throw new Error(`BROWSER_HARNESS_MATERIAL_LIBRARY_ACTION_FAILED:${actions.join(',')}`);
  }
  await page.keyboard.press('Escape');
  const consoleClosed = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      hidden: root.querySelector('[data-error-console]')?.hidden,
      expanded: root.querySelector('[data-error-console-toggle]')?.getAttribute('aria-expanded'),
      focusedTrigger: root.activeElement?.hasAttribute('data-error-console-toggle'),
    };
  });
  if (
    consoleClosed.hidden !== true ||
    consoleClosed.expanded !== 'false' ||
    !consoleClosed.focusedTrigger
  ) {
    throw new Error(`BROWSER_HARNESS_ERROR_CONSOLE_CLOSE_FAILED:${JSON.stringify(consoleClosed)}`);
  }

  const fallback = await page.evaluate(() => {
    window.baseScreenHarness.designer.materialLibraryGrouping = undefined;
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      categoryCount: root.querySelectorAll('[data-material-category-filter]').length,
      navigationHidden: root.querySelector('[data-material-groups]')?.hidden,
    };
  });
  if (fallback.categoryCount < 2 || fallback.navigationHidden !== true) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_LIBRARY_FALLBACK_FAILED:${JSON.stringify(fallback)}`);
  }

  const category = designer.locator('[data-material-category-filter]').first();
  const totalCards = await designer.locator('[data-material-card]').count();
  await category.click();
  const categoryFiltered = await designer.locator('[data-material-card]:not([hidden])').count();
  if (
    (await category.getAttribute('aria-pressed')) !== 'true' ||
    categoryFiltered < 1 ||
    categoryFiltered >= totalCards
  ) {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_CATEGORY_FAILED');
  }
  await category.click();
  const search = designer.locator('[data-material-search]');
  await search.fill('no-such-material');
  // ADR-0042：搜索渲染经 120ms 防抖，等待空态出现后再断言。
  await page.waitForFunction(
    () => {
      const designer = document.querySelector('base-screen-designer');
      const root = designer?.shadowRoot;
      const visible = root?.querySelectorAll('[data-material-card]:not([hidden])').length ?? -1;
      return visible === 0;
    },
    undefined,
    { timeout: 5000 },
  );
  const searchState = await designer.evaluate((element) => ({
    visible: element.shadowRoot.querySelectorAll('[data-material-card]:not([hidden])').length,
    emptyHidden: element.shadowRoot.querySelector('[data-material-search-empty]')?.hidden,
  }));
  if (searchState.visible !== 0 || searchState.emptyHidden !== false) {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_SEARCH_EMPTY_FAILED');
  }
  await search.fill('');
  await page.waitForFunction(
    () => {
      const designer = document.querySelector('base-screen-designer');
      return (
        (designer?.shadowRoot?.querySelectorAll('[data-material-card]:not([hidden])').length ?? 0) >
        0
      );
    },
    undefined,
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    window.baseScreenHarness.designer.materialLibraryGrouping =
      window.baseScreenHarness.materialLibraryGrouping;
  });
  await designer.locator('[data-material-library-status]').waitFor({ state: 'attached' });

  const expectedStates = [
    ['loading', undefined, null, true, null, 0],
    ['ready', undefined, null, true, null, 0],
    ['offline', '正在使用离线目录', 'status', false, 'offline', 1],
    ['error', '物料目录加载失败', 'alert', false, 'error', 1],
    ['update-available', '物料目录有更新', 'status', false, 'update-available', 1],
  ];
  for (const [status, text, role, hidden, surfaceStatus, actionCount] of expectedStates) {
    const rendered = await page.evaluate((nextStatus) => {
      window.baseScreenHarness.designer.materialLibraryState = { status: nextStatus };
      const root = window.baseScreenHarness.designer.shadowRoot;
      const surface = root.querySelector('[data-material-library-status]');
      const trigger = root.querySelector('[data-error-console-toggle]');
      return {
        status: surface?.getAttribute('data-status'),
        text: surface?.textContent?.trim(),
        role: surface?.getAttribute('role'),
        hidden: surface?.hidden,
        actionCount: surface?.querySelectorAll('[data-material-library-action]').length,
        gridTop: root.querySelector('[data-material-grid]')?.getBoundingClientRect().top,
        canvas: root.querySelector('[data-canvas]')?.getBoundingClientRect().toJSON(),
        consoleWidth: trigger?.getBoundingClientRect().width,
      };
    }, status);
    if (
      rendered.status !== surfaceStatus ||
      rendered.role !== role ||
      rendered.hidden !== hidden ||
      (text !== undefined && !rendered.text?.includes(text)) ||
      rendered.actionCount !== actionCount ||
      !rectWithin(rendered.canvas, state.canvas) ||
      rendered.consoleWidth !== state.consoleWidth
    ) {
      throw new Error(
        `BROWSER_HARNESS_MATERIAL_LIBRARY_STATUS_FAILED:${JSON.stringify({ status, rendered, expected: { text, role, hidden, surfaceStatus, actionCount }, baseline: { canvas: state.canvas, consoleWidth: state.consoleWidth } })}`,
      );
    }
  }

  await consoleTrigger.click();
  await designer.locator('[data-material-library-action="reload"]').click();
  const updatedActions = await page.evaluate(() => window.baseScreenHarness.materialLibraryActions);
  if (updatedActions.at(-1) !== 'reload') {
    throw new Error('BROWSER_HARNESS_MATERIAL_LIBRARY_RELOAD_FAILED');
  }
  await designer.locator('[data-error-console-clear]').click();
  const cleared = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      entryCount: root.querySelectorAll('[data-error-console-entry]').length,
      count: root.querySelector('[data-error-console-count]')?.textContent,
      status: root.querySelector('[data-material-library-status]')?.getAttribute('data-status'),
    };
  });
  if (cleared.entryCount !== 0 || cleared.count !== '' || cleared.status !== 'update-available') {
    throw new Error(`BROWSER_HARNESS_ERROR_CONSOLE_CLEAR_FAILED:${JSON.stringify(cleared)}`);
  }
  await designer.locator('[data-error-console]').click({ position: { x: 2, y: 2 } });
  const backdropClosed = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    return {
      hidden: root.querySelector('[data-error-console]')?.hidden,
      focusedTrigger: root.activeElement?.hasAttribute('data-error-console-toggle'),
    };
  });
  if (backdropClosed.hidden !== true || !backdropClosed.focusedTrigger) {
    throw new Error(
      `BROWSER_HARNESS_ERROR_CONSOLE_BACKDROP_CLOSE_FAILED:${JSON.stringify(backdropClosed)}`,
    );
  }
}

export { assertMaterialLibraryHostState };

// ---- 源模块：assert-cover-thumbnail.mjs ----
// ADR-0040 物料宿主封面验证：harness 的 cover 探针实例（仅含托管包目录，hosted-metric 声明
// 根相对 cover '/cover.svg'）在卡片缩略图区渲染真实封面；加载后图片与缩略图容器都置
// data-material-cover-loaded（opacity 1、object-fit cover），占位图标保留为回退层，
// 缩略图几何与无封面卡片完全一致（无抖动）。断言后移除探针实例，不影响主流程与截图。
async function assertCoverThumbnail(page) {
  await page.evaluate(() => window.baseScreenHarness.createCoverProbeDemo());
  const probe = page.locator('base-screen-designer[data-cover-probe]');
  await probe.waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('base-screen-designer[data-cover-probe]')?.shadowRoot;
      const grid = root?.querySelector('[data-material-grid]');
      return grid !== null && grid !== undefined && grid.children.length >= 2;
    },
    undefined,
    { timeout: 8000 },
  );
  const card = probe.locator('[data-material-card="harness.hosted-metric"]');
  await card.scrollIntoViewIfNeeded();
  await probe
    .locator(
      '[data-material-card="harness.hosted-metric"] .material-cover[data-material-cover-loaded]',
    )
    .waitFor({ state: 'attached', timeout: 8000 });
  // opacity 过渡进行中时计算样式仍为 0，等过渡结束（opacity 1）再采样。
  await page.waitForFunction(
    () => {
      const root = document.querySelector('base-screen-designer[data-cover-probe]')?.shadowRoot;
      const image = root?.querySelector(
        '[data-material-card="harness.hosted-metric"] .material-cover',
      );
      return image !== null && image !== undefined && getComputedStyle(image).opacity === '1';
    },
    undefined,
    { timeout: 8000 },
  );
  const observed = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const card = root.querySelector('[data-material-card="harness.hosted-metric"]');
    const thumb = card?.querySelector('.material-thumb');
    const image = thumb?.querySelector('.material-cover');
    const plainThumb = root
      .querySelector('[data-material-card="harness.hosted-badge"]')
      ?.querySelector('.material-thumb');
    const coverStyle = image === null || image === undefined ? undefined : getComputedStyle(image);
    return {
      src: image?.getAttribute('src'),
      alt: image?.getAttribute('alt'),
      draggable: image?.getAttribute('draggable'),
      loading: image?.getAttribute('loading'),
      decoding: image?.getAttribute('decoding'),
      thumbAriaHidden: thumb?.getAttribute('aria-hidden'),
      loadedOnImage: image?.hasAttribute('data-material-cover-loaded') ?? false,
      loadedOnThumb: thumb?.hasAttribute('data-material-cover-loaded') ?? false,
      opacity: coverStyle?.opacity,
      objectFit: coverStyle?.objectFit,
      placeholderSvg: thumb?.querySelector('svg') !== null,
      // ADR-0042：物料卡片网格项启用 content-visibility（屏外跳过渲染）。
      cardContentVisibility:
        card === null || card === undefined ? null : getComputedStyle(card).contentVisibility,
      thumbRect:
        thumb === null || thumb === undefined ? null : thumb.getBoundingClientRect().toJSON(),
      plainThumbRect:
        plainThumb === null || plainThumb === undefined
          ? null
          : plainThumb.getBoundingClientRect().toJSON(),
    };
  });
  // ADR-0041 自适应封面：200x24 窄条封面应完整 contain 显示（不放大、不裁切），
  // 缩略图容器带 data-material-cover-fit="contain" 标记，计算样式 object-fit: contain；
  // 缩略图几何仍与无封面卡片一致（无抖动）。
  const tinyCard = probe.locator('[data-material-card="harness.hosted-tiny"]');
  await tinyCard.scrollIntoViewIfNeeded();
  await probe
    .locator(
      '[data-material-card="harness.hosted-tiny"] .material-cover[data-material-cover-loaded]',
    )
    .waitFor({ state: 'attached', timeout: 8000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('base-screen-designer[data-cover-probe]')?.shadowRoot;
      const thumb = root?.querySelector(
        '[data-material-card="harness.hosted-tiny"] .material-thumb',
      );
      const image = thumb?.querySelector('.material-cover');
      return (
        image !== null &&
        image !== undefined &&
        getComputedStyle(image).opacity === '1' &&
        thumb?.hasAttribute('data-material-cover-fit')
      );
    },
    undefined,
    { timeout: 8000 },
  );
  const tinyObserved = await probe.evaluate((element) => {
    const root = element.shadowRoot;
    const card = root.querySelector('[data-material-card="harness.hosted-tiny"]');
    const thumb = card?.querySelector('.material-thumb');
    const image = thumb?.querySelector('.material-cover');
    const plainThumb = root
      .querySelector('[data-material-card="harness.hosted-badge"]')
      ?.querySelector('.material-thumb');
    const coverStyle = image === null || image === undefined ? undefined : getComputedStyle(image);
    return {
      src: image?.getAttribute('src'),
      loadedOnImage: image?.hasAttribute('data-material-cover-loaded') ?? false,
      fitOnThumb: thumb?.getAttribute('data-material-cover-fit'),
      objectFit: coverStyle?.objectFit,
      thumbRect:
        thumb === null || thumb === undefined ? null : thumb.getBoundingClientRect().toJSON(),
      plainThumbRect:
        plainThumb === null || plainThumb === undefined
          ? null
          : plainThumb.getBoundingClientRect().toJSON(),
    };
  });
  await page.evaluate(() => {
    document.querySelector('base-screen-designer[data-cover-probe]')?.remove();
  });
  const geometryMatches =
    observed.thumbRect !== null &&
    observed.plainThumbRect !== null &&
    Math.abs(observed.thumbRect.width - observed.plainThumbRect.width) < 1 &&
    Math.abs(observed.thumbRect.height - observed.plainThumbRect.height) < 1;
  const tinyGeometryMatches =
    tinyObserved.thumbRect !== null &&
    tinyObserved.plainThumbRect !== null &&
    Math.abs(tinyObserved.thumbRect.width - tinyObserved.plainThumbRect.width) < 1 &&
    Math.abs(tinyObserved.thumbRect.height - tinyObserved.plainThumbRect.height) < 1;
  if (
    observed.src !== '/cover.svg' ||
    observed.alt !== '' ||
    observed.draggable !== 'false' ||
    observed.loading !== 'lazy' ||
    observed.decoding !== 'async' ||
    observed.thumbAriaHidden !== 'true' ||
    !observed.loadedOnImage ||
    !observed.loadedOnThumb ||
    observed.opacity !== '1' ||
    observed.objectFit !== 'cover' ||
    observed.cardContentVisibility !== 'auto' ||
    !observed.placeholderSvg ||
    !geometryMatches
  ) {
    throw new Error(`BROWSER_HARNESS_COVER_THUMBNAIL_FAILED:${JSON.stringify(observed)}`);
  }
  if (
    tinyObserved.src !== '/tiny-cover.svg' ||
    !tinyObserved.loadedOnImage ||
    tinyObserved.fitOnThumb !== 'contain' ||
    tinyObserved.objectFit !== 'contain' ||
    !tinyGeometryMatches
  ) {
    throw new Error(`BROWSER_HARNESS_COVER_ADAPTIVE_FAILED:${JSON.stringify(tinyObserved)}`);
  }
}

export { assertCoverThumbnail };

// ---- 源模块：assert-image-density-size.mjs ----
export async function assertImageDensitySize(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);
    const designer = page.locator('base-screen-designer').first();
    expect(
      await page.evaluate(() => {
        const designer = window.baseScreenHarness.designer;
        const manifest = designer.catalog.get('base.image').manifest;
        return designer.replaceDocument({
          canvas: { width: 120, height: 80, backgroundColor: '#07101f' },
          components: [
            {
              id: 'density-image',
              type: 'base.image',
              name: 'Density image',
              parentId: null,
              position: { x: 10, y: 12 },
              size: { width: 40, height: 25 },
              rotation: 7,
              zIndex: 0,
              status: { locked: false, hidden: false },
              props: manifest.defaultProps,
              style: manifest.defaultStyle,
              dataSource: { type: 'static', value: '/cover.svg' },
            },
          ],
          variables: [],
          blueprint: { rules: [] },
        }).ok;
      }),
    ).toBe(true);

    const image = designer.locator('[data-base-screen-component-id="density-image"]');
    await expect(image).toHaveAttribute('data-base-screen-image-natural-width', '320');
    await expect(image).toHaveAttribute('data-base-screen-image-natural-height', '200');
    await image.click();
    const actions = designer.locator('[data-image-density-action]');
    await expect(actions).toHaveCount(4);
    expect(await actions.allTextContents()).toEqual(['1x', '2x', '3x', '4x']);

    const expectedSizes = [
      [1, { width: 320, height: 200 }],
      [2, { width: 160, height: 100 }],
      [3, { width: 106.67, height: 66.67 }],
      [4, { width: 80, height: 50 }],
    ];
    for (const [density, expected] of expectedSizes) {
      await designer.locator(`[data-image-density-action="${density}"]`).click();
      expect(await readComponent(page)).toMatchObject({
        position: { x: 10, y: 12 },
        size: expected,
        rotation: 7,
        style: { objectFit: 'contain', opacity: 1 },
        dataSource: { type: 'static', value: '/cover.svg' },
      });
    }

    // 1x 超过 120 x 80 画布仍按自然尺寸提交；每次点击都是可撤销的一次事务。
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    expect((await readComponent(page)).size).toEqual({ width: 106.67, height: 66.67 });
    await page.evaluate(() => window.baseScreenHarness.designer.redo());
    expect((await readComponent(page)).size).toEqual({ width: 80, height: 50 });

    expect(
      await page.evaluate(
        () =>
          window.baseScreenHarness.designer.executeCommand({
            type: 'update-components',
            componentIds: ['density-image'],
            patch: { dataSource: { type: 'static', value: '/tiny-cover.svg' } },
          }).ok,
      ),
    ).toBe(true);
    await expect(image).toHaveAttribute('data-base-screen-image-natural-width', '200');
    await expect(image).toHaveAttribute('data-base-screen-image-natural-height', '24');
    expect((await readComponent(page)).size).toEqual({ width: 80, height: 50 });

    await designer.locator('[data-image-density-action="2"]').click();
    expect((await readComponent(page)).size).toEqual({ width: 100, height: 12 });

    const exported = await page.evaluate(() => {
      const result = window.baseScreenHarness.designer.exportDocument();
      return result.ok ? JSON.parse(result.value) : null;
    });
    expect(exported?.components[0]?.size).toEqual({ width: 100, height: 12 });
    expect(exported?.components[0]?.autoSize).toBeUndefined();
    expect(exported?.components[0]?.pixelRatio).toBeUndefined();

    await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const viewer = document.createElement('base-screen-viewer');
      viewer.dataset.imageDensityProbe = '';
      viewer.catalog = designer.catalog;
      viewer.document = designer.document;
      viewer.style.cssText =
        'display:block;position:absolute;left:-2000px;top:0;width:120px;height:80px;visibility:hidden';
      document.body.appendChild(viewer);
    });
    const viewerImage = page.locator(
      'base-screen-viewer[data-image-density-probe] [data-base-screen-component-id="density-image"]',
    );
    await expect(viewerImage).toHaveCount(1);
    expect(
      await viewerImage.evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        height: Number.parseFloat(getComputedStyle(element).height),
      })),
    ).toEqual({ width: 100, height: 12 });
    await page.evaluate(() => document.querySelector('[data-image-density-probe]')?.remove());
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

async function readComponent(page) {
  return page.evaluate(() =>
    structuredClone(
      window.baseScreenHarness.designer.document.components.find(
        (component) => component.id === 'density-image',
      ),
    ),
  );
}

// ---- 源模块：assert-authoring-material-visuals.mjs ----
export async function assertAuthoringMaterialVisuals(page, designer) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  // 官方物料视觉能力（ADR-0055）：矩形面板出现圆角/阴影字段，设置后画布样式生效
  // （圆角/阴影/渐变 fill，以及不改变 canonical bounds 的渐变 border）。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const card = [...root.querySelectorAll('button')].find(
      (button) => button.dataset.materialType === 'base.rectangle',
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    return (
      panel?.innerText.includes('圆角') &&
      panel.innerText.includes('阴影模糊') &&
      panel.querySelector(
        '[data-style="borderColor"][data-color-palette-field="mode"][value="linear-gradient"]',
      ) !== null
    );
  });
  const visualResult = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-rectangle',
    );
    const id = element.getAttribute('data-base-screen-component-id');
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === id,
    );
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: {
        style: {
          ...component.style,
          borderRadius: 16,
          shadowColor: '#000000',
          shadowBlur: 10,
          shadowOffsetX: 4,
          shadowOffsetY: 6,
          fill: 'linear-gradient(90deg, #ff0000, #0000ff)',
          borderColor: 'linear-gradient(135deg, #ff765c 0%, #7c6cff 100%)',
          borderWidth: 4,
        },
      },
    });
    return { ok: result.ok };
  });
  if (!visualResult.ok) throw new Error('BROWSER_HARNESS_SHAPE_VISUAL_COMMAND_FAILED');
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-rectangle',
    );
    const border = element?.querySelector('[data-base-screen-gradient-border]');
    const elementBounds = element?.getBoundingClientRect();
    const borderBounds = border?.getBoundingClientRect();
    return (
      element?.style.borderRadius === '16px' &&
      element?.style.boxShadow !== '' &&
      element?.style.backgroundImage.startsWith('linear-gradient(') &&
      element?.style.borderWidth === '0px' &&
      border?.style.backgroundImage.startsWith('linear-gradient(') &&
      border?.style.padding === '4px' &&
      border?.style.borderRadius === 'inherit' &&
      border?.style.pointerEvents === 'none' &&
      ['exclude', 'xor'].includes(border?.style.maskComposite) &&
      ['exclude', 'xor'].includes(border?.style.webkitMaskComposite) &&
      elementBounds?.width === borderBounds?.width &&
      elementBounds?.height === borderBounds?.height
    );
  });

  // 图片物料 URL 校验（ADR-0056）：非法 URL 显示占位且不创建 img。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const card = [...root.querySelectorAll('button')].find(
      (button) => button.dataset.materialType === 'base.image',
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return [...root.querySelectorAll('[data-base-screen-component-id]')].some(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
  });
  const imageUrlResult = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    const id = element.getAttribute('data-base-screen-component-id');
    return window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: { dataSource: { type: 'static', value: 'javascript:alert(1)' } },
    });
  });
  if (!imageUrlResult.ok) throw new Error('BROWSER_HARNESS_IMAGE_URL_COMMAND_FAILED');
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    return element?.textContent === '图片地址无效' && element.querySelector('img') === null;
  });
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    const id = element.getAttribute('data-base-screen-component-id');
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: { dataSource: { type: 'static', value: 'https://example.com/a.png' } },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_IMAGE_URL_RESTORE_FAILED');
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].find(
      (entry) => entry.tagName.toLowerCase() === 'base-screen-image',
    );
    return element?.querySelector('img')?.src === 'https://example.com/a.png';
  });

  // 调色板切换模式继承单色色系（ADR-0057）：新建矩形（fill 默认单色 #2563eb），
  // 把单色改为 #ff0000 后切到线性渐变，首帧色标起点 = 所选单色、终点 = 同色系提亮；
  // 派生提交恰一条历史，撤销恢复到切换前的单色。
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const card = [...root.querySelectorAll('button')].find(
      (button) => button.dataset.materialType === 'base.rectangle',
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  });
  await page.waitForFunction(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    return panel?.querySelector('[data-style="fill"][data-color-palette-field="solid"]') !== null;
  });
  const paletteBefore = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const id = element.getAttribute('data-base-screen-component-id');
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === id,
    );
    return { id, fill: component?.style?.fill };
  });
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    solid.value = '#ff0000';
    const radio = panel.querySelector(
      '[data-style="fill"][data-color-palette-field="mode"][value="linear-gradient"]',
    );
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
  await page.waitForFunction((expected) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === expected;
  }, 'linear-gradient(90deg, #ff0000 0%, #ff7373 100%)');
  const paletteStops = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const panel = root.querySelector('[data-inspector-pane="appearance"]');
    const solid = panel.querySelector('[data-style="fill"][data-color-palette-field="solid"]');
    const palette = solid.closest('[data-designer-color-palette]');
    return [...palette.querySelectorAll('[data-color-palette-stop-handle]')].map(
      (handle) => handle.dataset.colorPaletteStopColor,
    );
  });
  if (JSON.stringify(paletteStops) !== JSON.stringify(['#ff0000', '#ff7373'])) {
    throw new Error(`BROWSER_HARNESS_PALETTE_FAMILY_STOPS_FAILED:${paletteStops.join(',')}`);
  }
  // 撤销前聚焦视口（Ctrl+Z 需进入 designer 事件链）。
  await page.evaluate(() => {
    window.baseScreenHarness.designer.shadowRoot.querySelector('[data-viewport]').focus();
  });
  await page.keyboard.press(`${modifier}+z`);
  await page.waitForFunction((undo) => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const element = [...root.querySelectorAll('[data-base-screen-component-id]')].at(-1);
    const component = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === element.getAttribute('data-base-screen-component-id'),
    );
    return component?.style?.fill === undo;
  }, paletteBefore.fill);
}

/**
 * 目录内每个物料的渲染盒必须等于 canonical `component.size`。
 *
 * 唯一例外是 `base.text` 的自适应宽度：宽度由引擎的 `DesignerAutoWidthController` 测量后
 * 投影回文档，物料写 `max-content` 只是让浏览器可测量（该控制器读的就是物料元素自身的
 * computed width）。除此之外，物料在 `renderMaterial()` 里写宿主元素的 `width`/`height`
 * 都会覆盖渲染器写入的像素尺寸——最常见的 `100%/100%` 会让组件撑满整个画布。这个 bug 已在
 * `plugin-echarts` 与 `plugin-datav-materials` 的四个物料上各出现一次，所以由这条覆盖全目录
 * 的断言兜底，而不是逐个物料写断言：新增物料不遵守就在这里失败。
 *
 * 覆盖所有 catalog 条目（含 `libraryVisible: false` 的容器类物料），并把全部违规一次性报出，
 * 避免"修一个露一个"。
 */
export async function assertMaterialGeometry(page, designer) {
  await page.waitForFunction(() => window.baseScreenHarness.designer.document !== undefined);
  const results = await page.evaluate(async () => {
    const harness = window.baseScreenHarness;
    const designerInstance = harness.designer;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const measured = [];

    // 隐藏物料被公开 `insertComponent` 有意拒绝——那是面向物料库的作者入口。这类物料按
    // manifest 默认值手搭节点，形状与引擎的 createInitialMaterialDataSource 一致
    // （tabular 物料必须带 defaultBinding，否则渲染器不会跑 adapter）。
    const buildComponent = (manifest, id) => ({
      id,
      type: manifest.type,
      name: manifest.name,
      parentId: null,
      position: { x: 24, y: 24 },
      size: manifest.defaultSize,
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: manifest.defaultProps,
      style: manifest.defaultStyle,
      dataSource:
        manifest.defaultData === undefined
          ? null
          : {
              type: 'static',
              value: manifest.defaultData,
              ...(manifest.staticData?.kind === 'tabular'
                ? { binding: manifest.staticData.defaultBinding }
                : {}),
            },
    });

    let index = 0;
    for (const entry of harness.catalog.list()) {
      const type = entry.manifest.type;
      let id = null;
      if (entry.manifest.libraryVisible === false) {
        const probeId = `geometry-probe-${index++}`;
        const added = designerInstance.executeCommand({
          type: 'add-component',
          component: buildComponent(entry.manifest, probeId),
        });
        if (!added.ok) {
          measured.push({ type, error: added.diagnostics.map((item) => item.code).join(',') });
          continue;
        }
        id = probeId;
      } else {
        const inserted = designerInstance.insertComponent({ materialType: type });
        if (!inserted.ok) {
          measured.push({ type, error: inserted.diagnostics.map((item) => item.code).join(',') });
          continue;
        }
        id = designerInstance.selection.focusedComponentId;
      }
      // 渲染器与物料的 renderMaterial 都在本次写入链内同步完成，再等两帧让布局落定。
      await nextFrame();
      await nextFrame();
      const component = designerInstance.document.components.find((item) => item.id === id);
      const node = designerInstance.shadowRoot.querySelector(
        `[data-base-screen-component-id=${id ?? ''}]`,
      );
      const rect = node?.getBoundingClientRect();
      measured.push({
        type,
        declared: { w: component?.size.width ?? null, h: component?.size.height ?? null },
        box: rect === undefined ? null : { w: +rect.width.toFixed(2), h: +rect.height.toFixed(2) },
      });
      if (id !== null) {
        designerInstance.executeCommand({ type: 'remove-components', componentIds: [id] });
        await nextFrame();
      }
    }
    return measured;
  });

  const offenders = results.filter((row) => {
    if (row.error !== undefined) return true;
    if (row.box === null || row.declared.w === null || row.declared.h === null) return true;
    return Math.abs(row.box.w - row.declared.w) > 1 || Math.abs(row.box.h - row.declared.h) > 1;
  });
  if (offenders.length > 0) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_GEOMETRY_FAILED:${JSON.stringify(offenders)}`);
  }
  // 至少确认跑过若干物料，避免目录为空时"零违规"假通过。
  if (results.length < 10) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_GEOMETRY_EMPTY:${results.length}`);
  }
}
