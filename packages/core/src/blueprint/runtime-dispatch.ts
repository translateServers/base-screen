import {
  parseScreenJsonValue,
  type ScreenBlueprintAction,
  type ScreenBlueprintHostEvent,
  type ScreenBlueprintRule,
  type ScreenBlueprintRuleStep,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { cloneObject, evaluateCondition, evaluateExpression } from './runtime-json.js';
import type {
  ScreenBlueprintActionTrace,
  ScreenBlueprintCanvasEffect,
  ScreenBlueprintConditionTrace,
  ScreenBlueprintDispatchResult,
  ScreenBlueprintEvent,
  ScreenBlueprintPlan,
  ScreenBlueprintRuleTrace,
  ScreenBlueprintStateEffect,
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

/** 一条规则执行期间的暂存输出；规则成功后整体提交，失败时整次分派失败。 */
interface RuleOutputs {
  readonly variables: Record<string, ScreenJsonValue>;
  readonly hostEvents: ScreenBlueprintHostEvent[];
  readonly hostActions: ScreenBlueprintHostEvent[];
  readonly visibilityEffects: ScreenBlueprintVisibilityEffect[];
  readonly canvasEffects: ScreenBlueprintCanvasEffect[];
  readonly stateEffects: ScreenBlueprintStateEffect[];
  readonly variableRequests: string[];
  readonly componentDataRequests: string[];
  readonly conditions: ScreenBlueprintConditionTrace[];
  readonly actions: ScreenBlueprintActionTrace[];
}

/**
 * 分派一次事件（ADR-0107 §2.3）：按规则顺序找出触发器匹配的规则，逐条深度优先执行其步骤树。
 * 条件在到达时用当前事件负载与当前变量求值（同一次分派中先前 `set-variable` 写入的值可见），
 * 再执行对应分支。一条规则的输出在规则成功后整体提交；任一表达式或条件求值失败则整次分派失败。
 * 变量写入引发的 `data-updated` 不在本函数内展开，由宿主（viewer）作为后续分派逐个处理。
 */
function evaluateScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
  withTrace: boolean,
): ScreenParseResult<ScreenBlueprintDispatchResult | ScreenBlueprintTraceResult> {
  const parsedPayload = parseScreenJsonValue(event.payload, { maxBytes: 256 * 1024 });
  if (!parsedPayload.ok) return parsedPayload;
  const payload = parsedPayload.value;
  const variables = cloneObject(state);
  const hostEvents: ScreenBlueprintHostEvent[] = [];
  const hostActions: ScreenBlueprintHostEvent[] = [];
  const visibilityEffects: ScreenBlueprintVisibilityEffect[] = [];
  const canvasEffects: ScreenBlueprintCanvasEffect[] = [];
  const stateEffects: ScreenBlueprintStateEffect[] = [];
  const variableRequests: string[] = [];
  const componentDataRequests: string[] = [];
  const ruleTraces: ScreenBlueprintRuleTrace[] = [];
  for (const [ruleIndex, rule] of plan.rules.entries()) {
    if (!triggerMatches(rule.trigger, event)) {
      if (withTrace) {
        ruleTraces.push({
          ruleId: rule.id,
          nodeId: rule.nodeId,
          triggerMatched: false,
          conditions: [],
          actions: [],
        });
      }
      continue;
    }
    const outputs: RuleOutputs = {
      variables: { ...variables },
      hostEvents: [],
      hostActions: [],
      visibilityEffects: [],
      canvasEffects: [],
      stateEffects: [],
      variableRequests: [],
      componentDataRequests: [],
      conditions: [],
      actions: [],
    };
    const failed = runSteps(rule.steps, payload, outputs, withTrace);
    if (failed !== undefined) return indexedFailure(failed, [ruleIndex]);
    Object.assign(variables, outputs.variables);
    hostEvents.push(...outputs.hostEvents);
    hostActions.push(...outputs.hostActions);
    visibilityEffects.push(...outputs.visibilityEffects);
    canvasEffects.push(...outputs.canvasEffects);
    stateEffects.push(...outputs.stateEffects);
    variableRequests.push(...outputs.variableRequests);
    componentDataRequests.push(...outputs.componentDataRequests);
    if (withTrace) {
      ruleTraces.push({
        ruleId: rule.id,
        nodeId: rule.nodeId,
        triggerMatched: true,
        conditions: outputs.conditions,
        actions: outputs.actions,
      });
    }
  }
  const result: ScreenBlueprintDispatchResult = {
    variables,
    hostEvents,
    hostActions,
    visibilityEffects,
    canvasEffects,
    stateEffects,
    variableRequests,
    componentDataRequests,
  };
  return {
    ok: true,
    value: withTrace ? { ...result, ruleTraces } : result,
    diagnostics: [],
  };
}

/** 深度优先执行步骤；失败时返回失败结果，成功时返回 `undefined`。 */
function runSteps(
  steps: readonly ScreenBlueprintRuleStep[],
  payload: ScreenJsonValue,
  outputs: RuleOutputs,
  withTrace: boolean,
): ScreenParseResult<unknown> | undefined {
  for (const step of steps) {
    if (step.type === 'condition') {
      const condition = evaluateCondition(step.condition, payload, outputs.variables);
      if (!condition.ok) return condition;
      if (withTrace) {
        outputs.conditions.push({
          nodeId: step.nodeId,
          edgeId: step.edgeId,
          passed: condition.value,
        });
      }
      const failed = runSteps(condition.value ? step.yes : step.no, payload, outputs, withTrace);
      if (failed !== undefined) return failed;
      continue;
    }
    const failed = runAction(step.action, step.edgeId, payload, outputs, withTrace);
    if (failed !== undefined) return failed;
  }
  return undefined;
}

function runAction(
  action: ScreenBlueprintAction,
  edgeId: string,
  payload: ScreenJsonValue,
  outputs: RuleOutputs,
  withTrace: boolean,
): ScreenParseResult<unknown> | undefined {
  const actionIndex = outputs.actions.length;
  if (action.type === 'component-visibility') {
    outputs.visibilityEffects.push({
      componentId: action.componentId,
      operation: action.operation,
      ...(action.transition === undefined ? {} : { transition: { ...action.transition } }),
    });
    if (withTrace) {
      outputs.actions.push({
        type: 'component-visibility',
        actionIndex,
        edgeId,
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
    return undefined;
  }
  if (action.type === 'canvas-visibility') {
    let parameters: ScreenJsonValue | undefined;
    if (action.payload !== undefined) {
      const value = evaluateExpression(action.payload, payload, outputs.variables);
      if (!value.ok) return value;
      parameters = value.value;
    }
    const effect = {
      type: 'canvas-visibility' as const,
      canvasId: action.canvasId,
      operation: action.operation,
      ...(parameters === undefined ? {} : { payload: parameters }),
    };
    outputs.canvasEffects.push(effect);
    if (withTrace) {
      const { type: _type, ...output } = effect;
      outputs.actions.push({
        type: 'canvas-visibility',
        actionIndex,
        edgeId,
        canvasId: action.canvasId,
        operation: action.operation,
        output,
        detached: { type: 'canvas-visibility', actionIndex, ...output },
      });
    }
    return undefined;
  }
  if (action.type === 'component-state') {
    const effect = {
      componentId: action.componentId,
      operation: action.operation,
      ...(action.stateId === undefined ? {} : { stateId: action.stateId }),
    };
    outputs.stateEffects.push(effect);
    if (withTrace) {
      outputs.actions.push({
        type: 'component-state',
        actionIndex,
        edgeId,
        ...effect,
        output: { ...effect },
        detached: { type: 'component-state', actionIndex, ...effect },
      });
    }
    return undefined;
  }
  if (action.type === 'page-navigation') {
    outputs.canvasEffects.push({ type: 'page-navigation', operation: action.operation });
    if (withTrace) {
      outputs.actions.push({
        type: 'page-navigation',
        actionIndex,
        edgeId,
        operation: action.operation,
        output: { operation: action.operation },
        detached: { type: 'page-navigation', actionIndex, operation: action.operation },
      });
    }
    return undefined;
  }
  if (action.type === 'request-variable') {
    outputs.variableRequests.push(action.variableId);
    if (withTrace) {
      outputs.actions.push({
        type: 'request-variable',
        actionIndex,
        edgeId,
        variableId: action.variableId,
        output: { variableId: action.variableId },
        detached: { type: 'request-variable', actionIndex, variableId: action.variableId },
      });
    }
    return undefined;
  }
  if (action.type === 'request-component-data') {
    outputs.componentDataRequests.push(action.componentId);
    if (withTrace) {
      outputs.actions.push({
        type: 'request-component-data',
        actionIndex,
        edgeId,
        componentId: action.componentId,
        output: { componentId: action.componentId },
        detached: {
          type: 'request-component-data',
          actionIndex,
          componentId: action.componentId,
        },
      });
    }
    return undefined;
  }
  const expression = action.type === 'set-variable' ? action.value : action.payload;
  const value = evaluateExpression(expression, payload, outputs.variables);
  if (!value.ok) return value;
  if (action.type === 'set-variable') {
    outputs.variables[action.variableId] = value.value;
    if (withTrace) {
      outputs.actions.push({
        type: 'set-variable',
        actionIndex,
        edgeId,
        variableId: action.variableId,
        output: value.value,
        detached: {
          type: 'set-variable',
          actionIndex,
          variableId: action.variableId,
          output: value.value,
        },
      });
    }
  } else if (action.type === 'emit-host-event') {
    outputs.hostEvents.push({ name: action.eventName, payload: value.value });
    if (withTrace) {
      outputs.actions.push({
        type: 'emit-host-event',
        actionIndex,
        edgeId,
        eventName: action.eventName,
        output: value.value,
        detached: {
          type: 'emit-host-event',
          actionIndex,
          eventName: action.eventName,
          output: value.value,
        },
      });
    }
  } else {
    outputs.hostActions.push({ name: action.actionId, payload: value.value });
    if (withTrace) {
      outputs.actions.push({
        type: 'host-action',
        actionIndex,
        edgeId,
        actionId: action.actionId,
        output: value.value,
        detached: {
          type: 'host-action',
          actionIndex,
          actionId: action.actionId,
          output: value.value,
        },
      });
    }
  }
  return undefined;
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
      : trigger.type === 'lifecycle' && event.type === 'lifecycle'
        ? true
        : trigger.type === 'timer' && event.type === 'timer'
          ? trigger.intervalSeconds === event.intervalSeconds
          : trigger.type === 'canvas-event' && event.type === 'canvas-event'
            ? trigger.canvasId === event.canvasId
            : trigger.type === 'page-changed' && event.type === 'page-changed'
              ? true
              : trigger.type === 'component-state-changed' &&
                event.type === 'component-state-changed' &&
                trigger.componentId === event.componentId;
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
