import { afterEach, describe, expect, it } from 'vitest';
import {
  addColorPaletteStop,
  type ColorPaletteState,
  clearColorPaletteDraftCache,
  createDesignerColorPalette,
  deriveColorPaletteStopsFromSolid,
  MAX_COLOR_PALETTE_STOPS,
  parseColorPaletteValue,
  removeColorPaletteStop,
  serializeColorPaletteValue,
  switchColorPaletteMode,
  updateColorPaletteStop,
} from '../../../../src/browser/dom/color/designer-color-palette-dom.js';
import {
  byDataset,
  byField,
  descendants,
  FakeDocument,
  FakeElement,
  SOLID_STATE,
  stopRows,
} from './designer-color-palette-dom-fixture.js';

afterEach(() => clearColorPaletteDraftCache());

describe('parseColorPaletteValue', () => {
  it('keeps a valid solid color', () => {
    const state = parseColorPaletteValue('#123456');
    expect(state.mode).toBe('solid');
    expect(state.solid).toBe('#123456');
  });

  it('parses linear gradients with multiple stops', () => {
    const state = parseColorPaletteValue(
      'linear-gradient(135deg, #112233 0%, #ff0000 50%, #ffffff 100%)',
    );
    expect(state.mode).toBe('linear-gradient');
    expect(state.angle).toBe(135);
    expect(state.stops).toEqual([
      { color: '#112233', position: 0 },
      { color: '#ff0000', position: 50 },
      { color: '#ffffff', position: 100 },
    ]);
  });

  it('parses radial gradients with a center', () => {
    const state = parseColorPaletteValue(
      'radial-gradient(circle at 25% 75%, #112233 0%, transparent 100%)',
    );
    expect(state.mode).toBe('radial-gradient');
    expect(state.x).toBe(25);
    expect(state.y).toBe(75);
    expect(state.stops[1]?.color).toBe('transparent');
  });

  it('falls back to solid for malformed or unsorted gradients', () => {
    for (const value of [
      'linear-gradient(135deg, #112233 0%, #ffffff)',
      'linear-gradient(135deg, #112233 60%, #ffffff 40%)',
      'linear-gradient(999deg, #112233 0%, #ffffff 100%)',
      'linear-gradient(135deg, #112233 0%, #ffffff 50.5%)',
      'radial-gradient(at 50% 50%, #112233 0%, #ffffff 100%)',
      'url(https://x/bg.png)',
    ]) {
      expect(parseColorPaletteValue(value).mode).toBe('solid');
    }
  });
});

describe('serializeColorPaletteValue', () => {
  it('round-trips solid and both gradient modes', () => {
    expect(serializeColorPaletteValue(SOLID_STATE)).toBe('#112233');
    const linear: ColorPaletteState = {
      ...SOLID_STATE,
      mode: 'linear-gradient',
      angle: 45,
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ff0000', position: 50 },
        { color: '#ffffff', position: 100 },
      ],
    };
    const linearText = serializeColorPaletteValue(linear);
    expect(linearText).toBe('linear-gradient(45deg, #000000 0%, #ff0000 50%, #ffffff 100%)');
    expect(serializeColorPaletteValue(parseColorPaletteValue(linearText))).toBe(linearText);
    const radial: ColorPaletteState = {
      ...SOLID_STATE,
      mode: 'radial-gradient',
      x: 30,
      y: 70,
    };
    const radialText = serializeColorPaletteValue(radial);
    expect(radialText).toBe('radial-gradient(circle at 30% 70%, #000000 0%, #ffffff 100%)');
    expect(serializeColorPaletteValue(parseColorPaletteValue(radialText))).toBe(radialText);
  });
});

