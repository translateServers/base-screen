import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintComponentVisibilityAction,
  ScreenBlueprintCondition,
  ScreenBlueprintLayoutNode,
  ScreenBlueprintLayoutViewport,
  ScreenBlueprintRule,
  ScreenDocument,
} from '@base-screen/contracts';
import { normalizeDesignerBlueprintRuleCapabilities } from './designer-blueprint-capabilities.js';
import type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
import {
  appendDesignerBlueprintLayoutNode,
  createDesignerBlueprintAction,
  createDesignerVisibilityAction,
  nextRuleId,
  parseActionNodeId,
  parseEdgeId,
  removeAction,
  removeLayoutNodes,
  removeRule,
  updateRule,
} from './designer-blueprint-mutation-helpers.js';
import {
  actionBlueprintNodeId,
  componentBlueprintNodeId,
  conditionBlueprintNodeId,
  type DesignerBlueprintNodePosition,
  materializeDesignerBlueprintLayoutNodes,
  parseDesignerBlueprintUnconnectedNodeId,
} from './designer-blueprint-node-ids.js';
import type { BaseScreenBlueprintCanvasSelection } from './designer-blueprint-protocol.js';

export function insertDesignerBlueprintComponentNode(
  document: ScreenDocument,
  componentId: string,
  position?: DesignerBlueprintNodePosition,
): ScreenBlueprint | null {
  if (!document.components.some((component) => component.id === componentId)) return null;
  const id = componentBlueprintNodeId(componentId);
  const nodes = materializeDesignerBlueprintLayoutNodes(document);
  if (nodes.some((node) => node.id === id)) return null;
  return appendDesignerBlueprintLayoutNode(document.blueprint, nodes, id, position);
}

export function createDesignerVisibilityRule(
  document: ScreenDocument,
  sourceComponentId: string,
  eventName: string,
  targetComponentId: string,
  operation: ScreenBlueprintComponentVisibilityAction['operation'],
  events: readonly DesignerBlueprintEventOption[],
): ScreenBlueprintRule | null {
  const option = events.find(
    (event) => event.componentId === sourceComponentId && event.name === eventName,
  );
  if (
    option?.available !== true ||
    !document.components.some((component) => component.id === targetComponentId) ||
    document.blueprint.rules.some(
      (rule) =>
        rule.trigger.componentId === sourceComponentId &&
        rule.trigger.eventName === eventName &&
        rule.actions.some(
          (action) =>
            action.type === 'component-visibility' &&
            action.componentId === targetComponentId &&
            action.operation === operation,
        ),
    )
  ) {
    return null;
  }
  const id = nextRuleId(document.blueprint, `${sourceComponentId}-${eventName}-${operation}`);
  return normalizeDesignerBlueprintRuleCapabilities({
    id,
    trigger: { type: 'material-event', componentId: sourceComponentId, eventName },
    actions: [createDesignerVisibilityAction(targetComponentId, operation)],
  });
}

export function insertDesignerBlueprintNode(
  document: ScreenDocument,
  kind: 'condition' | 'set-variable' | 'emit-host-event',
  ruleId: string,
  variableName?: string,
  position?: DesignerBlueprintNodePosition,
): ScreenBlueprint | null {
  const rule = document.blueprint.rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) return null;
  const layoutNodes = materializeDesignerBlueprintLayoutNodes(document);
  if (kind === 'condition') {
    if (rule.condition !== undefined) return null;
    const updated = updateRule(document.blueprint, ruleId, (candidate) => ({
      ...candidate,
      condition: {
        left: { kind: 'event-payload', path: [] },
        operator: 'exists',
      },
    }));
    return updated === null
      ? null
      : appendDesignerBlueprintLayoutNode(
          updated,
          layoutNodes,
          conditionBlueprintNodeId(ruleId),
          position,
        );
  }
  const action = createDesignerBlueprintAction(kind, document, variableName);
  if (action === null) return null;
  const actionIndex = rule.actions.length;
  const updated = updateRule(document.blueprint, ruleId, (candidate) => ({
    ...candidate,
    actions: [...candidate.actions, action],
  }));
  return updated === null
    ? null
    : appendDesignerBlueprintLayoutNode(
        updated,
        layoutNodes,
        actionBlueprintNodeId(ruleId, actionIndex),
        position,
      );
}

