export const MIN_COLOR_PALETTE_STOPS = 2;
export const MAX_COLOR_PALETTE_STOPS = 8;

export type ColorPaletteMode = 'solid' | 'linear-gradient' | 'radial-gradient';

export type ColorPaletteManualValueField = 'solid-value' | 'stop-value';

export interface ColorPaletteStop {
  readonly color: string;
  readonly position: number;
}

export interface ColorPaletteState {
  readonly mode: ColorPaletteMode;
  readonly solid: string;
  readonly stops: readonly ColorPaletteStop[];
  readonly angle: number;
  readonly x: number;
  readonly y: number;
}

export interface DesignerColorPalette {
  readonly element: HTMLElement;
  readonly controls: readonly HTMLInputElement[];
}

export interface DesignerColorPaletteOptions {
  /** 缺省展示完整填充控件；传 false 时保留同一控件外观但只提供纯色编辑。 */
  readonly allowGradient?: boolean;
}

export const DEFAULT_COLOR = '#000000';
const DEFAULT_END_COLOR = '#ffffff';
const COLOR_PATTERN = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|transparent)$/i;
// 草稿缓存为模块级（多设计器实例共享）：以 FIFO 上限约束长会话内存增长，
// 超限时淘汰最早写入的字段草稿（被淘汰字段回退为从文档值重新解析）。
export const MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES = 32;
const paletteDraftCache = new Map<string, ColorPaletteState>();
const paletteSelectionCache = new Map<string, number>();
const paletteHueCache = new Map<string, { readonly hue: number; readonly color: string }>();
const palettePlaneCache = new Map<
  string,
  { readonly saturation: number; readonly value: number; readonly color: string }
>();
export function cacheColorPaletteDraft(fieldKey: string, state: ColorPaletteState): void {
  if (paletteDraftCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES) {
    const oldest = paletteDraftCache.keys().next().value;
    if (oldest !== undefined) {
      paletteDraftCache.delete(oldest);
      paletteSelectionCache.delete(oldest);
      paletteHueCache.delete(oldest);
      palettePlaneCache.delete(oldest);
    }
  }
  paletteDraftCache.set(fieldKey, state);
}

export function cacheColorPaletteSelection(fieldKey: string, index: number): void {
  if (paletteSelectionCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES) {
    const oldest = paletteSelectionCache.keys().next().value;
    if (oldest !== undefined) paletteSelectionCache.delete(oldest);
  }
  paletteSelectionCache.set(fieldKey, index);
}

export function cacheColorPaletteHue(fieldKey: string, hue: number, color: string): void {
  if (
    !paletteHueCache.has(fieldKey) &&
    paletteHueCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES
  ) {
    const oldest = paletteHueCache.keys().next().value;
    if (oldest !== undefined) paletteHueCache.delete(oldest);
  }
  paletteHueCache.set(fieldKey, { hue, color: color.toLowerCase() });
}

export function cacheColorPalettePlane(
  fieldKey: string,
  saturation: number,
  value: number,
  color: string,
): void {
  if (
    !palettePlaneCache.has(fieldKey) &&
    palettePlaneCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES
  ) {
    const oldest = palettePlaneCache.keys().next().value;
    if (oldest !== undefined) palettePlaneCache.delete(oldest);
  }
  palettePlaneCache.set(fieldKey, {
    saturation,
    value,
    color: color.toLowerCase(),
  });
}

export function clearColorPaletteDraftCache(): void {
  paletteDraftCache.clear();
  paletteSelectionCache.clear();
  paletteHueCache.clear();
  palettePlaneCache.clear();
}

/** 测试支撑面：草稿/选中缓存当前条目数（与 clearColorPaletteDraftCache 配套）。 */
export function colorPaletteDraftCacheSizes(): {
  readonly drafts: number;
  readonly selections: number;
} {
  return { drafts: paletteDraftCache.size, selections: paletteSelectionCache.size };
}

