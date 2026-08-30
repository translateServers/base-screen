export async function assertCanvasBasics(designer, page) {
  const title = designer.locator('[data-base-screen-component-id=title]');
  const canvasLocator = designer.locator('[data-canvas]');
  await title.waitFor({ state: 'visible' });
  await canvasLocator.waitFor({ state: 'visible' });
  const box = await title.boundingBox();
  if (box === null) {
    throw new Error('BROWSER_HARNESS_TITLE_MISSING');
  }
  const titleCanvasBox = await canvasLocator.boundingBox();
  if (titleCanvasBox === null) {
    throw new Error('BROWSER_HARNESS_CANVAS_MISSING');
  }
  const before = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        .position,
  );
  await title.dragTo(designer.locator('[data-canvas]'), {
    sourcePosition: { x: 20, y: 20 },
    targetPosition: { x: box.x + 80 - titleCanvasBox.x, y: box.y + 50 - titleCanvasBox.y },
  });
  const after = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        .position,
  );
  if (after.x === before.x || after.y === before.y) {
    throw new Error('BROWSER_HARNESS_DRAG_FAILED');
  }
  await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
  const undone = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find((item) => item.id === 'title')
        .position,
  );
  if (undone.x !== before.x || undone.y !== before.y) {
    throw new Error('BROWSER_HARNESS_UNDO_FAILED');
  }
  await designer.locator('[data-viewport]').dispatchEvent('contextmenu', {
    clientX: 400,
    clientY: 200,
  });
  const contextMenu = designer.locator('[data-context-menu]');
  const contextMenuState = {
    hidden: await contextMenu.isHidden(),
    items: await contextMenu.getByRole('menuitem').count(),
  };
  if (contextMenuState.hidden || contextMenuState.items < 5) {
    throw new Error(`BROWSER_HARNESS_CONTEXT_MENU_FAILED:${JSON.stringify(contextMenuState)}`);
  }
  const canvasAidsToggle = contextMenu.locator('[data-submenu-toggle]').first();
  await canvasAidsToggle.click();
  await contextMenu
    .locator('[data-submenu][data-submenu-side] [data-menu-action="toggle-grid"]')
    .click();
  await page.keyboard.press('Escape');
  if (!(await contextMenu.isHidden())) {
    throw new Error('BROWSER_HARNESS_CONTEXT_MENU_ESCAPE_FAILED');
  }
  await designer.locator('[data-viewport]').click({ button: 'right', position: { x: 12, y: 12 } });
  if (await contextMenu.isHidden()) {
    throw new Error('BROWSER_HARNESS_SECONDARY_POINTER_CAPTURE_FAILED');
  }
  await page.keyboard.press('Escape');
  if (!(await contextMenu.isHidden())) {
    throw new Error('BROWSER_HARNESS_SECONDARY_CONTEXT_MENU_ESCAPE_FAILED');
  }
  const snapToggle = designer.locator('[data-status-toggle="snap"]');
  if ((await snapToggle.getAttribute('aria-checked')) !== 'true') {
    throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_INITIAL_STATE_FAILED');
  }
  await snapToggle.click();
  if ((await snapToggle.getAttribute('aria-checked')) !== 'false') {
    throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_OFF_FAILED');
  }
  if ((await designer.locator('.canvas-guide-snap').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_GUIDE_NOT_CLEARED_FAILED');
  }
  await snapToggle.click();
  if ((await snapToggle.getAttribute('aria-checked')) !== 'true') {
    throw new Error('BROWSER_HARNESS_SNAP_TOGGLE_ON_FAILED');
  }
  await designer.locator('[data-menu-toggle="tools"]').click();
  await designer
    .locator('.designer-menu[data-menu="tools"] [data-menu-action="show-help"]')
    .click();
  const helpMenu = designer.locator('[data-help-dialog]');
  if (
    (await helpMenu.isHidden()) ||
    (await helpMenu.locator('[data-help-operation]').count()) === 0
  ) {
    throw new Error('BROWSER_HARNESS_SHORTCUT_HELP_FAILED');
  }
  // 帮助对话框：点击 close 按钮关闭（对话框覆盖顶栏，直接派发 click 事件）。
  await helpMenu.locator('[data-help-close]').evaluate((button) => button.click());
  if (!(await helpMenu.isHidden())) {
    throw new Error('BROWSER_HARNESS_SHORTCUT_HELP_CLOSE_FAILED');
  }
  const workbench = designer.locator('.designer');
  await designer.locator('[data-viewport]').focus();
  await page.keyboard.press('f');
  if ((await workbench.getAttribute('data-workbench-mode')) !== 'with-menu') {
    throw new Error('BROWSER_HARNESS_WORKBENCH_MODE_FAILED');
  }
  await page.keyboard.press('f');
  await page.keyboard.press('f');
  if ((await workbench.getAttribute('data-workbench-mode')) !== 'standard') {
    throw new Error('BROWSER_HARNESS_WORKBENCH_MODE_RESET_FAILED');
  }
  // 工作台模式往返会改变画布偏移，Alt 拖拽前重新捕获标题位置，避免使用过期坐标。
  const altBox = await title.boundingBox();
  if (altBox === null) throw new Error('BROWSER_HARNESS_TITLE_MISSING');
  await page.keyboard.down('Alt');
  await page.mouse.move(altBox.x + 20, altBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(altBox.x + 80, altBox.y + 50, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const duplicate = await page.evaluate(() => ({
    count: window.baseScreenHarness.designer.document.components.length,
    original: window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'title',
    ).position,
  }));
  if (
    duplicate.count !== 10 ||
    duplicate.original.x !== before.x ||
    duplicate.original.y !== before.y
  ) {
    throw new Error(
      `BROWSER_HARNESS_ALT_DUPLICATE_FAILED:${JSON.stringify({
        duplicate,
        before,
        altBox,
      })}`,
    );
  }
  await designer.getByTitle('\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c').click();
}
