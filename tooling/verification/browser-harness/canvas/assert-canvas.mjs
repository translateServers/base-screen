// 画布基础、内容裁剪与坐标/尺寸精度
// 由 3 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。
import {
  assertCanvasAidChecked,
  openTopMenu,
  toggleCanvasAidViaMenu,
  toggleGridViaMenu,
  zoomResetViaMenu,
} from '../shared/harness-utils.mjs';

// ---- 源模块：assert-canvas-basics.mjs ----
export async function assertInitialCanvasPointerFocus(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
    const designer = page.locator('base-screen-designer');
    const component = designer.locator('[data-base-screen-component-id=title]');
    const viewport = designer.locator('[data-viewport]');
    await component.waitFor({ state: 'visible' });

    await component.click({ position: { x: 12, y: 12 } });
    const focusState = await viewport.evaluate((element) => ({
      active: element.getRootNode().activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      boxShadow: getComputedStyle(element).boxShadow,
    }));

    if (!focusState.active || focusState.focusVisible || focusState.boxShadow !== 'none') {
      throw new Error(
        `BROWSER_HARNESS_INITIAL_POINTER_FOCUS_VISIBLE_FAILED:${JSON.stringify(focusState)}`,
      );
    }

    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const keyboardFocusState = await viewport.evaluate((element) => ({
      active: element.getRootNode().activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      boxShadow: getComputedStyle(element).boxShadow,
    }));
    if (
      !keyboardFocusState.active ||
      !keyboardFocusState.focusVisible ||
      keyboardFocusState.boxShadow === 'none'
    ) {
      throw new Error(
        `BROWSER_HARNESS_KEYBOARD_FOCUS_VISIBLE_FAILED:${JSON.stringify(keyboardFocusState)}`,
      );
    }
  } finally {
    await page.close();
  }
}

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
  await designer.locator('[data-tip^="\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c"]').click();
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
    pluginLabel: await contextMenu.locator('.designer-menu-section-label').first().textContent(),
    iconCount: await contextMenu.locator('[data-menu-action] .menu-item-icon').count(),
  };
  if (
    contextMenuState.hidden ||
    contextMenuState.items < 5 ||
    contextMenuState.pluginLabel !== '插件' ||
    contextMenuState.iconCount < 5
  ) {
    throw new Error(`BROWSER_HARNESS_CONTEXT_MENU_FAILED:${JSON.stringify(contextMenuState)}`);
  }
  // 键盘进入：根菜单聚焦后方向键必须落到第一个可用项，而不是停在容器上。
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  const contextMenuFocus = await designer.evaluate((host) => {
    const active = host.shadowRoot?.activeElement;
    return {
      tag: active?.tagName,
      action:
        active?.getAttribute('data-menu-action') ?? active?.getAttribute('data-plugin-command'),
    };
  });
  if (contextMenuFocus.tag !== 'BUTTON' || contextMenuFocus.action === null) {
    throw new Error(
      `BROWSER_HARNESS_CONTEXT_MENU_KEYBOARD_FAILED:${JSON.stringify(contextMenuFocus)}`,
    );
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
  const toolsMenu = await openTopMenu(designer, '\u5de5\u5177');
  await toolsMenu.locator('[data-menu-action="show-help"]').click();
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
  await designer.locator('[data-tip^="\u64a4\u9500\u4e0a\u4e00\u6b65\u64cd\u4f5c"]').click();
}

