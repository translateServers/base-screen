import type { ScreenDocument } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import { appendDesignerFieldMessage, createDesignerSwitch } from '../designer-ui-primitives.js';
import {
  canvasBackgroundPaletteValue,
  type DesignerCanvasPresentationSettings,
  type DesignerCanvasScaleMode,
} from './designer-canvas-transactions.js';
import { appendSection } from './designer-panel-primitives.js';

interface CanvasField {
  readonly field: HTMLElement;
  readonly control: HTMLElement;
}

/**
 * 页面配置沿用组件检查器的字段行骨架（标签列 + 控件列，见 `.designer-field`），
 * 但按原型把内容拆成「画布 / 背景填充 / 背景图片」三段：每段用可折叠 details 承载，
 * 段内只靠留白分行，不逐行画通栏分隔线——行线会把一组设置切成表单条纹。
 */
export function appendCanvasControls(
  parent: HTMLElement,
  document: ScreenDocument,
  canvasBackgroundImageButtonVisible: boolean,
  canvasPresentation: DesignerCanvasPresentationSettings,
): void {
  const canvasSection = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.canvas);
  canvasSection.className += ' designer-canvas-section';
  appendCanvasSizeField(canvasSection, document);
  appendCanvasOpacityField(canvasSection, canvasPresentation);
  appendCanvasScaleField(canvasSection, canvasPresentation);
  appendCanvasSwitchField(
    canvasSection,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundAutoFill,
    'backgroundAutoFill',
    canvasPresentation.backgroundAutoFill,
  );
  appendCanvasSwitchField(
    canvasSection,
    DESIGNER_UI_TEXT.propertiesPanel.canvasDisableLoading,
    'disableComponentLoading',
    canvasPresentation.disableComponentLoading,
  );

  const backgroundSection = appendSection(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundSection,
  );
  backgroundSection.className += ' designer-canvas-background-section';
  appendCanvasBackgroundField(backgroundSection, document);

  const imageSection = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.canvasImageSection);
  imageSection.className += ' designer-canvas-image-section';
  appendCanvasBackgroundImageControls(imageSection, document, canvasBackgroundImageButtonVisible);
}

function createCanvasField(
  ownerDocument: Document,
  labelText: string,
  className = '',
): CanvasField {
  const field = ownerDocument.createElement('div');
  field.className = `designer-field designer-field-label${className}`;
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field-label-text';
  label.textContent = labelText;
  field.appendChild(label);
  const control = ownerDocument.createElement('span');
  control.className = 'designer-field-control';
  field.appendChild(control);
  return { field, control };
}

/** 几何输入：符号内嵌在输入框右缘（与组件几何网格同形），免去 W / H 这类前置小标题。 */
function createCanvasGeoInput(
  parent: HTMLElement,
  symbol: string,
  property: string,
  value: string | number,
  ariaLabel: string,
  options: { readonly min?: number; readonly max?: number; readonly step?: number } = {},
): HTMLInputElement {
  const ownerDocument = parent.ownerDocument;
  const field = ownerDocument.createElement('label');
  field.className = 'designer-geo-field';
  field.dataset.symbol = symbol;
  const input = ownerDocument.createElement('input');
  input.type = 'number';
  input.className = 'designer-control designer-input designer-number';
  input.value = String(value);
  input.dataset.canvasProperty = property;
  input.setAttribute('aria-label', ariaLabel);
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  field.appendChild(input);
  parent.appendChild(field);
  return input;
}

function appendCanvasSizeField(parent: HTMLElement, document: ScreenDocument): void {
  const { field, control } = createCanvasField(
    parent.ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.canvasDimensions,
    ' designer-canvas-size-field',
  );
  control.classList.add('designer-canvas-size-controls');
  createCanvasGeoInput(
    control,
    'W',
    'width',
    document.canvas.width,
    DESIGNER_UI_TEXT.propertiesPanel.canvasWidth,
    { min: 1, step: 1 },
  );
  const height = createCanvasGeoInput(
    control,
    'H',
    'height',
    document.canvas.height,
    DESIGNER_UI_TEXT.propertiesPanel.canvasHeight,
    { min: 1, step: 1 },
  );
  appendDesignerFieldMessage(field, height, 'canvas-height');
  parent.appendChild(field);
}

/** 画布不透明度与组件不透明度同一条读数语言：面板里一律 0–100，提交仍是 0–1。 */
function appendCanvasOpacityField(
  parent: HTMLElement,
  settings: DesignerCanvasPresentationSettings,
): void {
  const ownerDocument = parent.ownerDocument;
  const percent = Math.round(settings.opacity * 100);
  const { field, control } = createCanvasField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity,
    ' designer-canvas-opacity-field',
  );
  control.classList.add('designer-opacity-controls');
  const range = ownerDocument.createElement('input');
  range.type = 'range';
  range.className = 'designer-control designer-range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(percent);
  range.dataset.canvasSetting = 'opacity';
  range.dataset.opacityPercent = 'true';
  range.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity);
  const numberField = ownerDocument.createElement('label');
  numberField.className = 'designer-geo-field';
  numberField.dataset.symbol = '%';
  const number = ownerDocument.createElement('input');
  number.type = 'number';
  number.className =
    'designer-control designer-input designer-number designer-canvas-opacity-value';
  number.min = '0';
  number.max = '100';
  number.step = '1';
  number.value = String(percent);
  number.dataset.canvasSetting = 'opacity';
  number.dataset.opacityPercent = 'true';
  number.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity);
  numberField.appendChild(number);
  range.addEventListener('input', () => {
    number.value = range.value;
  });
  // 松手（change）由面板统一提交；可见读数在拖动过程中先跟上。
  range.addEventListener('change', () => {
    number.value = range.value;
  });
  number.addEventListener('input', () => {
    range.value = number.value;
  });
  control.appendChild(range);
  control.appendChild(numberField);
  appendDesignerFieldMessage(field, number, 'canvas-opacity');
  parent.appendChild(field);
}

