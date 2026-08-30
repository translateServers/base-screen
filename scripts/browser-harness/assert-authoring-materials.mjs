export async function assertAuthoringMaterials(authoringDesigner, page) {
  await authoringDesigner.getByTitle('\u6587\u672c').click();
  const canvas = authoringDesigner.locator('[data-canvas]');
  const canvasBox = await canvas.boundingBox();
  if (canvasBox === null) throw new Error('BROWSER_HARNESS_CANVAS_MISSING');
  await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.components.length === 10,
  );
  await authoringDesigner.getByTitle('\u77e9\u5f62').click();
  const activeTool = await authoringDesigner.locator('[data-status-tool]').textContent();
  const rectanglePressed = await authoringDesigner
    .locator('button[data-tool="rectangle"]')
    .getAttribute('aria-pressed');
  if (activeTool !== '\u77e9\u5f62' || rectanglePressed !== 'true') {
    throw new Error('BROWSER_HARNESS_ACTIVE_TOOL_STATUS_FAILED');
  }
  await authoringDesigner.locator('[data-material-type="base.rectangle"] .material-name').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.components.length === 11,
  );
  const rectangle = authoringDesigner.locator('[data-base-screen-component-id^="base-rectangle-"]');
  if (
    (await rectangle.count()) !== 1 ||
    (await rectangle.getAttribute('data-base-screen-data-state')) !== 'idle' ||
    (await rectangle.evaluate((element) => element.style.borderStyle)) !== 'solid'
  ) {
    throw new Error('BROWSER_HARNESS_RECTANGLE_MATERIAL_FAILED');
  }
  await authoringDesigner.getByTitle('\u692d\u5706').click();
  await authoringDesigner.locator('[data-material-type="base.ellipse"] .material-name').click();
  await page.waitForFunction(
    () => window.baseScreenHarness.designer.document.components.at(-1)?.type === 'base.ellipse',
  );
  const ellipse = authoringDesigner.locator('[data-base-screen-component-id^="base-ellipse-"]');
  if (
    (await ellipse.count()) !== 1 ||
    (await ellipse.evaluate((element) => element.style.borderRadius)) !== '50%'
  ) {
    throw new Error('BROWSER_HARNESS_ELLIPSE_MATERIAL_FAILED');
  }
  await authoringDesigner.getByTitle('\u56fe\u7247').click();
  await authoringDesigner.locator('[data-material-type="base.image"] .material-name').click();
  const imageType = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.at(-1)?.type,
  );
  if (imageType !== 'base.image') {
    throw new Error(`BROWSER_HARNESS_IMAGE_TOOL_FAILED: ${imageType}`);
  }
  const image = authoringDesigner.locator('[data-base-screen-component-id^="base-image-"]');
  const imageIdle = {
    count: await image.count(),
    state: await image.getAttribute('data-base-screen-data-state'),
    text: await image.textContent(),
  };
  if (
    imageIdle.count !== 1 ||
    imageIdle.state !== 'ready' ||
    imageIdle.text !== '\u672a\u8bbe\u7f6e\u56fe\u7247'
  ) {
    throw new Error(`BROWSER_HARNESS_IMAGE_IDLE_STATE_FAILED:${JSON.stringify(imageIdle)}`);
  }
  await image.evaluate((element) => {
    element.model = { ...element.model, dataState: { status: 'loading' } };
  });
  if (
    (await image.textContent()) !== '\u56fe\u7247\u52a0\u8f7d\u4e2d' ||
    (await image.getAttribute('aria-busy')) !== 'true'
  ) {
    throw new Error('BROWSER_HARNESS_IMAGE_LOADING_STATE_FAILED');
  }
  await image.evaluate((element) => {
    element.model = {
      ...element.model,
      dataState: { status: 'error', code: 'HOST_RESOURCE_FAILED', message: 'hidden' },
    };
  });
  if ((await image.textContent()) !== '\u56fe\u7247\u4e0d\u53ef\u7528') {
    throw new Error('BROWSER_HARNESS_IMAGE_ERROR_STATE_FAILED');
  }
  if ((await authoringDesigner.locator('[data-material-type="base.container"]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_CONTAINER_LIBRARY_VISIBLE_FAILED');
  }
  await authoringDesigner.locator('[data-panel-tab="layers"]').click();
  await authoringDesigner
    .locator('[data-layer-select]', { hasText: '矩形' })
    .locator('.layer-name')
    .click();
  await authoringDesigner
    .locator('[data-layer-select]', { hasText: '\u692d\u5706' })
    .locator('.layer-name')
    .click({ modifiers: ['Control'] });
  await authoringDesigner.locator('[data-viewport]').focus();
  await page.keyboard.press('Control+g');
  await page.waitForFunction(() =>
    window.baseScreenHarness.designer.document.components.some(
      (component) => component.type === 'base.container',
    ),
  );
  const container = authoringDesigner.locator('[data-base-screen-component-id^="base-container-"]');
  if (
    (await container.count()) !== 1 ||
    (await container.getAttribute('data-base-screen-data-state')) !== 'idle' ||
    (await container.evaluate((element) => getComputedStyle(element).borderStyle)) !== 'solid'
  ) {
    throw new Error('BROWSER_HARNESS_CONTAINER_MATERIAL_FAILED');
  }
  await authoringDesigner.locator('[data-panel-tab="materials"]').click();
  await authoringDesigner.locator('[data-material-type="base.text"] .material-name').click();
  const materialPaletteCount = await page.evaluate(
    () => window.baseScreenHarness.designer.document.components.length,
  );
  if (materialPaletteCount !== 15) {
    throw new Error(`BROWSER_HARNESS_MATERIAL_PALETTE_DELEGATION_FAILED: ${materialPaletteCount}`);
  }
  if ((await authoringDesigner.locator('[data-create-preview]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_CREATE_PREVIEW_STALE');
  }
  const zoomBefore = await authoringDesigner.locator('[data-zoom]').textContent();
  await authoringDesigner.locator('button[data-tool="zoom"]').click();
  await page.mouse.click(canvasBox.x + 500, canvasBox.y + 250);
  const zoomAfter = await authoringDesigner.locator('[data-zoom]').textContent();
  if (zoomBefore === zoomAfter) throw new Error('BROWSER_HARNESS_ZOOM_TOOL_FAILED');
}
