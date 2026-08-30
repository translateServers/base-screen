import { screenshotDirectory } from './constants.mjs';
import { rectWithin } from './layout-assertions.mjs';

async function assertMaterialLibraryHostState(page, designer, viewport) {
  const state = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const status = root.querySelector('[data-material-library-status]');
    const console = root.querySelector('[data-error-console]');
    const materials = root.querySelector('[data-materials]');
    const trigger = root.querySelector('[data-error-console-toggle]');
    const draft = root.querySelector('[data-material-card="base.echarts"]');
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
    state.consoleWidth !== 84 ||
    state.categoryCount !== 0 ||
    state.groupCount !== 4 ||
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
