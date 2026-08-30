import type { ScreenDatasetValueType, ScreenJsonValue } from '@base-screen/contracts';

export function coerceDesignerStaticCell(
  source: string,
  valueType: ScreenDatasetValueType,
  nullable: boolean,
): ScreenJsonValue | undefined {
  const value = source.trim();
  if (value === '') return nullable ? null : undefined;
  if (valueType === 'string' || valueType === 'date') {
    if (valueType === 'date' && !isIsoDate(value)) return undefined;
    return source;
  }
  if (valueType === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  return undefined;
}

function isIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    ) && Number.isFinite(Date.parse(value))
  );
}
