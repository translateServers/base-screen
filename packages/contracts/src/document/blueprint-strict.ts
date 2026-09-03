import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';

const BLUEPRINT_FIELDS = new Set(['rules', 'layout']);
const BLUEPRINT_RULE_FIELDS = new Set([
  'id',
  'trigger',
  'requiredCapabilities',
  'condition',
  'actions',
]);
const MATERIAL_EVENT_TRIGGER_FIELDS = new Set(['type', 'componentId', 'eventName']);
const VARIABLE_EVENT_TRIGGER_FIELDS = new Set(['type', 'variableId', 'eventName']);
const SET_VARIABLE_ACTION_FIELDS = new Set(['type', 'variableId', 'value']);
const REQUEST_VARIABLE_ACTION_FIELDS = new Set(['type', 'variableId']);
const REQUEST_COMPONENT_DATA_ACTION_FIELDS = new Set(['type', 'componentId']);
const EMIT_HOST_EVENT_ACTION_FIELDS = new Set(['type', 'eventName', 'payload']);
const HOST_ACTION_FIELDS = new Set(['type', 'actionId', 'payload']);
const COMPONENT_VISIBILITY_ACTION_FIELDS = new Set([
  'type',
  'componentId',
  'operation',
  'transition',
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
  if (Array.isArray(blueprint.rules)) {
    for (let index = 0; index < blueprint.rules.length; index++) {
      validateRuleStrictKeys(blueprint.rules[index], index, at, collector, phase);
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

function validateRuleStrictKeys(
  rule: unknown,
  index: number,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  const base = ['blueprint', 'rules', index] as DiagnosticSegment[];
  if (
    !isJsonObject(rule) ||
    !checkStrictObjectKeys(rule, BLUEPRINT_RULE_FIELDS, at(base), collector, phase)
  ) {
    return;
  }
  if (
    isJsonObject(rule.trigger) &&
    !checkStrictObjectKeys(
      rule.trigger,
      rule.trigger.type === 'variable-event'
        ? VARIABLE_EVENT_TRIGGER_FIELDS
        : MATERIAL_EVENT_TRIGGER_FIELDS,
      at([...base, 'trigger']),
      collector,
      phase,
    )
  ) {
    return;
  }
  if (
    isJsonObject(rule.condition) &&
    !checkStrictObjectKeys(
      rule.condition,
      BLUEPRINT_CONDITION_FIELDS,
      at([...base, 'condition']),
      collector,
      phase,
    )
  ) {
    return;
  }
  if (!Array.isArray(rule.actions)) return;
  for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex++) {
    validateActionStrictKeys(rule.actions[actionIndex], actionIndex, base, at, collector, phase);
  }
}

function validateActionStrictKeys(
  action: unknown,
  actionIndex: number,
  base: DiagnosticSegment[],
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): void {
  if (!isJsonObject(action)) return;
  const fields =
    action.type === 'set-variable'
      ? SET_VARIABLE_ACTION_FIELDS
      : action.type === 'request-variable'
        ? REQUEST_VARIABLE_ACTION_FIELDS
        : action.type === 'request-component-data'
          ? REQUEST_COMPONENT_DATA_ACTION_FIELDS
          : action.type === 'emit-host-event'
            ? EMIT_HOST_EVENT_ACTION_FIELDS
            : action.type === 'component-visibility'
              ? COMPONENT_VISIBILITY_ACTION_FIELDS
              : HOST_ACTION_FIELDS;
  checkStrictObjectKeys(action, fields, at([...base, 'actions', actionIndex]), collector, phase);
  if (action.type === 'component-visibility' && isJsonObject(action.transition)) {
    checkStrictObjectKeys(
      action.transition,
      COMPONENT_VISIBILITY_TRANSITION_FIELDS,
      at([...base, 'actions', actionIndex, 'transition']),
      collector,
      phase,
    );
  }
}
