import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';
import {
  bindDesignerColorPaletteDismiss,
  focusDesignerColorPaletteDialog,
  restoreDesignerColorPaletteOpen,
  setDesignerColorPaletteOpen,
} from './designer-color-popover-dom.js';
import {
  createDesignerFillColorPicker,
  setDesignerFillColorPickerDisabled,
  updateDesignerFillColorPicker,
} from './designer-fill-color-picker-dom.js';

export const MIN_COLOR_PALETTE_STOPS = 2;
export const MAX_COLOR_PALETTE_STOPS = 8;

export type ColorPaletteMode = 'solid' | 'linear-gradient' | 'radial-gradient';

type ColorPaletteManualValueField = 'solid-value' | 'stop-value';

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

const DEFAULT_COLOR = '#000000';
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
const colorPalettePickerProxyDispatch = new WeakSet<HTMLElement>();

function cacheColorPaletteDraft(fieldKey: string, state: ColorPaletteState): void {
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

function cacheColorPaletteSelection(fieldKey: string, index: number): void {
  if (paletteSelectionCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES) {
    const oldest = paletteSelectionCache.keys().next().value;
    if (oldest !== undefined) paletteSelectionCache.delete(oldest);
  }
  paletteSelectionCache.set(fieldKey, index);
}

function cacheColorPaletteHue(fieldKey: string, hue: number, color: string): void {
  if (
    !paletteHueCache.has(fieldKey) &&
    paletteHueCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES
  ) {
    const oldest = paletteHueCache.keys().next().value;
    if (oldest !== undefined) paletteHueCache.delete(oldest);
  }
  paletteHueCache.set(fieldKey, { hue, color: color.toLowerCase() });
}

function cacheColorPalettePlane(
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

function createColorPaletteTrigger(ownerDocument: Document, popoverId: string): HTMLButtonElement {
  const trigger = ownerDocument.createElement('button');
  trigger.type = 'button';
  trigger.className = 'designer-control designer-color-palette-trigger';
  trigger.dataset.colorPaletteAction = 'toggle';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', popoverId);
  trigger.setAttribute('aria-expanded', 'false');
  const swatch = ownerDocument.createElement('span');
  swatch.className = 'designer-color-palette-trigger-swatch designer-fill-color-checkerboard';
  swatch.dataset.colorPaletteTriggerSwatch = '';
  swatch.setAttribute('aria-hidden', 'true');
  const value = ownerDocument.createElement('span');
  value.className = 'designer-color-palette-trigger-value';
  value.dataset.colorPaletteTriggerValue = '';
  const icon = ownerDocument.createElement('span');
  icon.className = 'designer-color-palette-trigger-icon';
  icon.setAttribute('aria-hidden', 'true');
  trigger.appendChild(swatch);
  trigger.appendChild(value);
  trigger.appendChild(icon);
  return trigger;
}

function updateDesignerColorPaletteChrome(palette: HTMLElement, updatePicker = true): void {
  const state = readPaletteState(palette);
  if (state === undefined) return;
  const serialized = serializeColorPaletteValue(state);
  const trigger = palette.querySelector<HTMLButtonElement>('[data-color-palette-action="toggle"]');
  const swatch = palette.querySelector<HTMLElement>('[data-color-palette-trigger-swatch]');
  const value = palette.querySelector<HTMLElement>('[data-color-palette-trigger-value]');
  if (trigger !== null) {
    trigger.setAttribute(
      'aria-label',
      DESIGNER_UI_TEXT.propertiesPanel.colorPickerTrigger(serialized),
    );
    trigger.title = serialized;
  }
  if (swatch !== null) {
    swatch.setAttribute('style', `--designer-color-palette-value:${serialized}`);
  }
  if (value !== null) value.textContent = colorPaletteTriggerSummary(state);
  const picker = palette.querySelector<HTMLElement>('[data-designer-fill-color-picker]');
  if (picker !== null && updatePicker) {
    updateDesignerFillColorPicker(picker, activeDesignerColorPaletteValue(state, palette));
  }
}

function colorPaletteTriggerSummary(state: ColorPaletteState): string {
  if (state.mode === 'solid') return state.solid.toUpperCase();
  return state.mode === 'linear-gradient'
    ? DESIGNER_UI_TEXT.propertiesPanel.colorPickerLinearSummary(state.stops.length)
    : DESIGNER_UI_TEXT.propertiesPanel.colorPickerRadialSummary(state.stops.length);
}

function activeDesignerColorPaletteValue(state: ColorPaletteState, palette: HTMLElement): string {
  if (state.mode === 'solid') return state.solid;
  return state.stops[selectedColorPaletteStop(palette, state.stops.length)]?.color ?? state.solid;
}

function applyDesignerFillColorPickerValue(
  palette: HTMLElement,
  value: string,
  eventType: 'input' | 'change',
): void {
  const mode = palette.dataset.colorPaletteMode;
  const field: ColorPaletteManualValueField = mode === 'solid' ? 'solid-value' : 'stop-value';
  const manual = palette.querySelector<HTMLInputElement>(`[data-color-palette-field="${field}"]`);
  const color = palette.querySelector<HTMLInputElement>(
    `[data-color-palette-field="${mode === 'solid' ? 'solid' : 'stop-color'}"]`,
  );
  if (manual === null || color === null) return;
  colorPalettePickerProxyDispatch.add(palette);
  try {
    manual.value = value;
    syncColorPaletteManualValue(palette, manual, field);
    color.dispatchEvent(new Event(eventType, { bubbles: true }));
  } finally {
    colorPalettePickerProxyDispatch.delete(palette);
  }
}

function syncDesignerColorPaletteDisabled(palette: HTMLElement): void {
  const disabled = [
    ...palette.querySelectorAll<HTMLInputElement>('[data-color-palette-field]'),
  ].some((input) => input.disabled);
  const trigger = palette.querySelector<HTMLButtonElement>('[data-color-palette-action="toggle"]');
  if (trigger !== null && trigger.disabled !== disabled) trigger.disabled = disabled;
  const picker = palette.querySelector<HTMLElement>('[data-designer-fill-color-picker]');
  if (picker !== null) setDesignerFillColorPickerDisabled(picker, disabled);
  if (disabled) setDesignerColorPaletteOpen(palette, false);
}

export function createDesignerColorPalette(
  ownerDocument: Document,
  value: string | undefined,
  fieldKey?: string,
  options: DesignerColorPaletteOptions = {},
): DesignerColorPalette {
  const allowGradient = options.allowGradient !== false;
  const parsedValue = parseColorPaletteValue(value);
  const parsed = allowGradient ? parsedValue : solidColorPaletteState(parsedValue);
  const cached = fieldKey === undefined ? undefined : paletteDraftCache.get(fieldKey);
  // 仅当文档值仍等于缓存当前模式的序列化结果时复用草稿（撤销/重做/替换文档会自然失效）。
  const cachedState =
    cached !== undefined && serializeColorPaletteValue(cached) === value ? cached : parsed;
  const state = allowGradient ? cachedState : solidColorPaletteState(cachedState);
  const cachedSelection = fieldKey === undefined ? undefined : paletteSelectionCache.get(fieldKey);
  const selectedStop = selectedColorPaletteStopFromCache(cachedSelection, state.stops.length);
  const element = ownerDocument.createElement('div');
  element.className = 'designer-color-palette';
  element.dataset.designerColorPalette = '';
  element.dataset.colorPaletteMode = state.mode;
  element.dataset.colorPaletteSelectedStop = String(selectedStop);
  element.dataset.colorPaletteOpen = 'false';
  if (fieldKey !== undefined) element.dataset.colorPaletteKey = fieldKey;

  const identity = Math.random().toString(36).slice(2);
  const popoverId = `designer-color-popover-${identity}`;
  const trigger = createColorPaletteTrigger(ownerDocument, popoverId);
  element.appendChild(trigger);

  const popover = ownerDocument.createElement('section');
  popover.id = popoverId;
  popover.className = 'designer-color-popover';
  popover.dataset.colorPalettePopover = '';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.colorPickerTitle);
  const toolbar = ownerDocument.createElement('div');
  toolbar.className = 'designer-color-popover-toolbar';
  const close = ownerDocument.createElement('button');
  close.type = 'button';
  close.className = 'designer-color-popover-close';
  close.dataset.colorPaletteAction = 'close';
  close.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.colorPickerClose);
  close.innerHTML = designerIcon('x');

  const modes = ownerDocument.createElement('div');
  modes.className = 'designer-color-palette-modes';
  modes.setAttribute('role', 'radiogroup');
  const groupName = `designer-color-mode-${identity}`;
  const modeControls: HTMLInputElement[] = [];
  if (allowGradient) {
    for (const [mode, label, iconName] of [
      ['solid', DESIGNER_UI_TEXT.propertiesPanel.backgroundSolid, 'color-solid'],
      ['linear-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundLinear, 'color-linear'],
      ['radial-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundRadial, 'color-radial'],
    ] as const) {
      const modeLabel = ownerDocument.createElement('label');
      modeLabel.className = 'designer-color-palette-mode';
      modeLabel.title = label;
      const input = ownerDocument.createElement('input');
      input.type = 'radio';
      input.name = groupName;
      input.value = mode;
      input.checked = state.mode === mode;
      input.dataset.colorPaletteField = 'mode';
      input.setAttribute('aria-label', label);
      const icon = ownerDocument.createElement('span');
      icon.className = 'designer-color-palette-mode-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = designerIcon(iconName);
      modeLabel.appendChild(input);
      modeLabel.appendChild(icon);
      modes.appendChild(modeLabel);
      modeControls.push(input);
    }
    toolbar.appendChild(modes);
  }
  toolbar.appendChild(close);
  popover.appendChild(toolbar);

  const body = ownerDocument.createElement('div');
  body.className = 'designer-color-palette-fields';
  const { solid, solidValue, solidAlpha, stops, gradientInputs } = renderPaletteBody(
    element,
    body,
    state,
    selectedStop,
  );
  popover.appendChild(body);
  element.appendChild(popover);

  element.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const handle = target?.closest?.<HTMLButtonElement>('[data-color-palette-stop-handle]');
    if (handle !== null && handle !== undefined) {
      selectColorPaletteStop(element, Number(handle.dataset.colorPaletteStopHandle));
      return;
    }
    const button = target?.closest?.<HTMLButtonElement>('[data-color-palette-action]');
    if (button === null || button === undefined) return;
    const action = button.dataset.colorPaletteAction;
    if (action === 'toggle') {
      if (!button.disabled) {
        const open = element.dataset.colorPaletteOpen !== 'true';
        setDesignerColorPaletteOpen(element, open);
        if (open && (event as MouseEvent).detail === 0) {
          focusDesignerColorPaletteDialog(element);
        }
      }
      return;
    }
    if (action === 'close') {
      setDesignerColorPaletteOpen(element, false);
      trigger.focus?.();
      return;
    }
    if (action === 'add-stop' || action === 'remove-stop') {
      applyDesignerColorPaletteStopAction(
        element,
        action,
        Number(button.dataset.colorPaletteStopIndex),
      );
    }
  });
  element.addEventListener('change', (event) => {
    const target = event.target as Partial<HTMLInputElement> | null;
    const field = target?.dataset?.colorPaletteField;
    if (isColorPaletteManualValueField(field)) {
      syncColorPaletteManualValue(element, target as HTMLInputElement, field);
      updateDesignerColorPaletteChrome(element);
      return;
    }
    if (field !== 'mode' || !isColorPaletteMode(target?.value)) return;
    const current = readPaletteState(element);
    if (current === undefined) return;
    const metadata = readColorPaletteControlMetadata(element);
    const selected = selectedColorPaletteStop(element, current.stops.length);
    const previousMode = isColorPaletteMode(element.dataset.colorPaletteMode)
      ? element.dataset.colorPaletteMode
      : current.mode;
    const next = switchColorPaletteMode(current, target.value, previousMode, selected);
    element.dataset.colorPaletteMode = next.mode;
    renderPaletteBody(element, body, next, selected);
    applyColorPaletteControlMetadata(element, metadata);
    updateDesignerColorPaletteChrome(element, false);
    syncDesignerColorPaletteDisabled(element);
  });
  element.addEventListener('input', (event) => {
    const target = event.target as
      | (Partial<HTMLInputElement> & { readonly dataset?: DOMStringMap })
      | null;
    if (target?.dataset === undefined || target.value === undefined) return;
    if (colorPalettePickerProxyDispatch.has(element)) return;
    const field = target.dataset.colorPaletteField;
    if (isColorPaletteManualValueField(field)) {
      updateColorPaletteManualValueValidity(target as HTMLInputElement);
      return;
    }
    if (field === 'solid-alpha' || field === 'stop-alpha') {
      syncColorPaletteAlpha(element, target as HTMLInputElement, field);
      updateDesignerColorPaletteChrome(element);
      return;
    }
    if (
      field !== 'solid' &&
      field !== 'stop-position' &&
      field !== 'stop-color' &&
      field !== 'angle' &&
      field !== 'x' &&
      field !== 'y'
    ) {
      return;
    }
    if (field === 'stop-position' || field === 'stop-color') {
      syncColorPaletteStopEditor(element, target as HTMLInputElement, field);
    }
    updateColorPalettePreview(element);
    updateDesignerColorPaletteChrome(element);
  });

  element.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Escape' || element.dataset.colorPaletteOpen !== 'true') return;
    keyboardEvent.preventDefault();
    setDesignerColorPaletteOpen(element, false);
    trigger.focus?.();
  });

  bindDesignerColorPaletteDismiss(ownerDocument);
  updateDesignerColorPaletteChrome(element, false);
  restoreDesignerColorPaletteOpen(element);
  const Observer = ownerDocument.defaultView?.MutationObserver;
  if (Observer !== undefined) {
    new Observer(() => syncDesignerColorPaletteDisabled(element)).observe(element, {
      attributes: true,
      subtree: true,
      attributeFilter: ['disabled'],
    });
  }

  return {
    element,
    controls: [solid, solidValue, solidAlpha, ...stops, ...gradientInputs, ...modeControls],
  };
}