describe('gradient stop mutation helpers', () => {
  const gradient: ColorPaletteState = {
    ...SOLID_STATE,
    mode: 'linear-gradient',
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
  };

  it('adds a stop at the largest gap midpoint and respects the cap', () => {
    const added = addColorPaletteStop(gradient)!;
    expect(added.stops).toEqual([
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 50 },
      { color: '#ffffff', position: 100 },
    ]);
    let state = added;
    for (let index = 0; index < MAX_COLOR_PALETTE_STOPS - added.stops.length; index++) {
      const next = addColorPaletteStop(state);
      expect(next).toBeDefined();
      state = next!;
    }
    expect(state.stops).toHaveLength(MAX_COLOR_PALETTE_STOPS);
    expect(addColorPaletteStop(state)).toBeUndefined();
  });

  it('removes stops but never below the minimum', () => {
    const three: ColorPaletteState = {
      ...gradient,
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ff0000', position: 50 },
        { color: '#ffffff', position: 100 },
      ],
    };
    const removed = removeColorPaletteStop(three, 1)!;
    expect(removed.stops).toEqual([
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ]);
    expect(removeColorPaletteStop(removed, 0)).toBeUndefined();
    expect(removeColorPaletteStop(three, 5)).toBeUndefined();
  });

  it('clamps stop positions into the free gap and rejects invalid edits', () => {
    expect(updateColorPaletteStop(gradient, 0, { position: 40 })?.stops[0]?.position).toBe(40);
    expect(updateColorPaletteStop(gradient, 0, { position: 80 })?.stops[0]?.position).toBe(80);
    expect(updateColorPaletteStop(gradient, 0, { position: -5 })).toBeUndefined();
    expect(updateColorPaletteStop(gradient, 0, { position: 150 })).toBeUndefined();
    expect(updateColorPaletteStop(gradient, 0, { color: 'not-a-color' })).toBeUndefined();
    expect(updateColorPaletteStop(gradient, 0, { position: 12.5 })).toBeUndefined();
  });
});

