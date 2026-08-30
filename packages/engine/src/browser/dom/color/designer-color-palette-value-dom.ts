function colorInput(
  ownerDocument: Document,
  value: string,
  field: 'solid' | 'stop-color',
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'color';
  input.className = 'designer-control designer-color';
  // 原生 color input 只接受 #rrggbb；完整色值（alpha/transparent）由 dataset 保留。
  applyColorPaletteColorInputValue(input, value);
  input.dataset.colorPaletteField = field;
  return input;
}

export function applyColorPaletteColorInputValue(input: HTMLInputElement, value: string): void {
  if (value.toLowerCase() === 'transparent') {
    input.value = DEFAULT_COLOR;
    delete input.dataset.colorPaletteAlpha;
    input.dataset.colorPaletteTransparent = 'true';
    return;
  }
  const rgb = hexToRgb(value);
  input.value = rgb === undefined ? DEFAULT_COLOR : rgbToHex(rgb.r, rgb.g, rgb.b);
  if (rgb?.alpha !== undefined) input.dataset.colorPaletteAlpha = rgb.alpha;
  else delete input.dataset.colorPaletteAlpha;
  delete input.dataset.colorPaletteTransparent;
}

/** 完整色值 = RGB（input.value）+ 透明通道（dataset）；transparent 单独保留。 */
export function composedColorValue(input: {
  readonly value: string;
  readonly dataset?: DOMStringMap;
}): string {
  if (input.dataset?.colorPaletteTransparent === 'true') return 'transparent';
  const alpha = input.dataset?.colorPaletteAlpha;
  return alpha === undefined || alpha === 'ff' ? input.value : `${input.value}${alpha}`;
}

/** 标准 hex/transparent token 规范化为控件内部小写 CSS 色值。 */
export function normalizeColorPaletteManualValue(value: string): string | undefined {
  const candidate = value.trim();
  if (candidate.toLowerCase() === 'transparent') return 'transparent';
  const rgb = hexToRgb(candidate);
  return rgb === undefined ? undefined : `${rgbToHex(rgb.r, rgb.g, rgb.b)}${rgb.alpha ?? ''}`;
}

export function isColorPaletteManualValueField(
  value: string | undefined,
): value is ColorPaletteManualValueField {
  return value === 'solid-value' || value === 'stop-value';
}

export function updateColorPaletteManualValueValidity(input: HTMLInputElement): void {
  input.setAttribute(
    'aria-invalid',
    String(normalizeColorPaletteManualValue(input.value) === undefined),
  );
}

export function isValidColorPaletteManualValue(input: HTMLInputElement | null): boolean {
  return input !== null && normalizeColorPaletteManualValue(input.value) !== undefined;
}

/** 色值 → 透明度百分比（0..100）：不可解析或已不透明 = 100。 */
export function colorAlphaPercent(value: string | undefined): number {
  const rgb = hexToRgb(value);
  if (rgb?.alpha === undefined) return 100;
  return Math.round((Number.parseInt(rgb.alpha, 16) * 100) / 255);
}

/** 透明度百分比（0..100）→ 2 位 hex 透明通道。 */
export function colorAlphaFromPercent(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((clamped * 255) / 100)
    .toString(16)
    .padStart(2, '0');
}

export function updateColorControlValueText(
  valueInput: HTMLInputElement,
  input: HTMLInputElement,
): void {
  valueInput.value = composedColorValue(input).toUpperCase();
  valueInput.setAttribute('aria-invalid', 'false');
}

/**
 * 颜色控件（紧凑布局增量）：swatch + 可手动编辑的 hex 输入。输入失焦/提交时同步
 * 原生取色器、透明度与色标句柄；屏幕阅读器经 aria-label 获得字段语义。
 */