function solidColorPaletteState(state: ColorPaletteState): ColorPaletteState {
  return state.mode === 'solid' ? state : switchColorPaletteMode(state, 'solid', state.mode, 0);
}

export function readDesignerColorPaletteValue(target: EventTarget | null): string | undefined {
  const input = target as Partial<HTMLInputElement> | null;
  const palette = input?.closest?.<HTMLElement>('[data-designer-color-palette]');
  if (palette === null || palette === undefined) return undefined;
  const state = readPaletteState(palette);
  if (state === undefined) return undefined;
  const fieldKey = palette.dataset.colorPaletteKey;
  if (fieldKey !== undefined) {
    cacheColorPaletteDraft(fieldKey, state);
    cacheColorPaletteSelection(fieldKey, selectedColorPaletteStop(palette, state.stops.length));
  }
  return serializeColorPaletteValue(state);
}

export function applyDesignerColorPaletteStopAction(
  palette: HTMLElement,
  action: 'add-stop' | 'remove-stop',
  index: number,
): boolean {
  const state = readPaletteState(palette);
  if (state === undefined) return false;
  const next =
    action === 'add-stop' ? addColorPaletteStop(state) : removeColorPaletteStop(state, index);
  if (next === undefined) return false;
  const body = palette.querySelector<HTMLElement>('.designer-color-palette-fields');
  if (body === null) return false;
  const metadata = readColorPaletteControlMetadata(palette);
  const selected = selectedColorPaletteStop(palette, state.stops.length);
  const nextSelected =
    action === 'add-stop'
      ? addedColorPaletteStopIndex(state.stops, next.stops)
      : selected === index
        ? Math.min(index, next.stops.length - 1)
        : selected > index
          ? selected - 1
          : selected;
  palette.dataset.colorPaletteMode = next.mode;
  palette.dataset.colorPaletteSelectedStop = String(nextSelected);
  renderPaletteBody(palette, body, next, nextSelected);
  applyColorPaletteControlMetadata(palette, metadata);
  updateDesignerColorPaletteChrome(palette, false);
  syncDesignerColorPaletteDisabled(palette);
  const first = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="solid"], [data-color-palette-field="stop-position"]',
  );
  if (first !== null && typeof first.dispatchEvent === 'function') {
    first.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

const COLOR_PALETTE_METADATA_KEYS = [
  'prop',
  'style',
  'descriptorFieldId',
  'descriptorTarget',
  'descriptorPath',
  'descriptorControl',
  'descriptorProjection',
] as const;

type ColorPaletteControlMetadata = Readonly<
  Partial<Record<(typeof COLOR_PALETTE_METADATA_KEYS)[number], string>>
>;

function readColorPaletteControlMetadata(palette: HTMLElement): ColorPaletteControlMetadata {
  const source = palette.querySelector<HTMLInputElement>('[data-color-palette-field="solid"]');
  if (source === null) return {};
  return Object.fromEntries(
    COLOR_PALETTE_METADATA_KEYS.flatMap((key) => {
      const value = source.dataset[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function applyColorPaletteControlMetadata(
  palette: HTMLElement,
  metadata: ColorPaletteControlMetadata,
): void {
  for (const input of palette.querySelectorAll<HTMLInputElement>('[data-color-palette-field]')) {
    for (const key of COLOR_PALETTE_METADATA_KEYS) {
      const value = metadata[key];
      if (value !== undefined) input.dataset[key] = value;
    }
  }
}

function renderPaletteBody(
  palette: HTMLElement,
  body: HTMLElement,
  state: ColorPaletteState,
  selectedStopIndex: number,
): {
  readonly solid: HTMLInputElement;
  readonly solidValue: HTMLInputElement;
  readonly solidAlpha: HTMLInputElement;
  readonly stops: readonly HTMLInputElement[];
  readonly gradientInputs: readonly HTMLInputElement[];
} {
  body.replaceChildren();
  const ownerDocument = body.ownerDocument;
  const selected = Math.min(Math.max(selectedStopIndex, 0), state.stops.length - 1);
  const fieldKey = palette.dataset.colorPaletteKey;
  const pickerValue = state.mode === 'solid' ? state.solid : state.stops[selected]!.color;
  const cachedHue = fieldKey === undefined ? undefined : paletteHueCache.get(fieldKey);
  const initialPickerHue =
    cachedHue?.color === pickerValue.toLowerCase() ? cachedHue.hue : undefined;
  const cachedPlane = fieldKey === undefined ? undefined : palettePlaneCache.get(fieldKey);
  const initialPickerPlane =
    cachedPlane?.color === pickerValue.toLowerCase()
      ? { s: cachedPlane.saturation, v: cachedPlane.value }
      : undefined;
  // 单色组 = 颜色控件 + 透明度滑杆同一行（紧凑布局增量）：渐变模式下整组
  // 隐藏（hide 规则 display: none），透明度滑杆不会脱离单色字段单独露出。
  const solidField = paletteColorControl(ownerDocument, state.solid, 'solid');
  const solid = solidField.input;
  const solidValue = solidField.value;
  solid.className += ' designer-color-palette-solid';
  const solidAlpha = colorAlphaControl(ownerDocument, state.solid, 'solid-alpha');
  const solidGroup = ownerDocument.createElement('div');
  solidGroup.className = 'designer-color-palette-solid-field';
  solidGroup.appendChild(solidField.element);
  solidGroup.appendChild(solidAlpha.element);
  body.appendChild(solidGroup);

  const gradient = ownerDocument.createElement('div');
  gradient.className = 'designer-color-palette-gradient';

  const preview = ownerDocument.createElement('div');
  preview.className = 'designer-color-palette-preview';
  setColorPalettePreview(preview, state);
  gradient.appendChild(createColorPaletteStopSlider(ownerDocument, preview, state, selected));

  const editor = createColorPaletteStopEditor(ownerDocument, state, selected);
  const stopAlpha = colorAlphaControl(ownerDocument, state.stops[selected]!.color, 'stop-alpha');
  stopAlpha.input.dataset.colorPaletteStopIndex = String(selected);
  const tools = ownerDocument.createElement('div');
  tools.className = 'designer-color-palette-tools';
  const add = colorPaletteActionButton(
    ownerDocument,
    'add-stop',
    DESIGNER_UI_TEXT.propertiesPanel.gradientAddStop,
    'plus',
  );
  add.disabled = state.stops.length >= MAX_COLOR_PALETTE_STOPS;
  tools.appendChild(add);
  const remove = colorPaletteActionButton(
    ownerDocument,
    'remove-stop',
    DESIGNER_UI_TEXT.propertiesPanel.gradientRemoveStop,
    'trash',
  );
  remove.disabled = state.stops.length <= MIN_COLOR_PALETTE_STOPS;
  remove.dataset.colorPaletteStopIndex = String(selected);
  tools.appendChild(remove);

  // 色标位置、渐变参数和增删操作共用一条参数工具带；色标颜色与透明度仍由下方
  // 统一取色器编辑，保留隐藏代理输入只用于既有事件与状态同步。
  const parameters = ownerDocument.createElement('div');
  parameters.className = 'designer-color-palette-parameters';
  const angle = inlineNumberField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientAngle,
    state.angle,
    'angle',
    0,
    360,
  );
  angle.input.className += ' designer-color-palette-linear';
  angle.element.className += ' designer-color-palette-linear';
  parameters.appendChild(angle.element);
  const x = inlineNumberField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterX,
    state.x,
    'x',
    0,
    100,
    DESIGNER_UI_TEXT.propertiesPanel.x,
  );
  x.input.className += ' designer-color-palette-radial';
  x.element.className += ' designer-color-palette-radial';
  parameters.appendChild(x.element);
  const y = inlineNumberField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterY,
    state.y,
    'y',
    0,
    100,
    DESIGNER_UI_TEXT.propertiesPanel.y,
  );
  y.input.className += ' designer-color-palette-radial';
  y.element.className += ' designer-color-palette-radial';
  parameters.appendChild(y.element);

  const stopBar = ownerDocument.createElement('div');
  stopBar.className = 'designer-color-palette-stop-bar';
  stopBar.appendChild(editor.element);
  stopBar.appendChild(stopAlpha.element);
  stopBar.appendChild(parameters);
  stopBar.appendChild(tools);
  gradient.appendChild(stopBar);

  body.appendChild(gradient);
  body.appendChild(
    createDesignerFillColorPicker(
      ownerDocument,
      pickerValue,
      {
        input: (value) => applyDesignerFillColorPickerValue(palette, value, 'input'),
        change: (value) => applyDesignerFillColorPickerValue(palette, value, 'change'),
        hueChange: (hue, color) => {
          if (fieldKey !== undefined) cacheColorPaletteHue(fieldKey, hue, color);
        },
        planeChange: (saturation, value, color) => {
          if (fieldKey !== undefined) cacheColorPalettePlane(fieldKey, saturation, value, color);
        },
      },
      initialPickerHue,
      initialPickerPlane,
    ),
  );
  return {
    solid,
    solidValue,
    solidAlpha: solidAlpha.input,
    stops: [editor.color, editor.value, stopAlpha.input, editor.position],
    gradientInputs: [angle.input, x.input, y.input],
  };
}

function createColorPaletteStopSlider(
  ownerDocument: Document,
  preview: HTMLElement,
  state: ColorPaletteState,
  selectedStopIndex: number,
): HTMLElement {
  const slider = ownerDocument.createElement('div');
  slider.className = 'designer-color-palette-stop-slider';
  slider.dataset.colorPaletteStopSlider = '';
  slider.appendChild(preview);
  for (let index = 0; index < state.stops.length; index++) {
    const stop = state.stops[index]!;
    const handle = ownerDocument.createElement('button');
    handle.type = 'button';
    handle.className = 'designer-color-palette-stop-handle';
    handle.dataset.colorPaletteStopHandle = String(index);
    handle.dataset.colorPaletteStopColor = stop.color;
    handle.dataset.colorPaletteStopPosition = String(stop.position);
    setColorPaletteStopHandleColor(handle, stop.color);
    handle.setAttribute(
      'aria-label',
      `${DESIGNER_UI_TEXT.propertiesPanel.gradientStopPosition} ${index + 1}`,
    );
    updateColorPaletteHandleAccessibility(handle, state.stops, index, selectedStopIndex);
    setColorPaletteStopHandlePosition(handle, stop.position);
    handle.addEventListener('pointerdown', (event) => beginColorPaletteStopDrag(handle, event));
    handle.addEventListener('keydown', (event) => moveColorPaletteStopWithKeyboard(handle, event));
    slider.appendChild(handle);
  }
  return slider;
}

/**
 * 色标编辑行（紧凑布局增量）：颜色控件 + 行内「位置」数字输入同一行；
 * 透明度滑杆由 `renderPaletteBody` 的 footer 行承载。
 */
function createColorPaletteStopEditor(
  ownerDocument: Document,
  state: ColorPaletteState,
  index: number,
): {
  readonly element: HTMLElement;
  readonly color: HTMLInputElement;
  readonly value: HTMLInputElement;
  readonly position: HTMLInputElement;
} {
  const stop = state.stops[index]!;
  const editor = ownerDocument.createElement('div');
  editor.className = 'designer-color-palette-stop-editor';
  editor.dataset.colorPaletteStopEditor = String(index);
  const colorField = paletteColorControl(ownerDocument, stop.color, 'stop-color');
  const color = colorField.input;
  const value = colorField.value;
  color.dataset.colorPaletteStopIndex = String(index);
  value.dataset.colorPaletteStopIndex = String(index);
  editor.appendChild(colorField.element);
  const position = inlineNumberField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientStopPosition,
    stop.position,
    'stop-position',
    index === 0 ? 0 : state.stops[index - 1]!.position + 1,
    index === state.stops.length - 1 ? 100 : state.stops[index + 1]!.position - 1,
  );
  position.input.dataset.colorPaletteStopIndex = String(index);
  editor.appendChild(position.element);
  return { element: editor, color, value, position: position.input };
}

function colorPaletteActionButton(
  ownerDocument: Document,
  action: 'add-stop' | 'remove-stop',
  label: string,
  icon: 'plus' | 'trash',
): HTMLButtonElement {
  const button = ownerDocument.createElement('button');
  button.type = 'button';
  button.className =
    'designer-control designer-button designer-icon-button designer-color-palette-action';
  button.dataset.colorPaletteAction = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = designerIcon(icon);
  return button;
}

function colorInput(
  ownerDocument: Document,
  value: string,
  field: 'solid' | 'stop-color',
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'color';
  input.className = 'designer-control designer-color';
  // 原生 color input 只接受 #rrggbb；完整色值（alpha/transparent）由 dataset 保留。
  applyColorPaletteColorInputValue(input, value);
  input.dataset.colorPaletteField = field;
  return input;
}

function applyColorPaletteColorInputValue(input: HTMLInputElement, value: string): void {
  if (value.toLowerCase() === 'transparent') {
    input.value = DEFAULT_COLOR;
    delete input.dataset.colorPaletteAlpha;
    input.dataset.colorPaletteTransparent = 'true';
    return;
  }
  const rgb = hexToRgb(value);
  input.value = rgb === undefined ? DEFAULT_COLOR : rgbToHex(rgb.r, rgb.g, rgb.b);
  if (rgb?.alpha !== undefined) input.dataset.colorPaletteAlpha = rgb.alpha;
  else delete input.dataset.colorPaletteAlpha;
  delete input.dataset.colorPaletteTransparent;
}

/** 完整色值 = RGB（input.value）+ 透明通道（dataset）；transparent 单独保留。 */
function composedColorValue(input: {
  readonly value: string;
  readonly dataset?: DOMStringMap;
}): string {
  if (input.dataset?.colorPaletteTransparent === 'true') return 'transparent';
  const alpha = input.dataset?.colorPaletteAlpha;
  return alpha === undefined || alpha === 'ff' ? input.value : `${input.value}${alpha}`;
}

/** 标准 hex/transparent token 规范化为控件内部小写 CSS 色值。 */
function normalizeColorPaletteManualValue(value: string): string | undefined {
  const candidate = value.trim();
  if (candidate.toLowerCase() === 'transparent') return 'transparent';
  const rgb = hexToRgb(candidate);
  return rgb === undefined ? undefined : `${rgbToHex(rgb.r, rgb.g, rgb.b)}${rgb.alpha ?? ''}`;
}

function isColorPaletteManualValueField(
  value: string | undefined,
): value is ColorPaletteManualValueField {
  return value === 'solid-value' || value === 'stop-value';
}

function updateColorPaletteManualValueValidity(input: HTMLInputElement): void {
  input.setAttribute(
    'aria-invalid',
    String(normalizeColorPaletteManualValue(input.value) === undefined),
  );
}

function isValidColorPaletteManualValue(input: HTMLInputElement | null): boolean {
  return input !== null && normalizeColorPaletteManualValue(input.value) !== undefined;
}

/** 色值 → 透明度百分比（0..100）：不可解析或已不透明 = 100。 */
function colorAlphaPercent(value: string | undefined): number {
  const rgb = hexToRgb(value);
  if (rgb?.alpha === undefined) return 100;
  return Math.round((Number.parseInt(rgb.alpha, 16) * 100) / 255);
}

/** 透明度百分比（0..100）→ 2 位 hex 透明通道。 */
function colorAlphaFromPercent(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((clamped * 255) / 100)
    .toString(16)
    .padStart(2, '0');
}

function updateColorControlValueText(valueInput: HTMLInputElement, input: HTMLInputElement): void {
  valueInput.value = composedColorValue(input).toUpperCase();
  valueInput.setAttribute('aria-invalid', 'false');
}

/**
 * 颜色控件（紧凑布局增量）：swatch + 可手动编辑的 hex 输入。输入失焦/提交时同步
 * 原生取色器、透明度与色标句柄；屏幕阅读器经 aria-label 获得字段语义。
 */
function paletteColorControl(
  ownerDocument: Document,
  value: string,
  field: 'solid' | 'stop-color',
): {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  readonly value: HTMLInputElement;
} {
  const input = colorInput(ownerDocument, value, field);
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.gradientStopColor);
  const control = ownerDocument.createElement('span');
  control.className = 'designer-color-palette-color-control';
  const valueInput = ownerDocument.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'designer-color-palette-color-value';
  valueInput.dataset.colorPaletteField = field === 'solid' ? 'solid-value' : 'stop-value';
  valueInput.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.gradientStopHexValue);
  valueInput.setAttribute('autocomplete', 'off');
  valueInput.setAttribute('spellcheck', 'false');
  updateColorControlValueText(valueInput, input);
  input.addEventListener('input', () => {
    delete input.dataset.colorPaletteTransparent;
    updateColorControlValueText(valueInput, input);
  });
  control.appendChild(input);
  control.appendChild(valueInput);
  return { element: control, input, value: valueInput };
}

