import type {
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintRelation,
  ScreenBlueprintValueExpression,
  ScreenDataSource,
  ScreenDocument,
  ScreenValueRef,
} from '@base-screen/contracts';
import {
  readScreenComponentValueRef,
  readScreenDocumentDataSources,
  SCREEN_BLUEPRINT_CAPABILITIES,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { readDesignerVariableViews } from '../designer-variable-view.js';
import { hasDesignerBlueprintCapability } from './designer-blueprint-capabilities.js';
import type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
import {
  componentBlueprintNodeId,
  HOST_BLUEPRINT_NODE_ID,
  variableBlueprintNodeId,
} from './designer-blueprint-node-ids.js';
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
} from './designer-blueprint-protocol.js';

export type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
export * from './designer-blueprint-mutations.js';
export {
  componentBlueprintNodeId,
  componentIdFromBlueprintNodeId,
  type DesignerBlueprintNodePosition,
  HOST_BLUEPRINT_NODE_ID,
  variableBlueprintNodeId,
  variableIdFromBlueprintNodeId,
} from './designer-blueprint-node-ids.js';

const MAX_PROJECTED_COMPONENTS = 200;
const COMPONENT_COLUMN_GAP = 264;
const COMPONENT_ROW_GAP = 252;
const VARIABLE_ROW_GAP = 196;