describe('createDesignerColorPalette', () => {
  it('renders three modes, a shared stop slider, and gradient parameters', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(45deg, #000000 0%, #ff0000 50%, #ffffff 100%)',
    );
    const element = palette.element as unknown as FakeElement;
    expect(element.dataset.colorPaletteMode).toBe('linear-gradient');
    const modes = descendants(element).filter(
      (candidate) => candidate.dataset.colorPaletteField === 'mode',
    );
    expect(modes.map((mode) => mode.value)).toEqual([
      'solid',
      'linear-gradient',
      'radial-gradient',
    ]);
    expect(modes.map((mode) => mode.disabled)).toEqual([false, false, false]);
    expect(modes[1]?.checked).toBe(true);
    expect(byField(element, 'solid')?.value).toBe('#000000');
    expect(byField(element, 'angle')?.value).toBe('45');
    expect(byField(element, 'x')?.value).toBe('50');
    expect(byField(element, 'y')?.value).toBe('50');
    expect(stopRows(element)).toHaveLength(3);
    const handles = stopRows(element);
    expect(
      descendants(element).filter((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-stop-slider'),
      ),
    ).toHaveLength(1);
    expect(
      handles.map((handle) => [
        handle.dataset.colorPaletteStopMin,
        handle.dataset.colorPaletteStopMax,
        handle.dataset.colorPaletteStopPosition,
      ]),
    ).toEqual([
      ['0', '49', '0'],
      ['1', '99', '50'],
      ['51', '100', '100'],
    ]);
    expect(
      descendants(element).filter(
        (candidate) => candidate.dataset.colorPaletteField === 'stop-position',
      ),
    ).toHaveLength(1);
    expect(byDataset(element, 'colorPaletteAction')?.disabled).toBe(false);
    // modes(3) + solid(color/hex/alpha) + 色标编辑器(color/hex/alpha/position) + params(3)。
    expect(palette.controls).toHaveLength(3 + 3 + 4 + 3);
    expect(
      descendants(element).some((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-tools'),
      ),
    ).toBe(true);
    expect(
      descendants(element).some((candidate) =>
        candidate.className.split(/\s+/).includes('designer-color-palette-parameters'),
      ),
    ).toBe(true);
    expect(
      descendants(element).some(
        (candidate) =>
          candidate.tagName === 'span' &&
          candidate.className.split(/\s+/).includes('designer-color-palette-linear'),
      ),
    ).toBe(true);
    expect(
      descendants(element).some(
        (candidate) =>
          candidate.tagName === 'span' &&
          candidate.className.split(/\s+/).includes('designer-color-palette-radial'),
      ),
    ).toBe(true);
  });

  it('labels the angle, center, and stop fields so gradient parameters are discoverable', () => {
    const ownerDocument = new FakeDocument();
    const linear = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(45deg, #000000 0%, #ffffff 100%)',
    );
    const linearElement = linear.element as unknown as FakeElement;
    const labels = descendants(linearElement)
      .filter((candidate) => candidate.tagName === 'span')
      .map((candidate) => candidate.textContent);
    // 紧凑工具带保留位置/角度标签，径向轴用 X/Y 缩写并由 aria-label 补全语义。
    expect(labels).toContain('角度');
    expect(labels).toContain('X');
    expect(labels).toContain('Y');
    expect(labels).toContain('位置');
    expect(labels).toContain('透明度');
    // 颜色控件不再渲染可见「颜色」文字标签（hex 自明），改由 aria-label 提供语义。
    expect(labels).not.toContain('颜色');
    for (const field of ['solid', 'stop-color']) {
      const input = byField(linearElement, field)!;
      expect(input.attributes.get('aria-label')).toBe('颜色');
    }
    for (const field of ['solid-value', 'stop-value']) {
      const input = byField(linearElement, field)!;
      expect(input.type).toBe('text');
      expect(input.attributes.get('aria-label')).toBe('十六进制颜色');
    }
    expect(byField(linearElement, 'solid-alpha')?.attributes.get('aria-label')).toBe('透明度');
    expect(byField(linearElement, 'stop-alpha')?.attributes.get('aria-label')).toBe('透明度');
    expect(byField(linearElement, 'stop-position')?.attributes.get('aria-label')).toBe('位置');
    expect(byField(linearElement, 'angle')?.attributes.get('aria-label')).toBe('角度');
    expect(byField(linearElement, 'x')?.attributes.get('aria-label')).toBe('中心 X');
    expect(byField(linearElement, 'y')?.attributes.get('aria-label')).toBe('中心 Y');

    const radial = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'radial-gradient(circle at 25% 75%, #000000 0%, #ffffff 100%)',
    );
    const radialLabels = descendants(radial.element as unknown as FakeElement)
      .filter((candidate) => candidate.tagName === 'span')
      .map((candidate) => candidate.textContent);
    expect(radialLabels).toContain('角度');
    expect(radialLabels).toContain('X');
    expect(radialLabels).toContain('Y');
  });

  it('renders gradient controls even when the current value is a solid color', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(ownerDocument as unknown as Document, '#ff0000');
    const element = palette.element as unknown as FakeElement;
    expect(byField(element, 'solid')?.value).toBe('#ff0000');
    expect(byField(element, 'angle')).toBeDefined();
    expect(stopRows(element)).toHaveLength(2);
    expect(stopRows(element)).toHaveLength(2);
    expect(palette.controls).toHaveLength(3 + 3 + 4 + 3);
  });

  it('keeps the remove button disabled with the minimum stop count', () => {
    const ownerDocument = new FakeDocument();
    const palette = createDesignerColorPalette(
      ownerDocument as unknown as Document,
      'linear-gradient(90deg, #000000 0%, #ffffff 100%)',
    );
    const remove = descendants(palette.element as unknown as FakeElement).filter(
      (candidate) => candidate.dataset.colorPaletteAction === 'remove-stop',
    );
    expect(remove.map((button) => button.disabled)).toEqual([true]);
  });
});

describe('deriveColorPaletteStopsFromSolid', () => {
  it('derives a same-family tint from a regular solid color', () => {
    expect(deriveColorPaletteStopsFromSolid('#ff0000')).toEqual([
      { color: '#ff0000', position: 0 },
      { color: '#ff7373', position: 100 },
    ]);
  });

  it('derives visible stops for black and falls back to darkening for white', () => {
    expect(deriveColorPaletteStopsFromSolid('#000000')).toEqual([
      { color: '#000000', position: 0 },
      { color: '#737373', position: 100 },
    ]);
    expect(deriveColorPaletteStopsFromSolid('#ffffff')).toEqual([
      { color: '#ffffff', position: 0 },
      { color: '#a6a6a6', position: 100 },
    ]);
  });

  it('normalizes short hex and preserves alpha channels', () => {
    expect(deriveColorPaletteStopsFromSolid('#f00')).toEqual([
      { color: '#ff0000', position: 0 },
      { color: '#ff7373', position: 100 },
    ]);
    expect(deriveColorPaletteStopsFromSolid('#ff000080')).toEqual([
      { color: '#ff000080', position: 0 },
      { color: '#ff737380', position: 100 },
    ]);
  });

  it('returns undefined for transparent and unparseable solids', () => {
    for (const value of [
      'transparent',
      'not-a-color',
      'rgb(1, 2, 3)',
      undefined as unknown as string,
    ]) {
      expect(deriveColorPaletteStopsFromSolid(value)).toBeUndefined();
    }
  });
});

