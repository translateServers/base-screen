import { screenshotDirectory } from './constants.mjs';

// Exercise the real create-gesture -> snap -> DOM path, then cancel without adding a component.
export async function assertPointSnapOverlay(designer, page) {
  const before = await designer.evaluate((element) => JSON.stringify(element.document));
  await designer.locator('button[data-tool="rectangle"]').click();
  const canvas = designer.locator('[data-canvas]');
  try {
    const state = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const origin = { x: rect.left + element.clientLeft, y: rect.top + element.clientTop };
      const pointer = (type, x, y) =>
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            composed: true,
            pointerId: 971,
            clientX: origin.x + x,
            clientY: origin.y + y,
          }),
        );
      const root = element.getRootNode();
      const lines = () => root.querySelectorAll('.canvas-guide-snap[data-axis="x"]').length;
      pointer('pointerdown', 200, 200);
      pointer('pointermove', -3, 200);
      const captured = {
        lines: lines(),
        left: root.querySelector('[data-create-preview]')?.style.left,
      };
      pointer('pointermove', -0.5, 200);
      const nearLines = lines();
      pointer('pointermove', 0, 200);
      return { captured, nearLines, exactLines: lines() };
    });
    if (
      state.captured.left !== '0px' ||
      state.captured.lines !== 0 ||
      state.nearLines !== 1 ||
      state.exactLines !== 1
    ) {
      throw new Error(
        `BROWSER_HARNESS_POINT_SNAP_RENDER_THRESHOLD_FAILED:${JSON.stringify(state)}`,
      );
    }
  } finally {
    await canvas.dispatchEvent('pointercancel', { pointerId: 971 });
    await designer.locator('button[data-tool="select"]').click();
  }
  if ((await designer.locator('.canvas-guide-snap, [data-create-preview]').count()) !== 0) {
    throw new Error('BROWSER_HARNESS_POINT_SNAP_CANCEL_OVERLAY_FAILED');
  }
  if ((await designer.evaluate((element) => JSON.stringify(element.document))) !== before) {
    throw new Error('BROWSER_HARNESS_POINT_SNAP_CANCEL_DOCUMENT_FAILED');
  }
}

// Called while the title is captured at canvas top: y is the pointer's exact alignment position.
export async function assertSnapOverlayReuse(designer, page, { x, y }) {
  const layer = designer.locator('[data-canvas-guides]');
  const originalMarkers = await layer.evaluateHandle((element) => [
    ...element.querySelectorAll('.canvas-measurement'),
  ]);
  try {
    await assertUnchangedOverlay(layer, () => page.mouse.move(x, y - 3));
    await page.mouse.move(x, y - 1);
    if ((await layer.locator('.canvas-guide-snap[data-axis="y"]').count()) !== 1) {
      throw new Error('BROWSER_HARNESS_SNAP_VISIBLE_GUIDE_FIXTURE_FAILED');
    }
    const markersRetained = await originalMarkers.evaluate(
      (markers) => markers.length > 0 && markers.every((marker) => marker.isConnected),
    );
    if (!markersRetained) throw new Error('BROWSER_HARNESS_SNAP_MEASUREMENT_NODE_REPLACED');
    await assertUnchangedOverlay(layer, () => page.mouse.move(x, y + 1));
    await page.screenshot({ path: `${screenshotDirectory}/snap-overlay.png` });
  } finally {
    await originalMarkers.dispose();
  }
}

async function assertUnchangedOverlay(layer, move) {
  const probe = await layer.evaluateHandle((element) => {
    const records = [];
    const observer = new MutationObserver((entries) => records.push(...entries));
    observer.observe(element, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return { element, nodes: [...element.querySelectorAll('*')], records, observer };
  });
  try {
    await move();
    const result = await probe.evaluate(({ element, nodes, records, observer }) => {
      records.push(...observer.takeRecords());
      observer.disconnect();
      const after = [...element.querySelectorAll('*')];
      return {
        writes: records.length,
        identical:
          nodes.length === after.length && nodes.every((node, index) => node === after[index]),
      };
    });
    if (result.writes !== 0 || !result.identical) {
      throw new Error(`BROWSER_HARNESS_SNAP_UNCHANGED_OVERLAY_MUTATED:${JSON.stringify(result)}`);
    }
  } finally {
    await probe.evaluate(({ observer }) => observer.disconnect());
    await probe.dispose();
  }
}