export function buildDesignerBlueprintEventOptions(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly DesignerBlueprintEventOption[] {
  const materialEventAvailable = hasDesignerBlueprintCapability(
    runtimeContributions,
    SCREEN_BLUEPRINT_CAPABILITIES.materialEvent,
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
  const childrenByParent = new Map<string, string[]>();
  for (const component of document.components) {
    if (component.parentId === null) continue;
    const children = childrenByParent.get(component.parentId) ?? [];
    children.push(component.id);
    childrenByParent.set(component.parentId, children);
  }
  const depths = componentDepths(document);
  const rowByDepth = new Map<number, number>();
  return document.components.map((component) => {
    const depth = depths.get(component.id) ?? 0;
    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);
    const children = childrenByParent.get(component.id) ?? [];
    return withSavedPosition(
      {
        id: componentBlueprintNodeId(component.id),
        kind: 'component',
        x: 72 + depth * COMPONENT_COLUMN_GAP,
        y: 72 + row * COMPONENT_ROW_GAP,
        componentId: component.id,
        componentName: component.name,
        materialType: component.type,
        hidden: component.status.hidden,
        ...(component.parentId === null ? {} : { parentId: component.parentId }),
        ...(children.length === 0 ? {} : { childCount: children.length, isContainer: true }),
        events: eventsByComponent.get(component.id) ?? [],
      },
      saved,
    );
  });
}

export function buildDesignerBlueprintVariableLibrary(
  document: ScreenDocument,
): readonly BaseScreenBlueprintCanvasNode[] {
  const saved = new Map(document.blueprint.layout?.nodes.map((node) => [node.id, node] as const));
  const maxDepth = Math.max(0, ...componentDepths(document).values());
  return readDesignerVariableViews(document).map((variable, index) =>
    withSavedPosition(
      {
        id: variableBlueprintNodeId(variable.id),
        kind: 'variable',
        x: 72 + (maxDepth + 1) * COMPONENT_COLUMN_GAP,
        y: 72 + index * VARIABLE_ROW_GAP,
        variableId: variable.id,
        variableName: variable.name,
        variableType: variable.type,
        ...(variable.description === undefined
          ? {}
          : { variableDescription: variable.description }),
        variableInitialValue: variable.initialValue,
        events: [
          { name: 'data-updated', label: 'data-updated', available: true },
          { name: 'request-state', label: 'request-state', available: true },
        ],
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
  const componentLibrary = buildDesignerBlueprintComponentLibrary(
    document,
    catalog,
    runtimeContributions,
  );
  const variableLibrary = buildDesignerBlueprintVariableLibrary(document);
  const readVariablesByComponent = componentReadVariables(document);
  const relationVariableIds = new Set<string>();
  for (const relation of document.blueprint.relations) {
    if (relation.type === 'behavior') {
      if (relation.source.kind === 'variable') relationVariableIds.add(relation.source.variableId);
      if (relation.target.kind === 'variable') relationVariableIds.add(relation.target.variableId);
      for (const variableId of conditionVariableIds(relation)) {
        relationVariableIds.add(variableId);
      }
    }
  }
  const pinnedNodeIds = new Set(saved.keys());
  const projectedComponentIds = selectProjectedComponents(
    document,
    componentLibrary,
    readVariablesByComponent,
    relationVariableIds,
    pinnedNodeIds,
  );
  const componentNodes = componentLibrary.filter(
    (node) => node.componentId !== undefined && projectedComponentIds.has(node.componentId),
  );
  const nodeIds = new Set(componentNodes.map((node) => node.id));
  const neededVariableIds = new Set<string>(relationVariableIds);
  for (const componentId of projectedComponentIds) {
    for (const variableId of readVariablesByComponent.get(componentId) ?? []) {
      neededVariableIds.add(variableId);
    }
  }
  const variableNodes = variableLibrary.filter((node) => {
    const variableId = node.variableId;
    if (variableId === undefined) return false;
    return neededVariableIds.has(variableId) || pinnedNodeIds.has(node.id);
  });
  for (const node of variableNodes) nodeIds.add(node.id);
  const hasExit = document.blueprint.relations.some(
    (relation) => relation.type === 'behavior' && relation.target.kind === 'host',
  );
  const hostPinned = pinnedNodeIds.has(HOST_BLUEPRINT_NODE_ID);
  const hostNode: BaseScreenBlueprintCanvasNode | undefined =
    hasExit || hostPinned
      ? withSavedPosition(
          {
            id: HOST_BLUEPRINT_NODE_ID,
            kind: 'host',
            x: 72 + (Math.max(0, ...componentDepths(document).values()) + 2) * COMPONENT_COLUMN_GAP,
            y: 72,
          },
          saved,
        )
      : undefined;
  if (hostNode !== undefined) nodeIds.add(hostNode.id);
  const nodes: BaseScreenBlueprintCanvasNode[] = [
    ...componentNodes,
    ...variableNodes,
    ...(hostNode === undefined ? [] : [hostNode]),
  ];
  const edges: BaseScreenBlueprintCanvasEdge[] = [];
  for (const relation of document.blueprint.relations) {
    appendRelationEdge(edges, nodeIds, relation);
  }
  for (const component of document.components) {
    if (!projectedComponentIds.has(component.id) || component.parentId === null) continue;
    const source = componentBlueprintNodeId(component.parentId);
    const target = componentBlueprintNodeId(component.id);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    edges.push({
      id: `containment:${component.parentId}:${component.id}`,
      source,
      target,
      sourceHandle: 'containment:out',
      targetHandle: 'containment:in',
      kind: 'containment',
      locked: true,
      deletable: false,
    });
  }
  for (const [componentId, variableIds] of readVariablesByComponent) {
    if (!projectedComponentIds.has(componentId)) continue;
    const target = componentBlueprintNodeId(componentId);
    for (const variableId of variableIds) {
      const source = variableBlueprintNodeId(variableId);
      if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
      edges.push({
        id: `dependency:read:${variableId}:${componentId}`,
        source,
        target,
        sourceHandle: 'dependency:out',
        targetHandle: 'dependency:in',
        kind: 'dependency',
        locked: true,
        deletable: false,
      });
    }
  }
  for (const relation of document.blueprint.relations) {
    if (relation.type !== 'behavior' || relation.condition === undefined) continue;
    const targetNodeId = relationTargetNodeId(relation);
    if (!nodeIds.has(targetNodeId)) continue;
    for (const variableId of conditionVariableIds(relation)) {
      const source = variableBlueprintNodeId(variableId);
      if (!nodeIds.has(source)) continue;
      edges.push({
        id: `dependency:condition:${relation.id}:${variableId}`,
        source,
        target: targetNodeId,
        sourceHandle: 'dependency:out',
        targetHandle: 'dependency:in',
        kind: 'dependency',
        locked: true,
        deletable: false,
        relationId: relation.id,
      });
    }
  }
  const counts = countEdges(nodes, edges);
  return {
    nodes: nodes.map((node) => {
      const count = counts.get(node.id);
      if (count === undefined) return node;
      return {
        ...node,
        inboundCount: count.inbound,
        outboundCount: count.outbound,
        relationCount: count.inbound + count.outbound,
        ...(node.kind === 'variable'
          ? { readCount: count.read, writeCount: count.write }
          : node.kind === 'host'
            ? { exitCount: count.exit }
            : {}),
      };
    }),
    edges,
    ...(document.blueprint.layout?.viewport === undefined
      ? {}
      : { viewport: document.blueprint.layout.viewport }),
  };
}

function appendRelationEdge(
  edges: BaseScreenBlueprintCanvasEdge[],
  nodeIds: ReadonlySet<string>,
  relation: ScreenBlueprintRelation,
): void {
  const source = relationSourceNodeId(relation);
  const target = relationTargetNodeId(relation);
  if (!nodeIds.has(source) || !nodeIds.has(target)) return;
  if (relation.type === 'semantic') {
    edges.push({
      id: `semantic:${relation.id}`,
      source,
      target,
      sourceHandle: 'semantic:out',
      targetHandle: 'relation:in',
      kind: 'semantic',
      relationId: relation.id,
      relationKind: 'semantic',
      semanticRole: relation.role,
      deletable: true,
    });
    return;
  }
  const effect = relation.effect;
  edges.push({
    id: `relation:${relation.id}`,
    source,
    target,
    sourceHandle: `event:${relation.source.event.eventName}`,
    targetHandle: 'relation:in',
    kind: 'relation',
    relationId: relation.id,
    relationKind: 'behavior',
    effectType: effect.type,
    eventName: relation.source.event.eventName,
    ...(effect.type === 'component-visibility' ? { operation: effect.operation } : {}),
    ...(effect.type === 'host-action' ? { actionId: effect.actionId } : {}),
    ...(relation.target.kind === 'variable' ? { variableId: relation.target.variableId } : {}),
    deletable: true,
  });
}

function relationSourceNodeId(relation: ScreenBlueprintRelation): string {
  if (relation.type === 'semantic') return componentBlueprintNodeId(relation.source.componentId);
  return relation.source.kind === 'component'
    ? componentBlueprintNodeId(relation.source.componentId)
    : variableBlueprintNodeId(relation.source.variableId);
}

function relationTargetNodeId(relation: ScreenBlueprintRelation): string {
  if (relation.type === 'semantic') return componentBlueprintNodeId(relation.target.componentId);
  const target = relation.target;
  if (target.kind === 'component') return componentBlueprintNodeId(target.componentId);
  if (target.kind === 'variable') return variableBlueprintNodeId(target.variableId);
  return HOST_BLUEPRINT_NODE_ID;
}

interface EdgeCount {
  readonly inbound: number;
  readonly outbound: number;
  readonly read: number;
  readonly write: number;
  readonly exit: number;
}

function countEdges(
  nodes: readonly BaseScreenBlueprintCanvasNode[],
  edges: readonly BaseScreenBlueprintCanvasEdge[],
): ReadonlyMap<string, EdgeCount> {
  const counts = new Map<string, EdgeCount>();
  for (const node of nodes) {
    counts.set(node.id, { inbound: 0, outbound: 0, read: 0, write: 0, exit: 0 });
  }
  for (const edge of edges) {
    const source = counts.get(edge.source);
    const target = counts.get(edge.target);
    if (source !== undefined) {
      const next = { ...source, outbound: source.outbound + 1 };
      counts.set(edge.source, {
        ...next,
        ...(edge.kind === 'dependency' ? { read: next.read + 1 } : {}),
      });
    }
    if (target !== undefined) {
      const next = { ...target, inbound: target.inbound + 1 };
      const writes =
        edge.kind === 'relation' &&
        (edge.effectType === 'set-variable' || edge.effectType === 'request-variable');
      const exits =
        edge.kind === 'relation' &&
        (edge.effectType === 'emit-host-event' || edge.effectType === 'host-action');
      counts.set(edge.target, {
        ...next,
        ...(writes ? { write: next.write + 1 } : {}),
        ...(exits ? { exit: next.exit + 1 } : {}),
      });
    }
  }
  return counts;
}

function selectProjectedComponents(
  document: ScreenDocument,
  componentLibrary: readonly BaseScreenBlueprintCanvasNode[],
  readVariablesByComponent: ReadonlyMap<string, readonly string[]>,
  relationVariableIds: ReadonlySet<string>,
  pinnedNodeIds: ReadonlySet<string>,
): ReadonlySet<string> {
  if (document.components.length <= MAX_PROJECTED_COMPONENTS) {
    return new Set(document.components.map((component) => component.id));
  }
  const needed = new Set<string>();
  const byId = new Map(document.components.map((component) => [component.id, component] as const));
  for (const relation of document.blueprint.relations) {
    if (relation.type === 'semantic') {
      needed.add(relation.source.componentId);
      needed.add(relation.target.componentId);
    } else {
      if (relation.source.kind === 'component') needed.add(relation.source.componentId);
      if (relation.target.kind === 'component') needed.add(relation.target.componentId);
    }
  }
  for (const node of componentLibrary) {
    if (node.componentId !== undefined && pinnedNodeIds.has(node.id)) needed.add(node.componentId);
  }
  for (const [componentId, variableIds] of readVariablesByComponent) {
    if (variableIds.some((variableId) => relationVariableIds.has(variableId))) {
      needed.add(componentId);
    }
  }
  const includeTree = (componentId: string): void => {
    const component = byId.get(componentId);
    if (component === undefined || needed.has(component.id)) return;
    needed.add(component.id);
    if (component.parentId !== null) includeTree(component.parentId);
    for (const child of document.components) {
      if (child.parentId === component.id) includeTree(child.id);
    }
  };
  for (const componentId of [...needed]) includeTree(componentId);
  return needed;
}

/** 组件读取的变量：组件值引用 + 数据源实例参数中的变量引用。 */
function componentReadVariables(document: ScreenDocument): ReadonlyMap<string, readonly string[]> {
  const dataSources = new Map(
    readScreenDocumentDataSources(document).map((source) => [source.id, source] as const),
  );
  const reads = new Map<string, readonly string[]>();
  for (const component of document.components) {
    const variables = new Set<string>();
    const ref = readScreenComponentValueRef(component);
    if (ref !== null) {
      collectValueRefVariables(ref, dataSources, variables);
    }
    reads.set(component.id, [...variables]);
  }
  return reads;
}

function collectValueRefVariables(
  ref: ScreenValueRef,
  dataSources: ReadonlyMap<string, ScreenDataSource>,
  variables: Set<string>,
): void {
  if (ref.kind === 'variable') {
    variables.add(ref.variableId);
    return;
  }
  if (ref.kind !== 'data-source-field') return;
  const source = dataSources.get(ref.dataSourceId);
  if (source === undefined) return;
  for (const parameter of Object.values(source.params)) {
    if (parameter.kind === 'variable') variables.add(parameter.variableId);
  }
}

function conditionVariableIds(relation: ScreenBlueprintBehaviorRelation): readonly string[] {
  if (relation.condition === undefined) return [];
  const ids = new Set<string>();
  collectExpressionVariables(relation.condition.left, ids);
  if (relation.condition.right !== undefined) {
    collectExpressionVariables(relation.condition.right, ids);
  }
  return [...ids];
}

function collectExpressionVariables(
  expression: ScreenBlueprintValueExpression,
  variables: Set<string>,
): void {
  if (expression.kind === 'variable') {
    variables.add(expression.variableId);
  } else if (expression.kind === 'array') {
    for (const item of expression.items) collectExpressionVariables(item, variables);
  } else if (expression.kind === 'object') {
    for (const item of Object.values(expression.properties)) {
      collectExpressionVariables(item, variables);
    }
  }
}

function componentDepths(document: ScreenDocument): ReadonlyMap<string, number> {
  const byId = new Map(document.components.map((component) => [component.id, component] as const));
  const depths = new Map<string, number>();
  for (const component of document.components) {
    let depth = 0;
    let parentId = component.parentId;
    const seen = new Set<string>([component.id]);
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    depths.set(component.id, depth);
  }
  return depths;
}

function withSavedPosition(
  node: BaseScreenBlueprintCanvasNode,
  saved: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number; readonly collapsed?: boolean }
  >,
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
