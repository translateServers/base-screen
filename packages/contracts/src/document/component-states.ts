import { screenJsonEquals } from '../json/equality.js';
import type {
  ScreenComponentStateCase,
  ScreenComponentStateRowMatch,
  ScreenComponentStates,
} from '../types/document.js';
import type { ScreenJsonObject, ScreenJsonValue } from '../types/json.js';

/**
 * 组件状态的纯求值（ADR-0110 §2.2、§2.3）。renderer 与设计器预览共用，不做 I/O。
 *
 * 取值规则：
 * - 读不到来源（组件数据未就绪、变量 / 数据源尚无结果）或路径不存在 → `unavailable`，调用方保持上一个结果；
 * - 按行查找找不到匹配行 → 取值为空，判定照常进行（通常落到默认）；
 * - 条件按顺序判定，第一条命中且指向已声明状态的条件给出状态；都不命中为默认。
 */

export const DEFAULT_SCREEN_COMPONENT_STATE_ID = 'default';

export interface ScreenComponentStateReaders {
  /** 组件自身数据（`dataState.value`）；未就绪返回 `undefined`。 */
  readonly componentData: () => ScreenJsonValue | undefined;
  /** 变量当前值；未知或尚未就绪返回 `undefined`。 */
  readonly variable: (variableId: string) => ScreenJsonValue | undefined;
  /** 数据源实例当前结果；尚无结果返回 `undefined`。 */
  readonly dataSource: (dataSourceId: string) => ScreenJsonValue | undefined;
}

export type ScreenComponentStateResolution =
  | { readonly status: 'resolved'; readonly stateId: string; readonly value?: ScreenJsonValue }
  | { readonly status: 'unavailable' };

export function resolveScreenComponentState(
  states: ScreenComponentStates | undefined,
  readers: ScreenComponentStateReaders,
): ScreenComponentStateResolution {
  const judge = states?.judge;
  if (states === undefined || judge === undefined) {
    return { status: 'resolved', stateId: DEFAULT_SCREEN_COMPONENT_STATE_ID };
  }
  const input = judge.input;
  const source =
    input.kind === 'component-data'
      ? readers.componentData()
      : input.kind === 'variable'
        ? readers.variable(input.variableId)
        : readers.dataSource(input.dataSourceId);
  if (source === undefined) return { status: 'unavailable' };
  let value: ScreenJsonValue | undefined;
  if (input.kind === 'data-source-field' && input.where !== undefined) {
    const equals =
      input.where.equals.kind === 'literal'
        ? input.where.equals.value
        : readers.variable(input.where.equals.variableId);
    const row =
      equals === undefined ? undefined : selectScreenComponentStateRow(source, input.where, equals);
    if (row !== undefined) {
      const resolved = readScreenComponentStatePath(row, input.path);
      if (!resolved.ok) return { status: 'unavailable' };
      value = resolved.value;
    }
  } else {
    const resolved = readScreenComponentStatePath(source, input.path);
    if (!resolved.ok) return { status: 'unavailable' };
    value = resolved.value;
  }
  const declared = new Set(states.items.map((item) => item.id));
  for (const entry of judge.cases) {
    if (!declared.has(entry.stateId)) continue;
    if (testScreenComponentStateCase(entry, value)) {
      return {
        status: 'resolved',
        stateId: entry.stateId,
        ...(value === undefined ? {} : { value }),
      };
    }
  }
  return {
    status: 'resolved',
    stateId: DEFAULT_SCREEN_COMPONENT_STATE_ID,
    ...(value === undefined ? {} : { value }),
  };
}