describe('switchColorPaletteMode', () => {
  const solidState: ColorPaletteState = {
    mode: 'solid',
    solid: '#123456',
    stops: [
      { color: '#000000', position: 0 },
      { color: '#ffffff', position: 100 },
    ],
    angle: 90,
    x: 50,
    y: 50,
  };

  it('derives default stops from the solid color on solid → gradient', () => {
    const linear = switchColorPaletteMode(solidState, 'linear-gradient', 'solid');
    expect(linear.mode).toBe('linear-gradient');
    expect(linear.stops).toEqual([
      { color: '#123456', position: 0 },
      { color: '#7d8fa2', position: 100 },
    ]);
    expect(linear.angle).toBe(90);
    const radial = switchColorPaletteMode(solidState, 'radial-gradient', 'solid');
    expect(radial.mode).toBe('radial-gradient');
    expect(radial.stops).toEqual(linear.stops);
    expect(radial.x).toBe(50);
    expect(radial.y).toBe(50);
  });

  it('keeps customized stops on solid → gradient and between gradients', () => {
    const customized: ColorPaletteState = {
      ...solidState,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 100 },
      ],
    };
    const gradient = switchColorPaletteMode(customized, 'linear-gradient', 'solid');
    expect(gradient.stops).toEqual(customized.stops);
    const radial = switchColorPaletteMode(gradient, 'radial-gradient', 'linear-gradient');
    expect(radial.stops).toEqual(customized.stops);
    expect(radial.angle).toBe(90);
  });

  it('derives exactly once: derived stops survive a solid round-trip', () => {
    const derived = switchColorPaletteMode(solidState, 'linear-gradient', 'solid');
    const back = switchColorPaletteMode(derived, 'solid', 'linear-gradient');
    expect(back.mode).toBe('solid');
    const again = switchColorPaletteMode(back, 'linear-gradient', 'solid');
    expect(again.stops).toEqual([
      { color: '#123456', position: 0 },
      { color: '#7d8fa2', position: 100 },
    ]);
  });

  it('does not derive when re-selecting the active mode', () => {
    expect(switchColorPaletteMode(solidState, 'solid', 'solid')).toEqual(solidState);
  });

  it('shares the selected stop color (with alpha) back to solid on gradient -> solid', () => {
    const gradient: ColorPaletteState = {
      ...solidState,
      mode: 'linear-gradient',
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff66', position: 100 },
      ],
    };
    const shared = switchColorPaletteMode(gradient, 'solid', 'linear-gradient', 1);
    expect(shared.mode).toBe('solid');
    expect(shared.solid).toBe('#0000ff66');
    // 共享只改单色值，色标草稿原样保留（再切回渐变不丢配置）。
    expect(shared.stops).toEqual(gradient.stops);
    expect(shared.angle).toBe(90);
    // 未传索引默认选中第 0 个；越界索引回夹到有效范围。
    expect(switchColorPaletteMode(gradient, 'solid', 'radial-gradient').solid).toBe('#ff0000');
    expect(switchColorPaletteMode(gradient, 'solid', 'linear-gradient', 9).solid).toBe('#0000ff66');
  });

  it('keeps the solid draft when the selected stop is transparent', () => {
    const transparent: ColorPaletteState = {
      ...solidState,
      mode: 'radial-gradient',
      solid: '#123456',
      stops: [
        { color: '#ff0000', position: 0 },
        { color: 'transparent', position: 100 },
      ],
    };
    expect(switchColorPaletteMode(transparent, 'solid', 'radial-gradient', 1).solid).toBe(
      '#123456',
    );
    // 未选中 transparent 色标时照常共享。
    expect(switchColorPaletteMode(transparent, 'solid', 'radial-gradient', 0).solid).toBe(
      '#ff0000',
    );
    const invalid: ColorPaletteState = {
      ...transparent,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: 'not-a-color', position: 100 },
      ],
    };
    expect(switchColorPaletteMode(invalid, 'solid', 'radial-gradient', 1).solid).toBe('#123456');
  });
});
