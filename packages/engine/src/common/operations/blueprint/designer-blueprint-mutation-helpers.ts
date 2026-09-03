import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintComponentVisibilityAction,
  ScreenBlueprintLayoutNode,
  ScreenBlueprintRule,
  ScreenDocument,
} from '@base-screen/contracts';
import { normalizeDesignerBlueprintRuleCapabilities } from './designer-blueprint-capabilities.js';
import {
  actionBlueprintNodeId,
  conditionBlueprintNodeId,
  type DesignerBlueprintNodePosition,
} from './designer-blueprint-node-ids.js';

export function createDesignerBlueprintAction(
  kind: 'set-variable' | 'emit-host-event',
  document: ScreenDocument,
  variableId?: string,
): Exclude<ScreenBlueprintAction, ScreenBlueprintComponentVisibilityAction> | null {
  if (kind === 'set-variable') {
    const variable =
      document.variables.find((candidate) => candidate.id === variableId) ?? document.variables[0];
    return variable === undefined
      ? null
      : {
          type: 'set-variable',
          variableId: variable.id,
          value: { kind: 'literal', value: null },
        };
  }
  return {
    type: 'emit-host-event',
    eventName: 'host_event',
    payload: { kind: 'event-payload', path: [] },
  };
}

export function createDesignerVisibilityAction(
  componentId: string,
  operation: ScreenBlueprintComponentVisibilityAction['operation'],
): ScreenBlueprintComponentVisibilityAction {
  return {
    type: 'component-visibility',
    componentId,
    operation,
    transition: { effect: 'fade', durationMs: 240, easing: 'ease-in-out-quad' },
  };
}

export function updateRule(
  blueprint: ScreenBlueprint,
  ruleId: string,
  update: (rule: ScreenBlueprintRule) => ScreenBlueprintRule,
): ScreenBlueprint | null {
  if (!blueprint.rules.some((rule) => rule.id === ruleId)) return null;
  return {
    ...blueprint,
    rules: blueprint.rules.map((rule) =>
      rule.id === ruleId ? normalizeDesignerBlueprintRuleCapabilities(update(rule)) : rule,
    ),
  };
}

export function removeAction(
  blueprint: ScreenBlueprint,
  ruleId: string,
  actionIndex: number,
): ScreenBlueprint | null {
  const rule = blueprint.rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined || actionIndex < 0 || actionIndex >= rule.actions.length) return null;
  const actions = rule.actions.filter((_action, index) => index !== actionIndex);
  if (actions.length === 0) return removeRule(blueprint, ruleId);
  const updated: ScreenBlueprint = {
    ...blueprint,
    rules: blueprint.rules.map((candidate) =>
      candidate.id === ruleId
        ? normalizeDesignerBlueprintRuleCapabilities({ ...candidate, actions })
        : candidate,
    ),
  };
  if (updated.layout === undefined) return updated;
  const nodes = updated.layout.nodes.flatMap((node) => {
    const parsed = parseActionNodeId(node.id);
    if (parsed?.ruleId !== ruleId) return [node];
    if (parsed.actionIndex === actionIndex) return [];
    return parsed.actionIndex > actionIndex
      ? [{ ...node, id: actionBlueprintNodeId(ruleId, parsed.actionIndex - 1) }]
      : [node];
  });
  return { ...updated, layout: { ...updated.layout, nodes } };
}

export function removeRule(blueprint: ScreenBlueprint, ruleId: string): ScreenBlueprint {
  const updated = {
    ...blueprint,
    rules: blueprint.rules.filter((rule) => rule.id !== ruleId),
  };
  if (updated.layout === undefined) return updated;
  return {
    ...updated,
    layout: {
      ...updated.layout,
      nodes: updated.layout.nodes.filter(
        (node) =>
          node.id !== conditionBlueprintNodeId(ruleId) && !node.id.startsWith(`action:${ruleId}:`),
      ),
    },
  };
}

export function removeLayoutNodes(
  blueprint: ScreenBlueprint,
  ids: ReadonlySet<string>,
): ScreenBlueprint {
  return blueprint.layout === undefined
    ? blueprint
    : {
        ...blueprint,
        layout: {
          ...blueprint.layout,
          nodes: blueprint.layout.nodes.filter((node) => !ids.has(node.id)),
        },
      };
}

export function replaceDesignerBlueprintLayoutNodeId(
  blueprint: ScreenBlueprint,
  sourceId: string,
  targetId: string,
): ScreenBlueprint | null {
  const layout = blueprint.layout;
  if (layout === undefined || !layout.nodes.some((node) => node.id === sourceId)) return null;
  if (layout.nodes.some((node) => node.id === targetId)) return null;
  return {
    ...blueprint,
    layout: {
      ...layout,
      nodes: layout.nodes.map((node) => (node.id === sourceId ? { ...node, id: targetId } : node)),
    },
  };
}

export function appendDesignerBlueprintLayoutNode(
  blueprint: ScreenBlueprint,
  nodes: readonly ScreenBlueprintLayoutNode[],
  id: string,
  position: DesignerBlueprintNodePosition | undefined,
): ScreenBlueprint {
  const resolved = validPosition(position) ? position : nextDesignerBlueprintNodePosition(nodes);
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

export function parseEdgeId(
  id: string,
): { readonly ruleId: string; readonly actionIndex?: number } | null {
  if (!id.startsWith('edge:')) return null;
  const value = id.slice('edge:'.length);
  if (value.endsWith(':trigger')) return { ruleId: value.slice(0, -':trigger'.length) };
  const marker = value.lastIndexOf(':action:');
  if (marker < 1) return null;
  const actionIndex = Number(value.slice(marker + ':action:'.length));
  return Number.isInteger(actionIndex) ? { ruleId: value.slice(0, marker), actionIndex } : null;
}

export function parseActionNodeId(
  id: string,
): { readonly ruleId: string; readonly actionIndex: number } | null {
  if (!id.startsWith('action:')) return null;
  const value = id.slice('action:'.length);
  const marker = value.lastIndexOf(':');
  if (marker < 1) return null;
  const actionIndex = Number(value.slice(marker + 1));
  return Number.isInteger(actionIndex) ? { ruleId: value.slice(0, marker), actionIndex } : null;
}

export function nextRuleId(blueprint: ScreenBlueprint, value: string): string {
  const existing = new Set(blueprint.rules.map((rule) => rule.id));
  const base =
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 56) || 'event-rule';
  let index = 1;
  let candidate = `${base}-${index}`;
  while (existing.has(candidate)) candidate = `${base}-${++index}`;
  return candidate;
}

function nextDesignerBlueprintNodePosition(
  nodes: readonly ScreenBlueprintLayoutNode[],
): DesignerBlueprintNodePosition {
  const index = nodes.length;
  return { x: 72 + (index % 3) * 320, y: 72 + Math.floor(index / 3) * 224 };
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
