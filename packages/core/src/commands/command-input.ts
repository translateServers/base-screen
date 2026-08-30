import type { ScreenDocument } from '@base-screen/contracts';

export function canonicalTargetIds(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly string[] | undefined {
  const unique = new Set(componentIds);
  const ids = new Set(document.components.map((component) => component.id));
  if ([...unique].some((id) => !ids.has(id))) {
    return undefined;
  }
  return document.components.filter((component) => unique.has(component.id)).map(({ id }) => id);
}

export function patchDocument<T extends object>(base: T, patch: Record<string, unknown>): T {
  return { ...base, ...patch };
}

export function isExactPatch(
  value: unknown,
  allowed: ReadonlySet<string>,
): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
}

export function isStatusOnlyPatch(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 1 && value.status !== undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
