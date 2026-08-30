// ---------------------------------------------------------------------------
// RB3 原子配置：配置对象形状校验（validate before mutate）。这些校验只做
// 足够避免坏配置提交/运行时崩溃的形状检查，不发明兼容解析器。
// ---------------------------------------------------------------------------

export function isBaseScreenMaterialCatalog(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).get === 'function' &&
    typeof (value as Record<string, unknown>).has === 'function' &&
    typeof (value as Record<string, unknown>).list === 'function'
  );
}

export function isScreenHostResourcePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

export function isScreenHostVariablePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

export function isBaseScreenRuntimeContributionIndex(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).getResourceType === 'function' &&
    typeof (value as Record<string, unknown>).hasBlueprintCapability === 'function'
  );
}

export function isScreenBlueprintRuntimePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).emit === 'function'
  );
}

export function isBaseScreenConditionalStylePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

export function isScreenBlueprintHostActionPort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).execute === 'function'
  );
}
