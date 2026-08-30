import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDesignerColorPaletteStopAction,
  clearColorPaletteDraftCache,
  colorPaletteDraftCacheSizes,
  createDesignerColorPalette,
  MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
  MIN_COLOR_PALETTE_STOPS,
  parseColorPaletteValue,
  readDesignerColorPaletteValue,
  serializeColorPaletteValue,
} from '../../../../src/browser/dom/color/designer-color-palette-dom.js';
import {
  byField,
  checkMode,
  descendants,
  FakeDocument,
  FakeElement,
  stopRows,
} from './designer-color-palette-dom-fixture.js';

afterEach(() => clearColorPaletteDraftCache());

describe('manual hex color input', () => {
  it('keeps a shorthand draft while typing, then syncs solid rgb and alpha on change', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const value = byField(element, 'solid-value')!;
    value.value = '#fff';
    value.dispatchEvent(new Event('input', { bubbles: true }));
    // #fff 是有效完整短写，但输入期间不重写，作者可以继续输入 #ffffff。
    expect(value.value).toBe('#fff');
    expect(value.attributes.get('aria-invalid')).toBe('false');
    expect(byField(element, 'solid')?.value).toBe('#112233');
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(value.value).toBe('#FFFFFF');
    expect(byField(element, 'solid')?.value).toBe('#ffffff');

    value.value = '#12345680';
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(byField(element, 'solid')?.value).toBe('#123456');
    expect(byField(element, 'solid')?.dataset.colorPaletteAlpha).toBe('80');
    expect(byField(element, 'solid-alpha')?.value).toBe('50');
    expect(readDesignerColorPaletteValue(value)).toBe('#12345680');
  });

  it('syncs a selected stop into its handle and rejects an invalid hex draft', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const value = byField(element, 'stop-value')!;
    value.value = '#0EA5E9';
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(value.value).toBe('#0EA5E9');
    expect(byField(element, 'stop-color')?.value).toBe('#0ea5e9');
    expect(stopRows(element)[0]?.dataset.colorPaletteStopColor).toBe('#0ea5e9');
    expect(readDesignerColorPaletteValue(value)).toBe(
      'linear-gradient(90deg, #0ea5e9 0%, #ffffff 100%)',
    );

    value.value = '#12';
    value.dispatchEvent(new Event('input', { bubbles: true }));
    expect(value.attributes.get('aria-invalid')).toBe('true');
    value.dispatchEvent(new Event('change', { bubbles: true }));
    expect(readDesignerColorPaletteValue(value)).toBeUndefined();
    expect(stopRows(element)[0]?.dataset.colorPaletteStopColor).toBe('#0ea5e9');
  });
});

describe('readDesignerColorPaletteValue', () => {
  it('reads the palette DOM and serializes the active mode', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    byField(element, 'solid')!.value = '#abcdef';
    checkMode(element, 'linear-gradient');
    element.dataset.colorPaletteMode = 'linear-gradient';
    const stopPosition = byField(element, 'stop-position')!;
    stopPosition.value = '0';
    stopPosition.dispatchEvent(new Event('input', { bubbles: true }));
    const handles = stopRows(element);
    handles[1]!.dataset.colorPaletteStopPosition = '100';
    byField(element, 'angle')!.value = '135';

    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe(
      'linear-gradient(135deg, #000000 0%, #ffffff 100%)',
    );
  });

  it('returns undefined for out-of-order stops fail-closed', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    checkMode(element, 'linear-gradient');
    element.dataset.colorPaletteMode = 'linear-gradient';
    const handles = stopRows(element);
    handles[0]!.dataset.colorPaletteStopPosition = '60';
    handles[1]!.dataset.colorPaletteStopPosition = '40';
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBeUndefined();
  });

  it('selects a handle and keeps its editor position in sync', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const handles = stopRows(element);
    const position = byField(element, 'stop-position')!;
    expect(element.dataset.colorPaletteSelectedStop).toBe('0');
    handles[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(element.dataset.colorPaletteSelectedStop).toBe('1');
    expect(position.value).toBe('100');
    expect(position.dataset.colorPaletteStopIndex).toBe('1');
    position.value = '80';
    position.dispatchEvent(new Event('input', { bubbles: true }));
    expect(handles[1]!.dataset.colorPaletteStopPosition).toBe('80');
  });

  it('retains the selected handle after a committed panel re-render', () => {
    const ownerDocument = new FakeDocument();
    const value = 'linear-gradient(90deg, #000000 0%, #ffffff 100%)';
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      value,
      'component:style:color',
    );
    const firstElement = first.element as unknown as FakeElement;
    stopRows(firstElement)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe(value);

    const second = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      value,
      'component:style:color',
    );
    const secondElement = second.element as unknown as FakeElement;
    expect(secondElement.dataset.colorPaletteSelectedStop).toBe('1');
    expect(byField(secondElement, 'stop-position')?.value).toBe('100');
  });
});

