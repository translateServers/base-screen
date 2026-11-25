import type { ColorPaletteState, DesignerColorThemeSlot } from './designer-color-palette-types.js';

/**
 * 调色板与主题色位的关联（ADR-0098）：字段值是 `theme:<slot>` 时调色板按解析出的颜色展示，
 * 只要作者没有把颜色改成别的值，读回的仍是引用；改动颜色即变回具体色值。
 *
 * 判定不依赖事件顺序：`data-color-palette-theme-solid` 记下引用对应的纯色，读值时与当前纯色比较。
 */
const paletteThemeSlots = new WeakMap<HTMLElement, readonly DesignerColorThemeSlot[]>();
const themePicking = new WeakSet<HTMLElement>();

export function registerDesignerColorPaletteTheme(
  palette: HTMLElement,
  slots: readonly DesignerColorThemeSlot[],
): void {
  paletteThemeSlots.set(palette, slots);
}

export function designerColorPaletteThemeSlots(
  palette: HTMLElement,
): readonly DesignerColorThemeSlot[] {
  return paletteThemeSlots.get(palette) ?? [];
}

/** 解析 `theme:<slot>`：只认登记过的色位。 */
export function findDesignerColorThemeSlot(
  value: string | undefined,
  slots: readonly DesignerColorThemeSlot[],
): DesignerColorThemeSlot | undefined {
  if (value === undefined || !value.startsWith('theme:')) return undefined;
  const slot = value.slice('theme:'.length);
  return slots.find((entry) => entry.slot === slot);
}

/** 选中一个色位：执行期间读值一律返回引用（颜色规范化后的纯色在执行后记下）。 */
export function runDesignerColorPaletteThemePick(palette: HTMLElement, run: () => void): void {
  themePicking.add(palette);
  try {
    run();
  } finally {
    themePicking.delete(palette);
  }
}

/** 当前值是否仍是某个色位引用；不是返回 undefined。 */
export function readDesignerColorPaletteTheme(
  palette: HTMLElement,
  state: ColorPaletteState,
): DesignerColorThemeSlot | undefined {
  const slot = palette.dataset.colorPaletteThemeSlot;
  if (slot === undefined || state.mode !== 'solid') return undefined;
  const entry = designerColorPaletteThemeSlots(palette).find((item) => item.slot === slot);
  if (entry === undefined) return undefined;
  if (themePicking.has(palette)) return entry;
  return palette.dataset.colorPaletteThemeSolid === state.solid ? entry : undefined;
}
