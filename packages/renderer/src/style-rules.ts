import type {
  ScreenComponentStyleRule,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';

/**
 * 组件条件样式规则求值（ADR-0058）：以组件自身 `dataState.value` 为唯一条件源。
 * 非 `ready` 状态、路径不可解析、类型不匹配均视为不命中而不是错误；
 * 命中规则按数组顺序逐键合并，同键后写覆盖先写。
 */
export function evaluateScreenComponentStyleRules(
  rules: readonly ScreenComponentStyleRule[] | undefined,
  dataState: BaseScreenMaterialDataState,
): ScreenJsonObject | undefined {
  if (rules === undefined || rules.length === 0 || dataState.status !== 'ready') {
    return undefined;
  }
  let merged: ScreenJsonObject | undefined;
  for (const rule of rules) {
    if (!matchesStyleRule(rule, dataState.value)) continue;
    merged = { ...(merged ?? {}), ...rule.style };
  }
  return merged;
}

function matchesStyleRule(rule: ScreenComponentStyleRule, value: ScreenJsonValue): boolean {
  const resolved = resolveStyleRulePath(value, rule.when.path);
  if (rule.when.operator === 'exists') return resolved.ok;
  if (!resolved.ok) return false;
  const left = resolved.value;
  const right = rule.when.value;
  switch (rule.when.operator) {
    case 'eq':
      return jsonEquals(left, right);
    case 'neq':
      return !jsonEquals(left, right);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!isFiniteNumber(left) || !isFiniteNumber(right)) return false;
      if (rule.when.operator === 'gt') return left > right;
      if (rule.when.operator === 'gte') return left >= right;
      return rule.when.operator === 'lt' ? left < right : left <= right;
    }
    case 'contains':
      if (typeof left === 'string') return typeof right === 'string' && left.includes(right);
      return Array.isArray(left) && left.some((item) => jsonEquals(item, right));
    default:
      return false;
  }
}

/**
 * 路径解析只认自有属性与十进制非负整数数组下标（`__proto__` 等原型键不可解析），
 * 保证求值结果只由数据本身决定。
 */
function resolveStyleRulePath(
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

function isFiniteNumber(value: ScreenJsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 与 Core 蓝图 condition 同语义的结构化 JSON 相等（键序无关）。 */
function jsonEquals(
  left: ScreenJsonValue | undefined,
  right: ScreenJsonValue | undefined,
): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || left === undefined || right === undefined) return false;
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => jsonEquals(value, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] &&
      jsonEquals((left as ScreenJsonObject)[key], (right as ScreenJsonObject)[key]),
  );
}
