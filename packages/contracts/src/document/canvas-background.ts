import { codePointLength, hasControlCharacter } from '../json/canonical.js';
import type { ScreenCanvasBackground } from '../types/document.js';
import { MAX_BACKGROUND_COLOR_CODE_POINTS } from './limits.js';
import { canvasBackgroundSchema } from './schema.js';

/**
 * 画布背景能力的唯一权威。
 *
 * 背景能力此前在五处各写一份：契约 schema、`core` 的 patch 白名单、设计器调色板、
 * 智能体规则/工具 schema、三个宿主的编译器。契约加渐变时，后两处不会报错——它们只是
 * 静默地少一个字段，于是"把背景改成渐变的蓝色"被回答成"画布只支持纯色"。
 *
 * 因此这里把三件事收敛成可被引用的单一来源：
 * - `SCREEN_CANVAS_FIELDS`：`update-canvas` patch 能写哪些键；
 * - `SCREEN_CANVAS_BACKGROUND_TYPES`：背景有哪几种形态（从 schema 派生，不手写）；
 * - `isScreenCanvasPaletteColor` / `isScreenCanvasBackground`：什么值算合法。
 *
 * 不在契约包内的一侧（示例后端是 CJS 且刻意不依赖契约）由根级 Vitest 绑定，
 * 见 `tests/examples/canvas-background-parity.test.ts`。
 */
export const SCREEN_CANVAS_FIELDS = [
  'width',
  'height',
  'backgroundColor',
  'background',
  'backgroundImage',
  'backgroundImageFit',
] as const;

/**
 * 背景形态清单从 zod schema 派生：新增一种背景时只改 schema，这里自动跟随，
 * 不会再出现「契约支持、消费方不知道」的清单副本。
 */
export const SCREEN_CANVAS_BACKGROUND_TYPES: readonly ScreenCanvasBackground['type'][] =
  canvasBackgroundSchema.options.map((option) => option.shape.type.value);

/**
 * 画布调色板可落盘的色值：`transparent` 或 3/4/6/8 位十六进制。
 *
 * 比 `backgroundColor` 的契约（有界字符串）更严：`#12345` 这类非法 CSS 值写进去不会报错，
 * 只会渲染成透明——那是最难排查的失败形态，所以入口处就拒掉。
 */
const CANVAS_PALETTE_COLOR_PATTERN =
  /^(?:transparent|#[0-9A-Fa-f]{3,4}|#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?)$/;

export function isScreenCanvasPaletteColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    codePointLength(value) <= MAX_BACKGROUND_COLOR_CODE_POINTS &&
    !hasControlCharacter(value) &&
    CANVAS_PALETTE_COLOR_PATTERN.test(value)
  );
}

/**
 * 完整的背景值判定：形状（类型/角度/色标位置）由 schema 把关，色值再由调色板规则收紧。
 *
 * 宿主与智能体都用它判定"模型给的这个背景能不能落盘"，避免各写一套"看起来差不多"的校验。
 */
export function isScreenCanvasBackground(value: unknown): value is ScreenCanvasBackground {
  const parsed = canvasBackgroundSchema.safeParse(value);
  if (!parsed.success) return false;
  return backgroundColors(parsed.data).every(isScreenCanvasPaletteColor);
}

function backgroundColors(background: ScreenCanvasBackground): readonly string[] {
  return background.type === 'solid'
    ? [background.color]
    : background.stops.map((stop) => stop.color);
}
