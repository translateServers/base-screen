import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintLayoutNode,
  ScreenBlueprintRelation,
  ScreenBlueprintRelationEffect,
  ScreenBlueprintSemanticRelationRole,
  ScreenBlueprintValueExpression,
} from '@base-screen/contracts';
import { screenBlueprintEffectTargetKind } from '@base-screen/contracts';
import type { DesignerBlueprintNodePosition } from './designer-blueprint-node-ids.js';

export function updateRelation(
  blueprint: ScreenBlueprint,
  relationId: string,
  update: (relation: ScreenBlueprintRelation) => ScreenBlueprintRelation,
): ScreenBlueprint | null {
  if (!blueprint.relations.some((relation) => relation.id === relationId)) return null;
  return {
    ...blueprint,
    relations: blueprint.relations.map((relation) =>
      relation.id === relationId ? update(relation) : relation,
    ),
  };
}

export function removeRelation(blueprint: ScreenBlueprint, relationId: string): ScreenBlueprint {
  return {
    ...blueprint,
    relations: blueprint.relations.filter((relation) => relation.id !== relationId),
  };
}

export function updateRelationCondition(
  blueprint: ScreenBlueprint,
  relationId: string,
  condition: ScreenBlueprintCondition,
): ScreenBlueprint | null {
  return updateRelation(blueprint, relationId, (relation) =>
    relation.type === 'behavior' ? { ...relation, condition } : relation,
  );
}

export function removeRelationCondition(
  blueprint: ScreenBlueprint,
  relationId: string,
): ScreenBlueprint | null {
  return updateRelation(blueprint, relationId, (relation) => {
    if (relation.type !== 'behavior') return relation;
    const { condition: _condition, ...rest } = relation;
    return rest;
  });
}

export function updateRelationEffect(
  blueprint: ScreenBlueprint,
  relationId: string,
  effect: ScreenBlueprintRelationEffect,
): ScreenBlueprint | null {
  const relation = blueprint.relations.find((candidate) => candidate.id === relationId);
  if (
    relation === undefined ||
    relation.type !== 'behavior' ||
    relation.target.kind !== screenBlueprintEffectTargetKind(effect)
  ) {
    return null;
  }
  return updateRelation(blueprint, relationId, (candidate) => ({ ...candidate, effect }));
}

export function updateRelationSourceEvent(
  blueprint: ScreenBlueprint,
  relationId: string,
  eventName: string,
): ScreenBlueprint | null {
  const relation = blueprint.relations.find((candidate) => candidate.id === relationId);
  if (relation === undefined || relation.type !== 'behavior') return null;
  if (relation.source.kind === 'variable') {
    if (eventName !== 'data-updated' && eventName !== 'request-state') return null;
    const variableEventName: 'data-updated' | 'request-state' = eventName;
    return updateRelation(blueprint, relationId, (candidate) => {
      if (candidate.type !== 'behavior' || candidate.source.kind !== 'variable') {
        return candidate;
      }
      return {
        ...candidate,
        source: {
          ...candidate.source,
          event: { type: 'variable-event', eventName: variableEventName },
        },
      };
    });
  }
  return updateRelation(blueprint, relationId, (candidate) => {
    if (candidate.type !== 'behavior' || candidate.source.kind !== 'component') {
      return candidate;
    }
    return {
      ...candidate,
      source: { ...candidate.source, event: { type: 'material-event', eventName } },
    };
  });
}

export function updateSemanticRole(
  blueprint: ScreenBlueprint,
  relationId: string,
  role: ScreenBlueprintSemanticRelationRole,
): ScreenBlueprint | null {
  return updateRelation(blueprint, relationId, (relation) =>
    relation.type === 'semantic' ? { ...relation, role } : relation,
  );
}

export function parseRelationEdgeId(
  edgeId: string,
): { readonly kind: 'relation' | 'semantic'; readonly relationId: string } | null {
  if (edgeId.startsWith('relation:')) {
    return { kind: 'relation', relationId: edgeId.slice('relation:'.length) };
  }
  if (edgeId.startsWith('semantic:')) {
    return { kind: 'semantic', relationId: edgeId.slice('semantic:'.length) };
  }
  return null;
}