/** 一条判定条件；`value` 为 `undefined` 表示取值为空（按行查找没有匹配行）。 */
export function testScreenComponentStateCase(
  entry: Pick<ScreenComponentStateCase, 'operator' | 'value'>,
  value: ScreenJsonValue | undefined,
): boolean {
  if (entry.operator === 'exists') return value !== undefined && value !== null;
  if (value === undefined) return false;
  const right = entry.value;
  if (right === undefined) return false;
  switch (entry.operator) {
    case 'eq':
      return screenJsonEquals(value, right);
    case 'neq':
      return !screenJsonEquals(value, right);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!isFiniteNumber(value) || !isFiniteNumber(right)) return false;
      if (entry.operator === 'gt') return value > right;
      if (entry.operator === 'gte') return value >= right;
      return entry.operator === 'lt' ? value < right : value <= right;
    }
    case 'contains':
      if (typeof value === 'string') return typeof right === 'string' && value.includes(right);
      return Array.isArray(value) && value.some((item) => screenJsonEquals(item, right));
    default:
      return false;
  }
}

/**
 * 按行查找：表格结果（`{ fields, rows }`）在 `rows` 中找，数组结果在元素中找，其余形状视为找不到。
 * 返回第一条 `field` 等于 `equals` 的行。
 */
export function selectScreenComponentStateRow(
  source: ScreenJsonValue,
  where: Pick<ScreenComponentStateRowMatch, 'field'>,
  equals: ScreenJsonValue,
): ScreenJsonValue | undefined {
  const rows = Array.isArray(source)
    ? source
    : isObject(source) && Array.isArray(source.rows)
      ? (source.rows as readonly ScreenJsonValue[])
      : undefined;
  if (rows === undefined) return undefined;
  for (const row of rows) {
    const key = readScreenComponentStatePath(row, where.field);
    if (key.ok && screenJsonEquals(key.value, equals)) return row;
  }
  return undefined;
}

/**
 * 路径解析只认自有属性与十进制非负整数数组下标（`__proto__` 等原型键不可解析），
 * 保证结果只由数据本身决定。
 */
export function readScreenComponentStatePath(
  value: ScreenJsonValue,
  path: readonly string[],
): { readonly ok: true; readonly value: ScreenJsonValue } | { readonly ok: false } {
  let current: ScreenJsonValue = value;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return { ok: false };
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return { ok: false };
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index >= current.length) return { ok: false };
      current = current[index] as ScreenJsonValue;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return { ok: false };
    current = (current as ScreenJsonObject)[segment] as ScreenJsonValue;
  }
  return { ok: true, value: current };
}

/** 生效外观 = `style` 逐键覆盖为该状态的 `style`；默认或未知状态返回原 `style`。 */
export function mergeScreenComponentStateStyle(
  style: ScreenJsonObject,
  states: ScreenComponentStates | undefined,
  stateId: string,
): ScreenJsonObject {
  if (stateId === DEFAULT_SCREEN_COMPONENT_STATE_ID) return style;
  const state = states?.items.find((item) => item.id === stateId);
  if (state === undefined || Object.keys(state.style).length === 0) return style;
  return { ...style, ...state.style };
}

export interface ScreenComponentStateDependencies {
  readonly componentData: boolean;
  readonly variableIds: readonly string[];
  readonly dataSourceIds: readonly string[];
}

/** 判定取值依赖哪些来源：渲染器据此只在相关来源变化时重算，并把数据源实例计为一个消费者。 */
export function listScreenComponentStateDependencies(
  states: ScreenComponentStates | undefined,
): ScreenComponentStateDependencies {
  const input = states?.judge?.input;
  if (input === undefined) return { componentData: false, variableIds: [], dataSourceIds: [] };
  if (input.kind === 'component-data') {
    return { componentData: true, variableIds: [], dataSourceIds: [] };
  }
  if (input.kind === 'variable') {
    return { componentData: false, variableIds: [input.variableId], dataSourceIds: [] };
  }
  const equals = input.where?.equals;
  return {
    componentData: false,
    variableIds: equals?.kind === 'variable' ? [equals.variableId] : [],
    dataSourceIds: [input.dataSourceId],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: ScreenJsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
