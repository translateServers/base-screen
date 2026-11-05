/**
 * 画布动作：把"把背景改成天蓝色""背景改成渐变的深蓝"这类句子翻成 `update-canvas` 的 patch。
 *
 * 纯粹是确定性解析——画布按钮不做语义理解，只认"背景色 / 渐变 / 背景图 / 去掉背景图"，
 * 认不出就返回 null，交给动作路由决定要不要问模型。
 *
 * 这里的背景能力必须与 canonical 契约一致（`ScreenCanvas.background` 的三种形态），
 * 否则用户说"改成渐变"只会得到一句"画布只支持纯色"——而这句拒绝原本就是错的。
 * 后端是 CJS 且刻意不依赖契约包，因此一致性由根级 Vitest 绑定：
 * 见 `tests/examples/canvas-background-parity.test.ts`。
 */

/** 色标：与契约 `ScreenCanvasColorStop` 同形。 */
export interface AgentCanvasColorStop {
  readonly color: string;
  readonly position: number;
}

/** 背景填充：与契约 `ScreenCanvasBackground` 同形的三种形态。 */
export type AgentCanvasBackground =
  | { readonly type: 'solid'; readonly color: string }
  | {
      readonly type: 'linear-gradient';
      readonly angle: number;
      readonly stops: readonly AgentCanvasColorStop[];
    }
  | {
      readonly type: 'radial-gradient';
      readonly position: { readonly x: number; readonly y: number };
      readonly stops: readonly AgentCanvasColorStop[];
    };

/** 只含本模块认识的键，避免把任意对象直接塞进 `update-canvas`。 */
export interface AgentCanvasPatch {
  readonly backgroundColor?: string;
  readonly background?: AgentCanvasBackground | null;
  readonly backgroundImage?: string | null;
  readonly backgroundImageFit?: 'cover' | 'contain' | null;
}

export interface AgentCanvasState {
  readonly backgroundColor?: string;
  /** 当前 `canvas.background` 原值：用来判"改成渐变"是不是真的变了。 */
  readonly background?: unknown;
  readonly hasBackgroundImage?: boolean;
}

const MAX_IMAGE_URL_LENGTH = 2048;
/** 与契约 `MAX_BACKGROUND_GRADIENT_STOPS` 同值：单条渐变最多 8 个色标。 */
export const MAX_GRADIENT_STOPS = 8;
const MAX_STOPS_IN_INSTRUCTION = 4;

const CANVAS_COLORS: readonly (readonly [string, string])[] = [
  ['天蓝', '#87ceeb'],
  ['天空蓝', '#87ceeb'],
  ['浅蓝', '#a9c8f5'],
  ['淡蓝', '#a9c8f5'],
  ['深蓝', '#16305c'],
  ['藏青', '#1e293b'],
  ['米', '#f2ead8'],
  ['粉', '#f5c2d1'],
  ['红', '#d64545'],
  ['蓝', '#3b82f6'],
  ['绿', '#3fae6a'],
  ['白', '#ffffff'],
  ['黑', '#0b1020'],
  ['黄', '#f4c542'],
  ['橙', '#ef8a3c'],
  ['紫', '#8b7cf6'],
  ['灰', '#8b97a8'],
];

/** 背景指令的公因式：`(把/将)? [画布/页面/大屏/屏幕/整屏] 的? 背景[色] 改/换/设为 + 值`。 */
const BACKGROUND_INSTRUCTION_PATTERN =
  /^(?:把|将)?\s*(?:画布|页面|大屏|屏幕|整屏)?\s*的?\s*(?:背景|底色)(?:颜色|色)?\s*(?:改|换|设|调|变)(?:为|成|到|一下)?\s*(.+)$/;

/**
 * 识别画布指令；与当前值相同或认不出时返回 null。
 *
 * 返回 null 的两种情况要分开看：认不出（交给路由）与没变化（不提交空提案）。调用方
 * 用 `isCanvasInstruction` 区分——它只判"像不像画布指令"，不看当前值。
 */
