import {
  parseScreenJsonValue,
  type ScreenBlueprintComponentVisibilityAction,
  type ScreenBlueprintHostEvent,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { cloneObject, evaluateCondition, evaluateExpression } from './runtime-json.js';
import type {
  ScreenBlueprintActionTrace,
  ScreenBlueprintConditionTraceState,
  ScreenBlueprintDispatchResult,
  ScreenBlueprintEvent,
  ScreenBlueprintPlan,
  ScreenBlueprintRuleTrace,
  ScreenBlueprintTraceResult,
  ScreenBlueprintVisibilityEffect,
} from './runtime-types.js';

export function dispatchScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
): ScreenParseResult<ScreenBlueprintDispatchResult> {
  return evaluateScreenBlueprintEvent(plan, state, event, false);
}

export function traceScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
): ScreenParseResult<ScreenBlueprintTraceResult> {
  return evaluateScreenBlueprintEvent(
    plan,
    state,
    event,
    true,
  ) as ScreenParseResult<ScreenBlueprintTraceResult>;
}

function evaluateScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
  withTrace: boolean,
): ScreenParseResult<ScreenBlueprintDispatchResult | ScreenBlueprintTraceResult> {
  const parsedPayload = parseScreenJsonValue(event.payload, { maxBytes: 256 * 1024 });
  if (!parsedPayload.ok) return parsedPayload;
  const variables = cloneObject(state);
  const hostEvents: ScreenBlueprintHostEvent[] = [];
  const hostActions: ScreenBlueprintHostEvent[] = [];
  const visibilityEffects: ScreenBlueprintVisibilityEffect[] = [];
  const ruleTraces: ScreenBlueprintRuleTrace[] = [];
  for (const [ruleIndex, rule] of plan.rules.entries()) {
    const actions: ScreenBlueprintActionTrace[] = [];
    const ruleTrace: MutableRuleTrace = {
      ruleId: rule.id,
      triggerMatched: false,
      condition: 'not-evaluated',
      actions,
    };
    if (rule.trigger.componentId !== event.componentId || rule.trigger.eventName !== event.name) {
      if (withTrace) ruleTraces.push(ruleTrace);
      continue;
    }
    ruleTrace.triggerMatched = true;
    if (rule.condition) {
      const condition = evaluateCondition(rule.condition, parsedPayload.value, variables);
      if (!condition.ok) {
        return indexedFailure(condition, [ruleIndex]);
      }
      ruleTrace.condition = condition.value ? 'passed' : 'failed';
      if (!condition.value) {
        if (withTrace) ruleTraces.push(ruleTrace);
        continue;
      }
    } else {
      ruleTrace.condition = 'none';
    }
    const nextVariables = { ...variables };
    const nextEvents = [...hostEvents];
    const nextActions = [...hostActions];
    const nextVisibilityEffects = [...visibilityEffects];
    for (const [actionIndex, action] of rule.actions.entries()) {
      if (action.type === 'component-visibility') {
        nextVisibilityEffects.push({
          componentId: action.componentId,
          operation: action.operation,
          ...(action.transition === undefined ? {} : { transition: { ...action.transition } }),
        });
        if (withTrace) {
          actions.push({
            type: 'component-visibility',
            actionIndex,
            componentId: action.componentId,
            operation: action.operation,
            output: { componentId: action.componentId, operation: action.operation },
            detached: {
              type: 'component-visibility',
              actionIndex,
              componentId: action.componentId,
              operation: action.operation,
            },
          });
        }
        continue;
      }
      const expression = action.type === 'set-variable' ? action.value : action.payload;
      const value = evaluateExpression(expression, parsedPayload.value, nextVariables);
      if (!value.ok) {
        return indexedFailure(value, [ruleIndex, actionIndex]);
      }
      if (action.type === 'set-variable') nextVariables[action.variableName] = value.value;
      else if (action.type === 'emit-host-event')
        nextEvents.push({ name: action.eventName, payload: value.value });
      else nextActions.push({ name: action.actionId, payload: value.value });
      if (withTrace) {
        const trace = createActionTrace(action, actionIndex, value.value);
        if (trace !== undefined) actions.push(trace);
      }
    }
    Object.assign(variables, nextVariables);
    hostEvents.push(...nextEvents.slice(hostEvents.length));
    hostActions.push(...nextActions.slice(hostActions.length));
    visibilityEffects.push(...nextVisibilityEffects.slice(visibilityEffects.length));
    if (withTrace) ruleTraces.push(ruleTrace);
  }
  if (!withTrace) {
    return {
      ok: true,
      value: { variables, hostEvents, hostActions, visibilityEffects },
      diagnostics: [],
    };
  }
  return {
    ok: true,
    value: { variables, hostEvents, hostActions, visibilityEffects, ruleTraces },
    diagnostics: [],
  };
}

function createActionTrace(
  action: Exclude<
    ScreenDocument['blueprint']['rules'][number]['actions'][number],
    ScreenBlueprintComponentVisibilityAction
  >,
  actionIndex: number,
  output: ScreenJsonValue,
): ScreenBlueprintActionTrace | undefined {
  if (action.type === 'set-variable') {
    return {
      type: 'set-variable',
      actionIndex,
      variableName: action.variableName,
      output,
      detached: { type: 'set-variable', actionIndex, variableName: action.variableName, output },
    };
  }
  if (action.type === 'emit-host-event') {
    return {
      type: 'emit-host-event',
      actionIndex,
      eventName: action.eventName,
      output,
      detached: { type: 'emit-host-event', actionIndex, eventName: action.eventName, output },
    };
  }
  return {
    type: 'host-action',
    actionIndex,
    actionId: action.actionId,
    output,
    detached: { type: 'host-action', actionIndex, actionId: action.actionId, output },
  };
}

interface MutableRuleTrace {
  readonly ruleId: string;
  triggerMatched: boolean;
  condition: ScreenBlueprintConditionTraceState;
  readonly actions: ScreenBlueprintActionTrace[];
}

function indexedFailure<T>(
  result: ScreenParseResult<unknown>,
  path: readonly number[],
): ScreenParseResult<T> {
  const diagnostic = result.diagnostics[0];
  if (diagnostic === undefined) {
    return { ok: false, diagnostics: [] };
  }
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: diagnostic.code, path, message: diagnostic.message }],
  };
}
