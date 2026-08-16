import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../ui/designer-icons.js';

export const MIN_COLOR_PALETTE_STOPS = 2;
export const MAX_COLOR_PALETTE_STOPS = 8;

export type ColorPaletteMode = 'solid' | 'linear-gradient' | 'radial-gradient';

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

const DEFAULT_COLOR = '#000000';
const DEFAULT_END_COLOR = '#ffffff';
const COLOR_PATTERN = /^(?:#[0-9a-f]{3,8}|transparent)$/i;
const paletteDraftCache = new Map<string, ColorPaletteState>();
const paletteSelectionCache = new Map<string, number>();

export function clearColorPaletteDraftCache(): void {
  paletteDraftCache.clear();
  paletteSelectionCache.clear();
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

export function createDesignerColorPalette(
  ownerDocument: Document,
  value: string | undefined,
  fieldKey?: string,
): DesignerColorPalette {
  const parsed = parseColorPaletteValue(value);
  const cached = fieldKey === undefined ? undefined : paletteDraftCache.get(fieldKey);
  // 仅当文档值仍等于缓存当前模式的序列化结果时复用草稿（撤销/重做/替换文档会自然失效）。
  const state =
    cached !== undefined && serializeColorPaletteValue(cached) === value ? cached : parsed;
  const cachedSelection = fieldKey === undefined ? undefined : paletteSelectionCache.get(fieldKey);
  const selectedStop = selectedColorPaletteStopFromCache(cachedSelection, state.stops.length);
  const element = ownerDocument.createElement('div');
  element.className = 'designer-color-palette';
  element.dataset.designerColorPalette = '';
  element.dataset.colorPaletteMode = state.mode;
  element.dataset.colorPaletteSelectedStop = String(selectedStop);
  if (fieldKey !== undefined) element.dataset.colorPaletteKey = fieldKey;

  const modes = ownerDocument.createElement('div');
  modes.className = 'designer-color-palette-modes';
  modes.setAttribute('role', 'radiogroup');
  const groupName = `designer-color-mode-${Math.random().toString(36).slice(2)}`;
  const modeControls: HTMLInputElement[] = [];
  for (const [mode, label] of [
    ['solid', DESIGNER_UI_TEXT.propertiesPanel.backgroundSolid],
    ['linear-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundLinear],
    ['radial-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundRadial],
  ] as const) {
    const modeLabel = ownerDocument.createElement('label');
    modeLabel.className = 'designer-color-palette-mode';
    const input = ownerDocument.createElement('input');
    input.type = 'radio';
    input.name = groupName;
    input.value = mode;
    input.checked = state.mode === mode;
    input.dataset.colorPaletteField = 'mode';
    const text = ownerDocument.createElement('span');
    text.textContent = label;
    modeLabel.appendChild(input);
    modeLabel.appendChild(text);
    modes.appendChild(modeLabel);
    modeControls.push(input);
  }
  element.appendChild(modes);

  const body = ownerDocument.createElement('div');
  body.className = 'designer-color-palette-fields';
  const { solid, stops, gradientInputs } = renderPaletteBody(body, state, selectedStop);
  element.appendChild(body);

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
    if (target?.dataset?.colorPaletteField !== 'mode' || !isColorPaletteMode(target.value)) {
      return;
    }
    const current = readPaletteState(element);
    if (current === undefined) return;
    const metadata = readColorPaletteControlMetadata(element);
    const selected = selectedColorPaletteStop(element, current.stops.length);
    element.dataset.colorPaletteMode = target.value;
    renderPaletteBody(body, { ...current, mode: target.value }, selected);
    applyColorPaletteControlMetadata(element, metadata);
  });
  element.addEventListener('input', (event) => {
    const target = event.target as
      | (Partial<HTMLInputElement> & { readonly dataset?: DOMStringMap })
      | null;
    if (target?.dataset === undefined || target.value === undefined) return;
    const field = target.dataset.colorPaletteField;
    if (
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
  });

  return { element, controls: [solid, ...stops, ...gradientInputs, ...modeControls] };
}

export function readDesignerColorPaletteValue(target: EventTarget | null): string | undefined {
  const input = target as Partial<HTMLInputElement> | null;
  const palette = input?.closest?.<HTMLElement>('[data-designer-color-palette]');
  if (palette === null || palette === undefined) return undefined;
  const state = readPaletteState(palette);
  if (state === undefined) return undefined;
  const fieldKey = palette.dataset.colorPaletteKey;
  if (fieldKey !== undefined) {
    paletteDraftCache.set(fieldKey, state);
    paletteSelectionCache.set(fieldKey, selectedColorPaletteStop(palette, state.stops.length));
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
  renderPaletteBody(body, next, nextSelected);
  applyColorPaletteControlMetadata(palette, metadata);
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
  for (const input of palette.querySelectorAll<HTMLInputElement>('input')) {
    for (const key of COLOR_PALETTE_METADATA_KEYS) {
      const value = metadata[key];
      if (value !== undefined) input.dataset[key] = value;
    }
  }
}

function renderPaletteBody(
  body: HTMLElement,
  state: ColorPaletteState,
  selectedStopIndex: number,
): {
  readonly solid: HTMLInputElement;
  readonly stops: readonly HTMLInputElement[];
  readonly gradientInputs: readonly HTMLInputElement[];
} {
  body.replaceChildren();
  const ownerDocument = body.ownerDocument;
  const selected = Math.min(Math.max(selectedStopIndex, 0), state.stops.length - 1);
  const solidField = labeledColorControl(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientStopColor,
    state.solid,
    'solid',
  );
  const solid = solidField.input;
  solid.className += ' designer-color-palette-solid';
  solidField.element.className += ' designer-color-palette-solid-field';
  body.appendChild(solidField.element);

  const gradient = ownerDocument.createElement('div');
  gradient.className = 'designer-color-palette-gradient';

  const preview = ownerDocument.createElement('div');
  preview.className = 'designer-color-palette-preview';
  setColorPalettePreview(preview, state);
  gradient.appendChild(createColorPaletteStopSlider(ownerDocument, preview, state, selected));

  const editor = createColorPaletteStopEditor(ownerDocument, state, selected);
  gradient.appendChild(editor.element);

  const parameters = ownerDocument.createElement('div');
  parameters.className = 'designer-color-palette-parameters';
  const angle = labeledNumberInput(
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
  const x = labeledNumberInput(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterX,
    state.x,
    'x',
    0,
    100,
  );
  x.input.className += ' designer-color-palette-radial';
  x.element.className += ' designer-color-palette-radial';
  parameters.appendChild(x.element);
  const y = labeledNumberInput(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterY,
    state.y,
    'y',
    0,
    100,
  );
  y.input.className += ' designer-color-palette-radial';
  y.element.className += ' designer-color-palette-radial';
  parameters.appendChild(y.element);
  gradient.appendChild(parameters);

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
  gradient.appendChild(tools);

  body.appendChild(gradient);
  return {
    solid,
    stops: editor.inputs,
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

function createColorPaletteStopEditor(
  ownerDocument: Document,
  state: ColorPaletteState,
  index: number,
): { readonly element: HTMLElement; readonly inputs: readonly HTMLInputElement[] } {
  const stop = state.stops[index]!;
  const editor = ownerDocument.createElement('div');
  editor.className = 'designer-color-palette-stop-editor';
  editor.dataset.colorPaletteStopEditor = String(index);
  const colorField = labeledColorControl(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.gradientStopColor,
    stop.color,
    'stop-color',
  );
  const color = colorField.input;
  color.dataset.colorPaletteStopIndex = String(index);
  editor.appendChild(colorField.element);
  const position = numberInput(
    ownerDocument,
    stop.position,
    'stop-position',
    index === 0 ? 0 : state.stops[index - 1]!.position + 1,
    index === state.stops.length - 1 ? 100 : state.stops[index + 1]!.position - 1,
  );
  position.dataset.colorPaletteStopIndex = String(index);
  editor.appendChild(
    labeledControl(ownerDocument, DESIGNER_UI_TEXT.propertiesPanel.gradientStopPosition, position)
      .element,
  );
  return { element: editor, inputs: [color, position] };
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

function colorInput(ownerDocument: Document, value: string, field: string): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'color';
  input.className = 'designer-control designer-color';
  input.value = value === 'transparent' ? DEFAULT_COLOR : value;
  input.dataset.colorPaletteField = field;
  return input;
}

function labeledColorControl(
  ownerDocument: Document,
  labelText: string,
  value: string,
  field: string,
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const input = colorInput(ownerDocument, value, field);
  const control = ownerDocument.createElement('span');
  control.className = 'designer-color-palette-color-control';
  const valueText = ownerDocument.createElement('span');
  valueText.className = 'designer-color-palette-color-value';
  valueText.textContent = input.value.toUpperCase();
  input.addEventListener('input', () => {
    valueText.textContent = input.value.toUpperCase();
  });
  control.appendChild(input);
  control.appendChild(valueText);
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  label.appendChild(control);
  return { element: label, input };
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

function labeledNumberInput(
  ownerDocument: Document,
  labelText: string,
  value: number,
  field: string,
  min: number,
  max: number,
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  return labeledControl(
    ownerDocument,
    labelText,
    numberInput(ownerDocument, value, field, min, max),
  );
}

/**
 * 把控件包进带字段标签的 span（复用 designer-field 字段结构）。
 * 不用 <label> 包裹：label 点击会激活关联控件——对 color input 会弹出原生取色器，
 * 对 number input 会聚焦跳动；标签只是说明文字，不应产生输入副作用。
 */
function labeledControl(
  ownerDocument: Document,
  labelText: string,
  input: HTMLInputElement,
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field designer-field-label';
  label.textContent = labelText;
  label.appendChild(input);
  return { element: label, input };
}

function selectColorPaletteStop(palette: HTMLElement, index: number): void {
  const handles = colorPaletteHandles(palette);
  if (!Number.isInteger(index) || handles[index] === undefined) return;
  const stops = readColorPaletteStops(handles);
  if (stops === undefined) return;
  palette.dataset.colorPaletteSelectedStop = String(index);
  const fieldKey = palette.dataset.colorPaletteKey;
  if (fieldKey !== undefined) paletteSelectionCache.set(fieldKey, index);
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
    color.value = stops[index]!.color === 'transparent' ? DEFAULT_COLOR : stops[index]!.color;
    const valueText = color
      .closest<HTMLElement>('.designer-color-palette-color-control')
      ?.querySelector<HTMLElement>('.designer-color-palette-color-value');
    if (valueText !== null && valueText !== undefined) {
      valueText.textContent = color.value.toUpperCase();
    }
  }
  if (position !== null) {
    position.dataset.colorPaletteStopIndex = String(index);
    position.value = String(stops[index]!.position);
    position.min = String(index === 0 ? 0 : stops[index - 1]!.position + 1);
    position.max = String(index === stops.length - 1 ? 100 : stops[index + 1]!.position - 1);
  }
  if (remove !== null) remove.dataset.colorPaletteStopIndex = String(index);
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
    if (isValidColor(source.value)) {
      handle.dataset.colorPaletteStopColor = source.value;
      setColorPaletteStopHandleColor(handle, source.value);
    }
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
  const mode = palette.querySelector<HTMLInputElement>('[data-color-palette-field="mode"]:checked')
    ?.value as ColorPaletteMode | undefined;
  const solid = palette.querySelector<HTMLInputElement>(
    '[data-color-palette-field="solid"]',
  )?.value;
  const stops = readColorPaletteStops(colorPaletteHandles(palette));
  if (
    mode === undefined ||
    !isValidColor(solid) ||
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
  return { mode, solid: solid!, stops, angle, x, y };
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
    const match = token.match(/^(#[0-9a-f]{3,8}|transparent)\s+(\d+(?:\.\d+)?)%$/i);
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
