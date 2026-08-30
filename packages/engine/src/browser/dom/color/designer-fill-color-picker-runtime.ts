import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerFillRgbaColor, designerFillColorToHex } from './designer-fill-color-model.js';

export type PickerChannel = 'hex' | 'r' | 'g' | 'b' | 'a';

export interface DesignerFillColorPickerCallbacks {
  readonly input: (value: string) => void;
  readonly change: (value: string) => void;
  readonly hueChange?: (value: number, color: string) => void;
  readonly planeChange?: (saturation: number, value: number, color: string) => void;
}

export interface DesignerFillColorPickerRuntime {
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

export function currentValue(runtime: DesignerFillColorPickerRuntime): string {
  return designerFillColorToHex(runtime.color);
}

export function renderPicker(element: HTMLElement, runtime: DesignerFillColorPickerRuntime): void {
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
