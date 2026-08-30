import { componentCount } from './harness-utils.mjs';

async function assertLayersAuthoring(designer, page) {
  await designer.getByRole('tab', { name: '\u56fe\u5c42' }).click();
  const layers = designer.locator('[data-layers]');
  const tree = layers.locator('[role=tree]');
  const initialCount = await componentCount(page);
  if ((await tree.locator('[role=treeitem]').count()) !== initialCount) {
    throw new Error('BROWSER_HARNESS_LAYER_TREE_FAILED');
  }
  const search = layers.locator('[data-layer-search]');
  await search.fill('\u5bbf\u4e3b\u6570\u636e');
  if ((await tree.locator('[role=treeitem]').count()) !== 1) {
    throw new Error('BROWSER_HARNESS_LAYER_SEARCH_FAILED');
  }
  await search.fill('');
  const title = tree.locator('[role=treeitem][data-layer-id=title]');
  const lock = title.locator('[data-layer-toggle=locked]');
  await title.locator('[data-layer-select=title]').click({ force: true });
  await lock.click({ force: true });
  if ((await title.getAttribute('aria-selected')) !== 'true') {
    throw new Error('BROWSER_HARNESS_LAYER_FOCUS_STATE_FAILED');
  }
  if (
    (await layers
      .locator('[data-layer-id=title] [data-layer-toggle=locked]')
      .getAttribute('aria-pressed')) !== 'true'
  ) {
    throw new Error('BROWSER_HARNESS_LAYER_LOCK_STATE_FAILED');
  }
  // 锁定组件不是画布选择目标：左键单击保持既有选择；从锁定组件内部拖出时仍能
  // 发起框选，且最终选区排除锁定项、保留命中的未锁定项。
  const subtitle = tree.locator('[role=treeitem][data-layer-id=subtitle]');
  await subtitle.locator('[data-layer-select=subtitle]').click({ force: true });
  await designer.locator('[data-base-screen-component-id=title]').click({
    position: { x: 6, y: 7 },
  });
  if (
    (await subtitle.getAttribute('aria-selected')) !== 'true' ||
    (await title.getAttribute('aria-selected')) !== 'false'
  ) {
    throw new Error('BROWSER_HARNESS_LOCKED_CANVAS_CLICK_SELECTION_FAILED');
  }
  const titleBox = await designer.locator('[data-base-screen-component-id=title]').boundingBox();
  const subtitleBox = await designer
    .locator('[data-base-screen-component-id=subtitle]')
    .boundingBox();
  if (titleBox === null || subtitleBox === null) {
    throw new Error('BROWSER_HARNESS_LOCKED_MARQUEE_BOUNDS_MISSING');
  }
  await page.mouse.move(titleBox.x + 6, titleBox.y + 7);
  await page.mouse.down();
  await page.mouse.move(
    subtitleBox.x + subtitleBox.width - 6,
    subtitleBox.y + subtitleBox.height - 6,
    { steps: 6 },
  );
  await page.mouse.up();
  const marqueeSelection = await tree
    .locator('[role=treeitem][aria-selected=true]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-layer-id')));
  if (marqueeSelection.includes('title') || !marqueeSelection.includes('subtitle')) {
    throw new Error(
      `BROWSER_HARNESS_LOCKED_MARQUEE_SELECTION_FAILED:${JSON.stringify(marqueeSelection)}`,
    );
  }
  await lock.click({ force: true });
}

export { assertLayersAuthoring };