// ---- 源模块：assert-canvas-content-clipping.mjs ----
async function assertCanvasContentClipping(page) {
  await page.evaluate(() => {
    const { catalog, materialManifests } = window.baseScreenHarness;
    const textManifest = materialManifests.text;
    const probe = document.createElement('base-screen-designer');
    probe.dataset.canvasClipProbe = 'true';
    probe.catalog = catalog;
    probe.document = {
      canvas: { width: 480, height: 270, backgroundColor: '#17212b' },
      components: [
        {
          id: 'canvas-clip-component',
          type: 'base.text',
          name: 'Canvas clip probe',
          parentId: null,
          position: { x: 440, y: 80 },
          size: { width: 100, height: 60 },
          rotation: 0,
          zIndex: 0,
          status: { locked: false, hidden: false },
          props: structuredClone(textManifest.defaultProps),
          style: structuredClone(textManifest.defaultStyle),
          dataSource: { type: 'static', value: 'Canvas clip probe' },
        },
      ],
      variables: [],
      blueprint: { relations: [] },
    };
    probe.style.cssText =
      'position:fixed;inset:0;z-index:999;width:1400px;height:800px;background:#10151d;';
    document.body.appendChild(probe);
  });

  const probe = page.locator('base-screen-designer[data-canvas-clip-probe]');
  const component = probe.locator('[data-base-screen-component-id="canvas-clip-component"]');
  try {
    await component.waitFor({ state: 'visible' });
    const clipped = await probe.evaluate((element) => {
      const root = element.shadowRoot;
      const canvas = root.querySelector('[data-canvas]');
      const content = root.querySelector('[data-canvas-content]');
      const material = root.querySelector(
        '[data-base-screen-component-id="canvas-clip-component"]',
      );
      if (!(canvas instanceof HTMLElement) || !(content instanceof HTMLElement)) return null;
      if (!(material instanceof HTMLElement)) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const materialRect = material.getBoundingClientRect();
      const inside = {
        x: Math.min(contentRect.right - 12, materialRect.right - 2),
        y: Math.min(contentRect.bottom - 2, materialRect.top + materialRect.height / 2),
      };
      const outside = {
        x: contentRect.right + Math.min(12, (materialRect.right - contentRect.right) / 2),
        y: inside.y,
      };
      const componentIdAt = (point) =>
        root.elementFromPoint(point.x, point.y)?.closest('[data-base-screen-component-id]')?.dataset
          .baseScreenComponentId ?? null;
      return {
        overflow: getComputedStyle(content).overflow,
        parentIsContent: material.parentElement === content,
        canvasContainsContent:
          contentRect.left >= canvasRect.left &&
          contentRect.top >= canvasRect.top &&
          contentRect.right <= canvasRect.right &&
          contentRect.bottom <= canvasRect.bottom,
        materialExtendsPastCanvas: materialRect.right > contentRect.right + 20,
        insideHit: componentIdAt(inside),
        outsideHit: componentIdAt(outside),
        inside,
      };
    });
    if (
      clipped === null ||
      clipped.overflow !== 'clip' ||
      !clipped.parentIsContent ||
      !clipped.canvasContainsContent ||
      !clipped.materialExtendsPastCanvas ||
      clipped.insideHit !== 'canvas-clip-component' ||
      clipped.outsideHit === 'canvas-clip-component'
    ) {
      throw new Error(`BROWSER_HARNESS_CANVAS_CONTENT_CLIP_FAILED:${JSON.stringify(clipped)}`);
    }

    await page.mouse.click(clipped.inside.x, clipped.inside.y);
    await probe.locator('[data-selection]').waitFor({ state: 'visible' });
    const overlay = await probe.evaluate((element) => {
      const root = element.shadowRoot;
      const content = root.querySelector('[data-canvas-content]');
      const handle = root.querySelector('[data-transform-handle="east"]');
      if (!(content instanceof HTMLElement) || !(handle instanceof HTMLElement)) return null;
      const contentRect = content.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const point = {
        x: handleRect.left + handleRect.width / 2,
        y: handleRect.top + handleRect.height / 2,
      };
      return {
        outsideCanvas: point.x > contentRect.right,
        hitHandle:
          root.elementFromPoint(point.x, point.y)?.closest('[data-transform-handle="east"]') ===
          handle,
      };
    });
    if (overlay === null || !overlay.outsideCanvas || !overlay.hitHandle) {
      throw new Error(
        `BROWSER_HARNESS_CANVAS_AUTHORING_OVERLAY_CLIP_FAILED:${JSON.stringify(overlay)}`,
      );
    }

    const previewOpened = await probe.evaluate((element) => element.togglePreview());
    if (!previewOpened) throw new Error('BROWSER_HARNESS_CANVAS_PREVIEW_OPEN_FAILED');
    const previewViewer = probe.locator('.direct-preview base-screen-viewer');
    await previewViewer
      .locator('[data-base-screen-component-id="canvas-clip-component"]')
      .waitFor({ state: 'visible' });
    const preview = await previewViewer.evaluate((element) => {
      const root = element.shadowRoot;
      const mount = root?.firstElementChild;
      const material = root?.querySelector(
        '[data-base-screen-component-id="canvas-clip-component"]',
      );
      if (!(root instanceof ShadowRoot)) return null;
      if (!(mount instanceof HTMLElement) || !(material instanceof HTMLElement)) return null;
      const mountRect = mount.getBoundingClientRect();
      const materialRect = material.getBoundingClientRect();
      const inside = {
        x: Math.min(mountRect.right - 12, materialRect.right - 2),
        y: Math.min(mountRect.bottom - 2, materialRect.top + materialRect.height / 2),
      };
      const outside = {
        x: mountRect.right + Math.min(12, (materialRect.right - mountRect.right) / 2),
        y: inside.y,
      };
      const componentIdAt = (point) =>
        root.elementFromPoint(point.x, point.y)?.closest('[data-base-screen-component-id]')?.dataset
          .baseScreenComponentId ?? null;
      return {
        overflow: getComputedStyle(mount).overflow,
        parentIsMount: material.parentElement === mount,
        materialExtendsPastCanvas: materialRect.right > mountRect.right + 20,
        insideHit: componentIdAt(inside),
        outsideHit: componentIdAt(outside),
      };
    });
    if (
      preview === null ||
      preview.overflow !== 'hidden' ||
      !preview.parentIsMount ||
      !preview.materialExtendsPastCanvas ||
      preview.insideHit !== 'canvas-clip-component' ||
      preview.outsideHit === 'canvas-clip-component'
    ) {
      throw new Error(`BROWSER_HARNESS_CANVAS_PREVIEW_CLIP_FAILED:${JSON.stringify(preview)}`);
    }
  } finally {
    await page.evaluate(() => document.querySelector('[data-canvas-clip-probe]')?.remove());
  }
}

