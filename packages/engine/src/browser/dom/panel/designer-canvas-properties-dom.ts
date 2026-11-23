import type {
  ScreenDocument,
  ScreenPopupCanvas,
  ScreenSubCanvas,
  ScreenThemeSlot,
} from '@base-screen/contracts';
import {
  readScreenThemeColor,
  SCREEN_POPUP_ANCHORS,
  SCREEN_THEME_SLOTS,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { createDesignerColorPalette } from '../color/designer-color-palette-dom.js';
import {
  appendDesignerRangeField,
  createDesignerFieldRow,
  createDesignerSwitchField,
  type DesignerFieldRow,
  type DesignerFieldRowOptions,
} from '../designer-field-primitives.js';
import { enhanceDesignerSelect } from '../designer-select-dom.js';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerInput,
  createDesignerSelect,
} from '../designer-ui-primitives.js';
import {
  canvasBackgroundPaletteValue,
  type DesignerCanvasPresentationSettings,
  type DesignerCanvasScaleMode,
  SCREEN_THEME_AUTHORING_DEFAULT_PALETTE,
} from './designer-canvas-transactions.js';
import { appendDesignerColorGroup } from './designer-color-group-dom.js';
import { appendSection } from './designer-panel-primitives.js';

/**
 * 页面配置沿用组件检查器的字段行骨架（标签列 + 控件列，见 `.designer-field`），
 * 但按原型把内容拆成「画布 / 背景填充 / 背景图片」三段：每段用可折叠 details 承载，
 * 段内只靠留白分行，不逐行画通栏分隔线——行线会把一组设置切成表单条纹。
 */
export function appendCanvasControls(
  parent: HTMLElement,
  document: ScreenDocument,
  hostResourceSelectionButtonVisible: boolean,
  canvasPresentation: DesignerCanvasPresentationSettings,
  subCanvas?: ScreenSubCanvas,
  startPageId?: string | null,
): void {
  // 编辑从画布时（ADR-0109），「画布」各段作用于该从画布：先给从画布专属设置；页面尺寸恒随主画布，
  // 不给尺寸行；背景图与主题只属于主画布，整段不出现。
  if (subCanvas !== undefined) appendSubCanvasSection(parent, subCanvas, startPageId ?? null);
  // 首屏只展开「画布」：尺寸、不透明度、缩放方式、两个开关是高频设置；
  // 背景填充与背景图片属于低频配置，折叠后首屏少 4 个控件，需要时一点即开。
  // 每段都带稳定 key，折叠偏好按段记忆，不会因为插分区而串位。
  const canvasSection = appendSection(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvas,
    false,
    true,
    'canvas',
  );
  canvasSection.className += ' designer-canvas-section';
  if (subCanvas?.display !== 'page') appendCanvasSizeField(canvasSection, document);
  appendCanvasOpacityField(canvasSection, canvasPresentation);
  appendCanvasScaleField(canvasSection, canvasPresentation);

  // 两个开关是渲染行为开关而不是画布尺寸的一部分：它们一年改不了几次，
  // 却原来和尺寸/缩放挤在同一屏。独立成段并收起后，首屏只剩三个高频字段。
  const behaviorSection = appendSection(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBehaviorSection,
    false,
    false,
    'canvas-behavior',
    DESIGNER_UI_TEXT.propertiesPanel.canvasBehaviorSummary(
      canvasPresentation.backgroundAutoFill
        ? DESIGNER_UI_TEXT.propertiesPanel.canvasSwitchOn
        : DESIGNER_UI_TEXT.propertiesPanel.canvasSwitchOff,
      canvasPresentation.disableComponentLoading
        ? DESIGNER_UI_TEXT.propertiesPanel.canvasSwitchOff
        : DESIGNER_UI_TEXT.propertiesPanel.canvasSwitchOn,
    ),
  );
  appendCanvasSwitchField(
    behaviorSection,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundAutoFill,
    'backgroundAutoFill',
    canvasPresentation.backgroundAutoFill,
  );
  appendCanvasSwitchField(
    behaviorSection,
    DESIGNER_UI_TEXT.propertiesPanel.canvasDisableLoading,
    'disableComponentLoading',
    canvasPresentation.disableComponentLoading,
  );

  const backgroundSection = appendSection(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasBackgroundSection,
    false,
    false,
    'canvas-background',
    canvasBackgroundPaletteValue(document),
  );
  backgroundSection.className += ' designer-canvas-background-section';
  appendCanvasBackgroundField(backgroundSection, document);

  if (subCanvas !== undefined) return;
  const imageSection = appendSection(
    parent,
    DESIGNER_UI_TEXT.propertiesPanel.canvasImageSection,
    false,
    false,
    'canvas-image',
    document.canvas.backgroundImage == null
      ? DESIGNER_UI_TEXT.propertiesPanel.canvasSummaryUnset
      : DESIGNER_UI_TEXT.propertiesPanel.canvasSummarySet,
  );
  imageSection.className += ' designer-canvas-image-section';
  appendCanvasBackgroundImageControls(imageSection, document, hostResourceSelectionButtonVisible);

  appendCanvasThemeSection(parent, document);
}

