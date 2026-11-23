import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';

const BLUEPRINT_FIELDS = new Set(['nodes', 'edges', 'layout']);
const NODE_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  component: new Set(['kind', 'id', 'componentId', 'enabled']),
  variable: new Set(['kind', 'id', 'variableId', 'enabled']),
  host: new Set(['kind', 'id', 'enabled']),
  lifecycle: new Set(['kind', 'id', 'enabled']),
  timer: new Set(['kind', 'id', 'intervalSeconds', 'name', 'enabled']),
  condition: new Set(['kind', 'id', 'condition', 'name', 'enabled']),
  'sub-canvas': new Set(['kind', 'id', 'canvasId', 'enabled']),
  'main-canvas': new Set(['kind', 'id', 'enabled']),
};
// 未知 kind 的兜底字段集：让 Zod 报出无效判别值，而不是被严格键检查抢先拒绝。
const UNKNOWN_NODE_FIELDS = new Set([
  'kind',
  'id',
  'componentId',
  'variableId',
  'canvasId',
  'intervalSeconds',
  'condition',
  'name',
  'enabled',
]);
const FLOW_EDGE_FIELDS = new Set([
  'kind',
  'id',
  'from',
  'to',
  'value',
  'payload',
  'transition',
  'stateId',
  'requiredCapabilities',
]);
const SEMANTIC_EDGE_FIELDS = new Set(['kind', 'id', 'from', 'to', 'role']);
const UNKNOWN_EDGE_FIELDS = new Set([...FLOW_EDGE_FIELDS, 'role']);
const PORT_REF_FIELDS = new Set(['node', 'port']);
const SEMANTIC_END_FIELDS = new Set(['node']);
const TRANSITION_FIELDS = new Set(['effect', 'durationMs', 'easing']);
const BLUEPRINT_LAYOUT_FIELDS = new Set(['nodes', 'viewport']);
const BLUEPRINT_LAYOUT_NODE_FIELDS = new Set(['id', 'x', 'y', 'collapsed']);
const BLUEPRINT_LAYOUT_VIEWPORT_FIELDS = new Set(['x', 'y', 'zoom']);
const BLUEPRINT_CONDITION_FIELDS = new Set(['left', 'operator', 'right']);

type At = (path: DiagnosticSegment[]) => DiagnosticSegment[];

export function validateBlueprintStrictKeys(
  blueprint: Record<string, unknown>,
  at: At,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!checkStrictObjectKeys(blueprint, BLUEPRINT_FIELDS, at(['blueprint']), collector, phase)) {
    return false;
  }
  validateLayoutStrictKeys(blueprint.layout, at, collector, phase);
  if (Array.isArray(blueprint.nodes)) {
    blueprint.nodes.forEach((node, index) => {
      validateNodeStrictKeys(node, index, at, collector, phase);
    });
  }
  if (Array.isArray(blueprint.edges)) {
    blueprint.edges.forEach((edge, index) => {
      validateEdgeStrictKeys(edge, index, at, collector, phase);
    });
  }
  return true;
}

function validateNodeStrictKeys(
  node: unknown,
  index: number,
  at: At,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(node)) return;
  const base: DiagnosticSegment[] = ['blueprint', 'nodes', index];
  const fields =
    typeof node.kind === 'string'
      ? (NODE_FIELDS[node.kind] ?? UNKNOWN_NODE_FIELDS)
      : UNKNOWN_NODE_FIELDS;
  if (!checkStrictObjectKeys(node, fields, at(base), collector, phase)) return;
  if (node.kind === 'condition' && isJsonObject(node.condition)) {
    checkStrictObjectKeys(
      node.condition,
      BLUEPRINT_CONDITION_FIELDS,
      at([...base, 'condition']),
      collector,
      phase,
    );
  }
}

function validateEdgeStrictKeys(
  edge: unknown,
  index: number,
  at: At,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(edge)) return;
  const base: DiagnosticSegment[] = ['blueprint', 'edges', index];
  const fields =
    edge.kind === 'flow'
      ? FLOW_EDGE_FIELDS
      : edge.kind === 'semantic'
        ? SEMANTIC_EDGE_FIELDS
        : UNKNOWN_EDGE_FIELDS;
  if (!checkStrictObjectKeys(edge, fields, at(base), collector, phase)) return;
  const endFields = edge.kind === 'semantic' ? SEMANTIC_END_FIELDS : PORT_REF_FIELDS;
  for (const end of ['from', 'to'] as const) {
    const value = edge[end];
    if (isJsonObject(value)) {
      checkStrictObjectKeys(value, endFields, at([...base, end]), collector, phase);
    }
  }
  if (isJsonObject(edge.transition)) {
    checkStrictObjectKeys(
      edge.transition,
      TRANSITION_FIELDS,
      at([...base, 'transition']),
      collector,
      phase,
    );
  }
}

function validateLayoutStrictKeys(
  layout: unknown,
  at: At,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(layout)) return;
  checkStrictObjectKeys(
    layout,
    BLUEPRINT_LAYOUT_FIELDS,
    at(['blueprint', 'layout']),
    collector,
    phase,
  );
  if (Array.isArray(layout.nodes)) {
    for (let index = 0; index < layout.nodes.length; index++) {
      const node = layout.nodes[index];
      if (isJsonObject(node)) {
        checkStrictObjectKeys(
          node,
          BLUEPRINT_LAYOUT_NODE_FIELDS,
          at(['blueprint', 'layout', 'nodes', index]),
          collector,
          phase,
        );
      }
    }
  }
  if (isJsonObject(layout.viewport)) {
    checkStrictObjectKeys(
      layout.viewport,
      BLUEPRINT_LAYOUT_VIEWPORT_FIELDS,
      at(['blueprint', 'layout', 'viewport']),
      collector,
      phase,
    );
  }
}
