import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  clampDesignerFillColor,
  type DesignerFillRgbaColor,
  designerFillHsvaToRgba,
  designerFillRgbaToHsva,
  parseDesignerFillColor,
  resolveDesignerFillHue,
} from './designer-fill-color-model.js';
import {
  currentValue,
  type DesignerFillColorPickerRuntime,
  type PickerChannel,
  renderPicker,
} from './designer-fill-color-picker-runtime.js';

export function bindPickerEvents(
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
