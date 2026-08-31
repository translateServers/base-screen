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
    title: button.title,
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
  if ((await count()) !== '10' || (await designer.locator('[data-material-card]').count()) !== 11)
    throw new Error('MATERIAL_GROUP_TYPE_VS_ITEM_COUNT_FAILED');
  await designer.locator('[data-material-search]').fill('Alpha');
  await designer.locator('[data-material-search-clear]').waitFor({ state: 'visible' });
  if (
    (await designer.locator('[data-material-card]:not([hidden])').count()) !== 1 ||
    (await count()) !== '10'
  )
    throw new Error('MATERIAL_GROUP_SEARCH_CHANGED_COUNT');
  await designer.locator('[data-material-favorite="text:one"]').click();
  await designer.locator('[data-material-filter="favorite"]').click();
  if ((await count()) !== '10') throw new Error('MATERIAL_GROUP_FAVORITE_CHANGED_COUNT');
  await designer.locator('[data-material-search-clear]').click();
  await designer.locator('[data-material-filter="recent"]').click();
  const empty = designer.locator('[data-material-search-empty]');
  if (!(await empty.isVisible()) || (await count()) !== '10')
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