export function deleteDesignerBlueprintSelection(
  blueprint: ScreenBlueprint,
  selection: Exclude<BaseScreenBlueprintCanvasSelection, null>,
): ScreenBlueprint | null {
  if (selection.kind === 'edge') {
    const edge = parseEdgeId(selection.id);
    if (edge === null) return null;
    if (edge.actionIndex === undefined) {
      return removeRule(blueprint, edge.ruleId);
    }
    return removeAction(blueprint, edge.ruleId, edge.actionIndex);
  }
  if (parseDesignerBlueprintUnconnectedNodeId(selection.id) !== null) {
    return removeLayoutNodes(blueprint, new Set([selection.id]));
  }
  if (selection.id.startsWith('condition:')) {
    const ruleId = selection.id.slice('condition:'.length);
    const rule = blueprint.rules.find((candidate) => candidate.id === ruleId);
    if (rule?.actions.length === 0) return removeRule(blueprint, ruleId);
    const updated = updateRule(blueprint, ruleId, ({ condition: _condition, ...rule }) => rule);
    return updated === null ? null : removeLayoutNodes(updated, new Set([selection.id]));
  }
  if (selection.id.startsWith('action:')) {
    const parsed = parseActionNodeId(selection.id);
    return parsed === null ? null : removeAction(blueprint, parsed.ruleId, parsed.actionIndex);
  }
  if (selection.id.startsWith('component:')) {
    const componentId = selection.id.slice('component:'.length);
    let updated: ScreenBlueprint = blueprint;
    for (const rule of blueprint.rules) {
      if (rule.trigger.componentId === componentId) {
        updated = removeRule(updated, rule.id);
        continue;
      }
      const actionIndexes = rule.actions
        .map((action, index) => ({ action, index }))
        .filter(
          ({ action }) =>
            action.type === 'component-visibility' && action.componentId === componentId,
        )
        .map(({ index }) => index)
        .reverse();
      for (const actionIndex of actionIndexes) {
        updated = removeAction(updated, rule.id, actionIndex) ?? updated;
      }
    }
    return removeLayoutNodes(updated, new Set([selection.id]));
  }
  return null;
}

export function commitDesignerBlueprintLayout(
  blueprint: ScreenBlueprint,
  nodes: readonly ScreenBlueprintLayoutNode[],
  viewport?: ScreenBlueprintLayoutViewport,
): ScreenBlueprint {
  const effectiveViewport = viewport ?? blueprint.layout?.viewport;
  return {
    ...blueprint,
    layout: {
      nodes,
      ...(effectiveViewport === undefined ? {} : { viewport: effectiveViewport }),
    },
  };
}

export function commitDesignerBlueprintViewport(
  blueprint: ScreenBlueprint,
  viewport: ScreenBlueprintLayoutViewport,
): ScreenBlueprint {
  return {
    ...blueprint,
    layout: { nodes: blueprint.layout?.nodes ?? [], viewport },
  };
}

export function updateDesignerBlueprintCondition(
  blueprint: ScreenBlueprint,
  ruleId: string,
  condition: ScreenBlueprintCondition,
): ScreenBlueprint | null {
  return updateRule(blueprint, ruleId, (rule) => ({ ...rule, condition }));
}

export function updateDesignerBlueprintAction(
  blueprint: ScreenBlueprint,
  ruleId: string,
  actionIndex: number,
  action: ScreenBlueprintAction,
): ScreenBlueprint | null {
  return updateRule(blueprint, ruleId, (rule) => {
    if (actionIndex < 0 || actionIndex >= rule.actions.length) return rule;
    return {
      ...rule,
      actions: rule.actions.map((candidate, index) => (index === actionIndex ? action : candidate)),
    };
  });
}
