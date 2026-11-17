import type { ScreenTheme, ScreenThemeSlot } from '../types/document.js';

/**
 * 文档级主题色位（ADR-0098）。槽位固定且语义化：预设库、换肤策略与取色 UI 归宿主，
 * 基座只拥有「色位身份 + 确定性解析」。组件 style 里的颜色值可以写 `theme:<slot>`
 * 引用，渲染器在投影模型时解析成色板具体颜色；引用解析不到即失败关闭。
 */
export const SCREEN_THEME_SLOTS: readonly ScreenThemeSlot[] = [
  'primary',
  'text',
  'textSecondary',
  'background',
  'accent',
  'accentSecondary',
];

const THEME_REF_PREFIX = 'theme:';

export function isScreenThemeSlot(value: string): value is ScreenThemeSlot {
  return (SCREEN_THEME_SLOTS as readonly string[]).includes(value);
}

/** 读出 `theme:<slot>` 引用；不是引用语法时返回 undefined（调用方保留原值）。 */
export function readScreenThemeRef(value: string): ScreenThemeSlot | undefined {
  if (!value.startsWith(THEME_REF_PREFIX)) return undefined;
  const slot = value.slice(THEME_REF_PREFIX.length);
  return isScreenThemeSlot(slot) ? slot : undefined;
}

/** 值是否是引用语法（含非法槽位）：非法引用必须失败关闭，不能当普通颜色放行。 */
export function isScreenThemeRefSyntax(value: string): boolean {
  return value.startsWith(THEME_REF_PREFIX);
}

export function screenThemeRef(slot: ScreenThemeSlot): string {
  return `${THEME_REF_PREFIX}${slot}`;
}

export function resolveScreenThemeRef(
  value: string,
  theme: ScreenTheme | undefined,
): string | undefined {
  const slot = readScreenThemeRef(value);
  if (slot === undefined) return undefined;
  return theme?.palette[slot];
}
