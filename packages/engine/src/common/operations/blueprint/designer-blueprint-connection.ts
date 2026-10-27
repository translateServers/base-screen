import type {
  ScreenBlueprint,
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintRelationSource,
  ScreenBlueprintRelationTarget,
  ScreenDocument,
} from '@base-screen/contracts';
import type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
import { nextRelationId } from './designer-blueprint-mutation-helpers.js';
import {
  componentIdFromBlueprintNodeId,
  HOST_BLUEPRINT_NODE_ID,
  variableIdFromBlueprintNodeId,
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
  const sourceComponentId = componentIdFromBlueprintNodeId(document, sourceNodeId);
  const sourceVariableId = variableIdFromBlueprintNodeId(document, sourceNodeId);
  const targetComponentId = componentIdFromBlueprintNodeId(document, targetNodeId);
  const targetVariableId = variableIdFromBlueprintNodeId(document, targetNodeId);
  const targetHost = targetNodeId === HOST_BLUEPRINT_NODE_ID;
  if (sourceComponentId === undefined && sourceVariableId === undefined) {
    return { ok: false, reason: 'invalid' };
  }
  if (targetComponentId === undefined && targetVariableId === undefined && !targetHost) {
    return { ok: false, reason: 'invalid' };
  }
  if (sourceHandle === 'semantic:out') {
    if (
      sourceComponentId === undefined ||
      targetComponentId === undefined ||
      sourceComponentId === targetComponentId ||
      targetHandle !== 'relation:in'
    ) {
      return { ok: false, reason: 'invalid' };
    }
    const duplicate = document.blueprint.relations.some(
      (relation) =>
        relation.type === 'semantic' &&
        relation.source.componentId === sourceComponentId &&
        relation.target.componentId === targetComponentId,
    );
    if (duplicate) return { ok: false, reason: 'duplicate' };
    const id = nextRelationId(
      document.blueprint,
      `${sourceComponentId}-${targetComponentId}-semantic`,
    );
    return {
      ok: true,
      blueprint: {
        ...document.blueprint,
        relations: [
          ...document.blueprint.relations,
          {
            type: 'semantic',
            id,
            source: { kind: 'component', componentId: sourceComponentId },
            target: { kind: 'component', componentId: targetComponentId },
            role: 'related',
          },
        ],
      },
      selection: { kind: 'edge', id: `semantic:${id}` },
    };
  }
  const eventName = handleValue(sourceHandle, 'event:');
  let source: ScreenBlueprintRelationSource;
  if (sourceComponentId !== undefined && eventName !== undefined) {
    const available = events.some(
      (event) =>
        event.componentId === sourceComponentId && event.name === eventName && event.available,
    );
    if (!available) return { ok: false, reason: 'invalid' };
    source = {
      kind: 'component',
      componentId: sourceComponentId,
      event: { type: 'material-event', eventName },
    };
  } else if (
    sourceVariableId !== undefined &&
    (eventName === 'data-updated' || eventName === 'request-state')
  ) {
    source = {
      kind: 'variable',
      variableId: sourceVariableId,
      event: { type: 'variable-event', eventName },
    };
  } else {
    return { ok: false, reason: 'invalid' };
  }
  let target: ScreenBlueprintRelationTarget;
  let effect: ScreenBlueprintBehaviorRelation['effect'];
  if (targetComponentId !== undefined) {
    const operation = handleValue(targetHandle, 'visibility:');
    if (
      targetHandle !== 'relation:in' &&
      targetHandle !== 'dependency:in' &&
      operation !== 'show' &&
      operation !== 'hide' &&
      operation !== 'toggle'
    ) {
      return { ok: false, reason: 'invalid' };
    }
    target = { kind: 'component', componentId: targetComponentId };
    effect = {
      type: 'component-visibility',
      operation: operation === 'hide' || operation === 'toggle' ? operation : 'show',
      transition: { effect: 'fade', durationMs: 200, easing: 'ease-in-out-quad' },
    };
  } else if (targetVariableId !== undefined) {
    if (targetHandle !== 'relation:in' && targetHandle !== 'dependency:in') {
      return { ok: false, reason: 'invalid' };
    }
    target = { kind: 'variable', variableId: targetVariableId };
    effect = { type: 'set-variable', value: { kind: 'literal', value: null } };
  } else {
    if (targetHandle !== 'relation:in' && targetHandle !== 'dependency:in') {
      return { ok: false, reason: 'invalid' };
    }
    target = { kind: 'host' };
    effect = {
      type: 'emit-host-event',
      eventName: 'host_event',
      payload: { kind: 'event-payload', path: [] },
    };
  }
  const duplicate = document.blueprint.relations.some(
    (relation) =>
      relation.type === 'behavior' &&
      relation.condition === undefined &&
      sameSource(relation.source, source) &&
      sameTarget(relation.target, target) &&
      sameEffect(relation.effect, effect),
  );
  if (duplicate) return { ok: false, reason: 'duplicate' };
  const targetSlug =
    target.kind === 'component'
      ? target.componentId
      : target.kind === 'variable'
        ? target.variableId
        : 'host';
  const id = nextRelationId(document.blueprint, `${nodeSlug(source)}-${eventName}-${targetSlug}`);
  const relation: ScreenBlueprintBehaviorRelation = {
    type: 'behavior',
    id,
    source,
    target,
    effect,
  };
  return {
    ok: true,
    blueprint: {
      ...document.blueprint,
      relations: [...document.blueprint.relations, relation],
    },
    selection: { kind: 'edge', id: `relation:${id}` },
  };
}

function handleValue(handle: string, prefix: string): string | undefined {
  return handle.startsWith(prefix) && handle.length > prefix.length
    ? handle.slice(prefix.length)
    : undefined;
}

function nodeSlug(source: ScreenBlueprintRelationSource): string {
  return source.kind === 'component' ? source.componentId : source.variableId;
}

function sameSource(
  left: ScreenBlueprintRelationSource,
  right: ScreenBlueprintRelationSource,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'component' && right.kind === 'component') {
    return (
      left.componentId === right.componentId &&
      left.event.type === right.event.type &&
      left.event.eventName === right.event.eventName
    );
  }
  if (left.kind === 'variable' && right.kind === 'variable') {
    return (
      left.variableId === right.variableId &&
      left.event.type === right.event.type &&
      left.event.eventName === right.event.eventName
    );
  }
  return false;
}

function sameTarget(
  left: ScreenBlueprintRelationTarget,
  right: ScreenBlueprintRelationTarget,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'component' && right.kind === 'component') {
    return left.componentId === right.componentId;
  }
  if (left.kind === 'variable' && right.kind === 'variable') {
    return left.variableId === right.variableId;
  }
  return left.kind === 'host' && right.kind === 'host';
}

function sameEffect(
  left: ScreenBlueprintBehaviorRelation['effect'],
  right: ScreenBlueprintBehaviorRelation['effect'],
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'component-visibility' && right.type === 'component-visibility') {
    return left.operation === right.operation;
  }
  if (left.type === 'emit-host-event' && right.type === 'emit-host-event') {
    return left.eventName === right.eventName;
  }
  if (left.type === 'host-action' && right.type === 'host-action') {
    return left.actionId === right.actionId;
  }
  return true;
}
