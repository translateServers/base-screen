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

// 打开“更多 > <level2Label>”，再沿真实 hover 路径把指针从三级触发行水平移入其浮层，
// 返回已展开的三级浮层 locator。层级浮层与触发行有 4px 重叠，水平移入保持在同一 wrap 内，
// 用于回归“进入内层嵌套后父级被误收起”与“浮层被祖先面板裁剪”两类缺陷。
async function hoverNestedSubmenu(designer, page, level2Label, level3Label) {
  const moreMenu = await openMoreSubmenu(designer, level2Label);
  // 三级 wrap 的判定：直接挂在某个 [data-submenu] 之下（二级 wrap 挂在 [data-menu] 之下）。
  const nestedWrap = moreMenu
    .locator('[data-submenu] > .designer-menu-submenu-wrap')
    .filter({ hasText: level3Label });
  const trigger = nestedWrap.locator('[data-submenu-toggle]');
  await trigger.waitFor({ state: 'visible' });
  await trigger.hover();
  const panel = nestedWrap.locator('[data-submenu]');
  await panel.waitFor({ state: 'visible' });
  const triggerBox = await trigger.boundingBox();
  const panelBox = await panel.boundingBox();
  if (triggerBox === null || panelBox === null) {
    throw new Error('BROWSER_HARNESS_NESTED_SUBMENU_GEOMETRY_MISSING');
  }
  const enterX = Math.max(panelBox.x + 8, panelBox.x + panelBox.width - 24);
  await page.mouse.move(enterX, triggerBox.y + triggerBox.height / 2, { steps: 6 });
  return panel;
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
  hoverNestedSubmenu,
  openMoreSubmenu,
  stableJson,
  toggleCanvasAidViaMenu,
  toggleGridViaMenu,
  zoomResetViaMenu,
};
