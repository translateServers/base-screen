import {
  DEFAULT_PUSH_RETAIN_ROWS,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenPushCursor,
  type ScreenPushRetainPolicy,
} from '@base-screen/contracts';

/**
 * 推送实例的纯函数部分（ADR-0104 §2.4 / §2.5）：游标判定、表格形状、保留窗口与体积裁剪。
 * 不持有状态、不碰计时器，`DataSourceRuntime` 负责把它们接到订阅生命周期上。
 */

export type PushCursorVerdict = 'accept' | 'duplicate' | 'gap';

/** 宿主给的游标是否形状正确；不正确的游标按「不带游标」处理（不做去重）。 */
export function readPushCursor(value: unknown): ScreenPushCursor | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { epoch, revision } = value as { readonly epoch?: unknown; readonly revision?: unknown };
  if (typeof epoch !== 'string' || epoch.length === 0) return undefined;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return undefined;
  }
  return { epoch, revision };
}

/**
 * 游标规则：
 * - 任一侧没有游标：不做去重，按到达顺序接受；
 * - snapshot：同一 epoch 且 revision ≤ 当前 ⇒ 重复；其余（含换 epoch）一律接受，作为新基准；
 * - append：换 epoch 或 revision > 当前 + 1 ⇒ 跳号（进入重同步）；revision ≤ 当前 ⇒ 重复。
 */
export function classifyPushCursor(
  current: ScreenPushCursor | undefined,
  next: ScreenPushCursor | undefined,
  kind: 'snapshot' | 'append',
): PushCursorVerdict {
  if (current === undefined || next === undefined) return 'accept';
  if (kind === 'snapshot') {
    return next.epoch === current.epoch && next.revision <= current.revision
      ? 'duplicate'
      : 'accept';
  }
  if (next.epoch !== current.epoch) return 'gap';
  if (next.revision <= current.revision) return 'duplicate';
  if (next.revision > current.revision + 1) return 'gap';
  return 'accept';
}

export type PushTabularValue = ScreenJsonObject & {
  readonly fields: readonly ScreenJsonObject[];
  readonly rows: readonly ScreenJsonObject[];
};

/** 表格数据集的最小形状判定：`fields` 是带字符串 `id` 的对象数组，`rows` 是对象数组。 */
export function isPushTabularValue(value: ScreenJsonValue | undefined): value is PushTabularValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const { fields, rows } = value as { readonly fields?: unknown; readonly rows?: unknown };
  return (
    Array.isArray(fields) &&
    fields.every((field) => isObject(field) && typeof field.id === 'string') &&
    Array.isArray(rows) &&
    rows.every(isObject)
  );
}

/** 增量行必须是对象，且只能使用现有字段 id（缺字段允许，未知字段不允许）。 */
export function pushRowsMatchFields(
  rows: unknown,
  value: PushTabularValue,
): rows is ScreenJsonObject[] {
  if (!Array.isArray(rows)) return false;
  const fieldIds = new Set(value.fields.map((field) => field.id as string));
  return rows.every((row) => isObject(row) && Object.keys(row).every((key) => fieldIds.has(key)));
}

/** epoch 毫秒数或 ISO-8601 字符串；其它取值视为无法解析。 */
export function readPushRowTime(value: ScreenJsonValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export interface PushWindowResult {
  readonly rows: readonly ScreenJsonObject[];
  /** 有行的时间字段无法解析（按时长裁剪对这些行不生效）。 */
  readonly unparseableTime: boolean;
}

/**
 * 保留窗口裁剪（从头部删）：
 * 1. 声明了 `seconds` 时，以数据里最新一行的时间为基准，删去早于「最新 − seconds」的行；
 *    时间无法解析的行保留，并报告 `unparseableTime`；
 * 2. 行数超过 `rows`（缺省 1000）时删去最早的行。
 */
export function trimPushRows(
  rows: readonly ScreenJsonObject[],
  retain: ScreenPushRetainPolicy | undefined,
): PushWindowResult {
  let kept = rows;
  let unparseableTime = false;
  if (retain?.seconds !== undefined && retain.timeField !== undefined) {
    const field = retain.timeField;
    const times = kept.map((row) => readPushRowTime(row[field]));
    let latest = Number.NEGATIVE_INFINITY;
    for (const time of times) {
      if (time === undefined) unparseableTime = true;
      else if (time > latest) latest = time;
    }
    if (latest !== Number.NEGATIVE_INFINITY) {
      const cutoff = latest - retain.seconds * 1000;
      kept = kept.filter((_, index) => {
        const time = times[index];
        return time === undefined || time >= cutoff;
      });
    }
  }
  const limit = retain?.rows ?? DEFAULT_PUSH_RETAIN_ROWS;
  if (kept.length > limit) kept = kept.slice(kept.length - limit);
  return { rows: kept, unparseableTime };
}

/**
 * 体积裁剪：序列化后超过 `maxBytes` 时继续从头部删行，直到不超或删空。
 * 每轮按 10% 删，避免对大表逐行重算序列化。
 */
export function trimPushValueToBytes(value: PushTabularValue, maxBytes: number): PushTabularValue {
  let current = value;
  while (current.rows.length > 0 && exceedsBytes(JSON.stringify(current), maxBytes)) {
    const drop = Math.max(1, Math.ceil(current.rows.length / 10));
    current = { ...current, rows: current.rows.slice(drop) };
  }
  return current;
}

function exceedsBytes(text: string, maxBytes: number): boolean {
  // 粗判：每个 UTF-16 单元最多 3 字节；远低于上限时不必真正编码。
  if (text.length * 3 <= maxBytes) return false;
  return new TextEncoder().encode(text).length > maxBytes;
}

function isObject(value: unknown): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
