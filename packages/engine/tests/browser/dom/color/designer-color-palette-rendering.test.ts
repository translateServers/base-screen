import { afterEach, describe, expect, it } from 'vitest';
import {
  clearColorPaletteDraftCache,
  createDesignerColorPalette,
  readDesignerColorPaletteValue,
} from '../../../../src/browser/dom/color/designer-color-palette-dom.js';
import {
  byAction,
  byDataset,
  byField,
  checkMode,
  descendants,
  documentKeyboardEvent,
  documentPointerEvent,
  FakeDocument,
  FakeElement,
  modeRadio,
  stopRows,
} from './designer-color-palette-dom-fixture.js';

afterEach(() => clearColorPaletteDraftCache());

describe('mode switch derives solid family in the DOM', () => {
  it('derives the gradient from the solid color when switching to linear', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#123456');
    const element = palette.element as unknown as FakeElement;
    byField(element, 'solid')!.value = '#123456';
    checkMode(element, 'linear-gradient');
    modeRadio(element, 'linear-gradient').dispatchEvent(new Event('change', { bubbles: true }));
    expect(element.dataset.colorPaletteMode).toBe('linear-gradient');
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(
      'linear-gradient(90deg, #123456 0%, #7d8fa2 100%)',
    );
    expect(stopRows(element).map((handle) => handle.dataset.colorPaletteStopColor)).toEqual([
      '#123456',
      '#7d8fa2',
    ]);
  });

  it('preserves customized stops when cycling solid → gradient → solid → gradient', () => {
    const ownerDocument = new FakeDocument();
    const value = 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)';
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, value);
    const element = palette.element as unknown as FakeElement;
    checkMode(element, 'linear-gradient');
    element.dataset.colorPaletteMode = 'linear-gradient';
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(value);

    checkMode(element, 'solid');
    element.dataset.colorPaletteMode = 'solid';
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    checkMode(element, 'linear-gradient');
    modeRadio(element, 'linear-gradient').dispatchEvent(new Event('change', { bubbles: true }));
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(value);
  });

  it('keeps document gradient stops when switching between gradient modes', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #112233 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    checkMode(element, 'radial-gradient');
    modeRadio(element, 'radial-gradient').dispatchEvent(new Event('change', { bubbles: true }));
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe(
      'radial-gradient(circle at 50% 50%, #112233 0%, #ffffff 100%)',
    );
  });
});

describe('mode switch shares gradient state back to solid', () => {
  it('syncs the edited stop color into the solid field on gradient -> solid', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const stopColor = byField(element, 'stop-color')!;
    stopColor.value = '#123456';
    stopColor.dispatchEvent(new Event('input', { bubbles: true }));
    checkMode(element, 'solid');
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    expect(element.dataset.colorPaletteMode).toBe('solid');
    expect(byField(element, 'solid')?.value).toBe('#123456');
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe('#123456');
  });

  it('carries the selected stop alpha into the solid field and its alpha slider', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    stopRows(element)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    const alpha = byField(element, 'stop-alpha')!;
    alpha.value = '40';
    alpha.dispatchEvent(new Event('input', { bubbles: true }));
    checkMode(element, 'solid');
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    const solid = byField(element, 'solid')!;
    expect(solid.value).toBe('#ffffff');
    expect(solid.dataset.colorPaletteAlpha).toBe('66');
    expect(byField(element, 'solid-alpha')?.value).toBe('40');
    expect(readDesignerColorPaletteValue(solid)).toBe('#ffffff66');
  });

  it('keeps the solid draft when the selected stop is transparent', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'radial-gradient(circle at 50% 50%, #112233 0%, transparent 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    stopRows(element)[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    checkMode(element, 'solid');
    modeRadio(element, 'solid').dispatchEvent(new Event('change', { bubbles: true }));
    // 选中 transparent 色标不同步：保持解析回退的单色（文档渐变 -> DEFAULT_COLOR）。
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe('#000000');
  });
});

