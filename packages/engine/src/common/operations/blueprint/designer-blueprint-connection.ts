import type {
  ScreenBlueprint,
  ScreenBlueprintTrigger,
  ScreenDocument,
} from '@base-screen/contracts';
import { normalizeDesignerBlueprintRuleCapabilities } from './designer-blueprint-capabilities.js';
import type { DesignerBlueprintEventOption } from './designer-blueprint-model.js';
import {
  createDesignerBlueprintAction,
  createDesignerVisibilityAction,
  nextRuleId,
  replaceDesignerBlueprintLayoutNodeId,
  updateRule,
} from './designer-blueprint-mutation-helpers.js';
import {
  actionBlueprintNodeId,
  conditionBlueprintNodeId,
  materializeDesignerBlueprintLayoutNodes,
  parseDesignerBlueprintUnconnectedNodeId,
  resolveDesignerBlueprintUnconnectedVariable,
} from './designer-blueprint-node-ids.js';
import type { BaseScreenBlueprintCanvasSelection } from './designer-blueprint-protocol.js';

export type DesignerBlueprintConnectionFailureReason =
  | 'duplicate'
  | 'invalid'
  | 'source-unconnected'
  | 'unconfigured';

export type DesignerBlueprintConnectionResult =
  | {
      readonly ok: true;
      readonly blueprint: ScreenBlueprint;
      readonly selection: Exclude<BaseScreenBlueprintCanvasSelection, null>;
    }
  | { readonly ok: false; readonly reason: DesignerBlueprintConnectionFailureReason };

export function connectDesignerBlueprintNodes(
  document: ScreenDocument,
  sourceNodeId: string,
  sourceHandle: string,
  targetNodeId: string,
  targetHandle: string,
  events: readonly DesignerBlueprintEventOption[],
): DesignerBlueprintConnectionResult {
  const placed = new Set(materializeDesignerBlueprintLayoutNodes(document).map((node) => node.id));
  if (sourceNodeId === targetNodeId || !placed.has(sourceNodeId) || !placed.has(targetNodeId)) {
    return { ok: false, reason: 'invalid' };
  }
  const sourceComponentId = componentIdFromBlueprintNodeId(document, sourceNodeId);
  const eventName = handleValue(sourceHandle, 'event:');
  if (sourceComponentId !== undefined && eventName !== undefined) {
    return connectDesignerBlueprintEvent(
      document,
      sourceComponentId,
      eventName,
      targetNodeId,
      targetHandle,
      events,
    );
  }
  const sourceVariableId = variableIdFromBlueprintNodeId(document, sourceNodeId);
  if (
    sourceVariableId !== undefined &&
    (eventName === 'data-updated' || eventName === 'request-state')
  ) {
    return connectDesignerBlueprintTrigger(
      document,
      { type: 'variable-event', variableId: sourceVariableId, eventName },
      targetNodeId,
      targetHandle,
    );
  }
  const unconnectedSource = parseDesignerBlueprintUnconnectedNodeId(sourceNodeId);
  if (unconnectedSource?.kind === 'condition' && sourceHandle === 'condition:true') {
    return { ok: false, reason: 'source-unconnected' };
  }
  if (sourceNodeId.startsWith('condition:') && sourceHandle === 'condition:true') {
    return connectDesignerBlueprintCondition(
      document,
      sourceNodeId.slice('condition:'.length),
      targetNodeId,
      targetHandle,
    );
  }
  return { ok: false, reason: 'invalid' };
}

function connectDesignerBlueprintEvent(
  document: ScreenDocument,
  sourceComponentId: string,
  eventName: string,
  targetNodeId: string,
  targetHandle: string,
  events: readonly DesignerBlueprintEventOption[],
): DesignerBlueprintConnectionResult {
  if (
    !events.some(
      (event) =>
        event.componentId === sourceComponentId && event.name === eventName && event.available,
    )
  ) {
    return { ok: false, reason: 'invalid' };
  }
  return connectDesignerBlueprintTrigger(
    document,
    { type: 'material-event', componentId: sourceComponentId, eventName },
    targetNodeId,
    targetHandle,
  );
}

