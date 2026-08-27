import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  clampDesignerFillColor,
  type DesignerFillRgbaColor,
  designerFillColorToHex,
  designerFillHsvaToRgba,
  designerFillRgbaToHsva,
  parseDesignerFillColor,
  resolveDesignerFillHue,
} from './designer-fill-color-model.js';

const QUICK_COLORS = [
  '#2483ff',
  '#39c5bb',
  '#00c9a7',
  '#7c6cff',
  '#f0b94b',
  '#ff765c',
  '#ed5f82',
  '#d9e0e8',
  '#18222e',
] as const;

type PickerChannel = 'hex' | 'r' | 'g' | 'b' | 'a';

export interface DesignerFillColorPickerCallbacks {
  readonly input: (value: string) => void;
  readonly change: (value: string) => void;
  readonly hueChange?: (value: number, color: string) => void;
  readonly planeChange?: (saturation: number, value: number, color: string) => void;
}

interface DesignerFillColorPickerRuntime {
  color: DesignerFillRgbaColor;
  hueValue: number;
  planeSaturation: number;
  planeValue: number;
  readonly callbacks: DesignerFillColorPickerCallbacks;
  readonly plane: HTMLButtonElement;
  readonly hue: HTMLInputElement;
  readonly alpha: HTMLInputElement;
  readonly channels: Readonly<Record<PickerChannel, HTMLInputElement>>;
  readonly message: HTMLElement;
  readonly controls: readonly (HTMLButtonElement | HTMLInputElement)[];
}

const pickerRuntime = new WeakMap<HTMLElement, DesignerFillColorPickerRuntime>();

