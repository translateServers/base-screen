import type {
  ScreenBlueprintAction,
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintCondition,
  ScreenBlueprintRelation,
  ScreenBlueprintTrigger,
} from '@base-screen/contracts';

interface LegacyRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly condition?: ScreenBlueprintCondition;
  readonly requiredCapabilities?: readonly string[];
  readonly actions: readonly ScreenBlueprintAction[];
}

/** 测试夹具：把旧的 actions 规则展开成关系，首条关系沿用规则 id。 */
export function relationsFromRules(
  rules: readonly LegacyRule[],
): readonly ScreenBlueprintRelation[] {
  return rules.flatMap((rule) =>
    rule.actions.map((action, actionIndex) => ({
      type: 'behavior' as const,
      id: actionIndex === 0 ? rule.id : `${rule.id}-${actionIndex}`,
      source: sourceFromTrigger(rule.trigger),
      ...(rule.condition === undefined ? {} : { condition: rule.condition }),
      ...(rule.requiredCapabilities === undefined
        ? {}
        : { requiredCapabilities: rule.requiredCapabilities }),
      ...targetAndEffect(action),
    })),
  );
}

function sourceFromTrigger(
  trigger: ScreenBlueprintTrigger,
): ScreenBlueprintBehaviorRelation['source'] {
  if (trigger.type === 'material-event') {
    return {
      kind: 'component',
      componentId: trigger.componentId,
      event: { type: 'material-event', eventName: trigger.eventName },
    };
  }
  return {
    kind: 'variable',
    variableId: trigger.variableId,
    event: { type: 'variable-event', eventName: trigger.eventName },
  };
}

function targetAndEffect(
  action: ScreenBlueprintAction,
): Pick<ScreenBlueprintBehaviorRelation, 'target' | 'effect'> {
  if (action.type === 'component-visibility') {
    return {
      target: { kind: 'component', componentId: action.componentId },
      effect: {
        type: 'component-visibility',
        operation: action.operation,
        ...(action.transition === undefined ? {} : { transition: action.transition }),
      },
    };
  }
  if (action.type === 'request-component-data') {
    return {
      target: { kind: 'component', componentId: action.componentId },
      effect: { type: 'request-component-data' },
    };
  }
  if (action.type === 'set-variable') {
    return {
      target: { kind: 'variable', variableId: action.variableId },
      effect: { type: 'set-variable', value: action.value },
    };
  }
  if (action.type === 'request-variable') {
    return {
      target: { kind: 'variable', variableId: action.variableId },
      effect: { type: 'request-variable' },
    };
  }
  if (action.type === 'emit-host-event') {
    return {
      target: { kind: 'host' },
      effect: { type: 'emit-host-event', eventName: action.eventName, payload: action.payload },
    };
  }
  return {
    target: { kind: 'host' },
    effect: { type: 'host-action', actionId: action.actionId, payload: action.payload },
  };
}