export function paletteColorControl(
  ownerDocument: Document,
  value: string,
  field: 'solid' | 'stop-color',
): {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  readonly value: HTMLInputElement;
} {
  const input = colorInput(ownerDocument, value, field);
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.gradientStopColor);
  const control = ownerDocument.createElement('span');
  control.className = 'designer-color-palette-color-control';
  const valueInput = ownerDocument.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'designer-color-palette-color-value';
  valueInput.dataset.colorPaletteField = field === 'solid' ? 'solid-value' : 'stop-value';
  valueInput.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.gradientStopHexValue);
  valueInput.setAttribute('autocomplete', 'off');
  valueInput.setAttribute('spellcheck', 'false');
  updateColorControlValueText(valueInput, input);
  input.addEventListener('input', () => {
    delete input.dataset.colorPaletteTransparent;
    updateColorControlValueText(valueInput, input);
  });
  control.appendChild(input);
  control.appendChild(valueInput);
  return { element: control, input, value: valueInput };
}

/**
 * 透明度（alpha）滑杆：0..100%。滑杆本身不保存色值，只把透明通道写入关联
 * 颜色控件（input.dataset.colorPaletteAlpha，经面板 input 通道同步），完整色值由
 * composedColorValue 组装，值格式仍是 CSS 颜色字符串（#rrggbbaa），公共契约零变化。
 */
export function colorAlphaControl(
  ownerDocument: Document,
  value: string,
  field: 'solid-alpha' | 'stop-alpha',
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const row = ownerDocument.createElement('span');
  row.className = 'designer-color-palette-alpha';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-color-palette-alpha-label';
  label.textContent = DESIGNER_UI_TEXT.propertiesPanel.gradientStopOpacity;
  const input = ownerDocument.createElement('input');
  input.type = 'range';
  input.className = 'designer-control designer-range designer-color-palette-alpha-input';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(colorAlphaPercent(value));
  input.dataset.colorPaletteField = field;
  input.setAttribute('aria-label', DESIGNER_UI_TEXT.propertiesPanel.gradientStopOpacity);
  const valueText = ownerDocument.createElement('span');
  valueText.className = 'designer-color-palette-alpha-value';
  valueText.textContent = `${input.value}%`;
  input.addEventListener('input', () => {
    valueText.textContent = `${input.value}%`;
  });
  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(valueText);
  return { element: row, input };
}

function numberInput(
  ownerDocument: Document,
  value: number,
  field: string,
  min: number,
  max: number,
): HTMLInputElement {
  const input = ownerDocument.createElement('input');
  input.type = 'number';
  input.className = 'designer-control designer-input designer-number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.dataset.colorPaletteField = field;
  return input;
}

/**
 * 行内数字字段（紧凑布局增量）：可见文字标签与数字输入同一行，压缩纵向占用；
 * 输入补充 aria-label（span 文字与输入无程序关联）。不用 <label> 包裹：label
 * 点击会聚焦/激活关联控件（number input 聚焦跳动、color input 弹出原生取色器），
 * 标签只是说明文字，不应产生输入副作用。
 */
export function inlineNumberField(
  ownerDocument: Document,
  labelText: string,
  value: number,
  field: string,
  min: number,
  max: number,
  visibleLabel = labelText,
): { readonly element: HTMLElement; readonly input: HTMLInputElement } {
  const input = numberInput(ownerDocument, value, field, min, max);
  input.setAttribute('aria-label', labelText);
  const wrap = ownerDocument.createElement('span');
  wrap.className = 'designer-color-palette-field-inline';
  const label = ownerDocument.createElement('span');
  label.className = 'designer-color-palette-field-inline-label';
  label.textContent = visibleLabel;
  wrap.appendChild(label);
  wrap.appendChild(input);
  return { element: wrap, input };
}

import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  type ColorPaletteManualValueField,
  type ColorPaletteState,
  DEFAULT_COLOR,
  hexToRgb,
  rgbToHex,
} from './designer-color-palette-model.js';

export function colorPaletteTriggerSummary(state: ColorPaletteState): string {
  if (state.mode === 'solid') return state.solid.toUpperCase();
  return state.mode === 'linear-gradient'
    ? DESIGNER_UI_TEXT.propertiesPanel.colorPickerLinearSummary(state.stops.length)
    : DESIGNER_UI_TEXT.propertiesPanel.colorPickerRadialSummary(state.stops.length);
}
