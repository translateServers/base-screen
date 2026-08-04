import {
  parseScreenJsonValue,
  type ScreenBlueprintCondition,
  type ScreenBlueprintHostEvent,
  type ScreenBlueprintValueExpression,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';

export interface ScreenBlueprintEvent {
  readonly componentId: string;
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface ScreenBlueprintCapabilityIndex {
  readonly has: (id: string) => boolean;
}

export interface ScreenBlueprintPlan {
  readonly rules: ScreenDocument['blueprint']['rules'];
  readonly initialVariables: ScreenJsonObject;
}

export interface ScreenBlueprintDispatchResult {
  readonly variables: ScreenJsonObject;
  readonly hostEvents: readonly ScreenBlueprintHostEvent[];
}

export function compileScreenBlueprint(
  document: ScreenDocument,
  capabilities: ScreenBlueprintCapabilityIndex = { has: () => true },
): ScreenParseResult<ScreenBlueprintPlan> {
  for (const rule of document.blueprint.rules) {
    for (const capability of rule.requiredCapabilities ?? []) {
      if (!capabilities.has(capability)) {
        return failure('BLUEPRINT_CAPABILITY_UNAVAILABLE', 'Blueprint capability is unavailable.');
      }
    }
  }
  const initialVariables: Record<string, ScreenJsonValue> = {};
  for (const variable of document.variables) {
    initialVariables[variable.name] = cloneValue(variable.value);
  }
  return {
    ok: true,
    value: {
      rules: document.blueprint.rules.map((rule) => ({
        ...rule,
        trigger: { ...rule.trigger },
        ...(rule.condition ? { condition: cloneCondition(rule.condition) } : {}),
        actions: rule.actions.map((action) => ({
          ...action,
          ...(action.type === 'set-variable'
            ? { value: cloneExpression(action.value) }
            : { payload: cloneExpression(action.payload) }),
        })),
      })),
      initialVariables,
    },
    diagnostics: [],
  };
}

export function dispatchScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
): ScreenParseResult<ScreenBlueprintDispatchResult> {
  const parsedPayload = parseScreenJsonValue(event.payload, { maxBytes: 256 * 1024 });
  if (!parsedPayload.ok) return parsedPayload;
  const variables = cloneObject(state);
  const hostEvents: ScreenBlueprintHostEvent[] = [];
  for (const rule of plan.rules) {
    if (rule.trigger.componentId !== event.componentId || rule.trigger.eventName !== event.name)
      continue;
    if (rule.condition) {
      const condition = evaluateCondition(rule.condition, parsedPayload.value, variables);
      if (!condition.ok) return condition;
      if (!condition.value) continue;
    }
    const nextVariables = { ...variables };
    const nextEvents = [...hostEvents];
    for (const action of rule.actions) {
      const expression = action.type === 'set-variable' ? action.value : action.payload;
      const value = evaluateExpression(expression, parsedPayload.value, variables);
      if (!value.ok) return value;
      if (action.type === 'set-variable') nextVariables[action.variableName] = value.value;
      else nextEvents.push({ name: action.eventName, payload: value.value });
    }
    Object.assign(variables, nextVariables);
    hostEvents.push(...nextEvents.slice(hostEvents.length));
  }
  return { ok: true, value: { variables, hostEvents }, diagnostics: [] };
}

function evaluateExpression(
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

function evaluateCondition(
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
    !(
      (typeof a === 'string' && typeof b === 'string') ||
      (Array.isArray(a) && a.every((item) => JSON.stringify(item) !== undefined))
    )
  )
    return failure('BLUEPRINT_CONDITION_INVALID', 'Blueprint condition is invalid.');
  switch (condition.operator) {
    case 'eq':
      return { ok: true, value: JSON.stringify(a) === JSON.stringify(b), diagnostics: [] };
    case 'neq':
      return { ok: true, value: JSON.stringify(a) !== JSON.stringify(b), diagnostics: [] };
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
            : (a as ScreenJsonValue[]).some((item) => JSON.stringify(item) === JSON.stringify(b)),
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

function cloneObject(value: ScreenJsonObject): Record<string, ScreenJsonValue> {
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
function cloneValue(value: ScreenJsonValue): ScreenJsonValue {
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
function cloneExpression(value: ScreenBlueprintValueExpression): ScreenBlueprintValueExpression {
  return JSON.parse(JSON.stringify(value)) as ScreenBlueprintValueExpression;
}
function cloneCondition(value: ScreenBlueprintCondition): ScreenBlueprintCondition {
  return JSON.parse(JSON.stringify(value)) as ScreenBlueprintCondition;
}
function failure<T>(
  code:
    | 'BLUEPRINT_CAPABILITY_UNAVAILABLE'
    | 'BLUEPRINT_EXPRESSION_INVALID'
    | 'BLUEPRINT_CONDITION_INVALID',
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