export function createDesignerFillColorPicker(
  ownerDocument: Document,
  value: string,
  callbacks: DesignerFillColorPickerCallbacks,
  initialHue?: number,
  initialPlane?: { readonly s: number; readonly v: number },
): HTMLElement {
  const element = ownerDocument.createElement('section');
  element.className = 'designer-fill-color-picker';
  element.dataset.designerFillColorPicker = '';

  const plane = ownerDocument.createElement('button');
  plane.type = 'button';
  plane.className = 'designer-fill-color-plane';
  plane.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.colorPickerPlane);
  const thumb = ownerDocument.createElement('span');
  thumb.className = 'designer-fill-color-plane-thumb';
  plane.appendChild(thumb);
  element.appendChild(plane);

  const sliderRow = ownerDocument.createElement('div');
  sliderRow.className = 'designer-fill-color-slider-row';
  const sliders = ownerDocument.createElement('div');
  sliders.className = 'designer-fill-color-sliders';
  const hue = colorRange(
    ownerDocument,
    'designer-fill-color-hue',
    0,
    360,
    DESIGNER_UI_TEXT.propertiesPanel.colorPickerHue,
  );
  const hueTrack = ownerDocument.createElement('label');
  hueTrack.className = 'designer-fill-color-hue-track';
  hueTrack.appendChild(hue);
  const alpha = colorRange(
    ownerDocument,
    'designer-fill-color-alpha',
    0,
    100,
    DESIGNER_UI_TEXT.propertiesPanel.gradientStopOpacity,
  );
  const alphaTrack = ownerDocument.createElement('label');
  alphaTrack.className = 'designer-fill-color-alpha-track designer-fill-color-checkerboard';
  alphaTrack.appendChild(alpha);
  sliders.appendChild(hueTrack);
  sliders.appendChild(alphaTrack);
  const current = ownerDocument.createElement('span');
  current.className = 'designer-fill-color-current designer-fill-color-checkerboard';
  current.setAttribute('aria-hidden', 'true');
  sliderRow.appendChild(sliders);
  sliderRow.appendChild(current);
  element.appendChild(sliderRow);

  const channelGrid = ownerDocument.createElement('div');
  channelGrid.className = 'designer-fill-color-channel-grid';
  const channels = {} as Record<PickerChannel, HTMLInputElement>;
  for (const channel of ['hex', 'r', 'g', 'b', 'a'] as const) {
    const label = ownerDocument.createElement('label');
    label.className = `designer-fill-color-channel designer-fill-color-channel-${channel}`;
    const input = ownerDocument.createElement('input');
    input.type = channel === 'hex' ? 'text' : 'number';
    input.className = 'designer-control designer-input';
    input.dataset.fillColorChannel = channel;
    input.setAttribute('aria-label', channel === 'hex' ? 'Hex' : channel.toUpperCase());
    if (channel === 'hex') {
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.maxLength = 9;
    } else {
      input.min = '0';
      input.max = channel === 'a' ? '100' : '255';
      input.step = '1';
    }
    const text = ownerDocument.createElement('span');
    text.textContent = channel === 'hex' ? 'Hex' : channel.toUpperCase();
    label.appendChild(input);
    label.appendChild(text);
    channelGrid.appendChild(label);
    channels[channel] = input;
  }
  element.appendChild(channelGrid);

  const message = ownerDocument.createElement('p');
  message.className = 'designer-fill-color-message';
  message.setAttribute('aria-live', 'polite');
  element.appendChild(message);

  const quick = ownerDocument.createElement('section');
  quick.className = 'designer-fill-color-quick';
  const quickTitle = ownerDocument.createElement('span');
  quickTitle.textContent = DESIGNER_UI_TEXT.propertiesPanel.colorPickerQuickColors;
  quick.appendChild(quickTitle);
  const quickGrid = ownerDocument.createElement('div');
  const quickButtons: HTMLButtonElement[] = [];
  for (const color of QUICK_COLORS) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-fill-color-swatch';
    button.dataset.fillColorQuick = color;
    button.setAttribute('style', `--designer-fill-swatch:${color}`);
    button.setAttribute(
      'aria-label',
      DESIGNER_UI_TEXT.propertiesPanel.colorPickerQuickColor(color),
    );
    quickGrid.appendChild(button);
    quickButtons.push(button);
  }
  quick.appendChild(quickGrid);
  element.appendChild(quick);

  const initialColor = parseDesignerFillColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const initialHsva = designerFillRgbaToHsva(initialColor);
  const runtime: DesignerFillColorPickerRuntime = {
    color: initialColor,
    hueValue:
      initialHue === undefined
        ? resolveDesignerFillHue(initialColor)
        : clampDesignerFillColor(initialHue, 0, 360),
    planeSaturation: clampDesignerFillColor(initialPlane?.s ?? initialHsva.s, 0, 100),
    planeValue: clampDesignerFillColor(initialPlane?.v ?? initialHsva.v, 0, 100),
    callbacks,
    plane,
    hue,
    alpha,
    channels,
    message,
    controls: [plane, hue, alpha, ...Object.values(channels), ...quickButtons],
  };
  pickerRuntime.set(element, runtime);
  bindPickerEvents(element, runtime, quickButtons);
  renderPicker(element, runtime);
  return element;
}

export function updateDesignerFillColorPicker(element: HTMLElement, value: string): void {
  const runtime = pickerRuntime.get(element);
  const color = parseDesignerFillColor(value);
  if (runtime === undefined || color === undefined) return;
  const hsva = designerFillRgbaToHsva(color);
  runtime.hueValue = resolveDesignerFillHue(color, runtime.hueValue);
  runtime.planeSaturation = hsva.s;
  runtime.planeValue = hsva.v;
  runtime.color = color;
  runtime.message.textContent = '';
  renderPicker(element, runtime);
}

export function setDesignerFillColorPickerDisabled(element: HTMLElement, disabled: boolean): void {
  const runtime = pickerRuntime.get(element);
  if (runtime === undefined) return;
  for (const control of runtime.controls) {
    if (control.disabled !== disabled) control.disabled = disabled;
  }
}

function colorRange(
  ownerDocument: Document,
  className: string,
  minimum: number,
  maximum: number,
  label: string,
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'range';
  input.className = className;
  input.min = String(minimum);
  input.max = String(maximum);
  input.step = '1';
  input.setAttribute('aria-label', label);
  return input;
}