/**
 * 透明度（alpha）滑杆：0..100%。滑杆本身不保存色值，只把透明通道写入关联
 * 颜色控件（input.dataset.colorPaletteAlpha，经面板 input 通道同步），完整色值由
 * composedColorValue 组装，值格式仍是 CSS 颜色字符串（#rrggbbaa），公共契约零变化。
 */
function colorAlphaControl(
  ownerDocument: Document,
  value: string,
  field: 'solid-alpha' | 'stop-alpha',
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const row = ownerDocument.createElement('span');
  row.className = 'designer-color-palette-alpha';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-color-palette-alpha-label';
  label.textContent = DESIGNER_UI_TEXT.propertiesPanel.gradientStopOpacity;
  const input = ownerDocument.createElement('input');
  input.type = 'range';
  input.className = 'designer-control designer-range designer-color-palette-alpha-input';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(colorAlphaPercent(value));
  input.dataset.colorPaletteField = field;
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.gradientStopOpacity);
  const valueText = ownerDocument.createElement('span');
  valueText.className = 'designer-color-palette-alpha-value';
  valueText.textContent = `${input.value}%`;
  input.addEventListener('input', () => {
    valueText.textContent = `${input.value}%`;
  });
  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(valueText);
  return { element: row, input };
}

function numberInput(
  ownerDocument: Document,
  value: number,
  field: string,
  min: number,
  max: number,
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'number';
  input.className = 'designer-control designer-input designer-number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.dataset.colorPaletteField = field;
  return input;
}

