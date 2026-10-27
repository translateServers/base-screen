import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';

const BLUEPRINT_FIELDS = new Set(['relations', 'layout']);
const BEHAVIOR_RELATION_FIELDS = new Set([
  'type',
  'id',
  'source',
  'condition',
  'target',
  'effect',
  'requiredCapabilities',
]);
const SEMANTIC_RELATION_FIELDS = new Set(['type', 'id', 'source', 'target', 'role']);
const RELATION_SOURCE_COMPONENT_FIELDS = new Set(['kind', 'componentId', 'event']);
const RELATION_SOURCE_VARIABLE_FIELDS = new Set(['kind', 'variableId', 'event']);
const RELATION_SOURCE_EVENT_FIELDS = new Set(['type', 'eventName']);
const RELATION_TARGET_COMPONENT_FIELDS = new Set(['kind', 'componentId']);
const RELATION_TARGET_VARIABLE_FIELDS = new Set(['kind', 'variableId']);
const RELATION_TARGET_HOST_FIELDS = new Set(['kind']);
const COMPONENT_VISIBILITY_EFFECT_FIELDS = new Set(['type', 'operation', 'transition']);
const REQUEST_COMPONENT_DATA_EFFECT_FIELDS = new Set(['type']);
const SET_VARIABLE_EFFECT_FIELDS = new Set(['type', 'value']);
const REQUEST_VARIABLE_EFFECT_FIELDS = new Set(['type']);
const EMIT_HOST_EVENT_EFFECT_FIELDS = new Set(['type', 'eventName', 'payload']);
const HOST_ACTION_EFFECT_FIELDS = new Set(['type', 'actionId', 'payload']);
// 未知 type 的兜底字段集：让 Zod 报出无效判别值，而不是被严格键检查抢先拒绝。
const UNKNOWN_EFFECT_FIELDS = new Set([
  'type',
  'operation',
  'transition',
  'value',
  'eventName',
  'payload',
  'actionId',
]);
const COMPONENT_VISIBILITY_TRANSITION_FIELDS = new Set(['effect', 'durationMs', 'easing']);
const BLUEPRINT_LAYOUT_FIELDS = new Set(['nodes', 'viewport']);
const BLUEPRINT_LAYOUT_NODE_FIELDS = new Set(['id', 'x', 'y', 'collapsed']);
const BLUEPRINT_LAYOUT_VIEWPORT_FIELDS = new Set(['x', 'y', 'zoom']);
const BLUEPRINT_CONDITION_FIELDS = new Set(['left', 'operator', 'right']);

export function validateBlueprintStrictKeys(
  blueprint: Record<string, unknown>,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!checkStrictObjectKeys(blueprint, BLUEPRINT_FIELDS, at(['blueprint']), collector, phase)) {
    return false;
  }
  validateLayoutStrictKeys(blueprint.layout, at, collector, phase);
  if (Array.isArray(blueprint.relations)) {
    for (let index = 0; index < blueprint.relations.length; index++) {
      validateRelationStrictKeys(blueprint.relations[index], index, at, collector, phase);
    }
  }
  return true;
}

function validateLayoutStrictKeys(
  layout: unknown,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
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

function validateRelationStrictKeys(
  relation: unknown,
  index: number,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  const base = ['blueprint', 'relations', index] as DiagnosticSegment[];
  if (!isJsonObject(relation)) return;
  const semantic = relation.type === 'semantic';
  if (
    !checkStrictObjectKeys(
      relation,
      semantic ? SEMANTIC_RELATION_FIELDS : BEHAVIOR_RELATION_FIELDS,
      at(base),
      collector,
      phase,
    )
  ) {
    return;
  }
  validateSourceStrictKeys(relation.source, [...base, 'source'], at, collector, phase);
  if (semantic) {
    validateTargetStrictKeys(relation.target, [...base, 'target'], at, collector, phase);
    return;
  }
  if (
    isJsonObject(relation.condition) &&
    !checkStrictObjectKeys(
      relation.condition,
      BLUEPRINT_CONDITION_FIELDS,
      at([...base, 'condition']),
      collector,
      phase,
    )
  ) {
    return;
  }
  validateTargetStrictKeys(relation.target, [...base, 'target'], at, collector, phase);
  validateEffectStrictKeys(relation.effect, [...base, 'effect'], at, collector, phase);
}

function validateSourceStrictKeys(
  source: unknown,
  base: DiagnosticSegment[],
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(source)) return;
  checkStrictObjectKeys(
    source,
    source.kind === 'variable' ? RELATION_SOURCE_VARIABLE_FIELDS : RELATION_SOURCE_COMPONENT_FIELDS,
    at(base),
    collector,
    phase,
  );
  if (isJsonObject(source.event)) {
    checkStrictObjectKeys(
      source.event,
      RELATION_SOURCE_EVENT_FIELDS,
      at([...base, 'event']),
      collector,
      phase,
    );
  }
}

function validateTargetStrictKeys(
  target: unknown,
  base: DiagnosticSegment[],
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(target)) return;
  const fields =
    target.kind === 'variable'
      ? RELATION_TARGET_VARIABLE_FIELDS
      : target.kind === 'host'
        ? RELATION_TARGET_HOST_FIELDS
        : RELATION_TARGET_COMPONENT_FIELDS;
  checkStrictObjectKeys(target, fields, at(base), collector, phase);
}

function validateEffectStrictKeys(
  effect: unknown,
  base: DiagnosticSegment[],
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(effect)) return;
  const fields =
    effect.type === 'component-visibility'
      ? COMPONENT_VISIBILITY_EFFECT_FIELDS
      : effect.type === 'request-component-data'
        ? REQUEST_COMPONENT_DATA_EFFECT_FIELDS
        : effect.type === 'set-variable'
          ? SET_VARIABLE_EFFECT_FIELDS
          : effect.type === 'request-variable'
            ? REQUEST_VARIABLE_EFFECT_FIELDS
            : effect.type === 'emit-host-event'
              ? EMIT_HOST_EVENT_EFFECT_FIELDS
              : effect.type === 'host-action'
                ? HOST_ACTION_EFFECT_FIELDS
                : UNKNOWN_EFFECT_FIELDS;
  checkStrictObjectKeys(effect, fields, at(base), collector, phase);
  if (effect.type === 'component-visibility' && isJsonObject(effect.transition)) {
    checkStrictObjectKeys(
      effect.transition,
      COMPONENT_VISIBILITY_TRANSITION_FIELDS,
      at([...base, 'transition']),
      collector,
      phase,
    );
  }
}
