// R1/R5/R7：浏览器默认行为管控与零宿主影响边界（Designer Event System）。
// 仅在完整桌面流程视口调用：画布可见且可交互。
async function assertEventSystemGuards(page, designer) {
  // R1：真实可信的 Alt 按键不得触发 Edge/Chrome 的访问键聚焦（"设置及其他"按钮）。
  // Chromium 对 Alt 自身 keydown 上报 altKey=true，chord 必须剥离修饰键自身前缀，
  // 否则 'Alt+Alt' 伪 chord 使黑名单失配。焦点保持在设计器即证明浏览器默认被阻止。
  // 聚焦走真实点击路径（画布 pointerdown 的系统级焦点收敛）：Chromium 在复杂流程后
  // 对 shadow 内元素的编程 focus() 存在静默失效的怪癖。
  const viewportRect = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    const rect = viewport?.getBoundingClientRect();
    return rect === undefined
      ? null
      : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (viewportRect === null || viewportRect.width <= 0 || viewportRect.height <= 0) {
    throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
  }
  await page.mouse.click(
    viewportRect.x + viewportRect.width / 2,
    viewportRect.y + viewportRect.height / 2,
  );
  await page.keyboard.press('Alt');
  const altFocusKept = await page.evaluate(
    () => document.activeElement?.tagName === 'BASE-SCREEN-DESIGNER',
  );
  if (!altFocusKept) {
    throw new Error('BROWSER_HARNESS_ALT_ACCESS_KEY_FOCUS_FAILED');
  }
  // R4：空格抓手与键盘焦点解耦——焦点在宿主页面时，鼠标悬停视窗即可空格拖拽平移画布。
  const panState = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    const canvas = element.shadowRoot?.querySelector('[data-canvas]');
    const rect = viewport?.getBoundingClientRect();
    return {
      rect:
        rect === undefined
          ? null
          : { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      transform: canvas?.style.transform ?? null,
    };
  });
  if (panState.rect === null) throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
  await page.evaluate(() => document.body.focus());
  const centerX = panState.rect.x + panState.rect.width / 2;
  const centerY = panState.rect.y + panState.rect.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY + 60, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const panResult = await page.evaluate(() => {
    const element = document.querySelector('base-screen-designer');
    return {
      transform: element.shadowRoot?.querySelector('[data-canvas]')?.style.transform ?? null,
      scrollY: window.scrollY,
    };
  });
  if (panResult.transform === panState.transform) {
    throw new Error('BROWSER_HARNESS_SPACE_PAN_DECOUPLED_FAILED');
  }
  if (panResult.scrollY !== 0) {
    throw new Error('BROWSER_HARNESS_SPACE_PAN_SCROLLED_HOST');
  }
  // R1：焦点在设计器内时浏览器级快捷键被 capture 黑名单拦截；普通键不受影响。
  const inDesigner = await designer.evaluate((element) => {
    const viewport = element.shadowRoot?.querySelector('[data-viewport]');
    if (viewport === null || viewport === undefined) {
      throw new Error('BROWSER_HARNESS_VIEWPORT_MISSING');
    }
    viewport.focus();
    const blocked = [];
    for (const init of [
      { key: 's', code: 'KeyS', ctrlKey: true },
      { key: 'w', code: 'KeyW', ctrlKey: true },
      { key: 'r', code: 'KeyR', ctrlKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      viewport.dispatchEvent(event);
      blocked.push(event.defaultPrevented);
    }
    const plain = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(plain);
    return { blocked, plainPrevented: plain.defaultPrevented };
  });
  if (!inDesigner.blocked.every(Boolean) || inDesigner.plainPrevented) {
    throw new Error(`BROWSER_HARNESS_KEYBOARD_BLOCKLIST_FAILED: ${JSON.stringify(inDesigner)}`);
  }
  // R1/R7：焦点在宿主页面时设计器零干预（host 零影响硬边界）。
  const hostImpact = await page.evaluate(() => {
    document.body.focus();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  if (hostImpact) throw new Error('BROWSER_HARNESS_HOST_KEYBOARD_IMPACTED');
  // R5：设计器发起的拖拽在 window 层被阻止默认（拖不出设计器）；宿主拖拽零干预。
  const dragContained = await designer.evaluate((element) => {
    const material = element.shadowRoot?.querySelector('[data-base-screen-component-id]');
    if (material === null || material === undefined) return { own: false, hostPrevented: false };
    material.dispatchEvent(
      new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      }),
    );
    const ownOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    window.dispatchEvent(ownOver);
    const ownPrevented = ownOver.defaultPrevented;
    window.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
    const hostOver = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    window.dispatchEvent(hostOver);
    return { own: ownPrevented, hostPrevented: hostOver.defaultPrevented };
  });
  if (dragContained.own !== true || dragContained.hostPrevented !== false) {
    throw new Error(`BROWSER_HARNESS_DRAG_CONTAINMENT_FAILED: ${JSON.stringify(dragContained)}`);
  }
  // AE-ED-C09 双实例 smoke：第二个实例挂载/移除后，首个实例的键盘拦截不受影响。
  const multiInstance = await page.evaluate(async () => {
    const second = document.createElement('base-screen-designer');
    document.body.appendChild(second);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const first = document.querySelector('base-screen-designer');
    const viewport = first.shadowRoot?.querySelector('[data-viewport]');
    viewport?.focus();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewport?.dispatchEvent(event);
    const firstBlocked = event.defaultPrevented;
    second.remove();
    return firstBlocked;
  });
  if (multiInstance !== true) throw new Error('BROWSER_HARNESS_MULTI_INSTANCE_FAILED');
}

export { assertEventSystemGuards };