export { assertCanvasContentClipping };

// ---- 源模块：assert-canvas-precision.mjs ----
async function assertCanvasPrecision(designer, page) {
  const canvas = designer.locator('[data-canvas]');
  const ruler = designer.locator('.ruler-horizontal');
  const guidesToggle = designer.locator('.ruler-corner[data-status-toggle="guides"]');
  const persistentGuides = designer.locator('[data-canvas-guides] > .canvas-guide-persistent');
  const canvasBox = await canvas.boundingBox();
  const rulerBox = await ruler.boundingBox();
  const cornerBox = await guidesToggle.boundingBox();
  const verticalRulerBox = await designer.locator('.ruler-vertical').boundingBox();
  if (canvasBox === null || rulerBox === null || cornerBox === null || verticalRulerBox === null) {
    throw new Error('BROWSER_HARNESS_CANVAS_AIDS_REGION_MISSING');
  }
  if (
    cornerBox.y !== rulerBox.y ||
    cornerBox.x !== verticalRulerBox.x ||
    cornerBox.width !== verticalRulerBox.width ||
    cornerBox.height !== rulerBox.height ||
    cornerBox.y + cornerBox.height !== verticalRulerBox.y ||
    (await designer.locator('.statusbar [data-status-toggle="guides"]').count()) !== 0
  ) {
    throw new Error('BROWSER_HARNESS_RULER_GUIDES_TOGGLE_PLACEMENT_FAILED');
  }
  const beforeDocument = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    window.__guideLog = [];
    const record = (type, target) =>
      target?.addEventListener(type, (event) =>
        window.__guideLog.push([type, event.pointerId, event.clientX, event.clientY]),
      );
    record('pointerdown', root.querySelector('.ruler-horizontal'));
    record('pointermove', root.querySelector('[data-canvas]'));
    record('pointerup', root.querySelector('[data-canvas]'));
    record('lostpointercapture', root.querySelector('[data-canvas]'));
  });
  const guideHit = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    window.__guideLog = [];
    const record = (type, target) =>
      target?.addEventListener(type, (event) =>
        window.__guideLog.push([type, event.pointerId, event.clientX, event.clientY]),
      );
    record('pointerdown', root.querySelector('.ruler-horizontal'));
    record('pointermove', root.querySelector('[data-canvas]'));
    record('pointerup', root.querySelector('[data-canvas]'));
    record('lostpointercapture', root.querySelector('[data-canvas]'));
    root.addEventListener('pointerdown', (event) =>
      window.__guideLog.push(['root-down', event.pointerId, event.clientX, event.clientY]),
    );
    const target = root.elementFromPoint(342, 79);
    return {
      tag: target?.tagName ?? null,
      className: typeof target?.className === 'string' ? target.className : null,
      inRuler: target?.closest?.('.ruler') !== null && target?.closest?.('.ruler') !== undefined,
    };
  });
  const manualGuide = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const ruler = root.querySelector('.ruler-horizontal');
    const canvas = root.querySelector('[data-canvas]');
    const guides = root.querySelector('[data-canvas-guides]');
    ruler.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        clientX: 342,
        clientY: 79,
      }),
    );
    const captureAfterDown = canvas.hasPointerCapture(1);
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        clientX: 476,
        clientY: 249,
      }),
    );
    return {
      captureAfterDown,
      guidesChildren: guides?.children.length ?? -1,
    };
  });
  await page.mouse.move(rulerBox.x + 96, rulerBox.y + 10);
  await page.mouse.down();
  const captureState = await canvas.evaluate((element) => ({
    hasCapture: element.hasPointerCapture(1),
    canvasTransform: element.style.transform,
    captureLog: window.__guideLog.filter((entry) => entry[0] === 'lostpointercapture'),
  }));
  const manualMoveResult = await canvas.evaluate((element) => {
    const root = element.getRootNode();
    const guides = root.querySelector('[data-canvas-guides]');
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        clientX: 476,
        clientY: 249,
      }),
    );
    return { guidesChildren: guides?.children.length ?? -1 };
  });
  await page.mouse.move(canvasBox.x + 180, canvasBox.y + 130, { steps: 3 });
  if ((await canvas.locator('.canvas-guide-preview').count()) !== 1) {
    const guideState = await page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const guides = root.querySelector('[data-canvas-guides]');
      return {
        canvasTransform: root.querySelector('[data-canvas]').style.transform,
        canvasBox: root.querySelector('[data-canvas]').getBoundingClientRect(),
        rulerBox: root.querySelector('.ruler-horizontal')?.getBoundingClientRect(),
        guidesChildren: guides?.children.length ?? -1,
        guideLog: window.__guideLog,
      };
    });
    throw new Error(
      `BROWSER_HARNESS_GUIDE_PREVIEW_FAILED:${JSON.stringify({
        canvasBox,
        rulerBox,
        guideState,
        guideHit,
        captureState,
        manualGuide,
      })}`,
    );
  }
  if (
    (await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document))) !==
    beforeDocument
  ) {
    throw new Error('BROWSER_HARNESS_GUIDE_PREVIEW_MUTATED_DOCUMENT');
  }
  await page.mouse.up();
  const persistentGuide = canvas.locator('.canvas-guide-persistent');
  await persistentGuide.waitFor();
  if (
    (await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document))) !==
    beforeDocument
  ) {
    throw new Error('BROWSER_HARNESS_GUIDE_COMMIT_MUTATED_DOCUMENT');
  }
  // 追加一条跨越更高 painter order 组件的参考线（canvas y=260 穿过 host-data 236..268，
  // 其组件 z-index = painter order ≥ 2，修复前会盖住 z-index 1 的参考线层）。
  await page.mouse.move(rulerBox.x + 400, rulerBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 400, canvasBox.y + 260, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(
    (count) =>
      window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
        '[data-canvas-guides] > .canvas-guide-persistent',
      ).length === count,
    2,
  );
  // 参考线层级：组件 z-index 取 Core painter order 索引（0..N-1），覆盖层 z-index 由组件数派生，
  // 参考线必须绘制在所有组件之上。探测参考线穿过的最上层组件（按 z-index 取最大）中心点，
  // elementsFromPoint 中参考线必须先于目标组件；通知等更高层工作台浮层可以合法遮挡两者。
  const guideLayer = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const guides = root.querySelectorAll('.canvas-guide-persistent');
    const guide = guides[guides.length - 1];
    if (guide === undefined || guide === null) return null;
    const axis = guide.dataset.axis;
    const guideRect = guide.getBoundingClientRect();
    const guidePos =
      axis === 'x' ? guideRect.x + guideRect.width / 2 : guideRect.y + guideRect.height / 2;
    const inSpan = (rect) =>
      axis === 'x'
        ? rect.width > 0 && rect.height > 0 && guidePos >= rect.x && guidePos <= rect.x + rect.width
        : rect.width > 0 &&
          rect.height > 0 &&
          guidePos >= rect.y &&
          guidePos <= rect.y + rect.height;
    const crossed = [...root.querySelectorAll('[data-base-screen-component-id]')]
      .map((material) => {
        const rect = material.getBoundingClientRect();
        return { material, rect, z: Number(material.style.zIndex ?? 0) };
      })
      .filter(({ rect }) => inSpan(rect))
      .sort((left, right) => right.z - left.z);
    const target = crossed[0];
    if (target === undefined) {
      return { crossed: 0, axis, guidePos };
    }
    const probe =
      axis === 'x'
        ? { x: guidePos, y: target.rect.y + target.rect.height / 2 }
        : { x: target.rect.x + target.rect.width / 2, y: guidePos };
    const hit = root.elementFromPoint(probe.x, probe.y);
    const hitStack = root.elementsFromPoint(probe.x, probe.y);
    const guideStackIndex = hitStack.findIndex(
      (candidate) => candidate.closest?.('[data-canvas-guides]') !== null,
    );
    const targetStackIndex = hitStack.findIndex((candidate) => candidate === target.material);
    return {
      crossed: crossed.length,
      axis,
      guideLayerZ: getComputedStyle(guide.parentElement).zIndex,
      componentCountToken: getComputedStyle(element).getPropertyValue(
        '--designer-canvas-component-count',
      ),
      targetZ: target.z,
      targetId: target.material.dataset.baseScreenComponentId ?? null,
      probe,
      guidePos,
      guideStackIndex,
      targetStackIndex,
      guideAboveTarget:
        guideStackIndex >= 0 && targetStackIndex >= 0 && guideStackIndex < targetStackIndex,
      blockingOverlay:
        hit?.closest?.('[data-canvas-guides]') === null
          ? (hit?.closest?.('.designer-notification')?.className ?? null)
          : null,
    };
  });
  if (guideLayer === null || guideLayer.crossed === 0) {
    throw new Error(`BROWSER_HARNESS_GUIDE_LAYER_PROBE_FAILED:${JSON.stringify(guideLayer)}`);
  }
  if (guideLayer.targetZ < 2) {
    throw new Error(`BROWSER_HARNESS_GUIDE_LAYER_TARGET_WEAK:${JSON.stringify(guideLayer)}`);
  }
  if (!guideLayer.guideAboveTarget) {
    throw new Error(
      `BROWSER_HARNESS_GUIDE_COVERED_BY_COMPONENT_FAILED:${JSON.stringify(guideLayer)}`,
    );
  }
  // 双击移除参考线：真实鼠标双击第二条参考线（canvas y=260），持久参考线数量必须减少。
  // guide 拖拽以 setPointerCapture 接管指针后浏览器不再合成 click/dblclick，
  // 移除由 pointerdown 双击窗口判定实现，这里验证真实指针流程。
  const dblGuidePoint = await designer.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const guides = root.querySelectorAll('.canvas-guide-persistent');
    const guide = guides[guides.length - 1];
    if (guide === undefined || guide === null) return null;
    const rect = guide.getBoundingClientRect();
    const canvasBox = root.querySelector('[data-canvas]').getBoundingClientRect();
    return { x: canvasBox.x + 200, y: rect.y + rect.height / 2 };
  });
  if (dblGuidePoint === null) {
    throw new Error('BROWSER_HARNESS_GUIDE_DBLCLICK_PROBE_FAILED:null');
  }
  await page.mouse.dblclick(dblGuidePoint.x, dblGuidePoint.y, { delay: 60 });
  await page.waitForFunction(
    (count) =>
      window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
        '[data-canvas-guides] > .canvas-guide-persistent',
      ).length === count,
    1,
  );
  if (
    (await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document))) !==
    beforeDocument
  ) {
    throw new Error('BROWSER_HARNESS_GUIDE_DBLCLICK_MUTATED_DOCUMENT');
  }
  const rulerBefore = await ruler
    .locator('[data-ruler-canvas]')
    .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.rulerVersion ?? ''));
  const zoomBefore = await designer.locator('[data-zoom]').textContent();
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  await designer.locator('[data-tip^="\u653e\u5927"]').click();
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-zoom]')?.textContent ===
      '120%',
  );
  const zoomAnchor = await canvas.evaluate((element) => {
    const transform = element.style.transform;
    const match = /translate\(([-0-9.e-]+)px,\s*([-0-9.e-]+)px\)\s*scale\(([-0-9.e-]+)\)/.exec(
      transform,
    );
    if (match === null) return { transform, anchoredToOrigin: false, anchoredToCenter: false };
    const offsetX = Number(match[1]);
    const offsetY = Number(match[2]);
    return {
      transform,
      anchoredToOrigin: offsetX === 0 && offsetY === 0,
      anchoredToCenter: offsetX !== 0 && offsetY !== 0,
    };
  });
  if (!zoomAnchor.anchoredToCenter || zoomAnchor.anchoredToOrigin) {
    throw new Error(`BROWSER_HARNESS_ZOOM_ANCHOR_FAILED:${JSON.stringify(zoomAnchor)}`);
  }
  const rulerAfter = await ruler
    .locator('[data-ruler-canvas]')
    .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.rulerVersion ?? ''));
  if (rulerBefore.length === 0 || JSON.stringify(rulerBefore) === JSON.stringify(rulerAfter)) {
    throw new Error('BROWSER_HARNESS_RULER_ZOOM_UPDATE_FAILED');
  }
  // 工具栏缩放簇：读数按钮点击即复位，fit 按钮就位（随 40px 列头降到 28px 高）。
  const zoomReadout = designer.locator('[data-canvas-local-toolbar] [data-zoom]');
  await designer.locator('[data-canvas-local-toolbar] [data-action="zoom-in"]').click();
  const zoomedIn = (await zoomReadout.textContent())?.trim();
  await zoomReadout.click();
  const zoomResetByReadout = (await zoomReadout.textContent())?.trim();
  if (
    zoomedIn === zoomResetByReadout ||
    zoomResetByReadout !== '100%' ||
    (await designer.locator('[data-canvas-local-toolbar] [data-action="zoom-fit"]').count()) !== 1
  ) {
    throw new Error(
      `BROWSER_HARNESS_TOOLBAR_ZOOM_CONTROLS_FAILED:${JSON.stringify({ zoomedIn, zoomResetByReadout })}`,
    );
  }
  const viewport = designer.locator('[data-viewport]');
  await toggleGridViaMenu(designer, page);
  if ((await viewport.getAttribute('data-grid')) !== 'false') {
    // eslint-disable-next-line no-console
    console.log(
      'GRID_TOGGLE_FAILED_DIAG',
      JSON.stringify(
        await designer.evaluate((host) => {
          const root = host.shadowRoot;
          const viewport = root.querySelector('[data-viewport]');
          const trigger = root.querySelector('[data-menu-toggle="view"]');
          const menus = [...root.querySelectorAll('[data-menu]')].map((menu) => ({
            id: menu.dataset.menu,
            hidden: menu.hidden,
            items: [...menu.querySelectorAll('[data-menu-action]')].map((item) => ({
              id: item.dataset.menuAction,
              hidden: item.hidden,
              disabled: item.disabled,
            })),
          }));
          return {
            dataGrid: viewport?.getAttribute('data-grid'),
            triggerExpanded: trigger?.getAttribute('aria-expanded'),
            zoom: root.querySelector('[data-zoom]')?.textContent,
            guides: root.querySelectorAll('.canvas-guide-persistent').length,
            menus,
          };
        }),
      ),
    );
    throw new Error('BROWSER_HARNESS_GRID_TOGGLE_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-grid', 'false');
  await toggleGridViaMenu(designer, page);
  if ((await viewport.getAttribute('data-grid')) !== 'true') {
    throw new Error('BROWSER_HARNESS_GRID_TOGGLE_BACK_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-grid', 'true');
  // 标尺眼睛与菜单/键盘共用参考线状态；隐藏只影响显示，恢复后保留原参考线。
  const guidesCount = await persistentGuides.count();
  if (guidesCount === 0) throw new Error('BROWSER_HARNESS_GUIDES_TOGGLE_FIXTURE_MISSING');
  const assertGuidesToggle = async (visible) => {
    const expected = String(visible);
    if (
      (await guidesToggle.getAttribute('aria-checked')) !== expected ||
      !(await guidesToggle.locator(`[data-guide-visibility="${expected}"]`).isVisible()) ||
      (await guidesToggle.locator(`[data-guide-visibility="${!visible}"]`).isVisible()) ||
      (await persistentGuides.count()) !== (visible ? guidesCount : 0)
    ) {
      throw new Error(`BROWSER_HARNESS_RULER_GUIDES_TOGGLE_STATE_FAILED:${expected}`);
    }
    await assertCanvasAidChecked(designer, page, 'toggle-guides', expected);
  };
  await guidesToggle.click();
  await assertGuidesToggle(false);
  await toggleCanvasAidViaMenu(designer, page, 'toggle-guides');
  await assertGuidesToggle(true);
  await guidesToggle.press('Space');
  await assertGuidesToggle(false);
  await guidesToggle.press('Enter');
  await assertGuidesToggle(true);
  // 边框参考线开关往返：菜单勾选状态随开关翻转。
  await toggleCanvasAidViaMenu(designer, page, 'toggle-border-guides');
  await assertCanvasAidChecked(designer, page, 'toggle-border-guides', 'false');
  await toggleCanvasAidViaMenu(designer, page, 'toggle-border-guides');
  await assertCanvasAidChecked(designer, page, 'toggle-border-guides', 'true');

  // 视窗 resize 后标尺必须重绘（canvas 缓冲尺寸与新容器一致、版本号递增）。
  const readRulerVersion = () =>
    ruler
      .locator('[data-ruler-canvas]')
      .evaluateAll((canvases) => canvases.map((canvas) => canvas.dataset.rulerVersion ?? ''));
  const resizeBefore = await readRulerVersion();
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForFunction((previous) => {
    const ruler = window.baseScreenHarness.designer.shadowRoot?.querySelector(
      '.ruler-horizontal canvas[data-ruler-canvas]',
    );
    const version = ruler === null || ruler === undefined ? '' : (ruler.dataset.rulerVersion ?? '');
    return version !== previous;
  }, resizeBefore[0]);
  const resizeAfter = await readRulerVersion();
  const bufferMatches = await ruler.locator('[data-ruler-canvas]').evaluateAll((canvases) =>
    canvases.map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return canvas.width === Math.round(rect.width) && canvas.height === Math.round(rect.height);
    }),
  );
  if (
    resizeBefore.length === 0 ||
    JSON.stringify(resizeBefore) === JSON.stringify(resizeAfter) ||
    bufferMatches.includes(false)
  ) {
    throw new Error(
      `BROWSER_HARNESS_RULER_RESIZE_UPDATE_FAILED:${JSON.stringify({
        before: resizeBefore,
        after: resizeAfter,
        bufferMatches,
      })}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // 隔离后续用例：真实双击行为已在上方覆盖；缩放与 resize 断言完成后，再沿公开 DOM
  // 双击事件路径清理刻意保留的参考线，避免它拦截后续组件点击。
  const guideCleanupDispatched = await designer.evaluate((element) => {
    const root = element.shadowRoot;
    const guide = root.querySelector('.canvas-guide-persistent');
    if (!(guide instanceof HTMLElement)) return false;
    const rect = guide.getBoundingClientRect();
    return guide.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  if (!guideCleanupDispatched) {
    throw new Error('BROWSER_HARNESS_GUIDE_CLEANUP_TARGET_MISSING');
  }
  await page.waitForFunction(
    () =>
      window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
        '[data-canvas-guides] > .canvas-guide-persistent',
      ).length === 0,
  );
}

// 浏览器级吸附工作流（R2/R4）：真实指针拖拽验证按距离吸附、阈值内保持与旋转候选；

export { assertCanvasPrecision };
