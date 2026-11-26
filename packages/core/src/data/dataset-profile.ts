import type {
  ScreenDatasetDefinition,
  ScreenDatasetParameterValue,
  ScreenDatasetValueType,
  ScreenJsonValue,
  ScreenTabularDataset,
} from '@base-screen/contracts';

/**
 * 字段画像（ADR-0114 §2.2）：describe 结果 + 一份样本 → 确定性的统计描述。
 *
 * 同一份 describe 与同一份样本得到逐字节相同的结果；统计全部由代码完成，不让模型估。
 * 画像只证明「样本里如此」：`rows.truncated` 与 `rows.sampled` 原样交给模型和提案理由。
 * 字段清单以 describe 为准——运行时要求查询结果的 `fields` 与 describe 完全一致（ADR-0114 §8.1）。
 */

/** 样本最多处理的行数。 */
export const SCREEN_PROFILE_MAX_ROWS = 1000;
/** 画像最多带的字段数；超出按「度量、时间、维度、编号、全空」的优先级保留。 */
export const SCREEN_PROFILE_MAX_FIELDS = 64;

export type ScreenFieldKind = 'measure' | 'dimension' | 'time' | 'identifier' | 'empty';

export type ScreenTimeGranularity = 'minute' | 'hour' | 'day' | 'month' | 'year' | 'irregular';

export interface ScreenFieldProfile {
  readonly id: string;
  readonly label: string;
  readonly valueType: ScreenDatasetValueType;
  readonly unit?: string;
  readonly kind: ScreenFieldKind;
  /** 样本里的非空不同取值个数。 */
  readonly distinct: number;
  /** 样本里空值的比例，保留三位小数；没有样本时为 0。 */
  readonly nullRatio: number;
  readonly number?: {
    readonly min: number;
    readonly max: number;
    readonly integer: boolean;
    readonly nonNegative: boolean;
  };
  readonly time?: {
    readonly min: string;
    readonly max: string;
    readonly granularity: ScreenTimeGranularity;
  };
}

export interface ScreenParameterProfile {
  readonly name: string;
  readonly required: boolean;
  readonly allowedValues?: readonly ScreenDatasetParameterValue[];
  /** `default`：有默认值；`missing`：必填又没有默认值，本轮取不到数；`optional`：可选且无默认值。 */
  readonly resolved: 'default' | 'missing' | 'optional';
}

export interface ScreenDatasetProfile {
  readonly datasetId: string;
  readonly name: string;
  /** 是否有样本参与统计。没有样本时只有 describe 推得出的部分（`kind` 按类型，`distinct` 为 0）。 */
  readonly sampled: boolean;
  readonly rows: {
    /** 参与统计的行数。 */
    readonly sampled: number;
    /** 宿主给出的总行数（`totalRowCount`）。 */
    readonly total?: number;
    /** 样本是否不是全量：超过行数上限，或宿主声明的总行数大于样本行数。 */
    readonly truncated: boolean;
  };
  readonly params: readonly ScreenParameterProfile[];
  /**
   * 粒度：`keys` 为维度与时间字段（按字段顺序）；`unique` 表示样本里这些组合互不重复——
   * 数据看起来已按它们汇总好（每组一行），可以直接画分类与趋势。没有键时，单行结果算已汇总。
   */
  readonly grain: { readonly keys: readonly string[]; readonly unique: boolean };
  readonly fields: readonly ScreenFieldProfile[];
  /** 因字段数上限没有进画像的字段个数。 */
  readonly omittedFields: number;
}

/** 编号类字段名：单独成词的 id / code / no / sn / key，或中文的编号、代码、单号、工号、序号。 */
const IDENTIFIER_PATTERN =
  /(?:^|[^a-z])(?:id|code|no|sn|key|uuid)$|^(?:id|code|no|sn|key|uuid)(?:[^a-z]|$)|编号|代码|单号|工号|序号/i;

/** 驼峰写法的编号：`deviceId`、`orderNo`、`stationCode`（大小写敏感）。 */
const CAMEL_IDENTIFIER_PATTERN = /[a-z0-9](?:Id|ID|Code|No|Key|Uuid)$/;

const KIND_PRIORITY: Readonly<Record<ScreenFieldKind, number>> = {
  measure: 0,
  time: 1,
  dimension: 2,
  identifier: 3,
  empty: 4,
};

