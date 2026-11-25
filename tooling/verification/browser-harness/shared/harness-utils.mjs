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

/**
 * 在设计器画布里按「组件所在位置上实际最上层的元素」点击或双击。
 *
 * 不用 page.mouse：harness 页面里 designer 与底部 viewer 并列，真实鼠标可能落到 viewer 的物料上。
 * 也不直接向组件元素派发：那会绕过选框拖拽层这类覆盖层（真实双击的第二击常落在拖拽层上），
 * 抓不到覆盖层吞事件的缺陷。这里用 designer shadow root 的 elementFromPoint 找真实目标，
 * 顺序与浏览器一致：pointerdown → pointerup → click，双击再补一组和 dblclick。
 *
 * `offset` 是相对组件左上角的画布坐标（默认组件中心）。返回每一击实际命中的元素描述。
 */
async function clickComponentAt(page, componentId, { double = false, offset } = {}) {
  return page.evaluate(
    ({ componentId, double, offset }) => {
      const designer = window.baseScreenHarness.designer;
      const root = designer.shadowRoot;
      const element = root.querySelector(
        `[data-canvas] [data-base-screen-component-id="${componentId}"]`,
      );
      if (element === null) throw new Error(`BROWSER_HARNESS_CLICK_TARGET_MISSING:${componentId}`);
      const rect = element.getBoundingClientRect();
      const component = designer.document.components.find((item) => item.id === componentId);
      const scale = component === undefined ? 1 : rect.width / component.size.width || 1;
      const x = offset === undefined ? rect.left + rect.width / 2 : rect.left + offset.x * scale;
      const y = offset === undefined ? rect.top + rect.height / 2 : rect.top + offset.y * scale;
      const describe = (target) =>
        target === null
          ? null
          : (target.getAttribute('data-base-screen-component-id') ??
            (target.hasAttribute('data-selection-grab') ? 'selection-grab' : target.className));
      const hits = [];
      const press = (detail) => {
        const down = root.elementFromPoint(x, y);
        hits.push(describe(down));
        const pointer = {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
        };
        down?.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
        const up = root.elementFromPoint(x, y);
        up?.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
        up?.dispatchEvent(new MouseEvent('click', { ...pointer, detail }));
      };
      press(1);
      if (double) {
        press(2);
        const target = root.elementFromPoint(x, y);
        hits.push(describe(target));
        target?.dispatchEvent(
          new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            detail: 2,
          }),
        );
      }
      return hits;
    },
    { componentId, double, offset },
  );
}

export {
  assertCanvasAidChecked,
  clickComponentAt,
  componentCount,
  componentPositions,
  hoverNestedSubmenu,
  openTopMenu,
  stableJson,
  toggleCanvasAidViaMenu,
  toggleGridViaMenu,
  zoomResetViaMenu,
};
