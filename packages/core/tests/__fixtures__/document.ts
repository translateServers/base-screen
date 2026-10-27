import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintCondition,
  ScreenBlueprintLayout,
  ScreenBlueprintRelation,
  ScreenBlueprintTrigger,
  ScreenCanvas,
  ScreenComponentNode,
  ScreenDocument,
  ScreenStaticVariable,
} from '@base-screen/contracts';

export const DEFAULT_CANVAS: ScreenCanvas = {
  width: 1920,
  height: 1080,
  backgroundColor: '#000000',
};

export function makeComponent(
  overrides: Partial<ScreenComponentNode> & { id?: string } = {},
): ScreenComponentNode {
  const id = overrides.id ?? 'c1';
  return {
    id,
    type: 'acme.kpi-card',
    name: `Component ${id}`,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

export function makeVariable(
  overrides: Partial<ScreenStaticVariable> & { name?: string } = {},
): ScreenStaticVariable {
  return {
    type: 'static',
    id: overrides.id ?? overrides.name ?? 'var1',
    name: overrides.name ?? 'var1',
    initialValue: overrides.initialValue ?? null,
    ...overrides,
  };
}

export function makeDocument(overrides: MakeDocumentOverrides = {}): ScreenDocument {
  const { blueprint, ...rest } = overrides;
  const normalizedBlueprint =
    blueprint === undefined
      ? { relations: [] }
      : 'relations' in blueprint
        ? blueprint
        : {
            relations: relationsFromRules(blueprint.rules),
            ...(blueprint.layout === undefined ? {} : { layout: blueprint.layout }),
          };
  return {
    canvas: DEFAULT_CANVAS,
    components: [],
    variables: [],
    blueprint: normalizedBlueprint,
    ...rest,
  };
}

interface LegacyRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly condition?: ScreenBlueprintCondition;
  readonly requiredCapabilities?: readonly string[];
  readonly actions: readonly ScreenBlueprintAction[];
}

interface LegacyBlueprint {
  readonly rules: readonly LegacyRule[];
  readonly layout?: ScreenBlueprintLayout;
}

type MakeDocumentOverrides = Omit<Partial<ScreenDocument>, 'blueprint'> & {
  readonly blueprint?: ScreenBlueprint | LegacyBlueprint;
};

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

/**
 * Build a chain of `depth` ancestors where each component parents the next.
 * The first component is a root (parentId: null). Returns components in
 * document order (root first, deepest descendant last).
 */
export function makeAncestorChain(
  depth: number,
  options: { locked?: boolean; hidden?: boolean } = {},
): ScreenComponentNode[] {
  const components: ScreenComponentNode[] = [];
  for (let index = 0; index <= depth; index++) {
    const id = `chain-${index}`;
    components.push(
      makeComponent({
        id,
        name: `Chain ${index}`,
        parentId: index === 0 ? null : `chain-${index - 1}`,
        zIndex: index,
        status: {
          locked: options.locked ?? false,
          hidden: options.hidden ?? false,
        },
      }),
    );
  }
  return components;
}