/**
 * 行内数字字段（紧凑布局增量）：可见文字标签与数字输入同一行，压缩纵向占用；
 * 输入补充 aria-label（span 文字与输入无程序关联）。不用 <label> 包裹：label
 * 点击会聚焦/激活关联控件（number input 聚焦跳动、color input 弹出原生取色器），
 * 标签只是说明文字，不应产生输入副作用。
 */
function inlineNumberField(
  ownerDocument: Document,
  labelText: string,
  value: number,
  field: string,
  min: number,
  max: number,
  visibleLabel = labelText,
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const input = numberInput(ownerDocument, value, field, min, max);
  input.setAttribute('aria-label', labelText);
  const wrap = ownerDocument.createElement('span');
  wrap.className = 'designer-color-palette-field-inline';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-color-palette-field-inline-label';
  label.textContent = visibleLabel;
  wrap.appendChild(label);
  wrap.appendChild(input);
  return { element: wrap, input };
}

function selectColorPaletteStop(palette: HTMLElement, index: number): void {
  const handles = colorPaletteHandles(palette);
  if (!Number.isInteger(index) || handles[index] === undefined) return;
  const stops = readColorPaletteStops(handles);
  if (stops === undefined) return;
  palette.dataset.colorPaletteSelectedStop = String(index);
  const fieldKey = palette.dataset.colorPaletteKey;
  if (fieldKey !== undefined) cacheColorPaletteSelection(fieldKey, index);
  for (let stopIndex = 0; stopIndex < handles.length; stopIndex++) {
    updateColorPaletteHandleAccessibility(handles[stopIndex]!, stops, stopIndex, index);
  }
  const editor = palette.querySelector<HTMLElement>('[data-color-palette-stop-editor]');
  const color = palette.querySelector<HTMLInputElement>('[data-color-palette-field="stop-color"]');
  const position = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="stop-position"]',
  );
  const remove = palette.querySelector<HTMLButtonElement>(
    '[data-color-palette-action="remove-stop"]',
  );
  if (editor !== null) editor.dataset.colorPaletteStopEditor = String(index);
  if (color !== null) {
    color.dataset.colorPaletteStopIndex = String(index);
    applyColorPaletteColorInputValue(color, stops[index]!.color);
    const valueInput = color
      .closest<HTMLElement>('.designer-color-palette-color-control')
      ?.querySelector<HTMLInputElement>('.designer-color-palette-color-value');
    if (valueInput !== null && valueInput !== undefined) {
      valueInput.dataset.colorPaletteStopIndex = String(index);
      updateColorControlValueText(valueInput, color);
    }
    const alpha = palette.querySelector<HTMLInputElement>(
      '[data-color-palette-field="stop-alpha"]',
    );
    if (alpha !== null) {
      alpha.dataset.colorPaletteStopIndex = String(index);
      alpha.value = String(colorAlphaPercent(stops[index]!.color));
      const alphaValue = alpha
        .closest<HTMLElement>('.designer-color-palette-alpha')
        ?.querySelector<HTMLElement>('.designer-color-palette-alpha-value');
      if (alphaValue !== null && alphaValue !== undefined) {
        alphaValue.textContent = `${alpha.value}%`;
      }
    }
  }
  if (position !== null) {
    position.dataset.colorPaletteStopIndex = String(index);
    position.value = String(stops[index]!.position);
    position.min = String(index === 0 ? 0 : stops[index - 1]!.position + 1);
    position.max = String(index === stops.length - 1 ? 100 : stops[index + 1]!.position - 1);
  }
  if (remove !== null) remove.dataset.colorPaletteStopIndex = String(index);
  updateDesignerColorPaletteChrome(palette);
}

