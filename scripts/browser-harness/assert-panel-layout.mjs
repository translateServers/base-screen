export async function assertPanelLayout(designer, page) {
  // ADR-0037：真实鼠标拖宽后折叠必须收敛到 48px 图标轨，展开恢复拖拽宽度；折叠态箭头 180°
  // 旋转、折叠按钮不被压扁（此前按钮被压缩到约 2px）；折叠态拖拽有展开阈值（48+24，参考
  // VSCode）：阈值内保持折叠，越过阈值才展开。完成后把左右面板拖回默认宽度恢复现场。
  const layoutBox = await designer.locator('.designer').boundingBox();
  if (layoutBox === null) {
    throw new Error('BROWSER_HARNESS_PANEL_HANDLE_MISSING');
  }
  const dragTo = async (side, targetX) => {
    const box = await designer.locator(`[data-panel-handle="${side}"]`).boundingBox();
    if (box === null) throw new Error('BROWSER_HARNESS_PANEL_HANDLE_MISSING');
    const startY = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, startY, { steps: 4 });
    await page.mouse.up();
  };
  // 宽度 = clientX - bounds.left - 边框1px - 列中线(2.5px)；右面板为 bounds.right 反向。
  // 读取面板 CSS 默认宽度（不硬编码具体默认值），供最后拖回默认宽度恢复现场。
  const defaultWidths = await page.evaluate(() => {
    const style = getComputedStyle(
      window.baseScreenHarness.designer.shadowRoot.querySelector('.designer'),
    );
    return {
      left: parseFloat(style.getPropertyValue('--left-panel-width')),
      right: parseFloat(style.getPropertyValue('--right-panel-width')),
    };
  });
  await dragTo('left', layoutBox.x + 1 + 380 + 2.5);
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 360 - 2.5);
  const readPanel = () =>
    page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      return {
        left: Math.round(root.querySelector('[data-left-panel]').getBoundingClientRect().width),
        right: Math.round(root.querySelector('.properties').getBoundingClientRect().width),
        leftState: root.querySelector('.designer').dataset.leftCollapsed,
        rightState: root.querySelector('.designer').dataset.rightCollapsed,
      };
    });
  const collapseEvaluate = async (side) => {
    await page.evaluate((panelSide) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      root.querySelector(`[data-panel-collapse="${panelSide}"]`).click();
    }, side);
    // 等待折叠过渡（--designer-motion 0.16s）结束后再读箭头 transform。
    await new Promise((resolve) => setTimeout(resolve, 220));
    return page.evaluate((panelSide) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const button = root.querySelector(`[data-panel-collapse="${panelSide}"]`);
      return {
        arrow: getComputedStyle(button.querySelector('svg')).transform,
        buttonWidth: Math.round(button.getBoundingClientRect().width),
      };
    }, side);
  };

  const dragged = await readPanel();
  const expectedDraggedRight = Math.max(
    288,
    Math.min(360, Math.round(layoutBox.width - 380 - 10 - 360)),
  );
  const collapsedLeft = { ...(await collapseEvaluate('left')), ...(await readPanel()) };
  if (
    dragged.left !== 380 ||
    dragged.right !== expectedDraggedRight ||
    collapsedLeft.leftState !== 'true' ||
    collapsedLeft.left !== 48 ||
    collapsedLeft.arrow !== 'matrix(-1, 0, 0, -1, 0, 0)' ||
    collapsedLeft.buttonWidth < 28
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_COLLAPSE_ROUNDTRIP_FAILED:${JSON.stringify({
        dragged,
        collapsedLeft,
      })}`,
    );
  }
  // 折叠态拖拽阈值：宽度 58 < 48+24 → 保持折叠；拖到 380 → 展开并应用宽度。
  await dragTo('left', layoutBox.x + 1 + 58 + 2.5);
  const underThreshold = await readPanel();
  await dragTo('left', layoutBox.x + 1 + 380 + 2.5);
  const expandedLeft = await readPanel();

  const collapsedRight = { ...(await collapseEvaluate('right')), ...(await readPanel()) };
  if (
    collapsedRight.rightState !== 'true' ||
    collapsedRight.right !== 48 ||
    collapsedRight.arrow !== 'matrix(-1, 0, 0, -1, 0, 0)' ||
    collapsedRight.buttonWidth < 28
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_COLLAPSE_ROUNDTRIP_FAILED:${JSON.stringify({ collapsedRight })}`,
    );
  }
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 58 - 2.5);
  const underThresholdRight = await readPanel();
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 360 - 2.5);
  const expandedRight = await readPanel();
  if (
    underThreshold.leftState !== 'true' ||
    underThreshold.left !== 48 ||
    expandedLeft.leftState !== 'false' ||
    expandedLeft.left !== 380 ||
    underThresholdRight.rightState !== 'true' ||
    underThresholdRight.right !== 48 ||
    expandedRight.rightState !== 'false' ||
    expandedRight.right !== expectedDraggedRight
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_COLLAPSE_THRESHOLD_FAILED:${JSON.stringify({
        underThreshold,
        expandedLeft,
        underThresholdRight,
        expandedRight,
      })}`,
    );
  }
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 288 - 2.5);
  const inspectorMinimum = await readPanel();
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - 480 - 2.5);
  const inspectorMaximum = await readPanel();
  const expectedInspectorMaximum = Math.max(
    288,
    Math.min(480, Math.round(layoutBox.width - 380 - 10 - 360)),
  );
  if (inspectorMinimum.right !== 288 || inspectorMaximum.right !== expectedInspectorMaximum) {
    throw new Error(
      `BROWSER_HARNESS_INSPECTOR_WIDTH_RANGE_FAILED:${JSON.stringify({ inspectorMinimum, inspectorMaximum })}`,
    );
  }
  // 拖回默认宽度，恢复后续断言的现场。
  await dragTo('left', layoutBox.x + 1 + defaultWidths.left + 2.5);
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - defaultWidths.right - 2.5);
  const restored = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    return {
      left: Math.round(root.querySelector('[data-left-panel]').getBoundingClientRect().width),
      right: Math.round(root.querySelector('.properties').getBoundingClientRect().width),
    };
  });
  const expectedRestoredRight = Math.max(
    288,
    Math.min(defaultWidths.right, Math.round(layoutBox.width - defaultWidths.left - 10 - 360)),
  );
  if (restored.left !== defaultWidths.left || restored.right !== expectedRestoredRight) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_WIDTH_RESTORE_FAILED:${JSON.stringify({ restored, defaultWidths, expectedRestoredRight })}`,
    );
  }

  // 分隔条必须同时具备真实键盘调整能力与 WAI-ARIA separator 数值投影。
  const readHandle = (side) =>
    designer.evaluate((element, panelSide) => {
      const root = element.shadowRoot;
      const handle = root.querySelector(`[data-panel-handle="${panelSide}"]`);
      const panel =
        panelSide === 'left'
          ? root.querySelector('[data-left-panel]')
          : root.querySelector('.properties');
      return {
        controls: handle.getAttribute('aria-controls'),
        focused: root.activeElement === handle,
        label: handle.getAttribute('aria-label'),
        maximum: Number(handle.getAttribute('aria-valuemax')),
        minimum: Number(handle.getAttribute('aria-valuemin')),
        orientation: handle.getAttribute('aria-orientation'),
        role: handle.getAttribute('role'),
        state: root.querySelector('.designer').dataset[`${panelSide}Collapsed`],
        value: Number(handle.getAttribute('aria-valuenow')),
        width: Math.round(panel.getBoundingClientRect().width),
      };
    }, side);

  const leftHandle = designer.locator('[data-panel-handle="left"]');
  await leftHandle.focus();
  const leftInitial = await readHandle('left');
  await page.keyboard.press('ArrowRight');
  const leftStep = await readHandle('left');
  await page.keyboard.press('Shift+ArrowRight');
  const leftLargeStep = await readHandle('left');
  await page.keyboard.press('End');
  const leftEnd = await readHandle('left');
  await designer.locator('[data-panel-collapse="left"]').click();
  await leftHandle.focus();
  await page.keyboard.press('Home');
  const leftExpandedByKeyboard = await readHandle('left');
  if (
    leftInitial.role !== 'separator' ||
    leftInitial.orientation !== 'vertical' ||
    leftInitial.controls !== 'designer-left-panel' ||
    !leftInitial.label ||
    !leftInitial.focused ||
    leftStep.value !== Math.min(480, leftInitial.value + 8) ||
    leftLargeStep.value !== Math.min(480, leftStep.value + 32) ||
    leftEnd.value !== 480 ||
    leftExpandedByKeyboard.state !== 'false' ||
    leftExpandedByKeyboard.value !== 200 ||
    leftExpandedByKeyboard.width !== 200
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_KEYBOARD_LEFT_FAILED:${JSON.stringify({ leftInitial, leftStep, leftLargeStep, leftEnd, leftExpandedByKeyboard })}`,
    );
  }
  await dragTo('left', layoutBox.x + 1 + defaultWidths.left + 2.5);

  const rightHandle = designer.locator('[data-panel-handle="right"]');
  await rightHandle.focus();
  const rightInitial = await readHandle('right');
  await page.keyboard.press('ArrowRight');
  const rightStep = await readHandle('right');
  await page.keyboard.press('Shift+ArrowLeft');
  const rightLargeStep = await readHandle('right');
  await page.keyboard.press('Home');
  const rightHome = await readHandle('right');
  await page.keyboard.press('End');
  const rightEnd = await readHandle('right');
  if (
    rightInitial.role !== 'separator' ||
    rightInitial.controls !== 'designer-right-panel' ||
    !rightInitial.focused ||
    rightStep.value !== Math.max(rightInitial.minimum, rightInitial.value - 8) ||
    rightLargeStep.value !== Math.min(rightInitial.maximum, rightStep.value + 32) ||
    rightHome.value !== rightInitial.minimum ||
    rightEnd.value !== rightEnd.maximum ||
    rightEnd.width !== rightEnd.value
  ) {
    throw new Error(
      `BROWSER_HARNESS_PANEL_KEYBOARD_RIGHT_FAILED:${JSON.stringify({ rightInitial, rightStep, rightLargeStep, rightHome, rightEnd })}`,
    );
  }
  await dragTo('right', layoutBox.x + layoutBox.width - 1 - defaultWidths.right - 2.5);

  // XJ Data Hub 的路由加载态通过 v-show 先以 display:none 挂载设计器。验证右侧宽度在
  // 0px 宿主中初始化后仍保持持久化值，并在宿主显示时直接生效。
  const hiddenHostInspectorWidth = await page.evaluate(async () => {
    const storageKey = 'base-screen.designer.inspector-width';
    const previous = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, '420');
    const host = document.createElement('div');
    host.style.cssText = 'display:none;width:1600px;height:900px';
    const probe = document.createElement('base-screen-designer');
    probe.catalog = window.baseScreenHarness.catalog;
    probe.style.cssText = 'display:block;width:100%;height:800px';
    host.append(probe);
    document.body.append(host);
    await Promise.resolve();
    host.style.display = 'block';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const width = Math.round(
      probe.shadowRoot.querySelector('.properties').getBoundingClientRect().width,
    );
    host.remove();
    if (previous === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, previous);
    return width;
  });
  if (hiddenHostInspectorWidth !== 420) {
    throw new Error(
      `BROWSER_HARNESS_HIDDEN_HOST_INSPECTOR_WIDTH_RESTORE_FAILED:${hiddenHostInspectorWidth}`,
    );
  }
  await designer.locator('[data-panel-tab="materials"]').click();
}
