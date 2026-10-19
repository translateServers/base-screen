import type { DatasetFieldDefinition, DatasetValueType } from '../datasets/dataset-definitions';
import type { CellScalar, DatasourceRow, SelectedColumn } from '../datasources/datasource.types';

/**
 * 值类型推断与单元格归一（三种数据源共用，PRD §8.3 / 架构 §4.4）。
 *
 * 两条铁律：
 * 1. **所有自建字段 `nullable: true`**：SQLite 是动态类型且允许 NULL；声明 `nullable:false`
 *    会让契约的 `parseRows` 在遇到一个 null 单元格时判整份响应非法（`HOST_DATASET_INVALID`），
 *    而「某行某列恰好是 null」在真实库里是常态。
 * 2. **`query` 用落库字段投影**（`projectRows`），不是重新推断：`describe.fields` 与
 *    `query.fields` 的逐字段一致由构造保证（A3/A24），并逐格 `coerceCell` 强制类型，
 *    保证契约的 `validCell` 永远通过。
 *
 * `coerceCell` 在 `src/sqlite/sqlite-runner.cjs` 里有一份**规则相同**的 JS 实现（执行器
 * 在主进程之外，无法 import TS）；`test/sqlite-executor.e2e-spec.ts` 用真实数据做一致性
 * 断言，任何一侧漂移都会红。
 */

/** 声明类型里的数值谱系（SQLite 的 NUMERIC 亲和 + 常见别名）。 */
const NUMERIC_TYPE_PATTERN = /INT|REAL|DOUBLE|FLOAT|NUMERIC|DECIMAL|BOOLEAN|NUMBER/;

/**
 * 声明类型 → 契约 `valueType`；**返回 null 表示该列不可勾选**（二进制列）。
 *
 * 规则（PRD §8.3）：`BLOB` → 不支持；含 `DATE`/`TIME` → `date`（比"按 NUMERIC 亲和算
 * number"更贴近语义，也不会把 ISO 串塞进 number 字段）；数值谱系 → `number`；
 * 其余（含 `TEXT`/`CHAR`/`CLOB` 与空声明类型）→ `string`。
 */
export function declaredTypeToValueType(declaredType: string): DatasetValueType | null {
  const normalized = declaredType.trim().toUpperCase();
  if (normalized === '') return 'string';
  if (normalized.includes('BLOB')) return null;
  if (normalized.includes('DATE') || normalized.includes('TIME')) return 'date';
  if (NUMERIC_TYPE_PATTERN.test(normalized)) return 'number';
  return 'string';
}

/** 该列能否勾选（BLOB 灰显 + 「二进制列不支持」）。 */
export function isSupportedDeclaredType(declaredType: string): boolean {
  return declaredTypeToValueType(declaredType) !== null;
}

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** ISO 8601 日期/时间串（`2026-03-01` 与 `2026-03-01T00:00:00.000Z` 都算）。 */
export function isIsoDateString(value: string): boolean {
  if (ISO_DATE_PATTERN.test(value) === false) return false;
  return Number.isNaN(Date.parse(value)) === false;
}

/** 单元格级类型推断（SQL 模式 / REST / 静态共用）。 */
export function inferValueTypeFromValue(value: unknown): DatasetValueType {
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'string';
  if (typeof value === 'bigint') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return isIsoDateString(value) ? 'date' : 'string';
  // null / 二进制 / 嵌套对象：一律按 string（嵌套值在 REST 侧已降级成 JSON 字符串）
  return 'string';
}

/** 字段 label：契约要求非空，列名 trim 后为空则回落列名本身。 */
function fieldLabel(columnName: string): string {
  const trimmed = columnName.trim();
  return trimmed === '' ? columnName : trimmed;
}