export function colorPaletteDraft(fieldKey: string): ColorPaletteState | undefined {
  return paletteDraftCache.get(fieldKey);
}

export function colorPaletteSelection(fieldKey: string): number | undefined {
  return paletteSelectionCache.get(fieldKey);
}

export function colorPaletteHue(
  fieldKey: string,
): { readonly hue: number; readonly color: string } | undefined {
  return paletteHueCache.get(fieldKey);
}

export function colorPalettePlane(
  fieldKey: string,
): { readonly saturation: number; readonly value: number; readonly color: string } | undefined {
  return palettePlaneCache.get(fieldKey);
}

export function parseColorPaletteValue(value: string | undefined): ColorPaletteState {
  const fallback: Omit<ColorPaletteState, 'mode'> = {
    solid: isValidColor(value) ? value! : DEFAULT_COLOR,
    stops: [
      { color: DEFAULT_COLOR, position: 0 },
      { color: DEFAULT_END_COLOR, position: 100 },
    ],
    angle: 90,
    x: 50,
    y: 50,
  };
  const linear = parseGradientString(value, 'linear-gradient');
  if (linear !== undefined) {
    return { mode: 'linear-gradient', ...fallback, angle: linear.angle!, stops: linear.stops };
  }
  const radial = parseGradientString(value, 'radial-gradient');
  if (radial !== undefined) {
    return {
      mode: 'radial-gradient',
      ...fallback,
      x: radial.x!,
      y: radial.y!,
      stops: radial.stops,
    };
  }
  return { mode: 'solid', ...fallback };
}

export function serializeColorPaletteValue(state: ColorPaletteState): string {
  if (state.mode === 'solid') return state.solid;
  const stops = state.stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ');
  if (state.mode === 'linear-gradient') {
    return `linear-gradient(${state.angle}deg, ${stops})`;
  }
  return `radial-gradient(circle at ${state.x}% ${state.y}%, ${stops})`;
}

export function addColorPaletteStop(state: ColorPaletteState): ColorPaletteState | undefined {
  if (state.stops.length >= MAX_COLOR_PALETTE_STOPS) return undefined;
  const gap = largestGap(state.stops);
  if (gap === undefined) return undefined;
  const stops = [...state.stops];
  const stop: ColorPaletteStop = { color: DEFAULT_END_COLOR, position: gap.position };
  stops.splice(gap.index, 0, stop);
  return { ...state, stops };
}

export function removeColorPaletteStop(
  state: ColorPaletteState,
  index: number,
): ColorPaletteState | undefined {
  if (state.stops.length <= MIN_COLOR_PALETTE_STOPS || state.stops[index] === undefined) {
    return undefined;
  }
  return { ...state, stops: state.stops.filter((_, stopIndex) => stopIndex !== index) };
}

export function updateColorPaletteStop(
  state: ColorPaletteState,
  index: number,
  patch: Partial<Pick<ColorPaletteStop, 'color' | 'position'>>,
): ColorPaletteState | undefined {
  const stop = state.stops[index];
  if (stop === undefined) return undefined;
  const color = patch.color === undefined ? stop.color : patch.color;
  if (!isValidColor(color)) return undefined;
  const position =
    patch.position === undefined
      ? stop.position
      : clampStopPosition(state.stops, index, patch.position);
  if (position === undefined) return undefined;
  const stops = state.stops.map((item, stopIndex) =>
    stopIndex === index ? { color, position } : item,
  );
  return { ...state, stops };
}

