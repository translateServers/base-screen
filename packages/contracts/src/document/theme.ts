import type {
  ScreenTheme,
  ScreenThemeBaseSlot,
  ScreenThemeSlot,
  ScreenThemeStatusSlot,
} from '../types/document.js';

/**
 * 文档级主题色位（ADR-0098）。槽位固定且语义化：预设库、换肤策略与取色 UI 归宿主，
 * 基座只拥有「色位身份 + 确定性解析」。组件 style 里的颜色值可以写 `theme:<slot>`
 * 引用，渲染器在投影模型时解析成色板具体颜色；引用解析不到即失败关闭。
 */
export const SCREEN_THEME_BASE_SLOTS: readonly ScreenThemeBaseSlot[] = [
  'primary',
  'text',
  'textSecondary',
  'background',
  'accent',
  'accentSecondary',
];

/** 状态色位（ADR-0110 §2.6.4）：色板里可省略，省略时取下面的内置默认色。 */
export const SCREEN_THEME_STATUS_SLOTS: readonly ScreenThemeStatusSlot[] = [
  'danger',
  'warning',
  'info',
  'success',
];

export const SCREEN_THEME_STATUS_DEFAULTS: Readonly<Record<ScreenThemeStatusSlot, string>> = {
  danger: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
  success: '#52c41a',
};

export const SCREEN_THEME_SLOTS: readonly ScreenThemeSlot[] = [
  ...SCREEN_THEME_BASE_SLOTS,
  ...SCREEN_THEME_STATUS_SLOTS,
];

const THEME_REF_PREFIX = 'theme:';

export function isScreenThemeSlot(value: string): value is ScreenThemeSlot {
  return (SCREEN_THEME_SLOTS as readonly string[]).includes(value);
}

export function isScreenThemeStatusSlot(value: string): value is ScreenThemeStatusSlot {
  return (SCREEN_THEME_STATUS_SLOTS as readonly string[]).includes(value);
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

/** 读一个色位的颜色：状态色位在色板缺省（含整份主题缺省）时回落到内置默认色。 */
export function readScreenThemeColor(
  theme: ScreenTheme | undefined,
  slot: ScreenThemeSlot,
): string | undefined {
  const color = (theme?.palette as Readonly<Record<string, string | undefined>> | undefined)?.[
    slot
  ];
  if (color !== undefined) return color;
  return isScreenThemeStatusSlot(slot) ? SCREEN_THEME_STATUS_DEFAULTS[slot] : undefined;
}

export function resolveScreenThemeRef(
  value: string,
  theme: ScreenTheme | undefined,
): string | undefined {
  const slot = readScreenThemeRef(value);
  if (slot === undefined) return undefined;
  return readScreenThemeColor(theme, slot);
}
