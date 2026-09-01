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
          rootTitle: group?.title,
          childrenHeight: children?.getBoundingClientRect().height,
          countWidth: count?.getBoundingClientRect().width,
          groupDisplay:
            group === null || group === undefined ? '' : getComputedStyle(group).display,
          countDisplay:
            count === null || count === undefined ? '' : getComputedStyle(count).display,
          selectedFilterShadow:
            selectedFilter === null || selectedFilter === undefined
              ? ''
              : getComputedStyle(selectedFilter).boxShadow,
          cardMinHeight:
            card === null || card === undefined ? '' : getComputedStyle(card).minHeight,
          thumbAspectRatio:
            thumb === null || thumb === undefined ? '' : getComputedStyle(thumb).aspectRatio,
          thumbBackgroundImage:
            thumb === null || thumb === undefined ? '' : getComputedStyle(thumb).backgroundImage,
          toolbarDisplay:
            toolbar === null || toolbar === undefined ? '' : getComputedStyle(toolbar).display,
          gridOverflowY:
            grid === null || grid === undefined ? '' : getComputedStyle(grid).overflowY,
          metaDisplay: meta === null || meta === undefined ? '' : getComputedStyle(meta).display,
          nameTitle: name?.getAttribute('title'),
          typeTitle: type?.getAttribute('title'),
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
    'base.chart',
    'base.echarts',
    'base.table',
    'harness.react-button',
    'harness.vue-button',
    'harness.dataset-ranking',
  ];
  if (
    rootState.navigationHidden ||
    !rootState.categoriesHidden ||
    rootState.groups.join(',') !== 'foundation,data,bridges,best-practices' ||
    rootState.cards.join(',') !== expectedCards.join(',') ||
    rootState.visual.navigationHeight < 150 ||
    rootState.visual.navigationWidth !== (compact ? 286 : 108) ||
    rootState.visual.headingHeight !== 0 ||
    rootState.visual.rootsWidth !== 32 ||
    rootState.visual.rootHeight !== 28 ||
    rootState.visual.rootGlyphWidth !== 16 ||
    rootState.visual.rootLabelDisplay !== 'none' ||
    rootState.visual.rootTitle !== '基础（4 个物料）' ||
    rootState.visual.childrenHeight !== rootState.visual.navigationHeight ||
    rootState.visual.countWidth !== (compact ? 24 : 0) ||
    rootState.visual.groupDisplay !== 'flex' ||
    rootState.visual.countDisplay !== (compact ? 'grid' : 'none') ||
    rootState.visual.selectedFilterShadow === 'none' ||
    rootState.visual.cardMinHeight !== '32px' ||
    rootState.visual.thumbAspectRatio !== '16 / 10' ||
    !rootState.visual.thumbBackgroundImage.includes('radial-gradient') ||
    rootState.visual.toolbarDisplay !== 'block' ||
    rootState.visual.gridOverflowY !== 'auto' ||
    rootState.visual.metaDisplay !== 'grid' ||
    rootState.visual.nameTitle !== null ||
    rootState.visual.typeTitle !== 'base.text' ||
    rootState.visual.favoriteWidth !== 28 ||
    // 200–480px 面板中卡片根据分类分栏或浮层模式自适应列数。
    ![1, 2, 3].includes(rootState.visual.firstRowCardCount) ||
    rootState.visual.panelCountRole !== 'status' ||
    rootState.visual.panelCountLive !== 'polite' ||
    rootState.visual.panelCountLabel !== '\u7269\u6599\uff1a10 \u9879' ||
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
    dataGroup.visible.join(',') !== 'base.chart,base.echarts,base.table' ||
    dataGroup.gridTop !== rootState.gridTop
  ) {
    throw new Error(
      `BROWSER_HARNESS_MATERIAL_GROUPING_DATA_FAILED:${JSON.stringify({ dataGroup, rootGridTop: rootState.gridTop })}`,
    );
  }
  if (compact) await page.keyboard.press('Escape');

  const groupSearch = designer.locator('[data-material-search]');
  await groupSearch.fill('echarts');
  // ADR-0042：搜索渲染经 120ms 防抖，等待过滤结果生效后再断言。
  await page.waitForFunction(
    () => {
      const designer = document.querySelector('base-screen-designer');
      const visible = [
        ...(designer?.shadowRoot?.querySelectorAll('[data-material-card]:not([hidden])') ?? []),
      ].map((card) => card.dataset.materialCard);
      return visible.join(',') === 'base.echarts';
    },
    undefined,
    { timeout: 5000 },
  );
  const searchScoped = await designer.evaluate((element) =>
    [...element.shadowRoot.querySelectorAll('[data-material-card]:not([hidden])')].map(
      (card) => card.dataset.materialCard,
    ),
  );
  if (searchScoped.join(',') !== 'base.echarts') {
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
    chartsGroup.visible.join(',') !== 'base.chart,base.echarts' ||
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
    designer.materialLibraryGrouping = {
      groups: [
        materialLibraryGrouping.groups[2],
        materialLibraryGrouping.groups[0],
        materialLibraryGrouping.groups[1],
        materialLibraryGrouping.groups[3],
      ],
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
    dynamic.groups.join(',') !== 'bridges,foundation,data,best-practices' ||
    dynamic.cards.join(',') !==
      'harness.react-button,harness.vue-button,base.text,base.rectangle,base.ellipse,base.image,base.chart,base.echarts,base.table,harness.dataset-ranking'
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
