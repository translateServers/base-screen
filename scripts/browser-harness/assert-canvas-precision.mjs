import { screenshotDirectory } from './constants.mjs';
import {
  assertCanvasAidChecked,
  toggleCanvasAidViaMenu,
  toggleGridViaMenu,
  zoomResetViaMenu,
} from './harness-utils.mjs';

async function assertCanvasPrecision(designer, page) {
  const canvas = designer.locator('[data-canvas]');
  const ruler = designer.locator('.ruler-horizontal');
  const canvasBox = await canvas.boundingBox();
  const rulerBox = await ruler.boundingBox();
  if (canvasBox === null || rulerBox === null) {
    throw new Error('BROWSER_HARNESS_CANVAS_AIDS_REGION_MISSING');
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
  await designer.getByTitle('\u653e\u5927').click();
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
          const trigger = root.querySelector('[data-menu-toggle="more"]');
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
  // 参考线开关（菜单与状态栏共用状态源）：菜单关闭后状态栏开关同步为 false。
  await toggleCanvasAidViaMenu(designer, page, 'toggle-guides');
  if (
    (await designer.locator('[data-status-toggle="guides"]').getAttribute('aria-checked')) !==
    'false'
  ) {
    throw new Error('BROWSER_HARNESS_GUIDES_TOGGLE_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-guides', 'false');
  await toggleCanvasAidViaMenu(designer, page, 'toggle-guides');
  if (
    (await designer.locator('[data-status-toggle="guides"]').getAttribute('aria-checked')) !==
    'true'
  ) {
    throw new Error('BROWSER_HARNESS_GUIDES_TOGGLE_BACK_FAILED');
  }
  await assertCanvasAidChecked(designer, page, 'toggle-guides', 'true');
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
