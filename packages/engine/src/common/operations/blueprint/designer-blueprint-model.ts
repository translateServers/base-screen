import type { ScreenBlueprintLayoutNode, ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  DESIGNER_BLUEPRINT_CAPABILITIES,
  hasDesignerBlueprintCapability,
} from './designer-blueprint-capabilities.js';
import type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
import {
  actionBlueprintNodeId,
  componentBlueprintNodeId,
  conditionBlueprintNodeId,
  materializeDesignerBlueprintLayoutNodes,
  parseDesignerBlueprintUnconnectedNodeId,
} from './designer-blueprint-node-ids.js';
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
} from './designer-blueprint-protocol.js';
import {
  summarizeDesignerBlueprintAction,
  summarizeDesignerBlueprintCondition,
} from './designer-blueprint-summary.js';
import { buildDesignerBlueprintUnconnectedNode } from './designer-blueprint-unconnected-nodes.js';

export type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
export * from './designer-blueprint-mutations.js';
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
