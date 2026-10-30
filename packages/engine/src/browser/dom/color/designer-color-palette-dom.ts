import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { createDesignerButton, createDesignerIconButton } from '../designer-ui-primitives.js';
import { renderPaletteBody } from './designer-color-palette-body-dom.js';
import {
  addColorPaletteStop,
  type ColorPaletteState,
  cacheColorPaletteDraft,
  cacheColorPaletteSelection,
  colorPaletteDraft,
  colorPaletteSelection,
  type DesignerColorPalette,
  type DesignerColorPaletteOptions,
  isColorPaletteMode,
  parseColorPaletteValue,
  removeColorPaletteStop,
  serializeColorPaletteValue,
  switchColorPaletteMode,
} from './designer-color-palette-model.js';
import {
  addedColorPaletteStopIndex,
  isDesignerFillColorPickerProxyDispatch,
  readPaletteState,
  selectColorPaletteStop,
  selectedColorPaletteStop,
  selectedColorPaletteStopFromCache,
  syncColorPaletteAlpha,
  syncColorPaletteManualValue,
  syncColorPaletteStopEditor,
  updateColorPalettePreview,
  updateDesignerColorPaletteChrome,
} from './designer-color-palette-state-dom.js';
import {
  isColorPaletteManualValueField,
  updateColorPaletteManualValueValidity,
} from './designer-color-palette-value-dom.js';
import {
  bindDesignerColorPaletteDismiss,
  focusDesignerColorPaletteDialog,
  restoreDesignerColorPaletteOpen,
  setDesignerColorPaletteOpen,
} from './designer-color-popover-dom.js';
import { setDesignerFillColorPickerDisabled } from './designer-fill-color-picker-dom.js';

export {
  addColorPaletteStop,
  type ColorPaletteMode,
  type ColorPaletteState,
  type ColorPaletteStop,
  clearColorPaletteDraftCache,
  colorPaletteDraftCacheSizes,
  type DesignerColorPalette,
  type DesignerColorPaletteOptions,
  deriveColorPaletteStopsFromSolid,
  MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES,
  MAX_COLOR_PALETTE_STOPS,
  MIN_COLOR_PALETTE_STOPS,
  parseColorPaletteValue,
  removeColorPaletteStop,
  serializeColorPaletteValue,
  switchColorPaletteMode,
  updateColorPaletteStop,
} from './designer-color-palette-model.js';

function createColorPaletteTrigger(ownerDocument: Document, popoverId: string): HTMLButtonElement {
  const trigger = createDesignerButton(ownerDocument, {
    className: 'designer-color-palette-trigger',
  });
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
  const caret = ownerDocument.createElement('span');
  caret.className = 'designer-color-palette-trigger-caret';
  caret.innerHTML = designerIcon('chevron-down');
  trigger.appendChild(swatch);
  trigger.appendChild(value);
  trigger.appendChild(caret);
  return trigger;
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
  const cached = fieldKey === undefined ? undefined : colorPaletteDraft(fieldKey);
  // 仅当文档值仍等于缓存当前模式的序列化结果时复用草稿（撤销/重做/替换文档会自然失效）。
  const cachedState =
    cached !== undefined && serializeColorPaletteValue(cached) === value ? cached : parsed;
  const state = allowGradient ? cachedState : solidColorPaletteState(cachedState);
  const cachedSelection = fieldKey === undefined ? undefined : colorPaletteSelection(fieldKey);
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
  if (fieldKey !== undefined) {
    popover.dataset.designerScrollScope = `color-palette:${fieldKey}`;
  }
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.colorPickerTitle);
  const toolbar = ownerDocument.createElement('div');
  toolbar.className = 'designer-color-popover-toolbar';
  const close = createDesignerIconButton(ownerDocument, {
    className: 'designer-color-popover-close',
    icon: 'close',
    label: DESIGNER_UI_TEXT.propertiesPanel.colorPickerClose,
  });
  close.dataset.colorPaletteAction = 'close';

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
      modeLabel.setAttribute('data-tip', label);
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
    if (isDesignerFillColorPickerProxyDispatch(element)) return;
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