/**
 * 从画布设置（ADR-0109）：名称、显示方式；页面给自定义背景与起始页，弹框给遮罩、圆角、位置、
 * 关闭方式；最后是复制与删除。由画板控制器经 `data-sub-canvas-*` / `data-popup-*` 提交到完整文档。
 */
function appendSubCanvasSection(
  parent: HTMLElement,
  subCanvas: ScreenSubCanvas,
  startPageId: string | null,
): void {
  const text = DESIGNER_UI_TEXT.artboard;
  const ownerDocument = parent.ownerDocument;
  const section = appendSection(parent, text.subCanvasSection, false, true, 'sub-canvas');
  section.className += ' designer-sub-canvas-section';
  section.dataset.subCanvasId = subCanvas.id;

  const name = createCanvasFieldRow(ownerDocument, { label: text.name });
  const nameInput = createDesignerInput(ownerDocument, {
    ariaLabel: text.name,
    value: subCanvas.name,
  });
  nameInput.dataset.subCanvasProperty = 'name';
  nameInput.setAttribute('autocomplete', 'off');
  nameInput.setAttribute('spellcheck', 'false');
  name.control.appendChild(nameInput);
  appendDesignerFieldMessage(name.field, nameInput, 'sub-canvas-name');
  section.appendChild(name.field);

  const display = createCanvasFieldRow(ownerDocument, {
    label: text.display,
    controlClassName: 'designer-sub-canvas-display',
  });
  display.control.setAttribute('role', 'radiogroup');
  display.control.setAttribute('aria-label', text.display);
  for (const [value, label] of [
    ['page', text.displayPage],
    ['popup', text.displayPopup],
  ] as const) {
    const button = createDesignerButton(ownerDocument, {
      text: label,
      className: 'designer-sub-canvas-display-option',
      pressed: subCanvas.display === value,
    });
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(subCanvas.display === value));
    button.dataset.subCanvasDisplay = value;
    display.control.appendChild(button);
  }
  section.appendChild(display.field);

  if (subCanvas.display === 'page') {
    const custom = subCanvas.backgroundColor !== undefined || subCanvas.background !== undefined;
    const { field: backgroundField, input: backgroundInput } = createDesignerSwitchField(
      ownerDocument,
      { label: text.customBackground, checked: custom },
    );
    backgroundInput.dataset.subCanvasProperty = 'customBackground';
    appendDesignerFieldMessage(backgroundField, backgroundInput, 'sub-canvas-background');
    section.appendChild(backgroundField);
    const start = createCanvasFieldRow(ownerDocument, { label: text.startPage });
    if (subCanvas.id === startPageId) {
      const chip = ownerDocument.createElement('span');
      chip.className = 'designer-sub-canvas-start';
      chip.textContent = text.startPageCurrent;
      start.control.appendChild(chip);
    } else {
      const button = createDesignerButton(ownerDocument, { text: text.setStartPage });
      button.dataset.subCanvasAction = 'set-start';
      start.control.appendChild(button);
    }
    section.appendChild(start.field);
  } else {
    appendPopupFields(section, subCanvas);
  }

  const actions = createCanvasFieldRow(ownerDocument, {
    label: text.actions,
    controlClassName: 'designer-sub-canvas-actions',
  });
  const duplicate = createDesignerButton(ownerDocument, { text: text.duplicate });
  duplicate.dataset.subCanvasAction = 'duplicate';
  const remove = createDesignerButton(ownerDocument, {
    text: text.deleteSubCanvas,
    variant: 'danger',
    className: 'designer-sub-canvas-delete',
  });
  remove.dataset.subCanvasAction = 'delete';
  actions.control.append(duplicate, remove);
  section.appendChild(actions.field);
}