/** 表模式：字段来自**勾选列 + 声明类型**，顺序 = 勾选顺序（PRD §8.3）。 */
export function fieldsFromTableColumns(
  columns: readonly SelectedColumn[],
): readonly DatasetFieldDefinition[] {
  return columns.map((column) => {
    const valueType = declaredTypeToValueType(column.declaredType) ?? 'string';
    return {
      id: column.name,
      label: fieldLabel(column.name),
      valueType,
      nullable: true,
    };
  });
}

/**
 * SQL 模式 / REST / 静态：字段来自**结果集列名 + 首行取值**，顺序 = 结果集顺序。
 *
 * `sampleRow` 为 null（空结果）时全部按 `string`——调用方本应在空结果时判失败
 * （PRD §8.5「结果为空 → 不算成功」），这里只是不制造额外分支。
 */
export function inferFieldsFromColumns(
  columnNames: readonly string[],
  sampleRow: Readonly<Record<string, unknown>> | null,
): readonly DatasetFieldDefinition[] {
  return columnNames.map((columnName) => {
    const sample = sampleRow === null ? null : readCell(sampleRow, columnName);
    const nonNull = sample === null || sample === undefined ? null : sample;
    return {
      id: columnName,
      label: fieldLabel(columnName),
      valueType: nonNull === null ? 'string' : inferValueTypeFromValue(nonNull),
      nullable: true,
    };
  });
}

function isBinaryCell(value: unknown): boolean {
  return value instanceof Uint8Array;
}

function safeJsonString(value: unknown): string | null {
  try {
    const text = JSON.stringify(value);
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function bigintToSafeNumber(value: bigint): number | null {
  if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(value);
  }
  return null;
}

function toNumberCell(value: unknown): CellScalar {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return bigintToSafeNumber(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBooleanCell(value: unknown): CellScalar {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true' || lowered === '1') return true;
    if (lowered === 'false' || lowered === '0') return false;
  }
  return null;
}

function toDateCell(value: unknown): CellScalar {
  if (typeof value === 'string') return isIsoDateString(value) ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/**
 * 按字段声明的 `valueType` 强制单元格类型，保证契约的 `validCell` 永远通过。
 *
 * 规则必须与 `sqlite-runner.cjs` 的 `coerceCell` 完全一致（见文件头）。
 */
export function coerceCell(value: unknown, valueType: DatasetValueType): CellScalar {
  if (value === null || value === undefined) return null;
  switch (valueType) {
    case 'string':
      if (isBinaryCell(value)) return null;
      if (typeof value === 'object') return safeJsonString(value);
      if (typeof value === 'bigint') return value.toString();
      return String(value);
    case 'number':
      return toNumberCell(value);
    case 'boolean':
      return toBooleanCell(value);
    case 'date':
      return toDateCell(value);
    default:
      return null;
  }
}

function readCell(row: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
}

/**
 * 用落库字段投影一行：**缺列补 null、多列丢弃**，值一律按字段类型归一。
 *
 * 行对象用 `Object.create(null)` 构造，规避列名为 `__proto__` 时静默丢键。
 */
export function projectRows(
  rows: readonly Readonly<Record<string, unknown>>[],
  fields: readonly DatasetFieldDefinition[],
): readonly DatasourceRow[] {
  const projected: DatasourceRow[] = [];
  for (const row of rows) {
    const output: Record<string, CellScalar> = Object.create(null);
    for (const field of fields) {
      output[field.id] = coerceCell(readCell(row, field.id), field.valueType);
    }
    projected.push(output);
  }
  return projected;
}

/** 字段集合（仅 id + 类型）是否变化 —— 「编辑已引用数据源」的字段变化二次确认要用。 */
export function haveFieldsChanged(
  previous: readonly DatasetFieldDefinition[],
  next: readonly DatasetFieldDefinition[],
): boolean {
  if (previous.length !== next.length) return true;
  for (let index = 0; index < previous.length; index += 1) {
    const left = previous[index];
    const right = next[index];
    if (left === undefined || right === undefined) return true;
    if (left.id !== right.id || left.valueType !== right.valueType) return true;
  }
  return false;
}