describe('compact palette layout', () => {
  it('keeps the picker behind one compact trigger and opens it as a dialog overlay', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#2483ff');
    const element = palette.element as unknown as FakeElement;
    const trigger = byAction(element, 'toggle')!;
    const popover = byDataset(element, 'colorPalettePopover')! as FakeElement & {
      hidden: boolean;
    };

    expect(trigger.attributes.get('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes.get('aria-expanded')).toBe('false');
    // 字段形态的三段：色块 / 色值 / 右侧 chevron。chevron 是「点了会开弹层」的唯一提示，
    // 少了它触发器和一颗普通按钮没有区别。
    const caret = trigger.children.at(-1)!;
    expect(caret.className).toBe('designer-color-palette-trigger-caret');
    expect(
      ((caret as FakeElement & { readonly innerHTML?: string }).innerHTML ?? '').includes('<svg'),
    ).toBe(true);
    expect(popover.attributes.get('role')).toBe('dialog');
    expect(popover.hidden).toBe(true);

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    expect(element.dataset.colorPaletteOpen).toBe('true');
    expect(trigger.attributes.get('aria-expanded')).toBe('true');
    expect(popover.hidden).toBe(false);

    byAction(element, 'close')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(element.dataset.colorPaletteOpen).toBe('false');
    expect(popover.hidden).toBe(true);
  });

  it('uses an icon-only mode toolbar without visible title or hint text', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#2483ff');
    const element = palette.element as unknown as FakeElement;
    const popover = byDataset(element, 'colorPalettePopover')!;
    const toolbar = descendants(popover).find(
      (candidate) => candidate.className === 'designer-color-popover-toolbar',
    );
    const modes = descendants(popover).filter(
      (candidate) => candidate.className === 'designer-color-palette-mode',
    );
    const icons = descendants(popover).filter(
      (candidate) => candidate.className === 'designer-color-palette-mode-icon',
    );
    const radios = descendants(popover).filter(
      (candidate) => candidate.dataset.colorPaletteField === 'mode',
    );

    expect(toolbar).toBeDefined();
    expect(
      descendants(popover).some(
        (candidate) => candidate.className === 'designer-color-popover-heading',
      ),
    ).toBe(false);
    expect(modes).toHaveLength(3);
    expect(modes.map((mode) => mode.textContent)).toEqual(['', '', '']);
    expect(modes.map((mode) => mode.attributes.get('data-tip'))).toEqual([
      '单色',
      '线性渐变',
      '径向渐变',
    ]);
    expect(radios.map((radio) => radio.attributes.get('aria-label'))).toEqual([
      '单色',
      '线性渐变',
      '径向渐变',
    ]);
    expect(icons).toHaveLength(3);
    expect(
      icons.every((icon) =>
        ((icon as FakeElement & { readonly innerHTML?: string }).innerHTML ?? '').includes('<svg'),
      ),
    ).toBe(true);
  });

  it('renders precise channels and quick colors while preserving the original proxy contract', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233');
    const element = palette.element as unknown as FakeElement;
    const picker = byDataset(element, 'designerFillColorPicker');
    const channels = descendants(element).filter(
      (candidate) => candidate.dataset.fillColorChannel !== undefined,
    );
    const quickColors = descendants(element).filter(
      (candidate) => candidate.dataset.fillColorQuick !== undefined,
    );

    expect(picker).toBeDefined();
    expect(channels.map((channel) => channel.dataset.fillColorChannel)).toEqual([
      'hex',
      'r',
      'g',
      'b',
      'a',
    ]);
    expect(quickColors).toHaveLength(9);
    expect(palette.controls.some((control) => control.dataset.colorPaletteField === 'solid')).toBe(
      true,
    );

    quickColors[1]!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(readDesignerColorPaletteValue(byField(element, 'solid')!)).toBe('#39c5bb');
  });

  it('keeps the fill picker but omits gradient modes for solid-only color fields', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #112233 0%, #ffffff 100%)',
      'chart:grid-color',
      { allowGradient: false },
    );
    const element = palette.element as unknown as FakeElement;

    expect(element.dataset.colorPaletteMode).toBe('solid');
    expect(byField(element, 'mode')).toBeUndefined();
    expect(byDataset(element, 'designerFillColorPicker')).toBeDefined();
    expect(readDesignerColorPaletteValue(palette.controls[0]!)).toBe('#112233');
  });

  it('restores an open popover when a committed color rerenders the same field', () => {
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#112233',
      'title:style:color',
    ).element as unknown as FakeElement;
    byAction(first, 'toggle')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(byDataset(first, 'colorPalettePopover')?.dataset.designerScrollScope).toBe(
      'color-palette:title:style:color',
    );

    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#39c5bb',
      'title:style:color',
    ).element as unknown as FakeElement;
    expect(rerendered.dataset.colorPaletteOpen).toBe('true');
    expect(byAction(rerendered, 'toggle')?.attributes.get('aria-expanded')).toBe('true');
    expect(
      (byDataset(rerendered, 'colorPalettePopover') as FakeElement & { hidden: boolean }).hidden,
    ).toBe(false);

    byAction(rerendered, 'close')!.dispatchEvent(new Event('click', { bubbles: true }));
    const closed = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#39c5bb',
      'title:style:color',
    ).element as unknown as FakeElement;
    expect(closed.dataset.colorPaletteOpen).toBe('false');
  });

  it('restores an achromatic picker hue when the same field rerenders', () => {
    const ownerDocument = new FakeDocument();
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ffffff',
      'title:style:color',
    ).element as unknown as FakeElement;
    const firstHue = descendants(first).find((candidate) =>
      candidate.className.split(/\s+/).includes('designer-fill-color-hue'),
    )!;
    firstHue.value = '180';
    firstHue.dispatchEvent(new Event('input'));
    expect(firstHue.value).toBe('180');

    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ffffff',
      'title:style:color',
    ).element as unknown as FakeElement;
    const rerenderedHue = descendants(rerendered).find((candidate) =>
      candidate.className.split(/\s+/).includes('designer-fill-color-hue'),
    )!;
    expect(rerenderedHue.value).toBe('180');
  });

  it('keeps hue stationary while the color plane changes saturation and value', () => {
    const ownerDocument = new FakeDocument();
    const fieldKey = 'title:style:color';
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#0b1324',
      fieldKey,
    ).element as unknown as FakeElement;
    const plane = descendants(palette).find(
      (candidate) => candidate.className === 'designer-fill-color-plane',
    )!;
    const hue = descendants(palette).find((candidate) =>
      candidate.className.split(/\s+/).includes('designer-fill-color-hue'),
    )!;

    expect(hue.value).toBe('221');
    plane.dispatchEvent(
      documentPointerEvent('pointerdown', plane, 'mouse', { clientX: 10, clientY: 86 }),
    );
    expect(hue.value).toBe('221');
    plane.dispatchEvent(
      documentPointerEvent('pointermove', plane, 'mouse', { clientX: 20, clientY: 86 }),
    );
    expect(hue.value).toBe('221');
    plane.dispatchEvent(
      documentPointerEvent('pointerup', plane, 'mouse', { clientX: 20, clientY: 86 }),
    );
    expect(hue.value).toBe('221');

    const committed = readDesignerColorPaletteValue(byField(palette, 'solid')!);
    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      committed,
      fieldKey,
    ).element as unknown as FakeElement;
    const rerenderedHue = descendants(rerendered).find((candidate) =>
      candidate.className.split(/\s+/).includes('designer-fill-color-hue'),
    )!;
    expect(rerenderedHue.value).toBe('221');
  });

  it('keeps the color plane thumb at the dragged position when RGB quantizes to black', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ff0000',
      'title:style:color',
    ).element as unknown as FakeElement;
    const plane = descendants(palette).find(
      (candidate) => candidate.className === 'designer-fill-color-plane',
    )!;
    const picker = byDataset(palette, 'designerFillColorPicker')!;

    plane.dispatchEvent(
      documentPointerEvent('pointerdown', plane, 'mouse', { clientX: 75, clientY: 100 }),
    );

    expect(picker.attributes.get('style')).toContain('--designer-fill-saturation:75');
    expect(picker.attributes.get('style')).toContain('--designer-fill-value:0');
    expect(plane.attributes.get('aria-valuetext')).toBe('饱和度 75%，明度 0%');
  });

  it('restores the bottom-plane position after a palette re-render', () => {
    const ownerDocument = new FakeDocument();
    const fieldKey = 'title:style:color';
    const first = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#ff0000',
      fieldKey,
    );
    const firstElement = first.element as unknown as FakeElement;
    const firstPlane = descendants(firstElement).find(
      (candidate) => candidate.className === 'designer-fill-color-plane',
    )!;
    firstPlane.dispatchEvent(
      documentPointerEvent('pointerdown', firstPlane, 'mouse', { clientX: 75, clientY: 100 }),
    );
    expect(readDesignerColorPaletteValue(first.controls[0]!)).toBe('#000000');

    const rerendered = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#000000',
      fieldKey,
    ).element as unknown as FakeElement;
    const picker = byDataset(rerendered, 'designerFillColorPicker')!;
    expect(picker.attributes.get('style')).toContain('--designer-fill-saturation:75');
    expect(picker.attributes.get('style')).toContain('--designer-fill-value:0');
  });

  it('keeps the anchored popover open when its inspector pane scrolls', () => {
    const ownerDocument = new FakeDocument();
    const pane = ownerDocument.createElement('div');
    pane.dataset.inspectorPane = 'appearance';
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      '#112233',
      'title:style:color',
    ).element as unknown as FakeElement;
    pane.appendChild(palette);

    byAction(palette, 'toggle')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(palette.dataset.colorPaletteOpen).toBe('true');
    pane.dispatchEvent(new Event('scroll'));
    expect(palette.dataset.colorPaletteOpen).toBe('true');
  });

  it.each(['pointerup', 'pointercancel', 'lostpointercapture'] as const)(
    'releases the color plane drag on %s and keeps achromatic hue editable',
    (terminalEvent) => {
      const ownerDocument = new FakeDocument();
      const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#ffffff')
        .element as unknown as FakeElement;
      const plane = descendants(palette).find(
        (candidate) => candidate.className === 'designer-fill-color-plane',
      )!;
      const hue = descendants(palette).find((candidate) =>
        candidate.className.split(/\s+/).includes('designer-fill-color-hue'),
      )!;
      const outside = { clientX: -100, clientY: -100 };

      plane.dispatchEvent(documentPointerEvent('pointerdown', plane, 'mouse', outside));
      expect(plane.hasPointerCapture(7)).toBe(true);
      plane.dispatchEvent(documentPointerEvent('pointermove', plane, 'mouse', outside));
      if (terminalEvent === 'lostpointercapture') plane.capturedPointers.delete(7);
      plane.dispatchEvent(documentPointerEvent(terminalEvent, plane, 'mouse', outside));
      expect(plane.hasPointerCapture(7)).toBe(false);

      hue.value = '180';
      hue.dispatchEvent(new Event('input'));
      expect(hue.value).toBe('180');
      plane.dispatchEvent(
        documentPointerEvent('pointermove', plane, 'mouse', { clientX: 75, clientY: 25 }),
      );
      expect(hue.value).toBe('180');
    },
  );

  it.each(['mouse', 'touch'] as const)(
    'consumes the first %s pointer sequence outside the open popover',
    (pointerType) => {
      const ownerDocument = new FakeDocument();
      const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233')
        .element as unknown as FakeElement;
      const outside = ownerDocument.createElement('button');
      const activations = { pointerdown: 0, pointerup: 0, click: 0 };
      for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
        ownerDocument.addEventListener(type, () => {
          activations[type] += 1;
        });
      }

      byAction(palette, 'toggle')!.dispatchEvent(new Event('click', { bubbles: true }));
      expect(palette.dataset.colorPaletteOpen).toBe('true');

      for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
        const event = documentPointerEvent(type, outside, pointerType);
        expect(ownerDocument.dispatchEvent(event)).toBe(false);
      }
      expect(palette.dataset.colorPaletteOpen).toBe('false');
      expect(activations).toEqual({ pointerdown: 0, pointerup: 0, click: 0 });

      for (const type of ['pointerdown', 'pointerup', 'click'] as const) {
        ownerDocument.dispatchEvent(documentPointerEvent(type, outside, pointerType));
      }
      expect(activations).toEqual({ pointerdown: 1, pointerup: 1, click: 1 });
    },
  );

  it('keeps Escape dismissal keyboard-only and returns focus to the trigger', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#112233')
      .element as unknown as FakeElement;
    const trigger = byAction(palette, 'toggle')!;
    const outside = ownerDocument.createElement('button');
    let outsideClicks = 0;
    ownerDocument.addEventListener('click', () => {
      outsideClicks += 1;
    });

    trigger.dispatchEvent(new Event('click', { bubbles: true }));
    const escape = documentKeyboardEvent('Escape', outside);
    expect(ownerDocument.dispatchEvent(escape)).toBe(false);
    expect(palette.dataset.colorPaletteOpen).toBe('false');
    expect(trigger.focused).toBe(true);

    ownerDocument.dispatchEvent(documentPointerEvent('click', outside, 'mouse'));
    expect(outsideClicks).toBe(1);
  });

  it('puts stop position, mode parameters, and stop actions in one compact toolbar', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    const stopColor = byField(element, 'stop-color')!;
    const stopPosition = byField(element, 'stop-position')!;
    expect(stopPosition.closest('.designer-color-palette-stop-editor')).toBe(
      stopColor.closest('.designer-color-palette-stop-editor'),
    );
    const stopAlpha = byField(element, 'stop-alpha')!;
    const stopBar = stopPosition.closest('.designer-color-palette-stop-bar');
    expect(stopBar).not.toBeNull();
    for (const control of [
      stopAlpha,
      byField(element, 'angle'),
      byField(element, 'x'),
      byField(element, 'y'),
      byAction(element, 'add-stop'),
      byAction(element, 'remove-stop'),
    ]) {
      expect(control?.closest('.designer-color-palette-stop-bar')).toBe(stopBar);
    }

    // 径向中心保留完整 aria-label，但视觉标签缩短为 X/Y。
    expect(byField(element, 'x')?.attributes.get('aria-label')).toBe('中心 X');
    expect(byField(element, 'y')?.attributes.get('aria-label')).toBe('中心 Y');
    expect(
      byField(element, 'x')?.closest('.designer-color-palette-field-inline')?.children[0]
        ?.textContent,
    ).toBe('X');
    expect(
      byField(element, 'y')?.closest('.designer-color-palette-field-inline')?.children[0]
        ?.textContent,
    ).toBe('Y');
  });
});