function connectDesignerBlueprintTrigger(
  document: ScreenDocument,
  trigger: ScreenBlueprintTrigger,
  targetNodeId: string,
  targetHandle: string,
): DesignerBlueprintConnectionResult {
  const targetComponentId = componentIdFromBlueprintNodeId(document, targetNodeId);
  const operation = handleValue(targetHandle, 'visibility:');
  if (
    targetComponentId !== undefined &&
    (operation === 'show' || operation === 'hide' || operation === 'toggle')
  ) {
    const duplicate = document.blueprint.rules.some(
      (rule) =>
        JSON.stringify(rule.trigger) === JSON.stringify(trigger) &&
        rule.actions.some(
          (action) =>
            action.type === 'component-visibility' &&
            action.componentId === targetComponentId &&
            action.operation === operation,
        ),
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };
    const sourceId = trigger.type === 'material-event' ? trigger.componentId : trigger.variableId;
    const rule = normalizeDesignerBlueprintRuleCapabilities({
      id: nextRuleId(document.blueprint, `${sourceId}-${trigger.eventName}-${operation}`),
      trigger,
      actions: [createDesignerVisibilityAction(targetComponentId, operation)],
    });
    return {
      ok: true,
      blueprint: { ...document.blueprint, rules: [...document.blueprint.rules, rule] },
      selection: { kind: 'edge', id: `edge:${rule.id}:action:0` },
    };
  }
  const target = parseDesignerBlueprintUnconnectedNodeId(targetNodeId);
  if (target === null) return { ok: false, reason: 'invalid' };
  if (target.kind === 'condition' && targetHandle !== 'condition:in') {
    return { ok: false, reason: 'invalid' };
  }
  if (target.kind !== 'condition' && targetHandle !== 'action:in') {
    return { ok: false, reason: 'invalid' };
  }
  const sourceId = trigger.type === 'material-event' ? trigger.componentId : trigger.variableId;
  const ruleId = nextRuleId(document.blueprint, `${sourceId}-${trigger.eventName}-${target.kind}`);
  const action =
    target.kind === 'condition'
      ? null
      : createDesignerBlueprintAction(
          target.kind,
          document,
          resolveDesignerBlueprintUnconnectedVariable(document, target),
        );
  if (target.kind !== 'condition' && action === null) {
    return { ok: false, reason: 'unconfigured' };
  }
  const rule = normalizeDesignerBlueprintRuleCapabilities({
    id: ruleId,
    trigger,
    ...(target.kind === 'condition' ? { condition: defaultDesignerBlueprintCondition() } : {}),
    actions: action === null ? [] : [action],
  });
  const targetId =
    target.kind === 'condition'
      ? conditionBlueprintNodeId(ruleId)
      : actionBlueprintNodeId(ruleId, 0);
  const blueprint = replaceDesignerBlueprintLayoutNodeId(
    { ...document.blueprint, rules: [...document.blueprint.rules, rule] },
    targetNodeId,
    targetId,
  );
  if (blueprint === null) return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    blueprint,
    selection: {
      kind: 'edge',
      id: target.kind === 'condition' ? `edge:${ruleId}:trigger` : `edge:${ruleId}:action:0`,
    },
  };
}

function connectDesignerBlueprintCondition(
  document: ScreenDocument,
  ruleId: string,
  targetNodeId: string,
  targetHandle: string,
): DesignerBlueprintConnectionResult {
  const rule = document.blueprint.rules.find((candidate) => candidate.id === ruleId);
  if (rule?.condition === undefined) return { ok: false, reason: 'invalid' };
  const targetComponentId = componentIdFromBlueprintNodeId(document, targetNodeId);
  const operation = handleValue(targetHandle, 'visibility:');
  if (
    targetComponentId !== undefined &&
    (operation === 'show' || operation === 'hide' || operation === 'toggle')
  ) {
    if (
      rule.actions.some(
        (action) =>
          action.type === 'component-visibility' &&
          action.componentId === targetComponentId &&
          action.operation === operation,
      )
    ) {
      return { ok: false, reason: 'duplicate' };
    }
    const actionIndex = rule.actions.length;
    const blueprint = updateRule(document.blueprint, ruleId, (candidate) => ({
      ...candidate,
      actions: [...candidate.actions, createDesignerVisibilityAction(targetComponentId, operation)],
    }));
    return blueprint === null
      ? { ok: false, reason: 'invalid' }
      : {
          ok: true,
          blueprint,
          selection: { kind: 'edge', id: `edge:${ruleId}:action:${actionIndex}` },
        };
  }
  const target = parseDesignerBlueprintUnconnectedNodeId(targetNodeId);
  if (target === null || target.kind === 'condition' || targetHandle !== 'action:in') {
    return { ok: false, reason: 'invalid' };
  }
  const action = createDesignerBlueprintAction(
    target.kind,
    document,
    resolveDesignerBlueprintUnconnectedVariable(document, target),
  );
  if (action === null) return { ok: false, reason: 'unconfigured' };
  const actionIndex = rule.actions.length;
  const updated = updateRule(document.blueprint, ruleId, (candidate) => ({
    ...candidate,
    actions: [...candidate.actions, action],
  }));
  const blueprint =
    updated === null
      ? null
      : replaceDesignerBlueprintLayoutNodeId(
          updated,
          targetNodeId,
          actionBlueprintNodeId(ruleId, actionIndex),
        );
  return blueprint === null
    ? { ok: false, reason: 'invalid' }
    : {
        ok: true,
        blueprint,
        selection: { kind: 'edge', id: `edge:${ruleId}:action:${actionIndex}` },
      };
}

function componentIdFromBlueprintNodeId(
  document: ScreenDocument,
  nodeId: string,
): string | undefined {
  if (!nodeId.startsWith('component:')) return undefined;
  const componentId = nodeId.slice('component:'.length);
  return document.components.some((component) => component.id === componentId)
    ? componentId
    : undefined;
}

function variableIdFromBlueprintNodeId(
  document: ScreenDocument,
  nodeId: string,
): string | undefined {
  if (!nodeId.startsWith('variable:')) return undefined;
  const variableId = nodeId.slice('variable:'.length);
  return document.variables.some((variable) => variable.id === variableId) ? variableId : undefined;
}

function handleValue(handle: string, prefix: string): string | undefined {
  return handle.startsWith(prefix) && handle.length > prefix.length
    ? handle.slice(prefix.length)
    : undefined;
}

function defaultDesignerBlueprintCondition() {
  return { left: { kind: 'event-payload' as const, path: [] }, operator: 'exists' as const };
}