export function matchCanvasInstruction(
  text: string,
  current: AgentCanvasState = {},
): AgentCanvasPatch | null {
  const patch = parseCanvasInstruction(text, current);
  if (patch === null) return null;
  return canvasPatchChanges(patch, current) ? patch : null;
}

/** 只判语义，不看当前值：路由用它决定"要不要跳过模型"。 */
export function isCanvasInstruction(text: string): boolean {
  return parseCanvasInstruction(text, {}) !== null;
}

export function canvasPatchChanges(patch: AgentCanvasPatch, current: AgentCanvasState): boolean {
  if (patch.backgroundColor !== undefined && patch.backgroundColor !== current.backgroundColor) {
    return true;
  }
  if (patch.background !== undefined) {
    // 渐变是整值：色标/角度任一不同都算变，全等才算"已经是这样了"。
    return patch.background !== null && !jsonEquals(patch.background, current.background);
  }
  if (patch.backgroundImage === null) {
    return current.hasBackgroundImage === true;
  }
  return patch.backgroundImage !== undefined;
}

function parseCanvasInstruction(text: string, current: AgentCanvasState): AgentCanvasPatch | null {
  const trimmed = text.trim();

  // 去掉背景图：语义明确，即使当前没有图也算画布指令（只是不会产生变更）。
  if (/(?:去掉|删除|清除|取消|移除)\s*(?:背景图|背景图片|底图)/.test(trimmed)) {
    return { backgroundImage: null, backgroundImageFit: null };
  }

  if (/(?:背景图|背景图片|底图)/.test(trimmed)) {
    const url = extractImageUrl(trimmed);
    if (url !== null) return { backgroundImage: url, backgroundImageFit: 'cover' };
  }

  return extractBackgroundValue(trimmed, current);
}

/** 背景值的落点按值本身分：含「渐变」走 fill，其余按纯色。 */
function extractBackgroundValue(text: string, current: AgentCanvasState): AgentCanvasPatch | null {
  const match = text.match(BACKGROUND_INSTRUCTION_PATTERN);
  if (match === null) return null;
  const value = (match[1] ?? '').trim().replace(/[。.!！?？]+$/g, '');
  if (value === '') return null;
  if (value.includes('渐变')) {
    const background = parseGradient(value, current);
    return background === null ? null : { background };
  }
  const color = parseCanvasColor(value);
  return color === null ? null : { backgroundColor: color };
}

/**
 * 「渐变的 X 色」「X 色渐变」「从 A 到 B 的渐变」→ 契约里的背景值。
 *
 * 只说"渐变"没给颜色时，以当前底色为起点——这也正是用户对"就加个渐变"的预期。
 */
export function parseGradient(
  value: string,
  current: AgentCanvasState = {},
): AgentCanvasBackground | null {
  const stops = parseGradientStops(value, current);
  if (stops === null) return null;
  if (/(?:径向|圆形)/.test(value)) {
    return { type: 'radial-gradient', position: { x: 50, y: 50 }, stops };
  }
  return { type: 'linear-gradient', angle: gradientAngle(value), stops };
}

function parseGradientStops(
  value: string,
  current: AgentCanvasState,
): readonly AgentCanvasColorStop[] | null {
  // 「从 A 到 B（的渐变）」：两端都点名，按用户给的顺序落色标。
  const range = value.match(/从\s*(.+?)\s*(?:到|至)\s*(.+?)\s*(?:的)?渐变/);
  if (range !== null) {
    const from = parseCanvasColor(range[1] ?? '');
    const to = parseCanvasColor(range[2] ?? '');
    if (from === null || to === null) return null;
    return evenStops([from, to]);
  }

  // 单色：起点 = 用户说的颜色，终点 = 同色系提亮或压暗。
  const remainder = stripGradientWords(value);
  const named = parseCanvasColor(remainder);
  if (named !== null) return evenStops([named, gradientEndColor(named)]);

  // 没有点名颜色时只允许"整句都在说渐变"（"加个渐变""上下渐变"）。否则
  // "改成渐变，再加个图表"会被当成纯画布指令，把要动内容的那半句丢掉——
  // 与纯色规则一样，判定收窄到"只换背景"。
  if (remainder !== '') return null;
  const start = paletteColorOrUndefined(current.backgroundColor) ?? '#87ceeb';
  return evenStops([start, gradientEndColor(start)]);
}

