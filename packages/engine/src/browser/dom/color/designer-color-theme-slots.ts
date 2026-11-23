import {
  isScreenThemeStatusSlot,
  readScreenThemeColor,
  resolveScreenThemeRef,
  SCREEN_THEME_SLOTS,
  type ScreenJsonValue,
  type ScreenTheme,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerColorThemeSlot } from './designer-color-palette-types.js';

/**
 * 当前文档可引用的主题色位：基础色位只在文档带色板时可用（否则引用会失败关闭），
 * 状态色位总是可用（色板省略时取内置默认色，ADR-0110 §2.6.4）。
 */
export function designerThemeColorSlots(
  theme: ScreenTheme | undefined,
): readonly DesignerColorThemeSlot[] {
  return SCREEN_THEME_SLOTS.flatMap((slot) => {
    const color = readScreenThemeColor(theme, slot);
    return color === undefined
      ? []
      : [
          {
            slot,
            label: DESIGNER_UI_TEXT.propertiesPanel.themeSlots[slot],
            color,
            group: isScreenThemeStatusSlot(slot) ? ('status' as const) : ('theme' as const),
          },
        ];
  });
}

/** 色卡、色块这类只读展示：`theme:<slot>` 换成当前色板的颜色，其余值原样返回。 */
export function resolveDesignerThemeColorValue(
  value: ScreenJsonValue | undefined,
  theme: ScreenTheme | undefined,
): ScreenJsonValue | undefined {
  if (typeof value !== 'string') return value;
  return resolveScreenThemeRef(value, theme) ?? value;
}
