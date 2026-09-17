import {
  type ScreenComponentStyleRule,
  type ScreenJsonObject,
  type ScreenJsonValue,
  screenJsonEquals,
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
      return screenJsonEquals(left, right);
    case 'neq':
      return !screenJsonEquals(left, right);
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
      return Array.isArray(left) && left.some((item) => screenJsonEquals(item, right));
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
