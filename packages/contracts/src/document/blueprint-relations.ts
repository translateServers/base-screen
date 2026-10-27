import { serializeCanonicalJson } from '../json/canonical.js';
import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintCondition,
  ScreenBlueprintRelation,
  ScreenBlueprintRelationEffect,
  ScreenBlueprintRelationTarget,
  ScreenBlueprintRule,
  ScreenBlueprintTrigger,
  ScreenBlueprintValueExpression,
} from '../types/document.js';
import type { ScreenJsonValue } from '../types/json.js';
import { SCREEN_BLUEPRINT_CAPABILITIES } from './blueprint-capabilities.js';

export type ScreenBlueprintRelationCategory = 'interaction' | 'data' | 'exit' | 'semantic';

const derivedRuleCache = new WeakMap<ScreenBlueprint, readonly ScreenBlueprintRule[]>();

interface MutableDerivedRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly condition?: ScreenBlueprintCondition;
  readonly actions: ScreenBlueprintAction[];
  readonly relationIds: string[];
  readonly capabilities: Set<string>;
}

/**
 * 关系 → 派生规则的唯一权威。
 *
 * 连续相同 `source + event + condition` 的行为关系合并成一条规则；动作顺序等于关系顺序。
 * 规则 id 取组内首条关系 id，不持久化。语义关系不产生规则。
 */
export function deriveScreenBlueprintRules(
  blueprint: ScreenBlueprint,
): readonly ScreenBlueprintRule[] {
  const cached = derivedRuleCache.get(blueprint);
  if (cached !== undefined) return cached;

  const rules: MutableDerivedRule[] = [];
  let previousGroupKey: string | undefined;
  for (const relation of blueprint.relations) {
    if (relation.type !== 'behavior') continue;
    const groupKey = behaviorRelationGroupKey(relation);
    let rule = rules[rules.length - 1];
    if (rule === undefined || previousGroupKey !== groupKey) {
      rule = {
        id: relation.id,
        trigger: triggerOf(relation),
        ...(relation.condition === undefined ? {} : { condition: relation.condition }),
        actions: [],
        relationIds: [],
        capabilities: new Set(),
      };
      rules.push(rule);
      previousGroupKey = groupKey;
    }
    rule.relationIds.push(relation.id);
    rule.actions.push(actionOf(relation));
    for (const capability of relationCapabilities(relation)) rule.capabilities.add(capability);
  }

  const derived = rules.map((rule) => ({
    id: rule.id,
    trigger: rule.trigger,
    ...(rule.condition === undefined ? {} : { condition: rule.condition }),
    actions: rule.actions,
    relationIds: rule.relationIds,
    requiredCapabilities: [...rule.capabilities].sort(),
  }));
  derivedRuleCache.set(blueprint, derived);
  return derived;
}

/** 效果类型决定目标端点的种类；Zod、引用校验与引擎连接共用这一判定。 */
export function screenBlueprintEffectTargetKind(
  effect: ScreenBlueprintRelationEffect,
): ScreenBlueprintRelationTarget['kind'] {
  switch (effect.type) {
    case 'component-visibility':
    case 'request-component-data':
      return 'component';
    case 'set-variable':
    case 'request-variable':
      return 'variable';
    case 'emit-host-event':
    case 'host-action':
      return 'host';
  }
}

/** 面向作者面的四类关系：交互联动、数据共享、业务出口、语义关联。 */
export function readScreenBlueprintRelationCategory(
  relation: ScreenBlueprintRelation,
): ScreenBlueprintRelationCategory {
  if (relation.type === 'semantic') return 'semantic';
  switch (relation.effect.type) {
    case 'component-visibility':
    case 'request-component-data':
      return 'interaction';
    case 'set-variable':
    case 'request-variable':
      return 'data';
    case 'emit-host-event':
    case 'host-action':
      return 'exit';
  }
}

