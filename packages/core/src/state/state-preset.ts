import {
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenLevelTone,
  screenThemeRef,
} from '@base-screen/contracts';

/**
 * 组件状态的外观预置（ADR-0110 §2.6.3，ADR-0115 D8 下沉）：给一个语义色调，算出状态要覆盖的样式键。
 *
 * 原先只在 engine（「按分级生成状态」）里；智能体生成阈值状态也要同一套规则，否则同一个物料在两处
 * 生成的状态外观不一样。core 不认识物料清单与编辑器描述符，所以入参是摊平后的键表——由 engine 从
 * manifest 的外观区读出来（`readDesignerStatePresetSource`），或由宿主随目录上送。
 *
 * 规则：
 * - 清单显式声明了 `statePresetKeys` 时只用它：字符串键写语义色引用，布尔键只在 `danger` 时开；
 * - 否则推断：外观区里的颜色键，取第一个不是描边 / 发光 / 阴影 / 背景的当主色，描边色跟着变；
 *   `danger` 时再打开发光开关、发光色也写语义色。
 */

/** 外观区开放编辑的一个顶层 style 键。 */
export interface ScreenStatePresetField {
  readonly key: string;
  /** style schema 里的类型（`string` / `number` / `boolean` / `enum` …）。 */
  readonly kind: string;
  /** 检查器控件是颜色。 */
  readonly color?: boolean;
}

export interface ScreenStatePresetSource {
  /** 清单的 `statePresetKeys` 与各键的 schema 类型；有它时只用它。 */
  readonly declared?: readonly { readonly key: string; readonly kind: string }[];
  /** 外观区的 style 键（按外观区顺序）。 */
  readonly fields: readonly ScreenStatePresetField[];
}

const NOT_MAIN = /border|stroke|glow|shadow|background/i;
const BORDER = /border|stroke/i;
const GLOW = /glow/i;
const GLOW_COLOR = /glow|shadow/i;

export function screenStatePresetStyle(
  source: ScreenStatePresetSource,
  tone: ScreenLevelTone,
): ScreenJsonObject {
  const style: Record<string, ScreenJsonValue> = {};
  const ref = screenThemeRef(tone);
  if (source.declared !== undefined) {
    for (const { key, kind } of source.declared) {
      if (kind === 'string') style[key] = ref;
      else if (kind === 'boolean' && tone === 'danger') style[key] = true;
    }
    return style;
  }
  const colors = source.fields
    .filter((field) => field.color === true && field.kind === 'string')
    .map((field) => field.key);
  const main = colors.find((key) => !NOT_MAIN.test(key)) ?? colors[0];
  if (main !== undefined) style[main] = ref;
  const border = colors.find((key) => BORDER.test(key));
  if (border !== undefined) style[border] = ref;
  if (tone === 'danger') {
    const glow = source.fields.find((field) => GLOW.test(field.key) && field.kind === 'boolean');
    const glowColor = colors.find((key) => GLOW_COLOR.test(key));
    if (glow !== undefined) style[glow.key] = true;
    if (glowColor !== undefined) style[glowColor] = ref;
  }
  return style;
}