/** 六档缩放方式：分段控件顶满一行，标签在上（原型 .insp-field），避免标签列挤掉档位文案。 */
function appendCanvasScaleField(
  parent: HTMLElement,
  settings: DesignerCanvasPresentationSettings,
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createCanvasField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode,
    ' designer-field-stacked designer-canvas-scale-field',
  );
  const options = ownerDocument.createElement('span');
  options.className = 'designer-canvas-scale-options';
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode);
  const scaleOptions: readonly [DesignerCanvasScaleMode, string][] = [
    ['fill', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFill],
    ['fit', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFit],
    ['width', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleWidth],
    ['height', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleHeight],
    ['original', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleOriginal],
    ['none', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleNone],
  ];
  for (const [value, label] of scaleOptions) {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button designer-canvas-scale-option';
    button.dataset.canvasSetting = 'scaleMode';
    button.dataset.canvasSettingValue = value;
    button.textContent = label;
    button.setAttribute('data-tip', label);
    button.ariaPressed = String(settings.scaleMode === value);
    options.appendChild(button);
  }
  control.appendChild(options);
  parent.appendChild(field);
}

function appendCanvasSwitchField(
  parent: HTMLElement,
  labelText: string,
  setting: 'backgroundAutoFill' | 'disableComponentLoading',
  checked: boolean,
): void {
  const ownerDocument = parent.ownerDocument;
  // 开关行：标签左、开关右（原型 .toggle-row），长标签换行时开关仍贴右缘。
  const field = ownerDocument.createElement('label');
  field.className = 'designer-field designer-field-label designer-canvas-setting-checkbox';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field-label-text';
  label.textContent = labelText;
  field.appendChild(label);
  const input = createDesignerSwitch(ownerDocument, {
    ariaLabel: labelText,
    checked,
    value: String(checked),
  });
  input.dataset.canvasSetting = setting;
  field.appendChild(input);
  appendDesignerFieldMessage(field, input, `canvas-${setting}`);
  parent.appendChild(field);
}

/**
 * 背景填充直接复用检查器的统一颜色控件（`createDesignerColorPalette`）：单色 / 线性 /
 * 径向三种模式、色标增删、角度与中心、透明度以及取色弹层，全部由该控件自带的交互承担，
 * 这里只负责把画布背景读成它认识的整段颜色值，并在 `change` 时提交一次 `update-canvas`。
 * 页面配置因此不再有第二套颜色 UI，开关外观与组件检查器的颜色字段完全一致。
 */
function appendCanvasBackgroundField(parent: HTMLElement, document: ScreenDocument): void {
  const ownerDocument = parent.ownerDocument;
  const field = ownerDocument.createElement('span');
  field.className =
    'designer-field designer-field-label designer-field-stacked designer-canvas-background-field';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-field-label-text';
  label.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasBackground;
  field.appendChild(label);
  const control = ownerDocument.createElement('span');
  control.className = 'designer-field-control';
  const palette = createDesignerColorPalette(
    ownerDocument,
    canvasBackgroundPaletteValue(document),
    'canvas:background',
    { allowGradient: true },
  );
  // 标记挂在调色板根节点上，而不是控件列表上：增删色标时控件会被整段重建，
  // 挂在外层才在重建后仍然可达，读值也统一从调色板状态重新序列化。
  palette.element.dataset.canvasProperty = 'background';
  control.appendChild(palette.element);
  field.appendChild(control);
  appendDesignerFieldMessage(field, palette.controls[0]!, 'canvas-background');
  parent.appendChild(field);
}

function appendCanvasBackgroundImageControls(
  parent: HTMLElement,
  document: ScreenDocument,
  pickerVisible: boolean,
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createCanvasField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.canvasImageUrl,
    ' designer-canvas-image-field',
  );
  const input = ownerDocument.createElement('input');
  input.type = 'text';
  input.className = 'designer-control designer-input';
  input.value = document.canvas.backgroundImage ?? '';
  input.dataset.canvasProperty = 'backgroundImage';
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.backgroundImage);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  control.appendChild(input);
  appendDesignerFieldMessage(field, input, 'canvas-backgroundImage');
  if (pickerVisible) {
    // 背景图片：宿主选择按钮（ADR-0046）默认隐藏，仅宿主配置后渲染；
    // 点击派发请求事件，宿主自开弹出框可视化选择。
    const pickerButton = ownerDocument.createElement('button');
    pickerButton.type = 'button';
    pickerButton.className = 'designer-control designer-button designer-canvas-image-picker';
    pickerButton.dataset.canvasBackgroundImageAction = '';
    pickerButton.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundImageAction;
    control.appendChild(pickerButton);
  }
  parent.appendChild(field);

  const fitField = createCanvasField(
    ownerDocument,
    DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFit,
    ' designer-canvas-image-fit-field',
  );
  const select = ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.disabled = document.canvas.backgroundImage === undefined;
  select.dataset.canvasProperty = 'backgroundImageFit';
  for (const [option, label] of [
    ['cover', DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFitCover],
    ['contain', DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFitContain],
  ] as const) {
    const element = ownerDocument.createElement('option');
    element.value = option;
    element.textContent = label;
    select.appendChild(element);
  }
  select.value = document.canvas.backgroundImageFit ?? 'cover';
  fitField.control.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(fitField.field, select, 'canvas-backgroundImageFit');
  parent.appendChild(fitField.field);
}
