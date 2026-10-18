import type { ScreenDocument } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import {
  appendDesignerRangeField,
  createDesignerFieldElement,
  createDesignerFieldRow,
  type DesignerFieldRow,
  type DesignerFieldRowOptions,
} from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
  createDesignerSwitch,
} from '../designer-ui-primitives.js';
import {
  canvasBackgroundPaletteValue,
  type DesignerCanvasPresentationSettings,
  type DesignerCanvasScaleMode,
} from './designer-canvas-transactions.js';
import { appendSection } from './designer-panel-primitives.js';

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
  const input = createDesignerInput(ownerDocument, {
    appearance: 'number',
    ariaLabel,
    value: String(value),
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.min === undefined ? {} : { min: options.min }),
    ...(options.step === undefined ? {} : { step: options.step }),
  });
  input.dataset.canvasProperty = property;
  field.appendChild(input);
  parent.appendChild(field);
  return input;
}

/**
 * 页面配置行：沿用检查器的字段行骨架，但容器固定为 `div`——这些行里会出现按钮
 * （缩放档位、背景图片选择），用 `label` 会把点击转发给行内第一个可标注控件。
 */
function createCanvasFieldRow(
  ownerDocument: Document,
  options: Omit<DesignerFieldRowOptions, 'tagName'>,
): DesignerFieldRow {
  return createDesignerFieldRow(ownerDocument, { ...options, tagName: 'div' });
}

function appendCanvasSizeField(parent: HTMLElement, document: ScreenDocument): void {
  const { field, control } = createCanvasFieldRow(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasDimensions,
    className: 'designer-canvas-size-field',
    controlClassName: 'designer-canvas-size-controls',
  });
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
  const percent = Math.round(settings.opacity * 100);
  const { field, control } = createCanvasFieldRow(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity,
    className: 'designer-canvas-opacity-field',
  });
  // 松手（change）由面板统一提交：滑杆自身的 change 冒泡即可，不需要再转发一次。
  const { range, number } = appendDesignerRangeField(control, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity,
    min: 0,
    max: 100,
    step: 1,
    value: String(percent),
    numberClassName: 'designer-field-range-value designer-canvas-opacity-value',
    numberSymbol: '%',
  });
  for (const target of [range, number]) {
    target.dataset.canvasSetting = 'opacity';
    target.dataset.opacityPercent = 'true';
  }
  appendDesignerFieldMessage(field, number, 'canvas-opacity');
  parent.appendChild(field);
}

/** 六档缩放方式：分段控件顶满一行，标签在上（原型 .insp-field），避免标签列挤掉档位文案。 */
function appendCanvasScaleField(
  parent: HTMLElement,
  settings: DesignerCanvasPresentationSettings,
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createCanvasFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode,
    stacked: true,
    className: 'designer-canvas-scale-field',
  });
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
    const button = createDesignerButton(ownerDocument, {
      className: 'designer-canvas-scale-option',
      text: label,
      tip: label,
      pressed: settings.scaleMode === value,
    });
    button.dataset.canvasSetting = 'scaleMode';
    button.dataset.canvasSettingValue = value;
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
  const field = createDesignerFieldElement(ownerDocument, {
    label: labelText,
    className: 'designer-canvas-setting-checkbox',
  });
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
  const { field, control } = createDesignerFieldRow(parent.ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasBackground,
    tagName: 'span',
    stacked: true,
    className: 'designer-canvas-background-field',
  });
  const palette = createDesignerColorPalette(
    parent.ownerDocument,
    canvasBackgroundPaletteValue(document),
    'canvas:background',
    { allowGradient: true },
  );
  // 标记挂在调色板根节点上，而不是控件列表上：增删色标时控件会被整段重建，
  // 挂在外层才在重建后仍然可达，读值也统一从调色板状态重新序列化。
  palette.element.dataset.canvasProperty = 'background';
  control.appendChild(palette.element);
  appendDesignerFieldMessage(field, palette.controls[0]!, 'canvas-background');
  parent.appendChild(field);
}

function appendCanvasBackgroundImageControls(
  parent: HTMLElement,
  document: ScreenDocument,
  pickerVisible: boolean,
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createCanvasFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasImageUrl,
    className: 'designer-canvas-image-field',
  });
  const input = createDesignerInput(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.backgroundImage,
    placeholder: DESIGNER_UI_TEXT.propertiesPanel.canvasImageUrlPlaceholder,
    value: document.canvas.backgroundImage ?? '',
  });
  input.dataset.canvasProperty = 'backgroundImage';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  // 清空即删除背景图（事务层把空串翻译成 backgroundImage: null），把这条语义写进描述。
  input.ariaDescription = DESIGNER_UI_TEXT.propertiesPanel.canvasImageUrlHint;
  control.appendChild(input);
  appendDesignerFieldMessage(field, input, 'canvas-backgroundImage');
  if (pickerVisible) {
    // 背景图片：宿主选择按钮（ADR-0046）默认隐藏，仅宿主配置后渲染；
    // 点击派发请求事件，宿主自开弹出框可视化选择。
    const pickerButton = createDesignerButton(ownerDocument, {
      className: 'designer-canvas-image-picker',
      text: DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundImageAction,
    });
    pickerButton.dataset.canvasBackgroundImageAction = '';
    control.appendChild(pickerButton);
  }
  parent.appendChild(field);

  const fitField = createCanvasFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFit,
    className: 'designer-canvas-image-fit-field',
  });
  const select = createDesignerSelect(ownerDocument, {
    // 没有背景图时适配方式无意义：canonical 用 null 表示“未设置”，与 undefined 同样要禁用。
    disabled: document.canvas.backgroundImage == null,
    options: [
      { label: DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFitCover, value: 'cover' },
      { label: DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFitContain, value: 'contain' },
    ],
    value: document.canvas.backgroundImageFit ?? 'cover',
  });
  select.dataset.canvasProperty = 'backgroundImageFit';
  fitField.control.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(fitField.field, select, 'canvas-backgroundImageFit');
  parent.appendChild(fitField.field);
}
