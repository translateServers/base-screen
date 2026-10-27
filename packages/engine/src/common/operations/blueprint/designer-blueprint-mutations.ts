import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintLayoutNode,
  ScreenBlueprintLayoutViewport,
  ScreenBlueprintRelationEffect,
  ScreenBlueprintSemanticRelationRole,
  ScreenDocument,
} from '@base-screen/contracts';
import {
  insertLayoutNode,
  parseRelationEdgeId,
  relationReferencesComponent,
  relationReferencesHost,
  relationReferencesVariable,
  removeLayoutNodes,
  removeRelation,
  removeRelationCondition,
  updateRelationCondition,
  updateRelationEffect,
  updateRelationSourceEvent,
  updateSemanticRole,
} from './designer-blueprint-mutation-helpers.js';
import {
  componentBlueprintNodeId,
  type DesignerBlueprintNodePosition,
  HOST_BLUEPRINT_NODE_ID,
  variableBlueprintNodeId,
} from './designer-blueprint-node-ids.js';
import type { BaseScreenBlueprintCanvasSelection } from './designer-blueprint-protocol.js';

export function insertDesignerBlueprintComponentNode(
  document: ScreenDocument,
  componentId: string,
  position?: DesignerBlueprintNodePosition,
): ScreenBlueprint | null {
  if (!document.components.some((component) => component.id === componentId)) return null;
  return insertLayoutNode(document.blueprint, componentBlueprintNodeId(componentId), position);
}

export function insertDesignerBlueprintVariableNode(
  document: ScreenDocument,
  variableId: string,
  position?: DesignerBlueprintNodePosition,
): ScreenBlueprint | null {
  if (!document.variables.some((variable) => variable.id === variableId)) return null;
  return insertLayoutNode(document.blueprint, variableBlueprintNodeId(variableId), position);
}

export function insertDesignerBlueprintHostNode(
  blueprint: ScreenBlueprint,
  position?: DesignerBlueprintNodePosition,
): ScreenBlueprint {
  return insertLayoutNode(blueprint, HOST_BLUEPRINT_NODE_ID, position);
}

export function deleteDesignerBlueprintSelection(
  blueprint: ScreenBlueprint,
  selection: Exclude<BaseScreenBlueprintCanvasSelection, null>,
): ScreenBlueprint | null {
  if (selection.kind === 'edge') {
    const relation = parseRelationEdgeId(selection.id);
    return relation === null ? null : removeRelation(blueprint, relation.relationId);
  }
  if (selection.id === HOST_BLUEPRINT_NODE_ID) {
    let updated: ScreenBlueprint = blueprint;
    for (const relation of blueprint.relations) {
      if (relationReferencesHost(relation)) updated = removeRelation(updated, relation.id);
    }
    return removeLayoutNodes(updated, new Set([HOST_BLUEPRINT_NODE_ID]));
  }
  if (selection.id.startsWith('component:')) {
    const componentId = selection.id.slice('component:'.length);
    let updated: ScreenBlueprint = blueprint;
    for (const relation of blueprint.relations) {
      if (relationReferencesComponent(relation, componentId)) {
        updated = removeRelation(updated, relation.id);
      }
    }
    return removeLayoutNodes(updated, new Set([selection.id]));
  }
  if (selection.id.startsWith('variable:')) {
    const variableId = selection.id.slice('variable:'.length);
    let updated: ScreenBlueprint = blueprint;
    for (const relation of blueprint.relations) {
      if (relationReferencesVariable(relation, variableId)) {
        updated = removeRelation(updated, relation.id);
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
  // 没有保存过节点布局时，视口不是权威：写 nodes: [] 会让图构建器把节点全部隐藏。
  if (blueprint.layout === undefined || blueprint.layout.nodes.length === 0) return blueprint;
  return {
    ...blueprint,
    layout: { nodes: blueprint.layout.nodes, viewport },
  };
}

export function updateDesignerBlueprintCondition(
  blueprint: ScreenBlueprint,
  relationId: string,
  condition: ScreenBlueprintCondition,
): ScreenBlueprint | null {
  return updateRelationCondition(blueprint, relationId, condition);
}

export function removeDesignerBlueprintCondition(
  blueprint: ScreenBlueprint,
  relationId: string,
): ScreenBlueprint | null {
  return removeRelationCondition(blueprint, relationId);
}

export function updateDesignerBlueprintEffect(
  blueprint: ScreenBlueprint,
  relationId: string,
  effect: ScreenBlueprintRelationEffect,
): ScreenBlueprint | null {
  return updateRelationEffect(blueprint, relationId, effect);
}

export function updateDesignerBlueprintSourceEvent(
  blueprint: ScreenBlueprint,
  relationId: string,
  eventName: string,
): ScreenBlueprint | null {
  return updateRelationSourceEvent(blueprint, relationId, eventName);
}

export function updateDesignerBlueprintSemanticRole(
  blueprint: ScreenBlueprint,
  relationId: string,
  role: ScreenBlueprintSemanticRelationRole,
): ScreenBlueprint | null {
  return updateSemanticRole(blueprint, relationId, role);
}