/**
 * 透明度滑杆 → 颜色控件透明通道：RGB 不变（input.value），透明通道写入
 * dataset.colorPaletteAlpha，完整色值随后由 composedColorValue 组装、落到色标句柄。
 */
function syncColorPaletteAlpha(
  palette: HTMLElement,
  source: HTMLInputElement,
  field: 'solid-alpha' | 'stop-alpha',
): void {
  const colorInput =
    field === 'solid-alpha'
      ? palette.querySelector<HTMLInputElement>('[data-color-palette-field="solid"]')
      : palette.querySelector<HTMLInputElement>('[data-color-palette-field="stop-color"]');
  if (colorInput === null || colorInput === undefined) return;
  delete colorInput.dataset.colorPaletteTransparent;
  colorInput.dataset.colorPaletteAlpha = colorAlphaFromPercent(Number(source.value));
  const valueInput = colorInput
    .closest<HTMLElement>('.designer-color-palette-color-control')
    ?.querySelector<HTMLInputElement>('.designer-color-palette-color-value');
  if (valueInput !== null && valueInput !== undefined) {
    updateColorControlValueText(valueInput, colorInput);
  }
  if (field === 'stop-alpha') {
    syncColorPaletteStopColorToHandle(palette, colorInput);
  }
  updateColorPalettePreview(palette);
}

