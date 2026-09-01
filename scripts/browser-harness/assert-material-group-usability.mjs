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
    !(await back.getAttribute('title')).includes('数据可视化')
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
    reset.visible !== 10 ||
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