/**
 * 切换调色板模式并共享状态（双向：ADR-0057 派生 + 反向共享）：
 * - 单色 -> 渐变且色标还是未定制的内置默认时，按单色色系派生色标（ADR-0057）；
 *   已定制色标（非默认）原样保留。
 * - 渐变 -> 单色时，把选中色标的完整色值（含 alpha）同步为单色（反向
 *   共享，见 unified-color-palette spec 第 6 节）；选中色标为 transparent/非法色值时保持原单色。
 * `previousMode` 是切换前的面板模式（mode radio 的 change 触发时其 checked 已是新值，
 * 需从记录面板模式的 dataset 读取上一次模式）；`selectedStopIndex` 为渐变侧选中
 * 色标索引（越界由 `solidFromColorPaletteStops` 回夹）。
 */
export function switchColorPaletteMode(
  state: ColorPaletteState,
  nextMode: ColorPaletteMode,
  previousMode: ColorPaletteMode,
  selectedStopIndex = 0,
): ColorPaletteState {
  if (nextMode !== 'solid' && previousMode === 'solid' && isDefaultColorPaletteStops(state.stops)) {
    const stops = deriveColorPaletteStopsFromSolid(state.solid);
    if (stops !== undefined) return { ...state, mode: nextMode, stops };
  }
  if (nextMode === 'solid' && previousMode !== 'solid') {
    const solid = solidFromColorPaletteStops(state, selectedStopIndex);
    if (solid !== undefined) return { ...state, mode: 'solid', solid };
  }
  return { ...state, mode: nextMode };
}

/**
 * 渐变 -> 单色的共享色值：选中色标（索引回夹到有效范围）的完整色值（含 alpha）。
 * `transparent` 或非法色值返回 undefined（调用方按既有规则保持原单色草稿）。
 */
function solidFromColorPaletteStops(state: ColorPaletteState, index: number): string | undefined {
  if (state.stops.length === 0) return undefined;
  const clamped = Math.min(
    Math.max(Number.isInteger(index) ? index : 0, 0),
    state.stops.length - 1,
  );
  const color = state.stops[clamped]?.color;
  return color !== undefined && color.toLowerCase() !== 'transparent' && isValidColor(color)
    ? color
    : undefined;
}

/**
 * 从单色派生同色系渐变色标（起点 = 单色，终点 = 向白混合 45% 的提亮；提亮与起点
 * 无区分度时向黑混合 35% 加深）。仅接受 #rgb/#rgba/#rrggbb/#rrggbbaa；transparent
 * 或不可解析返回 undefined（调用方保持默认色标）。
 */
export function deriveColorPaletteStopsFromSolid(
  solid: string,
): readonly ColorPaletteStop[] | undefined {
  const rgb = hexToRgb(solid);
  if (rgb === undefined) return undefined;
  const suffix = rgb.alpha === undefined ? '' : rgb.alpha;
  const start = `${rgbToHex(rgb.r, rgb.g, rgb.b)}${suffix}`;
  const light = `${mixRgbHex(rgb, 255, 0.45)}${suffix}`;
  const end = light === start ? `${mixRgbHex(rgb, 0, 0.35)}${suffix}` : light;
  return [
    { color: start, position: 0 },
    { color: end, position: 100 },
  ];
}

export function isColorPaletteMode(value: string | undefined): value is ColorPaletteMode {
  return value === 'solid' || value === 'linear-gradient' || value === 'radial-gradient';
}

