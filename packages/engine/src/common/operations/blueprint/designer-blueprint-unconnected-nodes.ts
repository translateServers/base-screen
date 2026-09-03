import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintLayoutNode,
  ScreenDocument,
} from '@base-screen/contracts';
import {
  appendDesignerBlueprintLayoutNode,
  createDesignerBlueprintAction,
} from './designer-blueprint-mutation-helpers.js';
import {
  type DesignerBlueprintNodePosition,
  type DesignerBlueprintUnconnectedNodeId,
  type DesignerBlueprintUnconnectedNodeKind,
  materializeDesignerBlueprintLayoutNodes,
  nextDesignerBlueprintUnconnectedNodeId,
  resolveDesignerBlueprintUnconnectedVariable,
} from './designer-blueprint-node-ids.js';
import type { BaseScreenBlueprintCanvasNode } from './designer-blueprint-protocol.js';
import {
  summarizeDesignerBlueprintAction,
  summarizeDesignerBlueprintCondition,
} from './designer-blueprint-summary.js';

export interface DesignerBlueprintNodeInsertion {
  readonly blueprint: ScreenBlueprint;
  readonly nodeId: string;
}

export function insertDesignerBlueprintLibraryNode(
  document: ScreenDocument,
  kind: DesignerBlueprintUnconnectedNodeKind,
  variableId?: string,
  position?: DesignerBlueprintNodePosition,
): DesignerBlueprintNodeInsertion | null {
  if (
    variableId !== undefined &&
    (kind !== 'set-variable' || !document.variables.some((variable) => variable.id === variableId))
  ) {
    return null;
  }
  const nodes = materializeDesignerBlueprintLayoutNodes(document);
  const nodeId = nextDesignerBlueprintUnconnectedNodeId(nodes, kind, variableId);
  return {
    nodeId,
    blueprint: appendDesignerBlueprintLayoutNode(document.blueprint, nodes, nodeId, position),
  };
}

export function buildDesignerBlueprintUnconnectedNode(
  document: ScreenDocument,
  layoutNode: ScreenBlueprintLayoutNode,
  unconnected: DesignerBlueprintUnconnectedNodeId,
): BaseScreenBlueprintCanvasNode {
  if (unconnected.kind === 'condition') {
    const condition = defaultDesignerBlueprintCondition();
    return {
      id: layoutNode.id,
      kind: 'condition',
      x: layoutNode.x,
      y: layoutNode.y,
      ...(layoutNode.collapsed === true ? { collapsed: true } : {}),
      condition,
      summary: summarizeDesignerBlueprintCondition(condition),
      unconnected: true,
    };
  }
  const variableId = resolveDesignerBlueprintUnconnectedVariable(document, unconnected);
  const action = createDesignerBlueprintAction(unconnected.kind, document, variableId);
  const summary =
    action === null
      ? { kind: 'set-variable' as const, primary: '', secondary: '' }
      : withoutSummaryOrder(summarizeDesignerBlueprintAction(action, 0));
  return {
    id: layoutNode.id,
    kind: 'action',
    x: layoutNode.x,
    y: layoutNode.y,
    ...(layoutNode.collapsed === true ? { collapsed: true } : {}),
    ...(action === null ? {} : { action }),
    summary,
    unconnected: true,
  };
}

function defaultDesignerBlueprintCondition(): ScreenBlueprintCondition {
  return { left: { kind: 'event-payload', path: [] }, operator: 'exists' };
}

function withoutSummaryOrder(
  summary: NonNullable<BaseScreenBlueprintCanvasNode['summary']>,
): NonNullable<BaseScreenBlueprintCanvasNode['summary']> {
  const { order: _order, ...rest } = summary;
  return rest;
}