function bindPickerEvents(
  element: HTMLElement,
  runtime: DesignerFillColorPickerRuntime,
  quickButtons: readonly HTMLButtonElement[],
): void {
  const updateFromPointer = (event: PointerEvent, change: boolean): void => {
    const bounds = runtime.plane.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const saturation = clampDesignerFillColor(
      ((event.clientX - bounds.left) / bounds.width) * 100,
      0,
      100,
    );
    const value = clampDesignerFillColor(
      100 - ((event.clientY - bounds.top) / bounds.height) * 100,
      0,
      100,
    );
    const hsva = designerFillRgbaToHsva(runtime.color);
    commitPickerColor(
      element,
      runtime,
      designerFillHsvaToRgba({
        ...hsva,
        h: runtime.hueValue,
        s: saturation,
        v: value,
      }),
      change,
      runtime.hueValue,
      { s: saturation, v: value },
    );
  };
  let activePlanePointer: number | undefined;
  const releasePlanePointer = (pointerId: number): void => {
    activePlanePointer = undefined;
    const plane = runtime.plane as HTMLButtonElement & {
      hasPointerCapture?: (pointerId: number) => boolean;
      releasePointerCapture?: (pointerId: number) => void;
    };
    if (plane.hasPointerCapture?.(pointerId) === true) {
      plane.releasePointerCapture?.(pointerId);
    }
  };
  runtime.plane.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    activePlanePointer = event.pointerId;
    const plane = runtime.plane as HTMLButtonElement & {
      setPointerCapture?: (pointerId: number) => void;
    };
    plane.setPointerCapture?.(event.pointerId);
    updateFromPointer(event, false);
  });
  runtime.plane.addEventListener('pointermove', (event) => {
    if (activePlanePointer === event.pointerId) updateFromPointer(event, false);
  });
  runtime.plane.addEventListener('pointerup', (event) => {
    if (activePlanePointer !== event.pointerId) return;
    updateFromPointer(event, true);
    releasePlanePointer(event.pointerId);
  });
  runtime.plane.addEventListener('pointercancel', (event) => {
    if (activePlanePointer !== event.pointerId) return;
    runtime.callbacks.change(currentValue(runtime));
    releasePlanePointer(event.pointerId);
  });
  runtime.plane.addEventListener('lostpointercapture', (event) => {
    if (activePlanePointer !== event.pointerId) return;
    activePlanePointer = undefined;
    runtime.callbacks.change(currentValue(runtime));
  });
  runtime.plane.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(keyboardEvent.key)) return;
    event.preventDefault();
    const amount = keyboardEvent.shiftKey ? 10 : 1;
    const hsva = designerFillRgbaToHsva(runtime.color);
    const saturation =
      runtime.planeSaturation +
      (keyboardEvent.key === 'ArrowRight'
        ? amount
        : keyboardEvent.key === 'ArrowLeft'
          ? -amount
          : 0);
    const value =
      runtime.planeValue +
      (keyboardEvent.key === 'ArrowUp' ? amount : keyboardEvent.key === 'ArrowDown' ? -amount : 0);
    commitPickerColor(
      element,
      runtime,
      designerFillHsvaToRgba({
        ...hsva,
        h: runtime.hueValue,
        s: saturation,
        v: value,
      }),
      true,
      runtime.hueValue,
      { s: saturation, v: value },
    );
  });
  for (const input of [runtime.hue, runtime.alpha]) {
    input.addEventListener('input', () => commitSliders(element, runtime, false));
    input.addEventListener('change', () => runtime.callbacks.change(currentValue(runtime)));
  }
  for (const input of Object.values(runtime.channels)) {
    input.addEventListener('change', () => commitChannel(element, runtime, input));
  }
  for (const button of quickButtons) {
    button.addEventListener('click', () => {
      const color = parseDesignerFillColor(button.dataset.fillColorQuick ?? '');
      if (color !== undefined) commitPickerColor(element, runtime, color, true);
    });
  }
}

function commitSliders(
  element: HTMLElement,
  runtime: DesignerFillColorPickerRuntime,
  change: boolean,
): void {
  const hsva = designerFillRgbaToHsva(runtime.color);
  const hue = Number(runtime.hue.value);
  commitPickerColor(
    element,
    runtime,
    designerFillHsvaToRgba({
      ...hsva,
      h: hue,
      s: runtime.planeSaturation,
      v: runtime.planeValue,
      a: Number(runtime.alpha.value) / 100,
    }),
    change,
    hue,
  );
}