function parseGradientString(
  value: string | undefined,
  kind: 'linear-gradient' | 'radial-gradient',
): { angle?: number; x?: number; y?: number; stops: readonly ColorPaletteStop[] } | undefined {
  if (value === undefined) return undefined;
  const linear =
    kind === 'linear-gradient'
      ? value.match(/^linear-gradient\((\d+(?:\.\d+)?)deg,\s*(.+)\)$/i)
      : null;
  if (linear !== null && linear !== undefined) {
    const stops = parseStops(linear[2]!);
    if (stops === undefined) return undefined;
    const angle = Number(linear[1]);
    return Number.isFinite(angle) && angle >= 0 && angle <= 360 ? { angle, stops } : undefined;
  }
  const radial =
    kind === 'radial-gradient'
      ? value.match(/^radial-gradient\(circle at (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%,\s*(.+)\)$/i)
      : null;
  if (radial !== null && radial !== undefined) {
    const stops = parseStops(radial[3]!);
    if (stops === undefined) return undefined;
    const x = Number(radial[1]);
    const y = Number(radial[2]);
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100
      ? { x, y, stops }
      : undefined;
  }
  return undefined;
}

function parseStops(part: string): readonly ColorPaletteStop[] | undefined {
  const tokens = part.split(',').map((token) => token.trim());
  if (tokens.length < MIN_COLOR_PALETTE_STOPS || tokens.length > MAX_COLOR_PALETTE_STOPS) {
    return undefined;
  }
  const stops: ColorPaletteStop[] = [];
  for (const token of tokens) {
    const match = token.match(
      /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|transparent)\s+(\d+(?:\.\d+)?)%$/i,
    );
    if (match === null) return undefined;
    const position = Number(match[2]);
    if (!Number.isInteger(position) || position < 0 || position > 100) return undefined;
    stops.push({ color: match[1]!.toLowerCase(), position });
  }
  if (!stops.every((stop, index) => index === 0 || stops[index - 1]!.position < stop.position)) {
    return undefined;
  }
  return stops;
}

function largestGap(
  stops: readonly ColorPaletteStop[],
): { readonly index: number; readonly position: number } | undefined {
  const bounds = [0, ...stops.map((stop) => stop.position), 100];
  let best: { index: number; position: number; size: number } | undefined;
  for (let index = 0; index < bounds.length - 1; index++) {
    const left = bounds[index]!;
    const right = bounds[index + 1]!;
    if (right - left < 2) continue;
    const midpoint = Math.floor((left + right) / 2);
    if (best === undefined || right - left > best.size) {
      best = { index, position: midpoint, size: right - left };
    }
  }
  return best === undefined ? undefined : { index: best.index, position: best.position };
}

function clampStopPosition(
  stops: readonly ColorPaletteStop[],
  index: number,
  position: number,
): number | undefined {
  if (!Number.isInteger(position) || position < 0 || position > 100) return undefined;
  const prev = index > 0 ? stops[index - 1]!.position : -1;
  const next = index < stops.length - 1 ? stops[index + 1]!.position : 101;
  const clamped = Math.min(Math.max(position, prev + 1), next - 1);
  return clamped >= prev + 1 && clamped <= next - 1 ? clamped : undefined;
}

export function isValidColor(value: string | undefined): value is string {
  return value !== undefined && COLOR_PATTERN.test(value);
}

function isDefaultColorPaletteStops(stops: readonly ColorPaletteStop[]): boolean {
  return (
    stops.length === 2 &&
    stops[0]?.color === DEFAULT_COLOR &&
    stops[0]?.position === 0 &&
    stops[1]?.color === DEFAULT_END_COLOR &&
    stops[1]?.position === 100
  );
}

export function hexToRgb(
  color: string | undefined,
):
  | { readonly r: number; readonly g: number; readonly b: number; readonly alpha?: string }
  | undefined {
  if (color === undefined) return undefined;
  const match = color.toLowerCase().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (match === null || match === undefined) return undefined;
  let value = match[1]!;
  if (value.length === 3 || value.length === 4) {
    value = [...value].map((character) => `${character}${character}`).join('');
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const alpha = value.length === 8 ? value.slice(6, 8) : undefined;
  return alpha === undefined ? { r, g, b } : { r, g, b, alpha };
}

function mixChannel(channel: number, target: number, ratio: number): number {
  return Math.round(channel + (target - channel) * ratio);
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function mixRgbHex(
  rgb: { readonly r: number; readonly g: number; readonly b: number },
  target: number,
  ratio: number,
): string {
  return rgbToHex(
    mixChannel(rgb.r, target, ratio),
    mixChannel(rgb.g, target, ratio),
    mixChannel(rgb.b, target, ratio),
  );
}