export function relationReferencesComponent(
  relation: ScreenBlueprintRelation,
  componentId: string,
): boolean {
  if (relation.type === 'semantic') {
    return (
      relation.source.componentId === componentId || relation.target.componentId === componentId
    );
  }
  if (relation.source.kind === 'component' && relation.source.componentId === componentId) {
    return true;
  }
  return relation.target.kind === 'component' && relation.target.componentId === componentId;
}

export function relationReferencesVariable(
  relation: ScreenBlueprintRelation,
  variableId: string,
): boolean {
  if (relation.type === 'semantic') return false;
  if (relation.source.kind === 'variable' && relation.source.variableId === variableId) return true;
  if (relation.target.kind === 'variable' && relation.target.variableId === variableId) return true;
  if (
    relation.condition !== undefined &&
    (expressionVariableIds(relation.condition.left).includes(variableId) ||
      (relation.condition.right !== undefined &&
        expressionVariableIds(relation.condition.right).includes(variableId)))
  ) {
    return true;
  }
  const effect = relation.effect;
  if (effect.type === 'set-variable') {
    return expressionVariableIds(effect.value).includes(variableId);
  }
  if (effect.type === 'emit-host-event' || effect.type === 'host-action') {
    return expressionVariableIds(effect.payload).includes(variableId);
  }
  return false;
}

export function relationReferencesHost(relation: ScreenBlueprintRelation): boolean {
  return relation.type === 'behavior' && relation.target.kind === 'host';
}

export function insertLayoutNode(
  blueprint: ScreenBlueprint,
  id: string,
  position: DesignerBlueprintNodePosition | undefined,
): ScreenBlueprint {
  const nodes = blueprint.layout?.nodes ?? [];
  const resolved = validPosition(position) ? position : nextNodePosition(nodes);
  return {
    ...blueprint,
    layout: {
      nodes: [
        ...nodes.filter((node) => node.id !== id),
        { id, x: roundPosition(resolved.x), y: roundPosition(resolved.y) },
      ],
      ...(blueprint.layout?.viewport === undefined ? {} : { viewport: blueprint.layout.viewport }),
    },
  };
}

export function removeLayoutNodes(
  blueprint: ScreenBlueprint,
  ids: ReadonlySet<string>,
): ScreenBlueprint {
  if (blueprint.layout === undefined) return blueprint;
  const nodes = blueprint.layout.nodes.filter((node) => !ids.has(node.id));
  return {
    ...blueprint,
    layout: {
      nodes,
      ...(blueprint.layout.viewport === undefined ? {} : { viewport: blueprint.layout.viewport }),
    },
  };
}

export function nextRelationId(blueprint: ScreenBlueprint, value: string): string {
  const existing = new Set(blueprint.relations.map((relation) => relation.id));
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 56) || 'relation';
  let index = 1;
  let candidate = `${base}-${index}`;
  while (existing.has(candidate)) candidate = `${base}-${++index}`;
  return candidate;
}

function expressionVariableIds(expression: ScreenBlueprintValueExpression): readonly string[] {
  if (expression.kind === 'variable') return [expression.variableId];
  if (expression.kind === 'array') {
    return expression.items.flatMap(expressionVariableIds);
  }
  if (expression.kind === 'object') {
    return Object.values(expression.properties).flatMap(expressionVariableIds);
  }
  return [];
}

function nextNodePosition(
  nodes: readonly ScreenBlueprintLayoutNode[],
): DesignerBlueprintNodePosition {
  const index = nodes.length;
  return { x: 72 + (index % 3) * 264, y: 72 + Math.floor(index / 3) * 224 };
}

function validPosition(
  position: DesignerBlueprintNodePosition | undefined,
): position is DesignerBlueprintNodePosition {
  return (
    position !== undefined &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Math.abs(position.x) <= 1_000_000 &&
    Math.abs(position.y) <= 1_000_000
  );
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}