/** 弹框专属设置：遮罩、圆角、位置、点遮罩关闭与 Esc 关闭（ADR-0108 §2.3–§2.6 沿用）。 */
function appendPopupFields(section: HTMLElement, popup: ScreenPopupCanvas): void {
  const text = DESIGNER_UI_TEXT.artboard;
  const ownerDocument = section.ownerDocument;
  const mask = createDesignerFieldRow(ownerDocument, {
    label: text.popupMask,
    tagName: 'span',
    stacked: true,
  });
  const palette = createDesignerColorPalette(ownerDocument, popup.maskColor, 'popup:mask', {
    allowGradient: false,
  });
  palette.element.dataset.popupProperty = 'maskColor';
  mask.control.appendChild(palette.element);
  appendDesignerFieldMessage(mask.field, palette.controls[0]!, 'popup-mask');
  section.appendChild(mask.field);

  const radius = createCanvasFieldRow(ownerDocument, { label: text.popupRadius });
  const { range, number } = appendDesignerRangeField(radius.control, {
    ariaLabel: text.popupRadius,
    min: 0,
    max: 48,
    step: 1,
    value: String(popup.borderRadius),
    numberClassName: 'designer-field-range-value',
    numberSymbol: 'px',
  });
  range.dataset.popupProperty = 'borderRadius';
  number.dataset.popupProperty = 'borderRadius';
  appendDesignerFieldMessage(radius.field, number, 'popup-radius');
  section.appendChild(radius.field);

  appendPopupPlacementFields(section, popup);

  const { field: closeField, input: closeInput } = createDesignerSwitchField(ownerDocument, {
    label: text.popupCloseOnMask,
    checked: popup.closeOnMaskClick,
  });
  closeInput.dataset.popupProperty = 'closeOnMaskClick';
  appendDesignerFieldMessage(closeField, closeInput, 'popup-close-on-mask');
  section.appendChild(closeField);

  const { field: escapeField, input: escapeInput } = createDesignerSwitchField(ownerDocument, {
    label: text.popupCloseOnEscape,
    checked: popup.closeOnEscape,
  });
  escapeInput.dataset.popupProperty = 'closeOnEscape';
  appendDesignerFieldMessage(escapeField, escapeInput, 'popup-close-on-escape');
  section.appendChild(escapeField);
}

/**
 * 弹框位置（ADR-0108 §2.6）：九宫格锚点 + X / Y 偏移。锚点用 3×3 图钉按钮（同对齐控件的按下态），
 * 偏移沿用画布几何输入的「符号内嵌在右缘」写法。
 */
