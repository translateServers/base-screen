import type { ScreenCanvasColorStop, ScreenDocument } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import { appendDesignerFieldMessage, createDesignerSwitch } from '../designer-ui-primitives.js';
import type {
  DesignerCanvasBackgroundDrafts,
  DesignerCanvasPresentationSettings,
  DesignerCanvasScaleMode,
} from './designer-canvas-transactions.js';
import { appendSection } from './designer-panel-primitives.js';

export function appendCanvasControls(
  parent: HTMLElement,
  document: ScreenDocument,
  canvasBackgroundImageButtonVisible: boolean,
  drafts: DesignerCanvasBackgroundDrafts,
  canvasPresentation: DesignerCanvasPresentationSettings,
): void {
  const section = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.canvas);
  section.className += ' designer-datav-canvas-section';
  const size = parent.ownerDocument.createElement('div');
  size.className = 'designer-canvas-size';
  const sizeCaption = parent.ownerDocument.createElement('span');
  sizeCaption.className = 'designer-canvas-row-label';
  sizeCaption.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasDimensions;
  const sizeControls = parent.ownerDocument.createElement('span');
  sizeControls.className = 'designer-canvas-size-controls';
  const width = createCanvasInput(sizeControls, 'W', 'width', document.canvas.width, 'number');
  width.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasWidth);
  const height = createCanvasInput(sizeControls, 'H', 'height', document.canvas.height, 'number');
  height.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasHeight);
  size.appendChild(sizeCaption);
  size.appendChild(sizeControls);
  section.appendChild(size);
  appendCanvasPresentationControls(section, canvasPresentation);
  appendCanvasBackgroundControls(section, drafts);
  // 背景图片：URL 输入；宿主选择按钮（ADR-0046）默认隐藏，仅宿主配置
  // canvasBackgroundImageButton 后渲染（点击派发请求事件，宿主自开弹出框可视化选择）。
  if (canvasBackgroundImageButtonVisible) {
    const backgroundRow = parent.ownerDocument.createElement('div');
    backgroundRow.className = 'designer-canvas-background-row';
    appendCanvasInput(
      backgroundRow,
      DESIGNER_UI_TEXT.propertiesPanel.backgroundImage,
      'backgroundImage',
      document.canvas.backgroundImage ?? '',
      'text',
    );
    const pickerButton = backgroundRow.ownerDocument.createElement('button');
    pickerButton.type = 'button';
    pickerButton.className = 'designer-control designer-button';
    pickerButton.dataset.canvasBackgroundImageAction = '';
    pickerButton.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundImageAction;
    backgroundRow.appendChild(pickerButton);
    section.appendChild(backgroundRow);
  } else {
    appendCanvasInput(
      section,
      DESIGNER_UI_TEXT.propertiesPanel.backgroundImage,
      'backgroundImage',
      document.canvas.backgroundImage ?? '',
      'text',
    );
  }
  appendCanvasSelect(
    section,
    DESIGNER_UI_TEXT.propertiesPanel.backgroundImageFit,
    'backgroundImageFit',
    document.canvas.backgroundImageFit ?? 'cover',
    document.canvas.backgroundImage === undefined,
  );
}