function evenStops(colors: readonly string[]): readonly AgentCanvasColorStop[] {
  const bounded = colors.slice(0, Math.min(MAX_STOPS_IN_INSTRUCTION, MAX_GRADIENT_STOPS));
  return bounded.map((color, index) => ({
    color,
    position: Math.round((index * 100) / Math.max(1, bounded.length - 1)),
  }));
}

/** 中文方位词 → CSS 角度。「上下」是大屏最常见的默认，所以未指明时也用它。 */
function gradientAngle(value: string): number {
  if (/(?:左右|水平|横向|从左到右|向右)/.test(value)) return 90;
  if (/(?:对角|斜向|斜着)/.test(value)) return 135;
  if (/(?:从下到上|向上|反向)/.test(value)) return 0;
  return 180;
}

/** 去掉颜色词以外的语义词，剩下的交给颜色表；认不出就是没给颜色。 */
function stripGradientWords(value: string): string {
  return value
    .replace(/渐变/g, '')
    .replace(/(?:径向|圆形|线性)/g, '')
    .replace(/(?:上下|左右|水平|垂直|横向|纵向|对角|斜向|斜着|从下到上|向上|反向)/g, '')
    .replace(/[的]/g, '')
    .trim();
}

/**
 * 同色系第二色标：暗色向白提亮 35%，亮色向黑压暗 18%。
 *
 * 固定比例而不是"看起来差不多"的随机感：同一句话在任何时候都得到同一个文档，
 * 冒烟/回归测试才能比对。
 */
function gradientEndColor(color: string): string {
  const rgb = readHexColor(color);
  if (rgb === undefined) return color.toLowerCase() === '#ffffff' ? '#cbd5e1' : '#ffffff';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const lighten = luminance < 0.5;
  const ratio = lighten ? 0.35 : 0.18;
  const target = lighten ? 255 : 0;
  return toHex({
    r: mixChannel(rgb.r, target, ratio),
    g: mixChannel(rgb.g, target, ratio),
    b: mixChannel(rgb.b, target, ratio),
  });
}

function mixChannel(channel: number, target: number, ratio: number): number {
  return Math.round(channel + (target - channel) * ratio);
}

function readHexColor(value: string | undefined): { r: number; g: number; b: number } | undefined {
  if (value === undefined) return undefined;
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (match === null) return undefined;
  const digits = match[1] ?? '';
  const expanded =
    digits.length <= 4
      ? digits
          .split('')
          .map((digit) => `${digit}${digit}`)
          .join('')
      : digits;
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return undefined;
  return { r, g, b };
}

function toHex(rgb: { r: number; g: number; b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function paletteColorOrUndefined(value: string | undefined): string | undefined {
  return value === undefined ? undefined : (parseCanvasColor(value) ?? undefined);
}

export function parseCanvasColor(value: string): string | null {
  const trimmed = value.trim();
  // 只收合法 CSS 十六进制长度：`#12345` 这种值写进去不会报错、只会渲染成透明，
  // 与契约的调色板规则（`isScreenCanvasPaletteColor`）保持一致。
  const hex = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hex !== null) return hex[0].toLowerCase();
  const normalized = trimmed.replace(/\s+/g, '').replace(/色$/, '');
  return CANVAS_COLORS.find(([name]) => name === normalized)?.[1] ?? null;
}

function extractImageUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (match === null) return null;
  const url = match[0];
  if (url.length > MAX_IMAGE_URL_LENGTH) return null;
  return url;
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