/** 手动 hex 输入提交：同步原生取色器、透明度滑杆与（色标时）滑轨句柄。 */
function syncColorPaletteManualValue(
  palette: HTMLElement,
  source: HTMLInputElement,
  field: ColorPaletteManualValueField,
): void {
  const color = normalizeColorPaletteManualValue(source.value);
  if (color === undefined) {
    updateColorPaletteManualValueValidity(source);
    return;
  }
  const colorInput =
    field === 'solid-value'
      ? palette.querySelector<HTMLInputElement>('[data-color-palette-field="solid"]')
      : palette.querySelector<HTMLInputElement>('[data-color-palette-field="stop-color"]');
  if (colorInput === null || colorInput === undefined) return;
  applyColorPaletteColorInputValue(colorInput, color);
  updateColorControlValueText(source, colorInput);
  const alphaField = field === 'solid-value' ? 'solid-alpha' : 'stop-alpha';
  const alpha = palette.querySelector<HTMLInputElement>(
    `[data-color-palette-field="${alphaField}"]`,
  );
  if (alpha !== null) {
    alpha.value = String(colorAlphaPercent(color));
    const alphaValue = alpha
      .closest<HTMLElement>('.designer-color-palette-alpha')
      ?.querySelector<HTMLElement>('.designer-color-palette-alpha-value');
    if (alphaValue !== null && alphaValue !== undefined) {
      alphaValue.textContent = `${alpha.value}%`;
    }
  }
  if (field === 'stop-value') syncColorPaletteStopColorToHandle(palette, colorInput);
  updateColorPalettePreview(palette);
}

