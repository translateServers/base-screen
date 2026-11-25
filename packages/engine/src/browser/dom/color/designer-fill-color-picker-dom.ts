import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerInput } from '../designer-ui-primitives.js';
import {
  clampDesignerFillColor,
  designerFillRgbaToHsva,
  parseDesignerFillColor,
  resolveDesignerFillHue,
} from './designer-fill-color-model.js';
import { bindPickerEvents } from './designer-fill-color-picker-events.js';
import {
  type DesignerFillColorPickerCallbacks,
  type DesignerFillColorPickerRuntime,
  type PickerChannel,
  renderPicker,
} from './designer-fill-color-picker-runtime.js';

export type { DesignerFillColorPickerCallbacks } from './designer-fill-color-picker-runtime.js';

/** 常用颜色：键是文案表里的颜色名（悬停提示「名称 · 色值」）。 */
const QUICK_COLORS = [
  ['blue', '#2483ff'],
  ['teal', '#39c5bb'],
  ['mint', '#00c9a7'],
  ['violet', '#7c6cff'],
  ['amber', '#f0b94b'],
  ['coral', '#ff765c'],
  ['rose', '#ed5f82'],
  ['silver', '#d9e0e8'],
  ['ink', '#18222e'],
] as const;

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
    const input = createDesignerInput(ownerDocument, {
      type: channel === 'hex' ? 'text' : 'number',
      ariaLabel: channel === 'hex' ? 'Hex' : channel.toUpperCase(),
    });
    input.dataset.fillColorChannel = channel;
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
  for (const [name, color] of QUICK_COLORS) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-fill-color-swatch';
    button.dataset.fillColorQuick = color;
    button.setAttribute('style', `--designer-fill-swatch:${color}`);
    const label = DESIGNER_UI_TEXT.propertiesPanel.colorPickerQuickColor(
      DESIGNER_UI_TEXT.propertiesPanel.colorPickerQuickColorNames[name],
      color.toUpperCase(),
    );
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tip', label);
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
  const input = createDesignerInput(ownerDocument, {
    appearance: 'range',
    className,
    max: maximum,
    min: minimum,
    step: 1,
  });
  input.setAttribute('aria-label', label);
  return input;
}
