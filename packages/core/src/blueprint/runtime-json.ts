import {
  parseScreenJsonValue,
  type ScreenBlueprintCondition,
  type ScreenBlueprintValueExpression,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { areEqualJson } from '../internal/equality.js';

export function evaluateExpression(
  expression: ScreenBlueprintValueExpression,
  payload: ScreenJsonValue,
  variables: ScreenJsonObject,
): ScreenParseResult<ScreenJsonValue> {
  switch (expression.kind) {
    case 'literal':
      return cloneResult(expression.value);
    case 'event-payload':
      return resolvePath(payload, expression.path);
    case 'variable': {
      if (!Object.hasOwn(variables, expression.name))
        return failure('BLUEPRINT_EXPRESSION_INVALID', 'Blueprint variable is missing.');
      return cloneResult(variables[expression.name]!);
    }
    case 'array': {
      const values: ScreenJsonValue[] = [];
      for (const item of expression.items) {
        const result = evaluateExpression(item, payload, variables);
        if (!result.ok) return result;
        values.push(result.value);
      }
      return cloneResult(values);
    }
    case 'object': {
      const value: Record<string, ScreenJsonValue> = {};
      for (const [key, item] of Object.entries(expression.properties)) {
        const result = evaluateExpression(item, payload, variables);
        if (!result.ok) return result;
        value[key] = result.value;
      }
      return cloneResult(value);
    }
  }
}

export function evaluateCondition(
  condition: ScreenBlueprintCondition,
  payload: ScreenJsonValue,
  variables: ScreenJsonObject,
): ScreenParseResult<boolean> {
  const left = evaluateExpression(condition.left, payload, variables);
  if (!left.ok) return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  if (condition.operator === 'exists')
    return { ok: true, value: left.value !== undefined, diagnostics: [] };
  if (condition.right === undefined)
    return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  const right = evaluateExpression(condition.right, payload, variables);
  if (!right.ok) return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  const a = left.value;
  const b = right.value;
  if (
    ['gt', 'gte', 'lt', 'lte'].includes(condition.operator) &&
    (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b))
  )
    return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  if (
    condition.operator === 'contains' &&
    !((typeof a === 'string' && typeof b === 'string') || Array.isArray(a))
  )
    return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  switch (condition.operator) {
    case 'eq':
      return { ok: true, value: areEqualJson(a, b), diagnostics: [] };
    case 'neq':
      return { ok: true, value: !areEqualJson(a, b), diagnostics: [] };
    case 'gt':
      return { ok: true, value: (a as number) > (b as number), diagnostics: [] };
    case 'gte':
      return { ok: true, value: (a as number) >= (b as number), diagnostics: [] };
    case 'lt':
      return { ok: true, value: (a as number) < (b as number), diagnostics: [] };
    case 'lte':
      return { ok: true, value: (a as number) <= (b as number), diagnostics: [] };
    case 'contains':
      return {
        ok: true,
        value:
          typeof a === 'string'
            ? a.includes(b as string)
            : (a as ScreenJsonValue[]).some((item) => areEqualJson(item, b)),
        diagnostics: [],
      };
    default:
      return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  }
}

function resolvePath(
  value: ScreenJsonValue,
  path: readonly string[],
): ScreenParseResult<ScreenJsonValue> {
  if (
    path.length > 16 ||
    path.some(
      (item) =>
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(item) ||
        ['__proto__', 'prototype', 'constructor'].includes(item),
    )
  )
    return failure('BLUEPRINT_EXPRESSION_INVALID', 'Blueprint event path is invalid.');
  let current: unknown = value;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment))
      return failure('BLUEPRINT_EXPRESSION_INVALID', 'Blueprint event path is missing.');
    current = (current as Record<string, unknown>)[segment];
  }
  return cloneResult(current as ScreenJsonValue);
}

export function cloneObject(value: ScreenJsonObject): Record<string, ScreenJsonValue> {
  const parsed = parseScreenJsonValue(value, { maxBytes: 2 * 1024 * 1024 });
  if (
    !parsed.ok ||
    parsed.value === null ||
    Array.isArray(parsed.value) ||
    typeof parsed.value !== 'object'
  )
    throw new Error('Blueprint variable state must be a JSON object.');
  return { ...(parsed.value as ScreenJsonObject) };
}
export function cloneValue(value: ScreenJsonValue): ScreenJsonValue {
  const parsed = parseScreenJsonValue(value, { maxBytes: 2 * 1024 * 1024 });
  if (!parsed.ok) throw new Error('Blueprint plan contains invalid JSON.');
  return parsed.value;
}
function cloneResult(value: ScreenJsonValue): ScreenParseResult<ScreenJsonValue> {
  try {
    return { ok: true, value: cloneValue(value), diagnostics: [] };
  } catch {
    return failure('BLUEPRINT_EXPRESSION_INVALID', 'Blueprint expression exceeds budget.');
  }
}
export function cloneExpression(
  value: ScreenBlueprintValueExpression,
): ScreenBlueprintValueExpression {
  return cloneValue(value as unknown as ScreenJsonValue) as ScreenBlueprintValueExpression;
}
export function cloneCondition(value: ScreenBlueprintCondition): ScreenBlueprintCondition {
  return cloneValue(value as unknown as ScreenJsonValue) as unknown as ScreenBlueprintCondition;
}
export function failure<T>(
  code:
    | 'BLUEPRINT_CAPABILITY_UNAVAILABLE'
    | 'BLUEPRINT_EXPRESSION_INVALID'
    | 'BLUEPRINT_CONDITION_INVALID',
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
