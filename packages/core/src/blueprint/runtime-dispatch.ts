import {
  parseScreenJsonValue,
  type ScreenBlueprintHostEvent,
  type ScreenBlueprintRule,
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
  const variableRequests: string[] = [];
  const componentDataRequests: string[] = [];
  const ruleTraces: ScreenBlueprintRuleTrace[] = [];
  for (const [ruleIndex, rule] of plan.rules.entries()) {
    const actions: ScreenBlueprintActionTrace[] = [];
    const ruleTrace: MutableRuleTrace = {
      ruleId: rule.id,
      triggerMatched: false,
      condition: 'not-evaluated',
      actions,
    };
    if (!triggerMatches(rule.trigger, event)) {
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
    const nextVariableRequests = [...variableRequests];
    const nextComponentDataRequests = [...componentDataRequests];
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
      if (action.type === 'request-variable') {
        nextVariableRequests.push(action.variableId);
        if (withTrace) {
          const output = { variableId: action.variableId };
          actions.push({
            type: 'request-variable',
            actionIndex,
            variableId: action.variableId,
            output,
            detached: { type: 'request-variable', actionIndex, variableId: action.variableId },
          });
        }
        continue;
      }
      if (action.type === 'request-component-data') {
        nextComponentDataRequests.push(action.componentId);
        if (withTrace) {
          const output = { componentId: action.componentId };
          actions.push({
            type: 'request-component-data',
            actionIndex,
            componentId: action.componentId,
            output,
            detached: {
              type: 'request-component-data',
              actionIndex,
              componentId: action.componentId,
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
      if (action.type === 'set-variable') nextVariables[action.variableId] = value.value;
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
    variableRequests.push(...nextVariableRequests.slice(variableRequests.length));
    componentDataRequests.push(...nextComponentDataRequests.slice(componentDataRequests.length));
    if (withTrace) ruleTraces.push(ruleTrace);
  }
  if (!withTrace) {
    return {
      ok: true,
      value: {
        variables,
        hostEvents,
        hostActions,
        visibilityEffects,
        variableRequests,
        componentDataRequests,
      },
      diagnostics: [],
    };
  }
  return {
    ok: true,
    value: {
      variables,
      hostEvents,
      hostActions,
      visibilityEffects,
      variableRequests,
      componentDataRequests,
      ruleTraces,
    },
    diagnostics: [],
  };
}

function createActionTrace(
  action: Extract<
    ScreenBlueprintRule['actions'][number],
    { readonly type: 'set-variable' | 'emit-host-event' | 'host-action' }
  >,
  actionIndex: number,
  output: ScreenJsonValue,
): ScreenBlueprintActionTrace | undefined {
  if (action.type === 'set-variable') {
    return {
      type: 'set-variable',
      actionIndex,
      variableId: action.variableId,
      output,
      detached: { type: 'set-variable', actionIndex, variableId: action.variableId, output },
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

function triggerMatches(
  trigger: ScreenBlueprintRule['trigger'],
  event: ScreenBlueprintEvent,
): boolean {
  const eventType = event.type ?? 'material-event';
  if (trigger.type !== eventType || trigger.eventName !== event.name) return false;
  return trigger.type === 'material-event' && 'componentId' in event
    ? trigger.componentId === event.componentId
    : trigger.type === 'variable-event' && event.type === 'variable-event'
      ? trigger.variableId === event.variableId
      : false;
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
