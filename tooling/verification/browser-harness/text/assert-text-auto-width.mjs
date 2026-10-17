// 文本自适应宽度与运行时几何
// 由 3 个原 assert 模块合并；调用顺序由 run-browser-harness.mjs 编排。

import { expect } from '@playwright/test';
import { zoomResetViaMenu } from '../shared/harness-utils.mjs';

// 原各模块从 text-auto-width-helpers.mjs 以 `settleAutoWidth as settle` 导入；
// 合并为单模块后该别名需在本地显式绑定。
const settle = settleAutoWidth;

// ---- 源模块：assert-text-auto-width.mjs ----
export async function assertTextAutoWidth(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/?designer`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.baseScreenHarness?.designer?.document !== undefined);
    const designer = page.locator('base-screen-designer').first();
    expect(
      await page.evaluate(() => {
        const designer = window.baseScreenHarness.designer;
        const manifest = designer.catalog.get('base.text').manifest;
        return designer.replaceDocument({
          canvas: { width: 1000, height: 650, backgroundColor: '#07101f' },
          components: [
            {
              id: 'auto-text',
              type: 'base.text',
              name: '自适应文本',
              parentId: null,
              position: { x: 100, y: 150 },
              size: { width: 320, height: 80 },
              rotation: 0,
              zIndex: 0,
              status: { locked: false, hidden: false },
              props: manifest.defaultProps,
              style: manifest.defaultStyle,
              dataSource: { type: 'static', value: '中文 Text' },
            },
          ],
          variables: [],
          blueprint: { rules: [] },
        }).ok;
      }),
    ).toBe(true);
    const text = designer.locator('[data-canvas] [data-base-screen-component-id="auto-text"]');
    await text.click();
    expect((await readAutoWidthText(page)).width).toBe(320);
    await designer.locator('[data-prop="autoWidth"]').check();
    await settle(page);
    const initial = await readAutoWidthText(page);
    expect(initial.width).toBeGreaterThan(1);
    expect(initial.width).toBeLessThan(320);
    expect(initial.whiteSpace).toBe('pre');
    expect(initial.selectedWidth).toBeCloseTo(initial.width, 1);
    expect(initial.inputWidth).toBeCloseTo(initial.width, 1);
    expect(initial.component.size).toEqual({ width: 320, height: 80 });
    expect([initial.left, initial.top]).toEqual(['100px', '150px']);

    for (const value of ['中文 Text\n短', '中文 Text']) {
      await patchAutoWidthText(page, { dataSource: { type: 'static', value } });
      expect((await readAutoWidthText(page)).width).toBeCloseTo(initial.width, 1);
    }
    for (const verticalAlign of ['top', 'middle', 'bottom']) {
      await patchAutoWidthText(page, { style: { verticalAlign, textAlign: 'center' } });
      expect((await readAutoWidthText(page)).width).toBeCloseTo(initial.width, 1);
    }
    await patchAutoWidthText(page, {
      style: { fontSize: 48, letterSpacing: 2, fontWeight: '700' },
    });
    const larger = await readAutoWidthText(page);
    expect(larger.width).toBeGreaterThan(initial.width);
    expect(larger.height).toBe(80);
    for (const value of ['', '   ', 'Emoji 😀 文本', 'English words']) {
      await patchAutoWidthText(page, { dataSource: { type: 'static', value } });
      const state = await readAutoWidthText(page);
      expect(state.width).toBeGreaterThanOrEqual(1);
      expect(state.component.size.width).toBe(320);
      if (value === '') expect(state.width).toBe(1);
    }
    await patchAutoWidthText(page, {
      dataSource: { type: 'static', value: '中文 Text' },
      style: {
        fontSize: 32,
        letterSpacing: 0,
        fontWeight: '400',
        verticalAlign: 'top',
        textAlign: 'left',
      },
    });

    // Height-only entry preserves the stored width; numeric width editing exits automatic mode.
    await designer.locator('[data-property="height"]').fill('100');
    await designer.locator('[data-property="height"]').press('Enter');
    expect((await readAutoWidthText(page)).component).toMatchObject({
      props: { autoWidth: true },
      size: { width: 320, height: 100 },
    });
    await designer.locator('[data-property="width"]').fill('250');
    await designer.locator('[data-property="width"]').press('Enter');
    expect((await readAutoWidthText(page)).component).toMatchObject({
      props: { autoWidth: false },
      size: { width: 250, height: 100 },
    });
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    expect((await readAutoWidthText(page)).component).toMatchObject({
      props: { autoWidth: true },
      size: { width: 320 },
    });
    await designer.locator('[data-prop="autoWidth"]').uncheck();
    const fixed = await readAutoWidthText(page);
    expect(fixed.component.size.width).toBeCloseTo(initial.width, 1);
    expect(fixed.width).toBeCloseTo(initial.width, 1);
    await page.evaluate(() => window.baseScreenHarness.designer.undo());

    // Canceling an actual horizontal pointer resize keeps both mode and canonical geometry.
    const beforeDrag = (await readAutoWidthText(page)).component;
    const handle = await designer.locator('[data-transform-handle="east"]').boundingBox();
    expect(handle).not.toBeNull();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, {
      steps: 3,
    });
    await designer.locator('[data-canvas]').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    await settle(page);
    expect((await readAutoWidthText(page)).component).toEqual(beforeDrag);

    // The live contenteditable overlay grows without committing until Enter/blur.
    await text.dblclick();
    const overlay = designer.locator('[data-text-edit-overlay]');
    await expect(overlay).toBeVisible();
    await overlay.fill('A much longer editable text value');
    expect(
      await overlay.evaluate((element) => Number.parseFloat(getComputedStyle(element).width)),
    ).toBeGreaterThan(initial.width);
    await overlay.press('Escape');
    expect((await readAutoWidthText(page)).component).toEqual(beforeDrag);
    await text.dblclick();
    await overlay.fill('Changed text');
    await overlay.press('Enter');
    expect((await readAutoWidthText(page)).component.dataSource.value).toBe('Changed text');
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    expect((await readAutoWidthText(page)).component).toEqual(beforeDrag);

    // Copy/export retain the fixed fallback, while every renderer measures independently.
    const copied = await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const saved = designer.exportDocument();
      designer.copy();
      const result = designer.paste();
      return { saved, ok: result.ok, pasted: designer.document.components.at(-1) };
    });
    expect(copied.ok).toBe(true);
    expect(copied.saved.ok).toBe(true);
    expect(copied.pasted.props.autoWidth).toBe(true);
    expect(copied.pasted.size.width).toBe(beforeDrag.size.width);
    await page.evaluate(
      (serialized) => window.baseScreenHarness.designer.importDocument(JSON.parse(serialized)),
      copied.saved.value,
    );
    await text.click();
    const viewerWidth = await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      const viewer = document.createElement('base-screen-viewer');
      viewer.catalog = designer.catalog;
      viewer.document = designer.document;
      viewer.style.cssText =
        'display:block;position:absolute;left:-2000px;width:1000px;height:650px;visibility:hidden';
      document.body.appendChild(viewer);
      const element = viewer.shadowRoot.querySelector(
        '[data-base-screen-component-id="auto-text"]',
      );
      const width = Number.parseFloat(getComputedStyle(element).width);
      viewer.remove();
      return width;
    });
    expect(viewerWidth).toBeCloseTo((await readAutoWidthText(page)).width, 1);
    await designer.locator('[data-action="preview"]').first().click();
    const preview = designer.locator('.direct-preview base-screen-viewer');
    await expect(preview).toBeVisible();
    const previewText = await preview
      .locator('[data-base-screen-component-id="auto-text"]')
      .evaluate((element) => ({
        width: Number.parseFloat(getComputedStyle(element).width),
        font: getComputedStyle(element).font,
      }));
    const canvasFont = await text.evaluate((element) => getComputedStyle(element).font);
    expect(previewText.width, JSON.stringify({ previewText, canvasFont })).toBeCloseTo(
      (await readAutoWidthText(page)).width,
      1,
    );
    await designer.locator('.direct-preview [data-action="preview"]').click();

    await page.evaluate(() => {
      const designer = window.baseScreenHarness.designer;
      window.autoWidthResourceValue = '短数据';
      designer.datasetPort.query = async () => ({
        ok: true,
        value: {
          fields: [{ id: 'value', label: '文本', valueType: 'string' }],
          rows: [{ value: window.autoWidthResourceValue }],
        },
        diagnostics: [],
      });
    });
    await patchAutoWidthText(page, {
      dataSource: {
        type: 'dataset',
        datasetId: 'auto-text-data',
        params: {},
        binding: { fields: { value: ['value'] } },
      },
    });
    await expect(text).toHaveText('短数据');
    await settle(page);
    const short = await readAutoWidthText(page);
    const serialized = await page.evaluate(() =>
      JSON.stringify(window.baseScreenHarness.designer.document),
    );
    await designer.locator('[data-viewport]').focus();
    await page.keyboard.press('w');
    await designer.locator('[data-size-entry-height]').fill('140');
    await page.evaluate(() => {
      window.autoWidthDocumentEvents = 0;
      for (const name of ['base-screen-change', 'base-screen-dirty-change']) {
        window.baseScreenHarness.designer.addEventListener(
          name,
          () => window.autoWidthDocumentEvents++,
        );
      }
      window.autoWidthResourceValue = '这是一段明显更长的动态数据';
      window.baseScreenHarness.designer.refreshData('auto-text');
    });
    await expect(text).toHaveText('这是一段明显更长的动态数据');
    await settle(page);
    const long = await readAutoWidthText(page);
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.selectedWidth).toBeCloseTo(long.width, 1);
    expect(long.inputWidth).toBeCloseTo(long.width, 1);
    expect(Number(await designer.locator('[data-size-entry-width]').inputValue())).toBeCloseTo(
      long.width,
      1,
    );
    await expect(designer.locator('[data-size-entry-height]')).toHaveValue('140');
    expect(
      await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document)),
    ).toBe(serialized);
    expect(await page.evaluate(() => window.autoWidthDocumentEvents)).toBe(0);
    const samples = await page.evaluate(async () => {
      const element = window.baseScreenHarness.designer.shadowRoot.querySelector(
        '[data-base-screen-component-id="auto-text"]',
      );
      const widths = [];
      for (let index = 0; index < 6; index++) {
        await new Promise(requestAnimationFrame);
        widths.push(getComputedStyle(element).width);
      }
      return widths;
    });
    expect(new Set(samples).size).toBe(1);
    await designer.locator('[data-size-entry-height]').press('Enter');
    expect((await readAutoWidthText(page)).component).toMatchObject({
      size: { width: 320, height: 140 },
      props: { autoWidth: true },
    });
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    // While a gesture is active, asynchronous data must not change its geometry baseline.
    const dynamicBox = await text.boundingBox();
    await page.mouse.move(dynamicBox.x + 20, dynamicBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(dynamicBox.x + 55, dynamicBox.y + 55, { steps: 3 });
    const frozenWidth = (await readAutoWidthText(page)).selectedWidth;
    await page.evaluate(() => {
      window.autoWidthResourceValue = '短';
      window.baseScreenHarness.designer.refreshData('auto-text');
    });
    await expect(text).toHaveText('短');
    await settle(page);
    expect((await readAutoWidthText(page)).selectedWidth).toBe(frozenWidth);
    await designer.locator('[data-canvas]').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    await settle(page);
    const resumed = await readAutoWidthText(page);
    expect(resumed.width).toBeLessThan(frozenWidth);
    expect(resumed.selectedWidth).toBeCloseTo(resumed.width, 1);
    expect(
      await page.evaluate(() => JSON.stringify(window.baseScreenHarness.designer.document)),
    ).toBe(serialized);
    await patchAutoWidthText(page, { status: { hidden: true, locked: false } });
    await expect(text).toBeHidden();
    await page.evaluate(() => {
      window.autoWidthResourceValue = '隐藏时刷新后应使用新的宽度';
      window.baseScreenHarness.designer.refreshData('auto-text');
    });
    await expect(text).toHaveText('隐藏时刷新后应使用新的宽度');
    await expect(text).toBeHidden();
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    await expect(text).toBeVisible();
    await settle(page);
    expect((await readAutoWidthText(page)).width).toBeGreaterThan(resumed.width);
    await page.evaluate(() => window.baseScreenHarness.designer.undo());
    expect((await readAutoWidthText(page)).component.dataSource.type).toBe('static');
    await assertTextAutoWidthGeometry(page);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

// ---- 源模块：assert-text-auto-width-geometry.mjs ----
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

// ---- 源模块：text-auto-width-helpers.mjs ----
export async function readAutoWidthText(page) {
  return page.evaluate(() => {
    const designer = window.baseScreenHarness.designer;
    const root = designer.shadowRoot;
    const element = root.querySelector('[data-base-screen-component-id="auto-text"]');
    const style = getComputedStyle(element);
    const selection = root.querySelector('[data-selection]');
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      whiteSpace: style.whiteSpace,
      left: element.style.left,
      top: element.style.top,
      selectedWidth: Number.parseFloat(selection.style.width),
      inputWidth: Number(root.querySelector('[data-property="width"]')?.value),
      component: designer.document.components.find((item) => item.id === 'auto-text'),
    };
  });
}

export async function patchAutoWidthText(page, patch) {
  const result = await page.evaluate((patch) => {
    const designer = window.baseScreenHarness.designer;
    const current = designer.document.components.find((item) => item.id === 'auto-text');
    return designer.executeCommand({
      type: 'update-components',
      componentIds: ['auto-text'],
      patch: {
        ...patch,
        ...(patch.props === undefined ? {} : { props: { ...current.props, ...patch.props } }),
        ...(patch.style === undefined ? {} : { style: { ...current.style, ...patch.style } }),
      },
    }).ok;
  }, patch);
  expect(result).toBe(true);
}

export async function settleAutoWidth(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
