import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  type ColorPaletteManualValueField,
  type ColorPaletteState,
  cacheColorPaletteSelection,
  isValidColor,
  serializeColorPaletteValue,
} from './designer-color-palette-model.js';
import { readPaletteState } from './designer-color-palette-state-reader.js';
import {
  colorPaletteHandles,
  readColorPaletteStops,
  selectedColorPaletteStop,
  setColorPaletteStopHandleColor,
  setColorPaletteStopHandlePosition,
  updateColorPaletteHandleAccessibility,
} from './designer-color-palette-stop-utils.js';
import {
  applyColorPaletteColorInputValue,
  colorAlphaFromPercent,
  colorAlphaPercent,
  colorPaletteTriggerSummary,
  composedColorValue,
  normalizeColorPaletteManualValue,
  updateColorControlValueText,
  updateColorPaletteManualValueValidity,
} from './designer-color-palette-value-dom.js';
import { updateDesignerFillColorPicker } from './designer-fill-color-picker-dom.js';

export { readPaletteState } from './designer-color-palette-state-reader.js';
export {
  addedColorPaletteStopIndex,
  selectedColorPaletteStop,
  selectedColorPaletteStopFromCache,
  setColorPaletteStopHandleColor,
  setColorPaletteStopHandlePosition,
  updateColorPaletteHandleAccessibility,
} from './designer-color-palette-stop-utils.js';

const colorPalettePickerProxyDispatch = new WeakSet<HTMLElement>();

export function isDesignerFillColorPickerProxyDispatch(palette: HTMLElement): boolean {
  return colorPalettePickerProxyDispatch.has(palette);
}

export function updateDesignerColorPaletteChrome(palette: HTMLElement, updatePicker = true): void {
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

function activeDesignerColorPaletteValue(state: ColorPaletteState, palette: HTMLElement): string {
  if (state.mode === 'solid') return state.solid;
  return state.stops[selectedColorPaletteStop(palette, state.stops.length)]?.color ?? state.solid;
}

export function applyDesignerFillColorPickerValue(
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

export function selectColorPaletteStop(palette: HTMLElement, index: number): void {
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

export function syncColorPaletteAlpha(
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

export function syncColorPaletteManualValue(
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

export function syncColorPaletteStopEditor(
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

export function beginColorPaletteStopDrag(handle: HTMLButtonElement, event: PointerEvent): void {
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

export function moveColorPaletteStopWithKeyboard(
  handle: HTMLButtonElement,
  event: KeyboardEvent,
): void {
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

export function updateColorPalettePreview(palette: HTMLElement): void {
  const state = readPaletteState(palette);
  const preview = palette.querySelector<HTMLElement>('.designer-color-palette-preview');
  if (state !== undefined && preview !== null) setColorPalettePreview(preview, state);
  if (state !== undefined) {
    updateDesignerColorPaletteChrome(palette, !colorPalettePickerProxyDispatch.has(palette));
  }
}

export function setColorPalettePreview(preview: HTMLElement, state: ColorPaletteState): void {
  const previewStyle = (preview as { style?: { background?: string } }).style;
  if (previewStyle !== undefined) {
    previewStyle.background = serializeColorPaletteValue({
      ...state,
      mode: state.mode === 'solid' ? 'linear-gradient' : state.mode,
    });
  }
}
