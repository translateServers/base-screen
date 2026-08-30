import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import {
  type ColorPaletteState,
  cacheColorPaletteHue,
  cacheColorPalettePlane,
  colorPaletteHue,
  colorPalettePlane,
  MAX_COLOR_PALETTE_STOPS,
  MIN_COLOR_PALETTE_STOPS,
} from './designer-color-palette-model.js';
import {
  applyDesignerFillColorPickerValue,
  beginColorPaletteStopDrag,
  moveColorPaletteStopWithKeyboard,
  setColorPalettePreview,
  setColorPaletteStopHandleColor,
  setColorPaletteStopHandlePosition,
  updateColorPaletteHandleAccessibility,
} from './designer-color-palette-state-dom.js';
import {
  colorAlphaControl,
  inlineNumberField,
  paletteColorControl,
} from './designer-color-palette-value-dom.js';
import { createDesignerFillColorPicker } from './designer-fill-color-picker-dom.js';

export function renderPaletteBody(
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
  const cachedHue = fieldKey === undefined ? undefined : colorPaletteHue(fieldKey);
  const initialPickerHue =
    cachedHue?.color === pickerValue.toLowerCase() ? cachedHue.hue : undefined;
  const cachedPlane = fieldKey === undefined ? undefined : colorPalettePlane(fieldKey);
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
