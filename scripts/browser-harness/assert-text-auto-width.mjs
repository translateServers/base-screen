import { expect } from '@playwright/test';
import { assertTextAutoWidthGeometry } from './assert-text-auto-width-geometry.mjs';
import {
  patchAutoWidthText,
  readAutoWidthText,
  settleAutoWidth as settle,
} from './text-auto-width-helpers.mjs';

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
      designer.resourcePort.resolve = async () => ({
        ok: true,
        value: window.autoWidthResourceValue,
        diagnostics: [],
      });
    });
    await patchAutoWidthText(page, {
      dataSource: {
        type: 'host-resource',
        resourceType: 'dataset',
        resourceId: 'auto-text-data',
        params: {
          limit: { kind: 'literal', value: 1 },
          region: { kind: 'literal', value: 'north' },
        },
        binding: null,
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