function commitChannel(
  element: HTMLElement,
  runtime: DesignerFillColorPickerRuntime,
  input: HTMLInputElement,
): void {
  const channel = input.dataset.fillColorChannel as PickerChannel | undefined;
  let color: DesignerFillRgbaColor | undefined;
  if (channel === 'hex') color = parseDesignerFillColor(input.value);
  if (channel === 'r' || channel === 'g' || channel === 'b' || channel === 'a') {
    const value = Number(input.value);
    const maximum = channel === 'a' ? 100 : 255;
    if (Number.isFinite(value) && value >= 0 && value <= maximum) {
      color =
        channel === 'a'
          ? { ...runtime.color, a: value / 100 }
          : { ...runtime.color, [channel]: Math.round(value) };
    }
  }
  if (color === undefined) {
    input.setAttribute('aria-invalid', 'true');
    runtime.message.textContent = DESIGNER_UI_TEXT.propertiesPanel.colorPickerHexInvalid;
    return;
  }
  input.removeAttribute('aria-invalid');
  runtime.message.textContent = '';
  commitPickerColor(element, runtime, color, true);
}

function commitPickerColor(
  element: HTMLElement,
  runtime: DesignerFillColorPickerRuntime,
  color: DesignerFillRgbaColor,
  change: boolean,
  hue?: number,
  plane?: { readonly s: number; readonly v: number },
): void {
  runtime.color = {
    r: clampDesignerFillColor(color.r, 0, 255),
    g: clampDesignerFillColor(color.g, 0, 255),
    b: clampDesignerFillColor(color.b, 0, 255),
    a: clampDesignerFillColor(color.a, 0, 1),
  };
  runtime.hueValue =
    hue === undefined
      ? resolveDesignerFillHue(runtime.color, runtime.hueValue)
      : clampDesignerFillColor(hue, 0, 360);
  if (plane === undefined) {
    const hsva = designerFillRgbaToHsva(runtime.color);
    runtime.planeSaturation = hsva.s;
    runtime.planeValue = hsva.v;
  } else {
    runtime.planeSaturation = clampDesignerFillColor(plane.s, 0, 100);
    runtime.planeValue = clampDesignerFillColor(plane.v, 0, 100);
  }
  runtime.callbacks.hueChange?.(runtime.hueValue, currentValue(runtime));
  runtime.callbacks.planeChange?.(
    runtime.planeSaturation,
    runtime.planeValue,
    currentValue(runtime),
  );
  renderPicker(element, runtime);
  runtime.callbacks.input(currentValue(runtime));
  if (change) runtime.callbacks.change(currentValue(runtime));
}

function currentValue(runtime: DesignerFillColorPickerRuntime): string {
  return designerFillColorToHex(runtime.color);
}

function renderPicker(element: HTMLElement, runtime: DesignerFillColorPickerRuntime): void {
  const opaque = designerFillColorToHex({ ...runtime.color, a: 1 }, false);
  element.setAttribute(
    'style',
    `--designer-fill-hue:${runtime.hueValue};--designer-fill-saturation:${runtime.planeSaturation};--designer-fill-value:${runtime.planeValue};--designer-fill-color:${currentValue(runtime)};--designer-fill-opaque:${opaque}`,
  );
  runtime.plane.setAttribute(
    'aria-valuetext',
    DESIGNER_UI_TEXT.propertiesPanel.colorPickerPlaneValue(
      Math.round(runtime.planeSaturation),
      Math.round(runtime.planeValue),
    ),
  );
  runtime.hue.value = String(Math.round(runtime.hueValue));
  runtime.alpha.value = String(Math.round(runtime.color.a * 100));
  runtime.channels.hex.value = designerFillColorToHex(runtime.color, false);
  runtime.channels.r.value = String(Math.round(runtime.color.r));
  runtime.channels.g.value = String(Math.round(runtime.color.g));
  runtime.channels.b.value = String(Math.round(runtime.color.b));
  runtime.channels.a.value = String(Math.round(runtime.color.a * 100));
}
