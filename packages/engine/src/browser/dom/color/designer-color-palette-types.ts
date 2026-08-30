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

export interface DesignerColorPaletteOptions {
  /** 缺省展示完整填充控件；传 false 时保留同一控件外观但只提供纯色编辑。 */
  readonly allowGradient?: boolean;
}

export const DEFAULT_COLOR = '#000000';
