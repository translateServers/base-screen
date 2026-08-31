import { assertPointSnapOverlay, assertSnapOverlayReuse } from './assert-snap-overlay.mjs';
import { componentPositions, zoomResetViaMenu } from './harness-utils.mjs';

// 结束前把文档恢复到调用前状态，避免污染后续断言。
async function assertSnapWorkflow(designer, page) {
  const before = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  const beforeComponents = await page.evaluate(() => {
    const read = (id) => {
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === id,
      );
      if (component === undefined) throw new Error(`Missing component: ${id}`);
      return {
        position: { ...component.position },
        rotation: component.rotation,
      };
    };
    return { hostData: read('host-data'), title: read('title'), subtitle: read('subtitle') };
  });
  await zoomResetViaMenu(designer);
  await page.waitForFunction(() => {
    const canvas = window.baseScreenHarness.designer.shadowRoot?.querySelector('[data-canvas]');
    return canvas?.style.transform === 'translate(0px, 0px) scale(1)';
  });
  // 固定三组件几何，隔离前置断言的移动/旋转影响。
  await designer.evaluate(() => {
    const titleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: { position: { x: 350, y: 100 }, rotation: 0 },
    });
    const subtitleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['subtitle'],
      patch: { position: { x: 570, y: 100 }, rotation: 0 },
    });
    const hostDataResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['host-data'],
      // 保留 title 左侧对齐轨道，专供验证拖拽时的 Moveable 式间距标注。
      patch: { position: { x: 350, y: 300 }, rotation: 0 },
    });
    if (!titleResult.ok || !subtitleResult.ok || !hostDataResult.ok) {
      throw new Error('BROWSER_HARNESS_SNAP_BASELINE_FAILED');
    }
  });
  const baselineSettled = await page
    .waitForFunction(
      () => {
        const { document: doc } = window.baseScreenHarness.designer;
        const read = (id) => doc.components.find((item) => item.id === id);
        const title = read('title');
        const subtitle = read('subtitle');
        const hostData = read('host-data');
        return (
          title?.position.x === 350 &&
          title?.position.y === 100 &&
          title?.rotation === 0 &&
          subtitle?.position.x === 570 &&
          subtitle?.position.y === 100 &&
          subtitle?.rotation === 0 &&
          hostData?.position.x === 350 &&
          hostData?.position.y === 300 &&
          hostData?.rotation === 0
        );
      },
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!baselineSettled) {
    const state = await page.evaluate(() =>
      JSON.stringify(
        window.baseScreenHarness.designer.document.components.map((component) => ({
          id: component.id,
          position: component.position,
          rotation: component.rotation,
        })),
      ),
    );
    throw new Error(`BROWSER_HARNESS_SNAP_BASELINE_TIMEOUT:${state}`);
  }
  const baseline = await page.evaluate(() => {
    const { document: doc } = window.baseScreenHarness.designer;
    const read = (id) => {
      const component = doc.components.find((item) => item.id === id);
      if (component === undefined) throw new Error(`Missing component: ${id}`);
      return { position: { ...component.position }, size: { ...component.size } };
    };
    return { title: read('title'), subtitle: read('subtitle') };
  });
  await assertPointSnapOverlay(designer, page);
  const title = designer.locator('[data-base-screen-component-id=title]');
  await title.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const pointer = (type) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          composed: true,
          clientX: rect.x + 20,
          clientY: rect.y + 20,
          pointerId: 93,
        }),
      );
    pointer('pointerdown');
    pointer('pointerup');
  });
  const titleSelected = await page
    .waitForFunction(
      () => {
        const interaction = window.__browserHarnessSelectionEvents.at(-1);
        return (
          interaction?.selectedComponentIds?.length === 1 &&
          interaction.selectedComponentIds[0] === 'title'
        );
      },
      undefined,
      { timeout: 1_000 },
    )
    .catch(() => false);
  if (!titleSelected) {
    throw new Error('BROWSER_HARNESS_SNAP_TITLE_SELECTION_FAILED');
  }
  const titleBox = await title.boundingBox();
  if (titleBox === null) throw new Error('BROWSER_HARNESS_SNAP_TITLE_MISSING');
  const startY = titleBox.y + (136 - baseline.title.position.y);
  // 起点必须在 title 的可见区域：subtitle 覆盖 title 右半，左侧面板与标尺又会遮住画布左缘。
  // 在 title 矩形内水平扫描，取第一个命中 title 自身的屏幕点，与面板/标尺宽度解耦。
  const hitProbe = await designer.evaluate(
    (element, probe) => {
      const root = element.shadowRoot;
      const rect = (selector) => {
        const node = root?.querySelector(selector);
        const box = node?.getBoundingClientRect();
        return box === undefined
          ? null
          : { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const titleRect = rect('[data-base-screen-component-id="title"]');
      const subtitleRect = rect('[data-base-screen-component-id="subtitle"]');
      if (titleRect === null || subtitleRect === null) {
        return { startX: null, title: titleRect, subtitle: subtitleRect };
      }
      const right = Math.min(titleRect.x + titleRect.width, subtitleRect.x) - 4;
      let startX = null;
      for (let x = titleRect.x + 4; x <= right; x += 8) {
        const hit = root?.elementFromPoint(x, probe.y);
        if (hit?.closest?.('[data-base-screen-component-id="title"]') != null) {
          startX = x;
          break;
        }
      }
      return { startX, title: titleRect, subtitle: subtitleRect };
    },
    { y: startY },
  );
  if (hitProbe.startX === null || hitProbe.startX === undefined) {
    throw new Error(
      `BROWSER_HARNESS_SNAP_HIT_PROBE_FAILED:${JSON.stringify({ probe: { y: startY }, ...hitProbe })}`,
    );
  }
  const startX = hitProbe.startX;
  const readTranslate = (id) =>
    page.evaluate((componentId) => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const element = root?.querySelector(`[data-base-screen-component-id="${componentId}"]`);
      const translate = element?.style.translate ?? '';
      const match = /^(-?[\d.]+)px(?: (-?[\d.]+)px)?$/.exec(translate);
      if (match === null) return null;
      return { x: Number(match[1]), y: match[2] === undefined ? 0 : Number(match[2]) };
    }, id);
  const expectAxis = async (actual, axis, expected, label) => {
    const value = actual === null ? Number.NaN : actual[axis];
    if (!Number.isFinite(value) || Math.abs(value - expected) > 0.5) {
      const debug = await page.evaluate(() => ({
        guides: [
          ...(window.baseScreenHarness.designer.shadowRoot?.querySelectorAll(
            '[data-canvas-guides] > *',
          ) ?? []),
        ].map((element) => ({
          className: element.className,
          left: element.style?.left,
          top: element.style?.top,
        })),
        titleTranslate:
          window.baseScreenHarness.designer.shadowRoot?.querySelector(
            '[data-base-screen-component-id="title"]',
          )?.style.translate ?? null,
      }));
      throw new Error(
        `BROWSER_HARNESS_SNAP_${label}_FAILED:${JSON.stringify({ startX, startY, axis, translate: actual, expected, ...debug })}`,
      );
    }
  };
  // y 轴验证：title top 对齐画布 top=0（差 2px 进入捕获阈值）→ 吸附 -100。
  // 渲染阈值 1px：吸附（5px）与渲染分离，ALIGN 阶段（dist 2）无线（Moveable snapRenderThreshold 语义）。
  const targetDeltaY = 0 - baseline.title.position.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  if ((await designer.locator('.canvas-measurement').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_BEFORE_DRAG_FAILED');
  }
  await page.mouse.move(startX, startY + targetDeltaY - 2, { steps: 5 });
  let translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY, 'ALIGN');
  const dragMeasurements = await designer.locator('.canvas-measurement').evaluateAll((elements) =>
    elements.map((element) => ({
      axis: element.dataset.axis,
      label: element.querySelector('.canvas-measurement-label')?.textContent ?? '',
    })),
  );
  if (
    dragMeasurements.length === 0 ||
    dragMeasurements.some(
      (measurement) =>
        (measurement.axis !== 'x' && measurement.axis !== 'y') || !/^\d+$/.test(measurement.label),
    )
  ) {
    throw new Error(
      `BROWSER_HARNESS_SNAP_MEASUREMENT_DURING_DRAG_FAILED:${JSON.stringify(dragMeasurements)}`,
    );
  }
  // 捕获阈值内（4px ≤ 5px）每帧重新吸附：保持吸附目标（×1.0，无额外释放带，Nebula/Moveable 语义）。
  await assertSnapOverlayReuse(designer, page, { x: startX, y: startY + targetDeltaY });
  await page.mouse.move(startX, startY + targetDeltaY + 4, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY, 'HOLD');
  // 超出捕获阈值（6px > 5px）立即释放：translate 恢复原始位移。
  await page.mouse.move(startX, startY + targetDeltaY + 6, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY + 6, 'RELEASE_BEYOND');
  // 没有组件、画布或用户参考线命中时，移动保持原始位移。
  await page.mouse.move(startX, startY + targetDeltaY + 7, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', targetDeltaY + 7, 'RAW_MOVE');
  // 超出画布边界吸附阈值后，bottom 锚点距 subtitle top（100）2px → 按距离重新吸附。
  const releaseDelta =
    baseline.subtitle.position.y - (baseline.title.position.y + baseline.title.size.height);
  await page.mouse.move(startX, startY + targetDeltaY + 30, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', releaseDelta, 'RELEASE');
  // title 与 host-data 的 left=350 已精确重合；即使 y 轴仍在 2px 捕获范围内，
  // x 轴也不得因零校正而出现贯穿画布的辅助线。
  if ((await designer.locator('.canvas-guide-snap[data-axis="x"]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_EXACT_X_GUIDE_FAILED');
  }
  // 指针也精确落在重合边界时，两轴均无需校正，因此不应保留任何 snap overlay。
  await page.mouse.move(startX, startY + releaseDelta, { steps: 2 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'y', releaseDelta, 'EXACT_BOUNDARY');
  if ((await designer.locator('.canvas-guide-snap').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_EXACT_BOUNDARY_GUIDE_FAILED');
  }
  await page.mouse.up();
  if ((await designer.locator('.canvas-measurement').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_RELEASE_FAILED');
  }
  const commitTargetY = baseline.title.position.y + releaseDelta;
  const committedOk = await page
    .waitForFunction(
      (expected) => {
        const title = window.baseScreenHarness.designer.document.components.find(
          (item) => item.id === 'title',
        );
        return title !== undefined && Math.abs(title.position.y - expected) < 0.01;
      },
      commitTargetY,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!committedOk) {
    const committed = await componentPositions(page, ['title']);
    throw new Error(
      `BROWSER_HARNESS_SNAP_COMMIT_FAILED:${JSON.stringify({ committed, targetDeltaY, commitTargetY, baseline: baseline.title.position })}`,
    );
  }
  // 旋转候选：subtitle 移到 title 右侧并转 90°，按 visual bounds 左边缘吸附。
  // x=800 使旋转后的 visual left（991）远离 title，隔离旋转候选断言。
  await designer.evaluate(() => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['subtitle'],
      patch: { position: { x: 800, y: 100 }, rotation: 90 },
    });
    if (!result.ok) throw new Error('BROWSER_HARNESS_SNAP_ROTATION_FAILED');
  });
  await page.waitForFunction(() => {
    const subtitle = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'subtitle',
    );
    return subtitle?.position.x === 800 && subtitle?.rotation === 90;
  });
  const rotated = await page.evaluate(() => {
    const subtitle = window.baseScreenHarness.designer.document.components.find(
      (item) => item.id === 'subtitle',
    );
    if (subtitle === undefined) throw new Error('Missing subtitle');
    const centerX = subtitle.position.x + subtitle.size.width / 2;
    return { centerX, height: subtitle.size.height };
  });
  const rotatedLeft = rotated.centerX - rotated.height / 2;
  const rotatedDelta = rotatedLeft - (baseline.title.position.x + baseline.title.size.width);
  const settledAfterCommit = await page
    .waitForFunction(
      (expected) => {
        const root = window.baseScreenHarness.designer.shadowRoot;
        const element = root?.querySelector('[data-base-screen-component-id="title"]');
        const canvas = root?.querySelector('[data-canvas]');
        const box = element?.getBoundingClientRect();
        const canvasBox = canvas?.getBoundingClientRect();
        if (box === undefined || canvasBox === undefined || canvas === undefined) return false;
        return Math.abs(box.x - (canvasBox.x + canvas.clientLeft) - expected) < 1;
      },
      baseline.title.position.x,
      { timeout: 3_000 },
    )
    .catch(() => false);
  if (!settledAfterCommit) {
    const state = await page.evaluate(() => {
      const root = window.baseScreenHarness.designer.shadowRoot;
      const canvas = root?.querySelector('[data-canvas]');
      const title = root?.querySelector('[data-base-screen-component-id="title"]');
      const component = window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === 'title',
      );
      return {
        box: title?.getBoundingClientRect(),
        canvasBox: canvas?.getBoundingClientRect(),
        position: component?.position,
        translate: title?.style.translate ?? null,
        transform: canvas?.style.transform ?? null,
      };
    });
    throw new Error(`BROWSER_HARNESS_SNAP_SETTLE_FAILED:${JSON.stringify(state)}`);
  }
  const movedBox = await designer.locator('[data-base-screen-component-id=title]').boundingBox();
  if (movedBox === null) throw new Error('BROWSER_HARNESS_SNAP_TITLE_MOVED_MISSING');
  await page.mouse.move(movedBox.x + 250, movedBox.y + 36);
  await page.mouse.down();
  await page.mouse.move(movedBox.x + 250 + rotatedDelta - 2, movedBox.y + 36, { steps: 5 });
  translate = await readTranslate('title');
  await expectAxis(translate, 'x', rotatedDelta, 'ROTATED_CANDIDATE');
  await page.mouse.up();
  // 恢复文档与选择，避免污染后续断言。
  await page.evaluate((restore) => {
    const result = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title', 'subtitle'],
      patch: {
        position: {
          x: restore.subtitle.position.x,
          y: restore.subtitle.position.y,
        },
        rotation: restore.subtitle.rotation,
      },
    });
    const titleResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['title'],
      patch: {
        position: restore.title.position,
        rotation: restore.title.rotation,
      },
    });
    const hostDataResult = window.baseScreenHarness.designer.executeCommand({
      type: 'update-components',
      componentIds: ['host-data'],
      patch: {
        position: restore.hostData.position,
        rotation: restore.hostData.rotation,
      },
    });
    if (!result.ok || !titleResult.ok || !hostDataResult.ok) {
      throw new Error('BROWSER_HARNESS_SNAP_RESTORE_FAILED');
    }
  }, beforeComponents);
  await page.waitForFunction((expected) => {
    const { document: doc } = window.baseScreenHarness.designer;
    const read = (id) => {
      const component = doc.components.find((item) => item.id === id);
      return component === undefined
        ? undefined
        : {
            position: {
              x: component.position.x,
              y: component.position.y,
            },
            rotation: component.rotation,
          };
    };
    const title = read('title');
    const subtitle = read('subtitle');
    const hostData = read('host-data');
    return (
      title !== undefined &&
      subtitle !== undefined &&
      hostData !== undefined &&
      title.position.x === expected.title.position.x &&
      title.position.y === expected.title.position.y &&
      title.rotation === expected.title.rotation &&
      subtitle.position.x === expected.subtitle.position.x &&
      subtitle.position.y === expected.subtitle.position.y &&
      subtitle.rotation === expected.subtitle.rotation &&
      hostData.position.x === expected.hostData.position.x &&
      hostData.position.y === expected.hostData.position.y &&
      hostData.rotation === expected.hostData.rotation
    );
  }, beforeComponents);
  await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const canvas = root?.querySelector('[data-canvas]');
    const box = canvas?.getBoundingClientRect();
    if (canvas === undefined || box === undefined) return;
    const tool = root?.querySelector('button[data-tool="select"]');
    tool?.dispatchEvent(new PointerEvent('click', { bubbles: true, composed: true, pointerId: 1 }));
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        composed: true,
        clientX: box.left + 10,
        clientY: box.top + 10,
        pointerId: 1,
      }),
    );
  });
  const after = await page.evaluate(() =>
    JSON.stringify(window.baseScreenHarness.designer.document),
  );
  if (after !== before) {
    throw new Error('BROWSER_HARNESS_SNAP_RESTORE_MISMATCH');
  }
}

// 浏览器级变换实时预览（V10）：真实指针拖拽 east 手柄，断言 Material 根元素在预览期间

export { assertSnapWorkflow };
