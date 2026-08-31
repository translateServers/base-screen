import { expect } from '@playwright/test';
import { zoomResetViaMenu } from './harness-utils.mjs';
import {
  patchAutoWidthText,
  readAutoWidthText,
  settleAutoWidth as settle,
} from './text-auto-width-helpers.mjs';

export async function assertTextAutoWidthGeometry(page) {
  const designer = page.locator('base-screen-designer').first();
  const text = designer.locator('[data-canvas] [data-base-screen-component-id="auto-text"]');
  const viewport = designer.locator('[data-viewport]');
  await zoomResetViaMenu(designer);
  await text.click();
  const original = await readAutoWidthText(page);
  const undo = () => page.evaluate(() => window.baseScreenHarness.designer.undo());

  // Both pointer resize directions and quick entry commit through the same normalization.
  await dragHandle(page, designer, 'south', 0, 30);
  expect((await readAutoWidthText(page)).component).toMatchObject({
    props: { autoWidth: true },
    size: { width: original.component.size.width },
  });
  expect((await readAutoWidthText(page)).height).toBeGreaterThan(original.height);
  await undo();
  await dragHandle(page, designer, 'east', 60, 0);
  expect((await readAutoWidthText(page)).component.props.autoWidth).toBe(false);
  expect((await readAutoWidthText(page)).width).toBeGreaterThan(original.width);
  await undo();
  await viewport.focus();
  await page.keyboard.press('w');
  await designer.locator('[data-size-entry-height]').fill('130');
  await designer.locator('[data-size-entry-height]').press('Enter');
  expect((await readAutoWidthText(page)).component).toMatchObject({
    props: { autoWidth: true },
    size: { width: original.component.size.width, height: 130 },
  });
  await undo();
  await viewport.focus();
  await page.keyboard.press('w');
  await designer.locator('[data-size-entry-width]').fill('275');
  await designer.locator('[data-size-entry-width]').press('Enter');
  expect((await readAutoWidthText(page)).component).toMatchObject({
    props: { autoWidth: false },
    size: { width: 275 },
  });
  await undo();

  // Local measurement must be independent of rotation, mirroring, and viewport zoom.
  await patchAutoWidthText(page, { rotation: 30, style: { flipX: true } });
  await designer.locator('[data-action="zoom-out"]').click();
  await settle(page);
  const rotated = await readAutoWidthText(page);
  expect(rotated.width).toBeCloseTo(original.width, 1);
  expect(rotated.selectedWidth).toBeCloseTo(
    original.width * Math.cos(Math.PI / 6) + original.height / 2,
    1,
  );
  await text.dblclick();
  const overlay = designer.locator('[data-text-edit-overlay]');
  const boxes = await page.evaluate(() => {
    const root = window.baseScreenHarness.designer.shadowRoot;
    const read = (selector) => {
      const box = root.querySelector(selector).getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    };
    return [read('[data-base-screen-component-id="auto-text"]'), read('[data-text-edit-overlay]')];
  });
  boxes[0].forEach((value, index) => expect(boxes[1][index]).toBeCloseTo(value, 1));
  await overlay.press('Escape');
  await undo();
  await zoomResetViaMenu(designer);

  // Canvas hit testing and containment must use the measured edge, not the saved fallback.
  await page.evaluate(() => {
    window.autoWidthSelected = [];
    window.baseScreenHarness.designer.addEventListener('base-screen-selection-change', (event) => {
      window.autoWidthSelected = event.detail.selectedComponentIds;
    });
  });
  const origin = await designer.locator('[data-canvas]').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x + canvas.clientLeft, y: rect.y + canvas.clientTop };
  });
  await page.mouse.click(origin.x + 100 + original.width + 20, origin.y + 175);
  expect(await page.evaluate(() => window.autoWidthSelected)).toEqual([]);
  await page.keyboard.down('Alt');
  await page.mouse.move(origin.x + 90, origin.y + 140);
  await page.mouse.down();
  await page.mouse.move(origin.x + 110 + original.width, origin.y + 160 + original.height, {
    steps: 3,
  });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await page.evaluate(() => window.autoWidthSelected)).toEqual(['auto-text']);

  // Alt-drag copies canonical text settings, while its move uses displayed geometry.
  const box = await text.boundingBox();
  await page.keyboard.down('Alt');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 55, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const duplicate = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.components.at(-1),
  );
  expect(duplicate.id).not.toBe('auto-text');
  expect(duplicate.size.width).toBe(original.component.size.width);
  expect(duplicate.props.autoWidth).toBe(true);
  await undo();

  // Add differing natural widths, then exercise alignment, distribution, and group scaling.
  expect(
    await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const source = designer.document.components[0];
      return designer.executeTransaction({
        commands: [
          {
            type: 'add-component',
            component: {
              ...source,
              id: 'auto-second',
              name: 'second',
              zIndex: 1,
              position: { x: 370, y: 300 },
              size: { width: 450, height: 70 },
              dataSource: { type: 'static', value: '短' },
            },
          },
          {
            type: 'add-component',
            component: {
              ...source,
              id: 'auto-third',
              name: 'third',
              zIndex: 2,
              position: { x: 630, y: 400 },
              dataSource: { type: 'static', value: 'Another label' },
            },
          },
        ],
      }).ok;
    }),
  ).toBe(true);
  const second = designer.locator('[data-canvas] [data-base-screen-component-id="auto-second"]');
  const secondBox = await second.boundingBox();
  const edge = original.component.position.x + original.width;
  await page.mouse.move(secondBox.x + 16, secondBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 16 + edge - 370 + 2, secondBox.y + 20, { steps: 3 });
  await page.mouse.up();
  const snappedX = await page.evaluate(
    () =>
      window.baseScreenHarness.designer.document.components.find(
        (item) => item.id === 'auto-second',
      ).position.x,
  );
  expect(Math.abs(snappedX - edge)).toBeLessThan(1);
  await undo();
  await selectAll(page, viewport);
  expect(await page.evaluate(() => window.baseScreenHarness.designer.align('right').ok)).toBe(true);
  let measured = await measuredComponents(page);
  const edges = measured.map((item) => item.x + item.width);
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(0.02);
  expect(measured.every((item) => item.autoWidth)).toBe(true);
  await undo();
  expect(
    await page.evaluate(() => window.baseScreenHarness.designer.distribute('horizontal').ok),
  ).toBe(true);
  measured = (await measuredComponents(page)).sort((a, b) => a.x - b.x);
  expect(measured[1].x - measured[0].x - measured[0].width).toBeCloseTo(
    measured[2].x - measured[1].x - measured[1].width,
    1,
  );
  await undo();
  await designer.locator('[data-multi-property="height"]').fill('120');
  await designer.locator('[data-multi-property="height"]').press('Enter');
  expect((await measuredComponents(page)).map((item) => [item.savedWidth, item.autoWidth])).toEqual(
    [
      [320, true],
      [450, true],
      [320, true],
    ],
  );
  await undo();
  await designer.locator('[data-multi-property="width"]').fill('220');
  await designer.locator('[data-multi-property="width"]').press('Enter');
  expect((await measuredComponents(page)).map((item) => [item.savedWidth, item.autoWidth])).toEqual(
    [
      [220, false],
      [220, false],
      [220, false],
    ],
  );
  await undo();
  expect(await page.evaluate(() => window.baseScreenHarness.designer.group().ok)).toBe(true);
  const group = await page.evaluate(() =>
    window.baseScreenHarness.designer.document.components.find(
      (item) => item.type === 'base.container',
    ),
  );
  measured = await measuredComponents(page);
  expect(group.size.width).toBeCloseTo(
    Math.max(...measured.map((item) => item.x + item.width)) - 100,
    1,
  );
  await designer.locator('[data-property="height"]').fill(String(group.size.height + 50));
  await designer.locator('[data-property="height"]').press('Enter');
  expect((await measuredComponents(page)).every((item) => item.autoWidth)).toBe(true);
  await undo();
  await designer.locator('[data-property="width"]').fill(String(group.size.width * 0.8));
  await designer.locator('[data-property="width"]').press('Enter');
  const scaled = await measuredComponents(page);
  scaled.forEach((item, index) => {
    expect(item.autoWidth).toBe(false);
    expect(item.savedWidth).toBeCloseTo(measured[index].width * 0.8, 1);
  });
  await undo();
}

async function dragHandle(page, designer, handle, dx, dy) {
  const box = await designer.locator(`[data-transform-handle="${handle}"]`).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 });
  await page.mouse.up();
  await settle(page);
}

async function selectAll(page, viewport) {
  await viewport.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
}

async function measuredComponents(page) {
  return page.evaluate(() => {
    const designer = window.baseScreenHarness.designer;
    return designer.document.components
      .filter((item) => item.type === 'base.text')
      .map((component) => ({
        x: component.position.x,
        savedWidth: component.size.width,
        autoWidth: component.props.autoWidth,
        width: Number.parseFloat(
          getComputedStyle(
            designer.shadowRoot.querySelector(`[data-base-screen-component-id="${component.id}"]`),
          ).width,
        ),
      }));
  });
}