function appendPopupPlacementFields(section: HTMLElement, popup: ScreenPopupCanvas): void {
  const text = DESIGNER_UI_TEXT.artboard;
  const ownerDocument = section.ownerDocument;
  const placement = popup.placement ?? { anchor: 'center', offsetX: 0, offsetY: 0 };
  const anchorRow = createCanvasFieldRow(ownerDocument, {
    label: text.popupAnchor,
    controlClassName: 'designer-popup-anchor-grid',
  });
  anchorRow.control.setAttribute('role', 'radiogroup');
  anchorRow.control.setAttribute('aria-label', text.popupAnchor);
  for (const anchor of SCREEN_POPUP_ANCHORS) {
    const button = createDesignerButton(ownerDocument, {
      className: 'designer-popup-anchor',
      ariaLabel: text.anchors[anchor],
      tip: text.anchors[anchor],
      pressed: anchor === placement.anchor,
    });
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(anchor === placement.anchor));
    button.dataset.popupAnchor = anchor;
    anchorRow.control.appendChild(button);
  }
  section.appendChild(anchorRow.field);

  const offsetRow = createCanvasFieldRow(ownerDocument, {
    label: text.popupOffset,
    className: 'designer-canvas-size-field',
    controlClassName: 'designer-canvas-size-controls',
  });
  for (const [axis, symbol, value, label] of [
    ['offsetX', 'X', placement.offsetX, text.popupOffsetX],
    ['offsetY', 'Y', placement.offsetY, text.popupOffsetY],
  ] as const) {
    const field = ownerDocument.createElement('label');
    field.className = 'designer-geo-field';
    field.dataset.symbol = symbol;
    const input = createDesignerInput(ownerDocument, {
      appearance: 'number',
      ariaLabel: label,
      value: String(value),
      step: 1,
    });
    input.dataset.popupProperty = axis;
    field.appendChild(input);
    offsetRow.control.appendChild(field);
  }
  section.appendChild(offsetRow.field);
}

/**
 * 文档级主题色板（ADR-0098）与状态色位（ADR-0110 §2.6.4），默认折叠。
 * 与组件外观区同一套色板组（色卡 + 一个编辑器，见 `designer-color-group-dom`）：基础色位一组、
 * 状态色位一组。标记挂调色板根节点（色标增删会重建控件列表），提交走 update-theme 整副色板。
 */
function appendCanvasThemeSection(parent: HTMLElement, document: ScreenDocument): void {
  const section = appendSection(parent, DESIGNER_UI_TEXT.propertiesPanel.theme, true, false);
  const statusIndex = SCREEN_THEME_SLOTS.indexOf('danger');
  const groups = [
    { key: 'base', slots: SCREEN_THEME_SLOTS.slice(0, statusIndex) },
    { key: 'status', slots: SCREEN_THEME_SLOTS.slice(statusIndex) },
  ];
  for (const group of groups) {
    if (group.key === 'status') {
      // 状态色位：组件状态与等级着色共用，改一处全屏一起变。
      const heading = parent.ownerDocument.createElement('p');
      heading.className = 'designer-inspector-subheading';
      heading.textContent = DESIGNER_UI_TEXT.propertiesPanel.themeStatusSlots;
      section.appendChild(heading);
    }
    appendDesignerColorGroup(section, {
      groupKey: `canvas:theme:${group.key}`,
      entries: group.slots.map((slot) => ({
        key: slot,
        label: DESIGNER_UI_TEXT.propertiesPanel.themeSlots[slot],
        value: themeSlotColor(document, slot),
      })),
      renderField: (container, entry) => {
        const slot = entry.key as ScreenThemeSlot;
        const { field, control } = createDesignerFieldRow(parent.ownerDocument, {
          label: entry.label,
          tagName: 'span',
          stacked: true,
        });
        const palette = createDesignerColorPalette(
          parent.ownerDocument,
          themeSlotColor(document, slot),
          `canvas:theme:${slot}`,
          { allowGradient: false },
        );
        palette.element.dataset.canvasProperty = `theme.${slot}`;
        control.appendChild(palette.element);
        appendDesignerFieldMessage(field, palette.controls[0]!, `canvas-theme-${slot}`);
        container.appendChild(field);
      },
    });
  }
}