/** 行为关系派生出的能力集合；`requiredCapabilities` 作为宿主附加门禁并入。 */
export function relationCapabilities(relation: ScreenBlueprintBehaviorRelation): readonly string[] {
  const capabilities = new Set<string>([
    relation.source.kind === 'component'
      ? SCREEN_BLUEPRINT_CAPABILITIES.materialEvent
      : SCREEN_BLUEPRINT_CAPABILITIES.variableEvent,
  ]);
  if (relation.condition !== undefined) {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.condition);
    collectExpressionCapabilities(relation.condition.left, capabilities);
    if (relation.condition.right !== undefined) {
      collectExpressionCapabilities(relation.condition.right, capabilities);
    }
  }
  const effect = relation.effect;
  if (effect.type === 'set-variable') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.setVariable);
    collectExpressionCapabilities(effect.value, capabilities);
  } else if (effect.type === 'emit-host-event') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.emitHostEvent);
    collectExpressionCapabilities(effect.payload, capabilities);
  } else if (effect.type === 'component-visibility') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.componentVisibility);
  } else if (effect.type === 'host-action') {
    collectExpressionCapabilities(effect.payload, capabilities);
  } else if (effect.type === 'request-variable') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestVariable);
  } else if (effect.type === 'request-component-data') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestComponentData);
  }
  for (const capability of relation.requiredCapabilities ?? []) capabilities.add(capability);
  return [...capabilities];
}

function behaviorRelationGroupKey(relation: ScreenBlueprintBehaviorRelation): string {
  const source =
    relation.source.kind === 'component'
      ? `component:${relation.source.componentId}`
      : `variable:${relation.source.variableId}`;
  const condition =
    relation.condition === undefined
      ? 'null'
      : serializeCanonicalJson(relation.condition as unknown as ScreenJsonValue);
  return `${source}\u0000${relation.source.event.eventName}\u0000${condition}`;
}

function triggerOf(relation: ScreenBlueprintBehaviorRelation): ScreenBlueprintTrigger {
  if (relation.source.kind === 'component') {
    return {
      type: 'material-event',
      componentId: relation.source.componentId,
      eventName: relation.source.event.eventName,
    };
  }
  return {
    type: 'variable-event',
    variableId: relation.source.variableId,
    eventName: relation.source.event.eventName,
  };
}

function actionOf(relation: ScreenBlueprintBehaviorRelation): ScreenBlueprintAction {
  const target = relation.target;
  const effect = relation.effect;
  switch (effect.type) {
    case 'component-visibility':
      if (target.kind !== 'component') throw unexpectedTarget(relation, 'component');
      return {
        type: 'component-visibility',
        componentId: target.componentId,
        operation: effect.operation,
        ...(effect.transition === undefined ? {} : { transition: effect.transition }),
      };
    case 'request-component-data':
      if (target.kind !== 'component') throw unexpectedTarget(relation, 'component');
      return { type: 'request-component-data', componentId: target.componentId };
    case 'set-variable':
      if (target.kind !== 'variable') throw unexpectedTarget(relation, 'variable');
      return { type: 'set-variable', variableId: target.variableId, value: effect.value };
    case 'request-variable':
      if (target.kind !== 'variable') throw unexpectedTarget(relation, 'variable');
      return { type: 'request-variable', variableId: target.variableId };
    case 'emit-host-event':
      if (target.kind !== 'host') throw unexpectedTarget(relation, 'host');
      return { type: 'emit-host-event', eventName: effect.eventName, payload: effect.payload };
    case 'host-action':
      if (target.kind !== 'host') throw unexpectedTarget(relation, 'host');
      return { type: 'host-action', actionId: effect.actionId, payload: effect.payload };
  }
}

function unexpectedTarget(
  relation: ScreenBlueprintBehaviorRelation,
  expected: ScreenBlueprintRelationTarget['kind'],
): Error {
  return new Error(
    `Blueprint relation "${relation.id}" effect "${relation.effect.type}" requires a ${expected} target.`,
  );
}

function collectExpressionCapabilities(
  expression: ScreenBlueprintValueExpression,
  capabilities: Set<string>,
): void {
  if (expression.kind === 'event-payload') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.eventPayload);
  } else if (expression.kind === 'variable') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.variable);
  } else if (expression.kind === 'array') {
    for (const item of expression.items) collectExpressionCapabilities(item, capabilities);
  } else if (expression.kind === 'object') {
    for (const item of Object.values(expression.properties)) {
      collectExpressionCapabilities(item, capabilities);
    }
  }
}