function appendCanvasPresentationControls(
  parent: HTMLElement,
  settings: DesignerCanvasPresentationSettings,
): void {
  const opacity = parent.ownerDocument.createElement('label');
  opacity.className = 'designer-field designer-field-label designer-canvas-opacity';
  opacity.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity;
  const opacityControls = parent.ownerDocument.createElement('span');
  opacityControls.className = 'designer-opacity-controls';
  const range = parent.ownerDocument.createElement('input');
  range.type = 'range';
  range.className = 'designer-control designer-range';
  range.min = '0';
  range.max = '1';
  range.step = '0.01';
  range.value = String(settings.opacity);
  range.dataset.canvasSetting = 'opacity';
  range.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity);
  const number = parent.ownerDocument.createElement('input');
  number.type = 'number';
  number.className = 'designer-control designer-input designer-number';
  number.min = '0';
  number.max = '1';
  number.step = '0.01';
  number.value = String(settings.opacity);
  number.dataset.canvasSetting = 'opacity';
  number.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.canvasOpacity);
  opacityControls.appendChild(range);
  opacityControls.appendChild(number);
  opacity.appendChild(opacityControls);
  parent.appendChild(opacity);

  const scale = parent.ownerDocument.createElement('label');
  scale.className = 'designer-field designer-field-label designer-canvas-scale';
  scale.textContent = DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode;
  const scaleControls = parent.ownerDocument.createElement('span');
  scaleControls.className = 'designer-canvas-scale-options';
  const scaleOptions: readonly [DesignerCanvasScaleMode, string][] = [
    ['fill', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFill],
    ['fit', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFit],
    ['width', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleWidth],
    ['height', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleHeight],
    ['original', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleOriginal],
    ['none', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleNone],
  ];
  for (const [value, label] of scaleOptions) {
    const button = parent.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button designer-canvas-scale-option';
    button.dataset.canvasSetting = 'scaleMode';
    button.dataset.canvasSettingValue = value;
    button.textContent = label;
    button.setAttribute('data-tip', label);
    button.ariaPressed = String(settings.scaleMode === value);
    scaleControls.appendChild(button);
  }
  scale.appendChild(scaleControls);
  parent.appendChild(scale);

  appendCanvasSettingCheckbox(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundAutoFill,
    'backgroundAutoFill',
    settings.backgroundAutoFill,
  );
  appendCanvasSettingCheckbox(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasDisableLoading,
    'disableComponentLoading',
    settings.disableComponentLoading,
  );
}

function appendCanvasSettingCheckbox(
  parent: HTMLElement,
  labelText: string,
  setting: 'backgroundAutoFill' | 'disableComponentLoading',
  checked: boolean,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label designer-canvas-setting-checkbox';
  label.textContent = labelText;
  // 画布呈现开关（原型 .toggle-row + .switch）：原生 checkbox 承担取值与 change，外观绘成胶囊开关。
  const input = createDesignerSwitch(parent.ownerDocument, {
    ariaLabel: labelText,
    checked,
    value: String(checked),
  });
  input.dataset.canvasSetting = setting;
  label.appendChild(input);
  parent.appendChild(label);
}

