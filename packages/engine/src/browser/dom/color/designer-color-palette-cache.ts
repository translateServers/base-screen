import type { ColorPaletteState } from './designer-color-palette-types.js';

// 草稿缓存为模块级（多设计器实例共享）：以 FIFO 上限约束长会话内存增长，
// 超限时淘汰最早写入的字段草稿（被淘汰字段回退为从文档值重新解析）。
export const MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES = 32;
const paletteDraftCache = new Map<string, ColorPaletteState>();
const paletteSelectionCache = new Map<string, number>();
const paletteHueCache = new Map<string, { readonly hue: number; readonly color: string }>();
const palettePlaneCache = new Map<
  string,
  { readonly saturation: number; readonly value: number; readonly color: string }
>();
export function cacheColorPaletteDraft(fieldKey: string, state: ColorPaletteState): void {
  if (paletteDraftCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES) {
    const oldest = paletteDraftCache.keys().next().value;
    if (oldest !== undefined) {
      paletteDraftCache.delete(oldest);
      paletteSelectionCache.delete(oldest);
      paletteHueCache.delete(oldest);
      palettePlaneCache.delete(oldest);
    }
  }
  paletteDraftCache.set(fieldKey, state);
}

export function cacheColorPaletteSelection(fieldKey: string, index: number): void {
  if (paletteSelectionCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES) {
    const oldest = paletteSelectionCache.keys().next().value;
    if (oldest !== undefined) paletteSelectionCache.delete(oldest);
  }
  paletteSelectionCache.set(fieldKey, index);
}

export function cacheColorPaletteHue(fieldKey: string, hue: number, color: string): void {
  if (
    !paletteHueCache.has(fieldKey) &&
    paletteHueCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES
  ) {
    const oldest = paletteHueCache.keys().next().value;
    if (oldest !== undefined) paletteHueCache.delete(oldest);
  }
  paletteHueCache.set(fieldKey, { hue, color: color.toLowerCase() });
}

export function cacheColorPalettePlane(
  fieldKey: string,
  saturation: number,
  value: number,
  color: string,
): void {
  if (
    !palettePlaneCache.has(fieldKey) &&
    palettePlaneCache.size >= MAX_COLOR_PALETTE_DRAFT_CACHE_ENTRIES
  ) {
    const oldest = palettePlaneCache.keys().next().value;
    if (oldest !== undefined) palettePlaneCache.delete(oldest);
  }
  palettePlaneCache.set(fieldKey, {
    saturation,
    value,
    color: color.toLowerCase(),
  });
}

export function clearColorPaletteDraftCache(): void {
  paletteDraftCache.clear();
  paletteSelectionCache.clear();
  paletteHueCache.clear();
  palettePlaneCache.clear();
}

/** 测试支撑面：草稿/选中缓存当前条目数（与 clearColorPaletteDraftCache 配套）。 */
export function colorPaletteDraftCacheSizes(): {
  readonly drafts: number;
  readonly selections: number;
} {
  return { drafts: paletteDraftCache.size, selections: paletteSelectionCache.size };
}

export function colorPaletteDraft(fieldKey: string): ColorPaletteState | undefined {
  return paletteDraftCache.get(fieldKey);
}

export function colorPaletteSelection(fieldKey: string): number | undefined {
  return paletteSelectionCache.get(fieldKey);
}

export function colorPaletteHue(
  fieldKey: string,
): { readonly hue: number; readonly color: string } | undefined {
  return paletteHueCache.get(fieldKey);
}

export function colorPalettePlane(
  fieldKey: string,
): { readonly saturation: number; readonly value: number; readonly color: string } | undefined {
  return palettePlaneCache.get(fieldKey);
}
