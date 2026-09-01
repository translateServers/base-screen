import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';

const DEFAULT_VISIBLE_BORDER_WIDTH = 1;

/**
 * Builds an Inspector style patch and keeps coupled visual fields usable. Changing a declared
 * border color is an intent to show that border, so a zero-width border is enabled in the same
 * canonical transaction. An unchanged color or a manifest without an editable numeric width keeps
 * the existing width untouched.
 */
export function createDesignerStyleFieldPatch(
  style: ScreenJsonObject,
  field: string,
  value: ScreenJsonValue,
  manifest: BaseScreenMaterialManifest,
): ScreenJsonObject {
  const patch = { ...style, [field]: value };
  if (field !== 'borderColor' || Object.is(style.borderColor, value) || style.borderWidth !== 0) {
    return patch;
  }
  const widthSchema = manifest.styleSchema.properties.borderWidth;
  const exposesWidth = (manifest.stylePanel ?? []).some((item) => item.style === 'borderWidth');
  if (widthSchema?.kind !== 'number' || !exposesWidth) return patch;
  const borderWidth = Math.max(DEFAULT_VISIBLE_BORDER_WIDTH, widthSchema.minimum ?? 0);
  if (widthSchema.maximum !== undefined && borderWidth > widthSchema.maximum) return patch;
  return { ...patch, borderWidth };
}