export function profileScreenDataset(
  definition: ScreenDatasetDefinition,
  sample?: ScreenTabularDataset,
): ScreenDatasetProfile {
  const rows = sample === undefined ? [] : sample.rows.slice(0, SCREEN_PROFILE_MAX_ROWS);
  const sampled = sample !== undefined;
  const total = sample?.totalRowCount;
  const truncated =
    sampled &&
    (sample.rows.length > SCREEN_PROFILE_MAX_ROWS || (total !== undefined && total > rows.length));

  const all = definition.fields.map((field) => profileField(field, rows, sampled));
  const kept = [...all]
    .map((field, index) => ({ field, index }))
    .sort((a, b) => KIND_PRIORITY[a.field.kind] - KIND_PRIORITY[b.field.kind] || a.index - b.index)
    .slice(0, SCREEN_PROFILE_MAX_FIELDS)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.field);

  const keys = kept
    .filter((field) => field.kind === 'dimension' || field.kind === 'time')
    .map((field) => field.id);

  return {
    datasetId: definition.datasetId,
    name: definition.name,
    sampled,
    rows: {
      sampled: rows.length,
      ...(total === undefined ? {} : { total }),
      truncated,
    },
    params: definition.parameters.map((parameter) => ({
      name: parameter.name,
      required: parameter.required,
      ...(parameter.allowedValues === undefined
        ? {}
        : { allowedValues: [...parameter.allowedValues] }),
      resolved:
        parameter.defaultValue !== undefined
          ? 'default'
          : parameter.required
            ? 'missing'
            : 'optional',
    })),
    grain: { keys, unique: sampled && isUnique(rows, keys) },
    fields: kept,
    omittedFields: all.length - kept.length,
  };
}

function profileField(
  field: ScreenDatasetDefinition['fields'][number],
  rows: readonly Readonly<Record<string, ScreenJsonValue>>[],
  sampled: boolean,
): ScreenFieldProfile {
  const values: ScreenJsonValue[] = [];
  for (const row of rows) {
    const value = row[field.id];
    if (value !== null && value !== undefined) values.push(value);
  }
  const distinct = new Set(values.map((value) => JSON.stringify(value))).size;
  const nullRatio = rows.length === 0 ? 0 : round3((rows.length - values.length) / rows.length);
  const base = {
    id: field.id,
    label: field.label,
    valueType: field.valueType,
    ...(field.unit === undefined ? {} : { unit: field.unit }),
  };

  let kind: ScreenFieldKind;
  if (sampled && rows.length > 0 && values.length === 0) kind = 'empty';
  else if (field.valueType === 'date') kind = 'time';
  else if (
    sampled &&
    values.length >= 2 &&
    distinct === values.length &&
    (IDENTIFIER_PATTERN.test(field.id) ||
      CAMEL_IDENTIFIER_PATTERN.test(field.id) ||
      IDENTIFIER_PATTERN.test(field.label))
  )
    kind = 'identifier';
  else if (field.valueType === 'number') kind = 'measure';
  else kind = 'dimension';

  const numbers = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const numberStats =
    field.valueType === 'number' && numbers.length > 0
      ? {
          number: {
            min: Math.min(...numbers),
            max: Math.max(...numbers),
            integer: numbers.every((value) => Number.isInteger(value)),
            nonNegative: numbers.every((value) => value >= 0),
          },
        }
      : {};
  const timeStats = field.valueType === 'date' ? timeProfile(values) : {};

  return { ...base, kind, distinct, nullRatio, ...numberStats, ...timeStats };
}

function timeProfile(values: readonly ScreenJsonValue[]): Pick<ScreenFieldProfile, 'time'> {
  const stamps: { text: string; ms: number }[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) stamps.push({ text: value, ms });
  }
  if (stamps.length === 0) return {};
  stamps.sort((a, b) => a.ms - b.ms);
  const unique = [...new Set(stamps.map((item) => item.ms))];
  let step = Number.POSITIVE_INFINITY;
  for (let index = 1; index < unique.length; index += 1) {
    step = Math.min(step, unique[index]! - unique[index - 1]!);
  }
  return {
    time: {
      min: stamps[0]!.text,
      max: stamps[stamps.length - 1]!.text,
      granularity: granularityOf(step),
    },
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function granularityOf(step: number): ScreenTimeGranularity {
  if (!Number.isFinite(step)) return 'irregular';
  if (step >= 365 * DAY) return 'year';
  if (step >= 28 * DAY) return 'month';
  if (step >= DAY) return 'day';
  if (step >= HOUR) return 'hour';
  if (step >= MINUTE) return 'minute';
  return 'irregular';
}

function isUnique(
  rows: readonly Readonly<Record<string, ScreenJsonValue>>[],
  keys: readonly string[],
): boolean {
  if (rows.length === 0) return false;
  if (keys.length === 0) return rows.length === 1;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = JSON.stringify(keys.map((id) => row[id] ?? null));
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
