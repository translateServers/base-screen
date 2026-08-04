export const SCREEN_MATERIAL_TYPE_PATTERN =
  '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*\\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$';

const SCREEN_MATERIAL_TYPE_REGEXP = new RegExp(SCREEN_MATERIAL_TYPE_PATTERN);

export function isScreenMaterialType(value: unknown): value is string {
  return typeof value === 'string' && SCREEN_MATERIAL_TYPE_REGEXP.test(value);
}
