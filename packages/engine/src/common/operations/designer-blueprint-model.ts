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
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  DESIGNER_BLUEPRINT_CAPABILITIES,
  hasDesignerBlueprintCapability,
  normalizeDesignerBlueprintRuleCapabilities,
} from './designer-blueprint-capabilities.js';
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
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasEventOption,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
} from './designer-blueprint-protocol.js';
import {
  summarizeDesignerBlueprintAction,
  summarizeDesignerBlueprintCondition,
} from './designer-blueprint-summary.js';
import { buildDesignerBlueprintUnconnectedNode } from './designer-blueprint-unconnected-nodes.js';

export interface DesignerBlueprintEventOption extends BaseScreenBlueprintCanvasEventOption {
  readonly componentId: string;
  readonly componentName: string;
  readonly materialType: string;
}

export {
  actionBlueprintNodeId,
  componentBlueprintNodeId,
  conditionBlueprintNodeId,
  type DesignerBlueprintNodePosition,
} from './designer-blueprint-node-ids.js';

export function buildDesignerBlueprintEventOptions(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly DesignerBlueprintEventOption[] {
  const materialEventAvailable = hasDesignerBlueprintCapability(
    runtimeContributions,
    DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent,
  );
  return document.components.flatMap((component) => {
    const manifest = catalog?.get(component.type)?.manifest;
    const descriptors = new Map(
      (manifest?.editorDescriptor?.events ?? []).map((descriptor) => [descriptor.name, descriptor]),
    );
    return (manifest?.events ?? []).map((name) => {
      const descriptor = descriptors.get(name);
      const requiredCapability = descriptor?.requiredCapability;
      const blueprintAllowed =
        descriptor?.triggerContexts === undefined ||
        descriptor.triggerContexts.includes('blueprint');
      return {
        componentId: component.id,
        componentName: component.name,
        materialType: component.type,
        name,
        label: descriptor?.label ?? name,
        available:
          blueprintAllowed &&
          materialEventAvailable &&
          (requiredCapability === undefined ||
            hasDesignerBlueprintCapability(runtimeContributions, requiredCapability)),
        ...(requiredCapability === undefined ? {} : { requiredCapability }),
      };
    });
  });
}

export function buildDesignerBlueprintComponentLibrary(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly BaseScreenBlueprintCanvasNode[] {
  const saved = new Map(document.blueprint.layout?.nodes.map((node) => [node.id, node] as const));
  const events = buildDesignerBlueprintEventOptions(document, catalog, runtimeContributions);
  const eventsByComponent = new Map<string, DesignerBlueprintEventOption[]>();
  for (const event of events) {
    const list = eventsByComponent.get(event.componentId) ?? [];
    list.push(event);
    eventsByComponent.set(event.componentId, list);
  }
  return document.components.map((component, index) =>
    withSavedPosition(
      {
        id: componentBlueprintNodeId(component.id),
        kind: 'component',
        x: 72,
        y: 72 + index * 252,
        componentId: component.id,
        componentName: component.name,
        materialType: component.type,
        hidden: component.status.hidden,
        events: eventsByComponent.get(component.id) ?? [],
      },
      saved,
    ),
  );
}

export function buildDesignerBlueprintGraph(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): BaseScreenBlueprintCanvasGraph {
  const saved = new Map(document.blueprint.layout?.nodes.map((node) => [node.id, node] as const));
  const placed = new Set(materializeDesignerBlueprintLayoutNodes(document).map((node) => node.id));
  const nodes: BaseScreenBlueprintCanvasNode[] = buildDesignerBlueprintComponentLibrary(
    document,
    catalog,
    runtimeContributions,
  ).filter((node) => placed.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: BaseScreenBlueprintCanvasEdge[] = [];
  for (const layoutNode of materializeDesignerBlueprintLayoutNodes(document)) {
    const unconnected = parseDesignerBlueprintUnconnectedNodeId(layoutNode.id);
    if (unconnected === null) continue;
    const node = buildDesignerBlueprintUnconnectedNode(document, layoutNode, unconnected);
    nodes.push(node);
    nodeIds.add(node.id);
  }
  document.blueprint.rules.forEach((rule, ruleIndex) => {
    const source = componentBlueprintNodeId(rule.trigger.componentId);
    let actionSource = source;
    let actionSourceHandle = `event:${rule.trigger.eventName}`;
    if (rule.condition !== undefined) {
      const conditionId = conditionBlueprintNodeId(rule.id);
      if (placed.has(conditionId)) {
        nodes.push(
          withSavedPosition(
            {
              id: conditionId,
              kind: 'condition',
              x: 440,
              y: 72 + ruleIndex * 164,
              ruleId: rule.id,
              condition: rule.condition,
              summary: summarizeDesignerBlueprintCondition(rule.condition),
            },
            saved,
          ),
        );
        nodeIds.add(conditionId);
      }
      if (nodeIds.has(source) && nodeIds.has(conditionId)) {
        edges.push({
          id: `edge:${rule.id}:trigger`,
          source,
          target: conditionId,
          sourceHandle: actionSourceHandle,
          targetHandle: 'condition:in',
          ruleId: rule.id,
          kind: 'trigger',
        });
      }
      actionSource = conditionId;
      actionSourceHandle = 'condition:true';
    }
    rule.actions.forEach((action, actionIndex) => {
      const target =
        action.type === 'component-visibility'
          ? componentBlueprintNodeId(action.componentId)
          : actionBlueprintNodeId(rule.id, actionIndex);
      if (action.type !== 'component-visibility' && placed.has(target)) {
        nodes.push(
          withSavedPosition(
            {
              id: target,
              kind: 'action',
              x: 784,
              y: 72 + (ruleIndex * 3 + actionIndex) * 132,
              ruleId: rule.id,
              actionIndex,
              action,
              summary: summarizeDesignerBlueprintAction(action, actionIndex),
            },
            saved,
          ),
        );
        nodeIds.add(target);
      }
      if (nodeIds.has(actionSource) && nodeIds.has(target)) {
        edges.push({
          id: `edge:${rule.id}:action:${actionIndex}`,
          source: actionSource,
          target,
          sourceHandle: actionSourceHandle,
          targetHandle:
            action.type === 'component-visibility' ? `visibility:${action.operation}` : 'action:in',
          ruleId: rule.id,
          actionIndex,
          kind: 'action',
          ...(action.type === 'component-visibility' ? { operation: action.operation } : {}),
        });
      }
    });
  });
  return {
    nodes,
    edges,
    ...(document.blueprint.layout?.viewport === undefined
      ? {}
      : { viewport: document.blueprint.layout.viewport }),
  };
}

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

function withSavedPosition(
  node: BaseScreenBlueprintCanvasNode,
  saved: ReadonlyMap<string, ScreenBlueprintLayoutNode>,
): BaseScreenBlueprintCanvasNode {
  const position = saved.get(node.id);
  return position === undefined
    ? node
    : {
        ...node,
        x: position.x,
        y: position.y,
        ...(position.collapsed === true ? { collapsed: true } : {}),
      };
}