/** 把颜色控件的完整色值（RGB + 透明通道）同步到对应色标句柄。 */
function syncColorPaletteStopColorToHandle(
  palette: HTMLElement,
  colorInput: HTMLInputElement,
): void {
  const index = Number(colorInput.dataset.colorPaletteStopIndex);
  const handle = colorPaletteHandles(palette)[index];
  if (!Number.isInteger(index) || handle === undefined) return;
  const color = composedColorValue(colorInput);
  if (!isValidColor(color)) return;
  handle.dataset.colorPaletteStopColor = color;
  setColorPaletteStopHandleColor(handle, color);
}

function syncColorPaletteStopEditor(
  palette: HTMLElement,
  source: HTMLInputElement,
  field: 'stop-position' | 'stop-color',
): void {
  const index = Number(source.dataset.colorPaletteStopIndex);
  const handles = colorPaletteHandles(palette);
  const handle = handles[index];
  if (!Number.isInteger(index) || handle === undefined) return;
  if (field === 'stop-color') {
    syncColorPaletteStopColorToHandle(palette, source);
    return;
  }
  const position = Number(source.value);
  const min = Number(source.min);
  const max = Number(source.max);
  if (!Number.isInteger(position) || position < min || position > max) return;
  handle.dataset.colorPaletteStopPosition = String(position);
  setColorPaletteStopHandlePosition(handle, position);
  const stops = readColorPaletteStops(handles);
  if (stops === undefined) return;
  for (let stopIndex = 0; stopIndex < handles.length; stopIndex++) {
    updateColorPaletteHandleAccessibility(
      handles[stopIndex]!,
      stops,
      stopIndex,
      selectedColorPaletteStop(palette, stops.length),
    );
  }
}

function beginColorPaletteStopDrag(handle: HTMLButtonElement, event: PointerEvent): void {
  const palette = handle.closest<HTMLElement>('[data-designer-color-palette]');
  if (palette === null) return;
  const index = Number(handle.dataset.colorPaletteStopHandle);
  if (!Number.isInteger(index)) return;
  event.preventDefault();
  event.stopPropagation();
  selectColorPaletteStop(palette, index);
  handle.setPointerCapture?.(event.pointerId);
  let changed = false;
  const move = (moveEvent: PointerEvent): void => {
    changed = updateColorPaletteStopFromPointer(palette, index, moveEvent.clientX) || changed;
  };
  const finish = (finishEvent: PointerEvent): void => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    if (handle.hasPointerCapture?.(finishEvent.pointerId)) {
      handle.releasePointerCapture(finishEvent.pointerId);
    }
    if (changed) commitColorPaletteStopPosition(palette);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function moveColorPaletteStopWithKeyboard(handle: HTMLButtonElement, event: KeyboardEvent): void {
  const palette = handle.closest<HTMLElement>('[data-designer-color-palette]');
  if (palette === null) return;
  const index = Number(handle.dataset.colorPaletteStopHandle);
  const current = Number(handle.dataset.colorPaletteStopPosition);
  const stops = readColorPaletteStops(colorPaletteHandles(palette));
  if (!Number.isInteger(index) || !Number.isInteger(current) || stops === undefined) return;
  const min = index === 0 ? 0 : stops[index - 1]!.position + 1;
  const max = index === stops.length - 1 ? 100 : stops[index + 1]!.position - 1;
  const step = event.shiftKey ? 10 : 1;
  const next =
    event.key === 'ArrowLeft' || event.key === 'ArrowDown'
      ? current - step
      : event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? current + step
        : event.key === 'Home'
          ? min
          : event.key === 'End'
            ? max
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  selectColorPaletteStop(palette, index);
  if (updateColorPaletteStopPosition(palette, index, Math.min(Math.max(next, min), max))) {
    commitColorPaletteStopPosition(palette);
  }
}

function updateColorPaletteStopFromPointer(
  palette: HTMLElement,
  index: number,
  clientX: number,
): boolean {
  const slider = palette.querySelector<HTMLElement>('[data-color-palette-stop-slider]');
  if (slider === null) return false;
  const bounds = slider.getBoundingClientRect();
  if (bounds.width <= 0) return false;
  const position = Math.round(((clientX - bounds.left) / bounds.width) * 100);
  const stops = readColorPaletteStops(colorPaletteHandles(palette));
  if (stops === undefined || stops[index] === undefined) return false;
  const min = index === 0 ? 0 : stops[index - 1]!.position + 1;
  const max = index === stops.length - 1 ? 100 : stops[index + 1]!.position - 1;
  return updateColorPaletteStopPosition(palette, index, Math.min(Math.max(position, min), max));
}

function updateColorPaletteStopPosition(
  palette: HTMLElement,
  index: number,
  position: number,
): boolean {
  const handles = colorPaletteHandles(palette);
  const handle = handles[index];
  if (handle === undefined || Number(handle.dataset.colorPaletteStopPosition) === position) {
    return false;
  }
  handle.dataset.colorPaletteStopPosition = String(position);
  setColorPaletteStopHandlePosition(handle, position);
  const editor = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="stop-position"]',
  );
  if (editor !== null && Number(editor.dataset.colorPaletteStopIndex) === index) {
    editor.value = String(position);
  }
  const stops = readColorPaletteStops(handles);
  if (stops === undefined) return false;
  for (let stopIndex = 0; stopIndex < handles.length; stopIndex++) {
    updateColorPaletteHandleAccessibility(handles[stopIndex]!, stops, stopIndex, index);
  }
  updateColorPalettePreview(palette);
  return true;
}