function themeSlotColor(document: ScreenDocument, slot: ScreenThemeSlot): string {
  return readScreenThemeColor(document.theme, slot) ?? SCREEN_THEME_AUTHORING_DEFAULT_PALETTE[slot];
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

/**
 * 常用画布尺寸。键对应文案表 `canvasSizePresetNames`；宽高与预设都不一致时下拉显示「自定义」，
 * 下面的 W / H 始终可直接改，改完自动回落到对应预设或「自定义」。
 */
export const DESIGNER_CANVAS_SIZE_PRESETS = [
  ['fhd', 1920, 1080],
  ['qhd', 2560, 1440],
  ['uhd', 3840, 2160],
  ['hd', 1280, 720],
  ['laptop', 1366, 768],
  ['standard', 1024, 768],
  ['portrait', 1080, 1920],
  ['dual', 3840, 1080],
  ['triple', 5760, 1080],
] as const;

export const DESIGNER_CANVAS_SIZE_CUSTOM = 'custom';

function appendCanvasSizeField(parent: HTMLElement, document: ScreenDocument): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createCanvasFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasDimensions,
    className: 'designer-canvas-size-field',
    controlClassName: 'designer-canvas-size-controls',
  });
  const matched = DESIGNER_CANVAS_SIZE_PRESETS.find(
    ([, presetWidth, presetHeight]) =>
      presetWidth === document.canvas.width && presetHeight === document.canvas.height,
  );
  const names = DESIGNER_UI_TEXT.propertiesPanel.canvasSizePresetNames;
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.canvasSizePreset,
    options: [
      ...DESIGNER_CANVAS_SIZE_PRESETS.map(([key, presetWidth, presetHeight]) => ({
        value: `${presetWidth}x${presetHeight}`,
        label: DESIGNER_UI_TEXT.propertiesPanel.canvasSizePresetLabel(
          names[key],
          presetWidth,
          presetHeight,
        ),
      })),
      {
        value: DESIGNER_CANVAS_SIZE_CUSTOM,
        label: DESIGNER_UI_TEXT.propertiesPanel.canvasSizeCustom,
      },
    ],
    value: matched === undefined ? DESIGNER_CANVAS_SIZE_CUSTOM : `${matched[1]}x${matched[2]}`,
  });
  // 走 canvasProperty 通道：选中预设一次提交宽高；选「自定义」不提交，直接在下方输入。
  select.dataset.canvasProperty = 'size';
  const preset = enhanceDesignerSelect(select).element;
  preset.classList.add('designer-canvas-size-preset');
  control.appendChild(preset);
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

/**
 * 六档缩放方式：用下拉而不是 3×2 分段。它是低频设置，六个按钮常驻会占掉两行、
 * 把下面的字段整体往下推；下拉常态只占一行，标签也回到与其他字段一致的左列。
 */
function appendCanvasScaleField(
  parent: HTMLElement,
  settings: DesignerCanvasPresentationSettings,
): void {
  const ownerDocument = parent.ownerDocument;
  const { field, control } = createCanvasFieldRow(ownerDocument, {
    label: DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode,
    className: 'designer-canvas-scale-field',
  });
  const scaleOptions: readonly [DesignerCanvasScaleMode, string][] = [
    ['fill', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFill],
    ['fit', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleFit],
    ['width', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleWidth],
    ['height', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleHeight],
    ['original', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleOriginal],
    ['none', DESIGNER_UI_TEXT.propertiesPanel.canvasScaleNone],
  ];
  const select = createDesignerSelect(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.propertiesPanel.canvasScaleMode,
    options: scaleOptions.map(([value, label]) => ({ value, label })),
    value: settings.scaleMode,
  });
  // 走 canvasSetting 通道：change 冒泡到 surface router，由属性面板控制器提交。
  select.dataset.canvasSetting = 'scaleMode';
  control.appendChild(enhanceDesignerSelect(select).element);
  appendDesignerFieldMessage(field, select, 'canvas-scale-mode');
  parent.appendChild(field);
}

function appendCanvasSwitchField(
  parent: HTMLElement,
  labelText: string,
  setting: 'backgroundAutoFill' | 'disableComponentLoading',
  checked: boolean,
): void {
  const ownerDocument = parent.ownerDocument;
  // 开关行：与组件检查器的布尔字段同一个原语（ADR-0102 §5）。
  const { field, input } = createDesignerSwitchField(ownerDocument, {
    label: labelText,
    checked,
    className: 'designer-canvas-setting-checkbox',
  });
  input.value = String(checked);
  input.dataset.canvasSetting = setting;
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
    // 背景图片：宿主选择按钮（ADR-0089）默认隐藏，仅宿主配置后渲染；
    // 点击派发统一资源选择请求事件，宿主自开素材选择器。
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
