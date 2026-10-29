/**
 * WCAG 2.x 对比度计算：纯函数，无 DOM 依赖。
 *
 * 供设计器守卫与任何需要「从真实渲染颜色判定可读性」的调用方复用。
 * 只接受不透明颜色——带 alpha 的颜色需要知道背景才能合成，由测量层负责，避免这里猜。
 */

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const SHORT_HEX_PATTERN = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_PATTERN =
  /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([0-9.]+)(%?))?\s*\)$/i;

/** 解析不透明 CSS 颜色（`#rgb` / `#rrggbb` / `rgb()` / `rgba(..., 1)`），失败返回 undefined。 */
export function parseCssColor(value: string): RgbColor | undefined {
  const text = value.trim();
  const short = SHORT_HEX_PATTERN.exec(text);
  if (short !== null) {
    return {
      r: Number.parseInt(`${short[1]}${short[1]}`, 16),
      g: Number.parseInt(`${short[2]}${short[2]}`, 16),
      b: Number.parseInt(`${short[3]}${short[3]}`, 16),
    };
  }
  const hex = HEX_PATTERN.exec(text);
  if (hex !== null) {
    return {
      r: Number.parseInt(hex[1]!, 16),
      g: Number.parseInt(hex[2]!, 16),
      b: Number.parseInt(hex[3]!, 16),
    };
  }
  const rgb = RGB_PATTERN.exec(text);
  if (rgb !== null) {
    const alpha = rgb[4] === undefined ? 1 : rgb[5] === '%' ? Number(rgb[4]) / 100 : Number(rgb[4]);
    if (!Number.isFinite(alpha) || alpha < 1) return undefined;
    return {
      r: clampChannel(Number(rgb[1])),
      g: clampChannel(Number(rgb[2])),
      b: clampChannel(Number(rgb[3])),
    };
  }
  return undefined;
}

/** 解析 CSS 颜色并保留 alpha（0–1），供测量层逐级合成背景。 */
export function parseCssColorAlpha(
  value: string,
): { readonly color: RgbColor; readonly alpha: number } | undefined {
  const text = value.trim();
  if (text === 'transparent') return { color: { r: 0, g: 0, b: 0 }, alpha: 0 };
  const rgb = RGB_PATTERN.exec(text);
  if (rgb !== null) {
    const alpha = rgb[4] === undefined ? 1 : rgb[5] === '%' ? Number(rgb[4]) / 100 : Number(rgb[4]);
    if (!Number.isFinite(alpha)) return undefined;
    return {
      color: {
        r: clampChannel(Number(rgb[1])),
        g: clampChannel(Number(rgb[2])),
        b: clampChannel(Number(rgb[3])),
      },
      alpha: Math.min(1, Math.max(0, alpha)),
    };
  }
  const opaque = parseCssColor(text);
  return opaque === undefined ? undefined : { color: opaque, alpha: 1 };
}

/** 把一层带 alpha 的颜色合成到不透明底色上。 */
export function compositeOver(top: RgbColor, alpha: number, bottom: RgbColor): RgbColor {
  const mix = (a: number, b: number): number => a * alpha + b * (1 - alpha);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

export function formatCssColor(color: RgbColor): string {
  const hex = (channel: number): string =>
    Math.round(clampChannel(channel)).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

/** WCAG 相对亮度，输入通道范围 0–255。 */
export function relativeLuminance(color: RgbColor): number {
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

/** 对比度比值，范围 1–21。 */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 正文字号门槛：WCAG 把 ≥24px，或 ≥18.66px 且 ≥700 字重视为大字号（3:1），
 * 其余为普通文本（4.5:1）。
 */
export function minimumContrastRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? 3 : 4.5;
}

/**
 * 求满足门槛的最小改动颜色：保持色相趋势，把前景色向黑或白混合。
 * 返回 undefined 表示该背景上任何不透明颜色都达不到门槛。
 */
export function suggestReadableColor(
  foreground: RgbColor,
  background: RgbColor,
  minRatio: number,
): RgbColor | undefined {
  if (contrastRatio(foreground, background) >= minRatio) return foreground;
  const towardsBlack = contrastRatio({ r: 0, g: 0, b: 0 }, background);
  const towardsWhite = contrastRatio({ r: 255, g: 255, b: 255 }, background);
  const target = towardsBlack >= towardsWhite ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  if (Math.max(towardsBlack, towardsWhite) < minRatio) return undefined;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (contrastRatio(blend(foreground, target, middle), background) >= minRatio) high = middle;
    else low = middle;
  }
  // 通道取整会损失一点对比度，所以对取整后的颜色复核并按需继续推进，
  // 保证返回的颜色本身满足门槛，而不是只在浮点中间值上满足。
  for (let amount = high; amount <= 1; amount += 0.002) {
    const candidate = roundColor(blend(foreground, target, amount));
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return undefined;
}

/** 按 `amount`（0–1）把 `from` 混向 `to`，模拟颜色插值。 */
export function blend(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const mix = (a: number, b: number): number => a + (b - a) * amount;
  return { r: mix(from.r, to.r), g: mix(from.g, to.g), b: mix(from.b, to.b) };
}

function roundColor(color: RgbColor): RgbColor {
  return { r: Math.round(color.r), g: Math.round(color.g), b: Math.round(color.b) };
}

function linearize(channel: number): number {
  const ratio = clampChannel(channel) / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function clampChannel(channel: number): number {
  if (!Number.isFinite(channel)) return 0;
  return Math.min(255, Math.max(0, channel));
}
