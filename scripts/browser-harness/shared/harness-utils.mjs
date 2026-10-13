const topMenuIds = {
  '\u6587\u4ef6': 'file',
  '\u7f16\u8f91': 'edit',
  '\u89c6\u56fe': 'view',
  '\u5de5\u5177': 'tools',
};

async function componentCount(page) {
  return page.evaluate(() => window.baseScreenHarness.designer.document.components.length);
}

// 顶栏菜单栏直开：按顶层触发器展开对应面板，返回面板 locator；可重入。
async function openTopMenu(designer, label) {
  const menuId = topMenuIds[label];
  if (menuId === undefined) throw new Error(`BROWSER_HARNESS_TOP_MENU_UNKNOWN:${label}`);
  const trigger = designer.locator(`[data-menu-toggle="${menuId}"]`);
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
  return designer.locator(`.designer-menu[data-menu="${menuId}"]`);
}

// 画布辅助操作在顶层“视图”菜单内，按真实菜单路径触发。
// 先 Escape 收起可能已展开的菜单，保证 helper 可重入。
async function openCanvasAidsMenu(designer, page) {
  await page.keyboard.press('Escape');
  return openTopMenu(designer, '\u89c6\u56fe');
}

// 打开顶层 `<level2Label>` 菜单，再沿真实 hover 路径把指针从子菜单触发行水平移入其浮层，
// 返回已展开的浮层 locator。浮层与触发行有 4px 重叠，水平移入保持在同一 wrap 内，
// 用于回归“进入内层嵌套后父级被误收起”与“浮层被祖先面板裁剪”两类缺陷。
async function hoverNestedSubmenu(designer, page, level2Label, level3Label) {
  const topMenu = await openTopMenu(designer, level2Label);
  const nestedWrap = topMenu
    .locator('.designer-menu-submenu-wrap')
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
  await viewMenu.locator('[data-menu-action="toggle-grid"]').click();
}

// 视图菜单内按操作 id 触发开关。
async function toggleCanvasAidViaMenu(designer, page, actionId) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  await viewMenu.locator(`[data-menu-action="${actionId}"]`).click();
}

// 打开展开视图菜单，断言指定开关项勾选状态与真实开关状态一致。
async function assertCanvasAidChecked(designer, page, actionId, expected) {
  const viewMenu = await openCanvasAidsMenu(designer, page);
  const item = viewMenu.locator(`[data-menu-action="${actionId}"]`);
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
  const viewMenu = await openTopMenu(designer, '\u89c6\u56fe');
  await viewMenu.locator('[data-menu-action="zoom-reset"]').click();
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
  openTopMenu,
  stableJson,
  toggleCanvasAidViaMenu,
  toggleGridViaMenu,
  zoomResetViaMenu,
};