function commitColorPaletteStopPosition(palette: HTMLElement): void {
  palette
    .querySelector<HTMLInputElement>('[data-color-palette-field="stop-position"]')
    ?.dispatchEvent(new Event('change', { bubbles: true }));
}

function updateColorPalettePreview(palette: HTMLElement): void {
  const state = readPaletteState(palette);
  const preview = palette.querySelector<HTMLElement>('.designer-color-palette-preview');
  if (state !== undefined && preview !== null) setColorPalettePreview(preview, state);
  if (state !== undefined) {
    // Picker-originated proxy events already rendered the semantic hue. Re-reading the rounded
    // RGB proxy here would shift the hue thumb while saturation/value are being dragged.
    updateDesignerColorPaletteChrome(palette, !colorPalettePickerProxyDispatch.has(palette));
  }
}

function setColorPalettePreview(preview: HTMLElement, state: ColorPaletteState): void {
  const previewStyle = (preview as { style?: { background?: string } }).style;
  if (previewStyle !== undefined) {
    previewStyle.background = serializeColorPaletteValue({
      ...state,
      mode: state.mode === 'solid' ? 'linear-gradient' : state.mode,
    });
  }
}

function setColorPaletteStopHandlePosition(handle: HTMLElement, position: number): void {
  const style = (handle as { style?: { left?: string } }).style;
  if (style !== undefined) style.left = `${position}%`;
}

function setColorPaletteStopHandleColor(handle: HTMLElement, color: string): void {
  const style = (handle as { style?: { setProperty?: (name: string, value: string) => void } })
    .style;
  style?.setProperty?.('--designer-color-palette-stop-color', color);
}

function updateColorPaletteHandleAccessibility(
  handle: HTMLButtonElement,
  stops: readonly ColorPaletteStop[],
  index: number,
  selectedStopIndex: number,
): void {
  const min = index === 0 ? 0 : stops[index - 1]!.position + 1;
  const max = index === stops.length - 1 ? 100 : stops[index + 1]!.position - 1;
  const selected = index === selectedStopIndex;
  handle.dataset.colorPaletteStopMin = String(min);
  handle.dataset.colorPaletteStopMax = String(max);
  handle.dataset.colorPaletteStopSelected = String(selected);
  handle.setAttribute('aria-valuemin', String(min));
  handle.setAttribute('aria-valuemax', String(max));
  handle.setAttribute('aria-valuenow', String(stops[index]!.position));
  handle.setAttribute('aria-pressed', String(selected));
  const classes = handle.className
    .split(/\s+/)
    .filter((name) => name.length > 0 && name !== 'is-selected');
  if (selected) classes.push('is-selected');
  handle.className = classes.join(' ');
}

function colorPaletteHandles(palette: HTMLElement): HTMLButtonElement[] {
  return [...palette.querySelectorAll<HTMLButtonElement>('[data-color-palette-stop-handle]')];
}

function readColorPaletteStops(
  handles: readonly HTMLButtonElement[],
): readonly ColorPaletteStop[] | undefined {
  const stops: ColorPaletteStop[] = [];
  for (const handle of handles) {
    const color = handle.dataset.colorPaletteStopColor;
    const position = Number(handle.dataset.colorPaletteStopPosition);
    if (!isValidColor(color) || !Number.isInteger(position) || position < 0 || position > 100) {
      return undefined;
    }
    stops.push({ color, position });
  }
  return stops.every((stop, index) => index === 0 || stops[index - 1]!.position < stop.position)
    ? stops
    : undefined;
}

function selectedColorPaletteStop(palette: HTMLElement, stopCount: number): number {
  return selectedColorPaletteStopFromCache(
    Number(palette.dataset.colorPaletteSelectedStop),
    stopCount,
  );
}

function selectedColorPaletteStopFromCache(
  selected: number | undefined,
  stopCount: number,
): number {
  return selected !== undefined &&
    Number.isInteger(selected) &&
    selected >= 0 &&
    selected < stopCount
    ? selected
    : 0;
}

function addedColorPaletteStopIndex(
  before: readonly ColorPaletteStop[],
  after: readonly ColorPaletteStop[],
): number {
  for (let index = 0; index < after.length; index++) {
    const previous = before[index];
    const next = after[index]!;
    if (previous?.color !== next.color || previous.position !== next.position) return index;
  }
  return Math.max(0, after.length - 1);
}

function readPaletteState(palette: HTMLElement): ColorPaletteState | undefined {
  const checkedMode = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="mode"]:checked',
  )?.value;
  const mode = isColorPaletteMode(checkedMode)
    ? checkedMode
    : isColorPaletteMode(palette.dataset.colorPaletteMode)
      ? palette.dataset.colorPaletteMode
      : undefined;
  const solidInput = palette.querySelector<HTMLInputElement>('[data-color-palette-field="solid"]');
  const solid = solidInput === null ? undefined : composedColorValue(solidInput);
  const solidValue = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="solid-value"]',
  );
  const stopValue = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="stop-value"]',
  );
  const stops = readColorPaletteStops(colorPaletteHandles(palette));
  if (
    mode === undefined ||
    solid === undefined ||
    !isValidColor(solid) ||
    !isValidColorPaletteManualValue(solidValue) ||
    !isValidColorPaletteManualValue(stopValue) ||
    stops === undefined ||
    stops.length < MIN_COLOR_PALETTE_STOPS ||
    stops.length > MAX_COLOR_PALETTE_STOPS
  ) {
    return undefined;
  }
  const angle = paletteNumber(palette, 'angle');
  const x = paletteNumber(palette, 'x');
  const y = paletteNumber(palette, 'y');
  if (angle === undefined || x === undefined || y === undefined) return undefined;
  return { mode, solid, stops, angle, x, y };
}

function paletteNumber(palette: HTMLElement, field: string): number | undefined {
  const value = Number(
    palette.querySelector<HTMLInputElement>(`[data-color-palette-field="${field}"]`)?.value,
  );
  if (!Number.isFinite(value)) return undefined;
  const [min, max] = field === 'angle' ? [0, 360] : [0, 100];
  return value >= min && value <= max ? value : undefined;
}

function isColorPaletteMode(value: string | undefined): value is ColorPaletteMode {
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

function isValidColor(value: string | undefined): value is string {
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

function hexToRgb(
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

function rgbToHex(r: number, g: number, b: number): string {
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
