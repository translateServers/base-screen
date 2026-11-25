export const MIN_COLOR_PALETTE_STOPS = 2;
export const MAX_COLOR_PALETTE_STOPS = 8;

export type ColorPaletteMode = 'solid' | 'linear-gradient' | 'radial-gradient';
export type ColorPaletteManualValueField = 'solid-value' | 'stop-value';

export interface ColorPaletteStop {
  readonly color: string;
  readonly position: number;
}

export interface ColorPaletteState {
  readonly mode: ColorPaletteMode;
  readonly solid: string;
  readonly stops: readonly ColorPaletteStop[];
  readonly angle: number;
  readonly x: number;
  readonly y: number;
}

export interface DesignerColorPalette {
  readonly element: HTMLElement;
  readonly controls: readonly HTMLInputElement[];
}

/** 可选的主题色位（ADR-0098 / ADR-0110 §2.6.4）：`color` 是按当前色板解析出的颜色。 */
export interface DesignerColorThemeSlot {
  readonly slot: string;
  readonly label: string;
  readonly color: string;
  /** 与页面配置同名分组：`theme` = 主题色（六个基础色位），`status` = 状态色（ADR-0110 §2.6.4）。 */
  readonly group: 'theme' | 'status';
}

export interface DesignerColorPaletteOptions {
  /** 缺省展示完整填充控件；传 false 时保留同一控件外观但只提供纯色编辑。 */
  readonly allowGradient?: boolean;
  /**
   * 提供时弹层里多一排「主题色」：选中后写入 `theme:<slot>` 引用，颜色随文档色板变化。
   * 只给组件样式的颜色字段（渲染器只解析组件样式里的引用）；色板本身、画布背景不传。
   */
  readonly themeSlots?: readonly DesignerColorThemeSlot[];
}

export const DEFAULT_COLOR = '#000000';