describe('color palette alpha transparency', () => {
  it('splits alpha-hex colors into rgb value and alpha dataset on render', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#ff000080');
    const element = palette.element as unknown as FakeElement;
    const solid = byField(element, 'solid')!;
    expect(solid.value).toBe('#ff0000');
    expect(solid.dataset.colorPaletteAlpha).toBe('80');
    expect(byField(element, 'solid-alpha')?.value).toBe('50');
  });

  it('composes the alpha slider into the solid value on input', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const alpha = byField(element, 'solid-alpha')!;
    alpha.value = '50';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#11223380');
    alpha.value = '0';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#11223300');
    alpha.value = '100';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    // 不透明：不带透明通道后缀，保持既有 6 位值格式（旧文档零迁移）。
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#112233');
  });

  it('applies stop alpha to the selected gradient stop and keeps other stops intact', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const alpha = byField(element, 'stop-alpha')!;
    alpha.value = '40';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe(
      'linear-gradient(90deg, #00000066 0%, #ffffff 100%)',
    );
  });

  it('switching stops refreshes the alpha slider from the stop color', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #00000080 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    expect(byField(element, 'stop-alpha')?.value).toBe('50');
    stopRows(element)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(byField(element, 'stop-alpha')?.value).toBe('100');
    expect(byField(element, 'stop-color')?.value).toBe('#ffffff');
  });

  it('groups the solid alpha slider with the solid field so gradient modes hide them together', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const solid = byField(element, 'solid')!;
    const alpha = byField(element, 'solid-alpha')!;
    const solidGroup = solid.closest('.designer-color-palette-solid-field');
    expect(solidGroup).not.toBeNull();
    // 单色透明度行与单色字段同一组：渐变模式的 hide 规则（display: none 锚定
    // .designer-color-palette-solid-field）会把两者一起隐藏，滑杆不会单独露出。
    expect(alpha.closest('.designer-color-palette-solid-field')).toBe(solidGroup);
    expect(
      descendants(element).filter((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-solid-field'),
      ),
    ).toHaveLength(1);
  });

  it('keeps transparent gradient stops serialized as transparent when untouched', () => {
    const ownerDocument = new FakeDocument();
    const value = 'radial-gradient(circle at 50% 50%, #112233 0%, transparent 100%)';
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, value);
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe(value);
  });

  it('round-trips alpha solid and alpha gradient values through parse/serialize', () => {
    expect(parseColorPaletteValue('#aabbcc40').solid).toBe('#aabbcc40');
    expect(serializeColorPaletteValue(parseColorPaletteValue('#aabbcc40'))).toBe('#aabbcc40');
    const gradient = 'linear-gradient(90deg, #ff000080 0%, #0000ff20 100%)';
    expect(serializeColorPaletteValue(parseColorPaletteValue(gradient))).toBe(gradient);
  });
});

