import {
  isScreenThemeSlot,
  readScreenThemeColor,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenTheme,
  type ScreenThemeSlot,
} from '@base-screen/contracts';
import type { BaseScreenMaterialManifest, BaseScreenMaterialObjectSchema } from '../contracts.js';
import type { PluginDiagnosticCollector } from '../diagnostics.js';
import { isRecord } from './material-validation-utils.js';

/** 一份清单最多声明多少个跟随主题的样式键。 */
const MAX_THEME_STYLE_KEYS = 32;

/**
 * 校验 `themeStyle`：样式键 → 主题色位（ADR-0101）。
 *
 * 键必须是 `styleSchema` 里声明的字符串样式键（颜色只能落在字符串键上），值必须是文档主题的
 * 固定色位之一。缺省即不跟随主题。
 */
export function validateMaterialThemeStyle(
  value: ScreenJsonValue | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['themeStyle'],
      'Theme style must be an object of style keys to theme slots.',
    );
    return;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_THEME_STYLE_KEYS) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['themeStyle'],
      `Theme style declares more than ${MAX_THEME_STYLE_KEYS} keys.`,
    );
    return;
  }
  for (const [key, slot] of entries) {
    if (styleSchema?.properties[key]?.kind !== 'string') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['themeStyle', key],
        'Theme style keys must be string style keys declared by the style schema.',
      );
    }
    if (typeof slot !== 'string' || !isScreenThemeSlot(slot)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['themeStyle', key],
        'Theme style values must be document theme slots.',
      );
    }
  }
}

/** 一份清单最多声明多少个状态预置样式键。 */
const MAX_STATE_PRESET_KEYS = 16;

/**
 * 校验 `statePresetKeys`（ADR-0110 §2.6.3）：不重复的样式键，必须是 `styleSchema` 里的
 * 字符串键或布尔键。缺省即由设计器推断。
 */
export function validateMaterialStatePresetKeys(
  value: ScreenJsonValue | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > MAX_STATE_PRESET_KEYS) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['statePresetKeys'],
      `State preset keys must be an array of at most ${MAX_STATE_PRESET_KEYS} style keys.`,
    );
    return;
  }
  const seen = new Set<string>();
  value.forEach((key, index) => {
    const kind = typeof key === 'string' ? styleSchema?.properties[key]?.kind : undefined;
    if (typeof key !== 'string' || seen.has(key) || (kind !== 'string' && kind !== 'boolean')) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['statePresetKeys', index],
        'State preset keys must be unique string or boolean style keys declared by the style schema.',
      );
    }
    if (typeof key === 'string') seen.add(key);
  });
}

/**
 * 新建组件时使用的默认样式：文档带主题色板时，`themeStyle` 声明的键取当前色板的颜色，
 * 其余键与没有色板时一律用 `defaultStyle`。
 *
 * 写入的是**解析后的颜色**而不是 `theme:<slot>` 引用：组件插入时与当前主题一致，之后换色板
 * 不会连带改它（与「复用时适应新主题」同义）。引用会让检查器的取色器读不出颜色，也会在文档
 * 去掉色板后让组件失败关闭，所以「持续跟随主题」不由插入默认值承担。
 */
export function resolveBaseScreenMaterialDefaultStyle(
  manifest: Pick<BaseScreenMaterialManifest, 'defaultStyle' | 'themeStyle'>,
  theme: ScreenTheme | undefined,
): ScreenJsonObject {
  const slots = manifest.themeStyle;
  if (slots === undefined || theme === undefined) return manifest.defaultStyle;
  let next: Record<string, ScreenJsonValue> | undefined;
  for (const [key, slot] of Object.entries(slots) as [string, ScreenThemeSlot][]) {
    const color = readScreenThemeColor(theme, slot);
    if (typeof color !== 'string') continue;
    next ??= { ...manifest.defaultStyle };
    next[key] = color;
  }
  return next ?? manifest.defaultStyle;
}
