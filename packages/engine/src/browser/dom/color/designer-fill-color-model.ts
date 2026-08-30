export interface DesignerFillRgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface DesignerFillHsvaColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
  readonly a: number;
}

export function clampDesignerFillColor(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseDesignerFillColor(value: string): DesignerFillRgbaColor | undefined {
  if (value.trim().toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = value.trim().replace(/^#/, '');
  if (![3, 4, 6, 8].includes(hex.length) || !/^[\da-f]+$/i.test(hex)) return undefined;
  const expanded =
    hex.length <= 4 ? [...hex].map((character) => character.repeat(2)).join('') : hex.toLowerCase();
  const withAlpha = expanded.length === 6 ? `${expanded}ff` : expanded;
  return {
    r: Number.parseInt(withAlpha.slice(0, 2), 16),
    g: Number.parseInt(withAlpha.slice(2, 4), 16),
    b: Number.parseInt(withAlpha.slice(4, 6), 16),
    a: Number.parseInt(withAlpha.slice(6, 8), 16) / 255,
  };
}

export function designerFillColorToHex(
  color: DesignerFillRgbaColor,
  includeAlpha = color.a < 0.999,
): string {
  const channels = [color.r, color.g, color.b].map((channel) =>
    Math.round(clampDesignerFillColor(channel, 0, 255))
      .toString(16)
      .padStart(2, '0'),
  );
  if (includeAlpha) {
    channels.push(
      Math.round(clampDesignerFillColor(color.a, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    );
  }
  return `#${channels.join('')}`;
}

export function designerFillRgbaToHsva(color: DesignerFillRgbaColor): DesignerFillHsvaColor {
  const red = clampDesignerFillColor(color.r, 0, 255) / 255;
  const green = clampDesignerFillColor(color.g, 0, 255) / 255;
  const blue = clampDesignerFillColor(color.b, 0, 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    if (maximum === blue) hue = 60 * ((red - green) / delta + 4);
  }
  return {
    h: hue < 0 ? hue + 360 : hue,
    s: maximum === 0 ? 0 : (delta / maximum) * 100,
    v: maximum * 100,
    a: clampDesignerFillColor(color.a, 0, 1),
  };
}

export function resolveDesignerFillHue(color: DesignerFillRgbaColor, fallbackHue = 0): number {
  const hsva = designerFillRgbaToHsva(color);
  return hsva.s > 0 && hsva.v > 0 ? hsva.h : clampDesignerFillColor(fallbackHue, 0, 360);
}

export function designerFillHsvaToRgba(color: DesignerFillHsvaColor): DesignerFillRgbaColor {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clampDesignerFillColor(color.s, 0, 100) / 100;
  const value = clampDesignerFillColor(color.v, 0, 100) / 100;
  const chroma = value * saturation;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  const [red, green, blue] =
    hue < 60
      ? [chroma, intermediate, 0]
      : hue < 120
        ? [intermediate, chroma, 0]
        : hue < 180
          ? [0, chroma, intermediate]
          : hue < 240
            ? [0, intermediate, chroma]
            : hue < 300
              ? [intermediate, 0, chroma]
              : [chroma, 0, intermediate];
  return {
    r: Math.round((red + offset) * 255),
    g: Math.round((green + offset) * 255),
    b: Math.round((blue + offset) * 255),
    a: clampDesignerFillColor(color.a, 0, 1),
  };
}