describe('applyDesignerColorPaletteStopAction', () => {
  it('adds and removes stops in the DOM and dispatches a change', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    byField(element, 'solid')!.dataset.style = 'color';
    expect(stopRows(element)).toHaveLength(MIN_COLOR_PALETTE_STOPS);

    expect(
      applyDesignerColorPaletteStopAction(element as unknown as HTMLElement, 'add-stop', 0),
    ).toBe(true);
    expect(stopRows(element)).toHaveLength(MIN_COLOR_PALETTE_STOPS + 1);
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toMatch(
      /linear-gradient\(90deg, #000000 0%, #ffffff 50%, #ffffff 100%\)/,
    );
    expect(byField(element, 'stop-position')).toBeDefined();
    expect(byField(element, 'stop-position')?.dataset.style).toBe('color');
    expect(byField(element, 'solid')?.dispatched).toContain('change');

    expect(
      applyDesignerColorPaletteStopAction(element as unknown as HTMLElement, 'remove-stop', 1),
    ).toBe(true);
    expect(stopRows(element)).toHaveLength(MIN_COLOR_PALETTE_STOPS);
  });
});

describe('per-mode draft retention', () => {
  it('keeps every mode draft across panel re-renders and invalidates on document drift', () => {
    const linearValue = 'linear-gradient(90deg, #000000 0%, #ffffff 100%)';
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'c1:style:backgroundColor',
    );
    // 首次编辑提交后缓存建立。
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe(linearValue);

    // 面板重渲染：同一字段 key 复用缓存（当前模式序列化 == 文档值）。
    const second = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'c1:style:backgroundColor',
    );
    const secondElement = second.element as unknown as FakeElement;
    byField(secondElement, 'solid')!.value = '#abcdef';
    checkMode(secondElement, 'solid');
    secondElement.dataset.colorPaletteMode = 'solid';
    expect(readDesignerColorPaletteValue(second.controls[0]!)).toBe('#abcdef');

    // 再切回线性：缓存中的色标仍然保留。
    const third = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#abcdef',
      'c1:style:backgroundColor',
    );
    const thirdElement = third.element as unknown as FakeElement;
    checkMode(thirdElement, 'linear-gradient');
    thirdElement.dataset.colorPaletteMode = 'linear-gradient';
    expect(readDesignerColorPaletteValue(third.controls[0]!)).toBe(linearValue);

    // 文档值漂移（撤销/重做/替换）时缓存失效，从文档重新解析。
    const drifted = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'radial-gradient(circle at 25% 75%, #112233 0%, transparent 100%)',
      'c1:style:backgroundColor',
    );
    expect((drifted.element as unknown as FakeElement).dataset.colorPaletteMode).toBe(
      'radial-gradient',
    );
  });

  it('evicts the oldest field draft beyond the FIFO cap', () => {
    const linearValue = 'linear-gradient(90deg, #000000 0%, #ffffff 100%)';
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'field-1',
    );
    (first.element as unknown as FakeElement).dataset.colorPaletteSelectedStop = '1';
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe(linearValue);
    expect(colorPaletteDraftCacheSizes()).toEqual({ drafts: 1, selections: 1 });

    // 未超限时同 key 复用选中草稿。
    const reused = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'field-1',
    );
    expect((reused.element as unknown as FakeElement).dataset.colorPaletteSelectedStop).toBe('1');

    // 逐个写入直到上限：缓存条目数封顶。
    for (let index = 2; index <= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES; index++) {
      const palette = createDesignerColorPalette(
        ownerDocument as unknown as Document,
        '#123456',
        `field-${index}`,
      );
      expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#123456');
    }
    expect(colorPaletteDraftCacheSizes()).toEqual({
      drafts: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
      selections: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
    });

    // 超限写入：最早字段（field-1）被 FIFO 淘汰，条目数保持封顶。
    const overflow = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#123456',
      `field-${MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES + 1}`,
    );
    readDesignerColorPaletteValue(overflow.controls[0]!);
    expect(colorPaletteDraftCacheSizes()).toEqual({
      drafts: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
      selections: MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
    });
    const evicted = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      linearValue,
      'field-1',
    );
    expect((evicted.element as unknown as FakeElement).dataset.colorPaletteSelectedStop).toBe('0');
  });
});
