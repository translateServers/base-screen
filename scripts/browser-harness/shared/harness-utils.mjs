async function componentCount(page) {
  return page.evaluate(() => window.baseScreenHarness.designer.document.components.length);
}

async function openMoreSubmenu(designer, label) {
  const moreMenu = designer.locator('.designer-menu[data-menu="more"]');
  if (await moreMenu.isHidden()) {
    await designer.locator('[data-menu-toggle="more"]').click();
  }
  const trigger = moreMenu
    .locator(':scope > .designer-menu-submenu-wrap > [data-submenu-toggle]')
    .filter({ hasText: label });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
  return moreMenu;
}

// 顶栏改版后画布辅助操作移入“更多 > 视图”，按真实菜单路径触发。
// 先 Escape 收起可能已展开的菜单，保证 helper 可重入。
async function openCanvasAidsMenu(designer, page) {
  await page.keyboard.press('Escape');
  return openMoreSubmenu(designer, '\u89c6\u56fe');
}

async function toggleGridViaMenu(designer, page) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  await viewMenu.locator('[data-submenu] [data-menu-action="toggle-grid"]').click();
}

// 视图 > 画布辅助子菜单内按操作 id 触发开关。
async function toggleCanvasAidViaMenu(designer, page, actionId) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  await viewMenu.locator(`[data-submenu] [data-menu-action="${actionId}"]`).click();
}

// 打开视图 > 画布辅助子菜单，断言指定开关项勾选状态与真实开关状态一致。
async function assertCanvasAidChecked(designer, page, actionId, expected) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  const item = viewMenu.locator(`[data-submenu] [data-menu-action="${actionId}"]`);
  const checked = await item.getAttribute('aria-checked');
  if (checked !== expected) {
    throw new Error(
      `BROWSER_HARNESS_CANVAS_AID_CHECKED_FAILED:${JSON.stringify({
        actionId,
        checked,
        expected,
      })}`,
    );
  }
}

async function zoomResetViaMenu(designer) {
  const moreMenu = await openMoreSubmenu(designer, '\u89c6\u56fe');
  await moreMenu.locator('[data-menu-action="zoom-reset"]').click();
}

async function componentPositions(page, ids) {
  return page.evaluate(
    (componentIds) =>
      componentIds.map((id) => {
        const component = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === id,
        );
        if (component === undefined) throw new Error(`Missing component: ${id}`);
        return { id, ...component.position, zIndex: component.zIndex };
      }),
    ids,
  );
}
function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export {
  assertCanvasAidChecked,
  componentCount,
  componentPositions,
  openMoreSubmenu,
  stableJson,
  toggleCanvasAidViaMenu,
  toggleGridViaMenu,
  zoomResetViaMenu,
};
