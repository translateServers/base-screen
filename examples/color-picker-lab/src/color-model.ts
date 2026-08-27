export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface HsvaColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
  readonly a: number;
}

export const DEFAULT_COLOR: RgbaColor = { r: 36, g: 131, b: 255, a: 1 };

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseHexColor(value: string): RgbaColor | undefined {
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

export function rgbaToHex(color: RgbaColor, includeAlpha = color.a < 0.999): string {
  const channels = [color.r, color.g, color.b].map((channel) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, '0'),
  );
  if (includeAlpha) {
    channels.push(
      Math.round(clamp(color.a, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    );
  }
  return `#${channels.join('')}`;
}

export function rgbaToCss(color: RgbaColor): string {
  if (color.a >= 0.999) return rgbaToHex(color, false);
  const alpha = Math.round(clamp(color.a, 0, 1) * 1000) / 1000;
  return `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)} / ${alpha})`;
}

export function rgbaToHsva(color: RgbaColor): HsvaColor {
  const red = clamp(color.r, 0, 255) / 255;
  const green = clamp(color.g, 0, 255) / 255;
  const blue = clamp(color.b, 0, 255) / 255;
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
    a: clamp(color.a, 0, 1),
  };
}

export function hsvaToRgba(color: HsvaColor): RgbaColor {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clamp(color.s, 0, 100) / 100;
  const value = clamp(color.v, 0, 100) / 100;
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
    a: clamp(color.a, 0, 1),
  };
}

export function interpolateColor(first: RgbaColor, second: RgbaColor, ratio: number): RgbaColor {
  const amount = clamp(ratio, 0, 1);
  return {
    r: Math.round(first.r + (second.r - first.r) * amount),
    g: Math.round(first.g + (second.g - first.g) * amount),
    b: Math.round(first.b + (second.b - first.b) * amount),
    a: first.a + (second.a - first.a) * amount,
  };
}
