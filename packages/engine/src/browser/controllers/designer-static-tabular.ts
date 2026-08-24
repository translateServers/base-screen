import {
  MAX_DATASET_FIELDS,
  MAX_DATASET_ROWS,
  parseScreenTabularDataset,
  type ScreenDatasetField,
  type ScreenDatasetValueType,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenTabularDataset,
} from '@base-screen/contracts';

export function parseDesignerStaticTabularDraft(
  value: unknown,
): ScreenParseResult<ScreenTabularDataset> {
  return parseScreenTabularDataset(value);
}

export function parseDesignerTsv(
  source: string,
  firstRowIsHeader: boolean,
): ScreenParseResult<ScreenTabularDataset> {
  const matrix = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line, index, lines) => !(index === lines.length - 1 && line === ''))
    .map((line) => line.split('\t'));
  if (matrix.length === 0 || matrix.every((row) => row.length === 1 && row[0] === '')) {
    return invalid(['rows'], 'Pasted table is empty.');
  }
  const width = Math.max(...matrix.map((row) => row.length));
  if (width > MAX_DATASET_FIELDS) return invalid(['fields'], 'Pasted table has too many columns.');
  const dataRows = firstRowIsHeader ? matrix.slice(1) : matrix;
  if (dataRows.length > MAX_DATASET_ROWS)
    return invalid(['rows'], 'Pasted table has too many rows.');
  const header = firstRowIsHeader ? (matrix[0] ?? []) : [];
  const usedIds = new Set<string>();
  const fields: ScreenDatasetField[] = Array.from({ length: width }, (_, index) => {
    const headerLabel = header[index]?.trim();
    const label = headerLabel || `Column ${index + 1}`;
    const id = uniqueFieldId(headerLabel || `column_${index + 1}`, index, usedIds);
    const cells = dataRows.map((row) => row[index] ?? '');
    return {
      id,
      label,
      valueType: inferValueType(cells),
      nullable: cells.some((cell) => cell.trim() === ''),
    };
  });
  const rows: ScreenJsonObject[] = dataRows.map(
    (cells) =>
      Object.fromEntries(
        fields.map((field, index) => [field.id, parseCell(cells[index] ?? '', field.valueType)]),
      ) as ScreenJsonObject,
  );
  return parseScreenTabularDataset({ fields, rows });
}

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

function inferValueType(cells: readonly string[]): ScreenDatasetValueType {
  const values = cells.map((cell) => cell.trim()).filter((cell) => cell !== '');
  if (values.length === 0) return 'string';
  if (values.every((value) => Number.isFinite(Number(value)))) return 'number';
  if (values.every((value) => /^(?:true|false)$/i.test(value))) return 'boolean';
  if (values.every(isIsoDate)) return 'date';
  return 'string';
}

function parseCell(source: string, valueType: ScreenDatasetValueType): ScreenJsonValue {
  if (source.trim() === '') return null;
  return coerceDesignerStaticCell(source, valueType, false) ?? source;
}

function isIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    ) && Number.isFinite(Date.parse(value))
  );
}

function uniqueFieldId(label: string, index: number, used: Set<string>): string {
  const normalized = label
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 240);
  const base = normalized || `column_${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function invalid(path: readonly (string | number)[], message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'HOST_DATASET_INVALID', path, message }],
  };
}