function appendCanvasBackgroundControls(
  parent: HTMLElement,
  drafts: DesignerCanvasBackgroundDrafts,
): void {
  const type = parent.ownerDocument.createElement('label');
  type.className = 'designer-field designer-field-label';
  type.dataset.canvasField = 'backgroundType';
  type.textContent = DESIGNER_UI_TEXT.propertiesPanel.backgroundType;
  const select = type.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.dataset.canvasProperty = 'backgroundType';
  for (const [value, label] of [
    ['solid', DESIGNER_UI_TEXT.propertiesPanel.backgroundSolid],
    ['linear-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundLinear],
    ['radial-gradient', DESIGNER_UI_TEXT.propertiesPanel.backgroundRadial],
  ] as const) {
    const option = select.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = drafts.activeType;
  type.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(type, select, 'canvas-backgroundType');
  parent.appendChild(type);

  if (drafts.activeType === 'solid') {
    appendCanvasInput(
      parent,
      DESIGNER_UI_TEXT.propertiesPanel.canvasBackground,
      'backgroundSolidColor',
      drafts.solid.color,
      'color',
    );
    return;
  }
  if (drafts.activeType === 'linear-gradient') {
    appendCanvasInput(
      parent,
      DESIGNER_UI_TEXT.propertiesPanel.gradientAngle,
      'backgroundLinearAngle',
      drafts.linear.angle,
      'number',
    );
    appendCanvasGradientStops(parent, drafts.linear.stops);
    return;
  }
  appendCanvasInput(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterX,
    'backgroundRadialX',
    drafts.radial.position.x,
    'number',
  );
  appendCanvasInput(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.gradientCenterY,
    'backgroundRadialY',
    drafts.radial.position.y,
    'number',
  );
  appendCanvasGradientStops(parent, drafts.radial.stops);
}

function appendCanvasGradientStops(
  parent: HTMLElement,
  stops: readonly ScreenCanvasColorStop[],
): void {
  const section = parent.ownerDocument.createElement('div');
  section.className = 'designer-field-grid';
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]!;
    const color = createCanvasInput(
      section,
      DESIGNER_UI_TEXT.propertiesPanel.gradientStopColor,
      'backgroundStopColor',
      stop.color,
      'color',
    );
    color.dataset.canvasBackgroundStopIndex = String(index);
    const position = createCanvasInput(
      section,
      DESIGNER_UI_TEXT.propertiesPanel.gradientStopPosition,
      'backgroundStopPosition',
      stop.position,
      'number',
    );
    position.dataset.canvasBackgroundStopIndex = String(index);
    const remove = section.ownerDocument.createElement('button');
    remove.type = 'button';
    remove.className = 'designer-control designer-button';
    remove.disabled = stops.length <= 2;
    remove.dataset.canvasBackgroundStopAction = 'remove';
    remove.dataset.canvasBackgroundStopIndex = String(index);
    remove.textContent = DESIGNER_UI_TEXT.propertiesPanel.gradientRemoveStop;
    section.appendChild(remove);
  }
  const add = section.ownerDocument.createElement('button');
  add.type = 'button';
  add.className = 'designer-control designer-button';
  add.disabled = stops.length >= 8;
  add.dataset.canvasBackgroundStopAction = 'add';
  add.textContent = DESIGNER_UI_TEXT.propertiesPanel.gradientAddStop;
  section.appendChild(add);
  parent.appendChild(section);
}

function appendCanvasSelect(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string,
  disabled: boolean,
): void {
  const label = parent.ownerDocument.createElement('label');
  label.className = 'designer-field designer-field-label';
  label.dataset.canvasField = property;
  label.textContent = labelText;
  const select = parent.ownerDocument.createElement('select');
  select.className = 'designer-control designer-select';
  select.disabled = disabled;
  select.dataset.canvasProperty = property;
  for (const option of ['cover', 'contain'] as const) {
    const element = select.ownerDocument.createElement('option');
    element.value = option;
    element.textContent = option;
    select.appendChild(element);
  }
  select.value = value;
  label.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(label, select, `canvas-${property}`);
  parent.appendChild(label);
}

function createCanvasInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
): HTMLInputElement {
  // color 输入用 span 容器：label 点击会激活 color input 弹出原生取色器。
  const label = parent.ownerDocument.createElement(type === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.dataset.canvasField = property;
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.className =
    type === 'color'
      ? 'designer-control designer-color'
      : `designer-control designer-input${type === 'number' ? ' designer-number' : ''}`;
  input.value = String(value);
  input.dataset.canvasProperty = property;
  label.appendChild(input);
  appendDesignerFieldMessage(label, input, `canvas-${property}`);
  parent.appendChild(label);
  return input;
}

function appendCanvasInput(
  parent: HTMLElement,
  labelText: string,
  property: string,
  value: string | number,
  type = 'text',
): HTMLInputElement {
  // color 输入用 span 容器：label 点击会激活 color input 弹出原生取色器。
  const label = parent.ownerDocument.createElement(type === 'color' ? 'span' : 'label');
  label.className = 'designer-field designer-field-label';
  label.dataset.canvasField = property;
  label.textContent = labelText;
  const input = parent.ownerDocument.createElement('input');
  input.type = type;
  input.className =
    type === 'color'
      ? 'designer-control designer-color'
      : `designer-control designer-input${type === 'number' ? ' designer-number' : ''}`;
  input.value = String(value);
  input.dataset.canvasProperty = property;
  label.appendChild(input);
  appendDesignerFieldMessage(label, input, `canvas-${property}`);
  parent.appendChild(label);
  return input;
}
