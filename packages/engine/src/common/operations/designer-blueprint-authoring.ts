import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintRule,
  ScreenBlueprintValueExpression,
  ScreenDiagnostic,
  ScreenDocument,
} from '@base-screen/contracts';

export interface DesignerBlueprintGraphNode {
  readonly id: string;
  readonly ruleId: string;
  readonly kind: 'trigger' | 'condition' | 'action';
  readonly label: string;
}

export interface DesignerBlueprintGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface DesignerBlueprintGraphProjection {
  readonly nodes: readonly DesignerBlueprintGraphNode[];
  readonly edges: readonly DesignerBlueprintGraphEdge[];
  readonly selectedNodeId: string | undefined;
  readonly searchQuery: string;
  readonly diagnostics: readonly ScreenDiagnostic[];
  readonly simulationLog: readonly string[];
  readonly zoom: number;
}

export const DESIGNER_BLUEPRINT_CAPABILITIES = {
  materialEvent: 'blueprint.trigger.material-event',
  eventPayload: 'blueprint.value.event-payload',
  variable: 'blueprint.value.variable',
  condition: 'blueprint.condition.compare',
  setVariable: 'blueprint.action.set-variable',
  emitHostEvent: 'blueprint.action.emit-host-event',
} as const;

export function replaceDesignerBlueprintRule(
  blueprint: ScreenBlueprint,
  ruleId: string,
  update: (rule: ScreenBlueprintRule) => ScreenBlueprintRule,
): ScreenBlueprint {
  return {
    rules: blueprint.rules.map((rule) => (rule.id === ruleId ? update(rule) : rule)),
  };
}

export function addDesignerBlueprintAction(
  document: ScreenDocument,
  rule: ScreenBlueprintRule,
  type: 'set-variable' | 'emit-host-event',
): ScreenBlueprintRule {
  return withDesignerBlueprintCapabilities(
    {
      ...rule,
      actions: [
        ...rule.actions,
        type === 'set-variable'
          ? {
              type,
              variableName: document.variables[0]!.name,
              value: { kind: 'literal', value: null },
            }
          : {
              type,
              eventName: 'host_event',
              payload: { kind: 'literal', value: null },
            },
      ],
    },
    [
      type === 'set-variable'
        ? DESIGNER_BLUEPRINT_CAPABILITIES.setVariable
        : DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent,
    ],
  );
}

export function moveDesignerBlueprintRule(
  blueprint: ScreenBlueprint,
  ruleId: string,
  direction: 'up' | 'down',
): ScreenBlueprint | undefined {
  const from = blueprint.rules.findIndex((rule) => rule.id === ruleId);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= blueprint.rules.length) return undefined;
  const rules = [...blueprint.rules];
  const [rule] = rules.splice(from, 1);
  rules.splice(to, 0, rule!);
  return { rules };
}

export function updateDesignerBlueprintTrigger(
  rule: ScreenBlueprintRule,
  eventName: string,
): ScreenBlueprintRule {
  return withDesignerBlueprintCapabilities({ ...rule, trigger: { ...rule.trigger, eventName } }, [
    DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent,
  ]);
}

export function toggleDesignerBlueprintCondition(
  rule: ScreenBlueprintRule,
  enabled: boolean,
): ScreenBlueprintRule {
  if (enabled) {
    return withDesignerBlueprintCapabilities(
      {
        ...rule,
        condition: {
          left: { kind: 'literal', value: true },
          operator: 'eq',
          right: { kind: 'literal', value: true },
        },
      },
      [DESIGNER_BLUEPRINT_CAPABILITIES.condition],
    );
  }
  const { condition: _condition, ...withoutCondition } = rule;
  return pruneDesignerBlueprintCapabilities(withoutCondition);
}

export function updateDesignerBlueprintConditionOperator(
  rule: ScreenBlueprintRule,
  operator: ScreenBlueprintCondition['operator'],
): ScreenBlueprintRule {
  const condition = rule.condition!;
  return withDesignerBlueprintCapabilities(
    {
      ...rule,
      condition:
        operator === 'exists'
          ? { left: condition.left, operator }
          : {
              left: condition.left,
              operator,
              right: condition.right ?? { kind: 'literal', value: true },
            },
    },
    [DESIGNER_BLUEPRINT_CAPABILITIES.condition],
  );
}

export function updateDesignerBlueprintConditionExpression(
  rule: ScreenBlueprintRule,
  field: 'condition-left' | 'condition-right',
  expression: ScreenBlueprintValueExpression,
  capabilities: readonly string[],
): ScreenBlueprintRule {
  const condition = rule.condition!;
  return withDesignerBlueprintCapabilities(
    {
      ...rule,
      condition:
        field === 'condition-left'
          ? { ...condition, left: expression }
          : { ...condition, right: expression },
    },
    capabilities,
  );
}

export function updateDesignerBlueprintActionExpression(
  rule: ScreenBlueprintRule,
  actionIndex: number,
  expression: ScreenBlueprintValueExpression,
  capabilities: readonly string[],
): ScreenBlueprintRule {
  return withDesignerBlueprintCapabilities(
    {
      ...rule,
      actions: rule.actions.map((action, index) =>
        index !== actionIndex
          ? action
          : action.type === 'set-variable'
            ? { ...action, value: expression }
            : { ...action, payload: expression },
      ),
    },
    capabilities,
  );
}

export function updateDesignerBlueprintVariableName(
  rule: ScreenBlueprintRule,
  actionIndex: number,
  variableName: string,
): ScreenBlueprintRule {
  return withDesignerBlueprintCapabilities(
    {
      ...rule,
      actions: rule.actions.map((action, index) =>
        index === actionIndex && action.type === 'set-variable'
          ? { ...action, variableName }
          : action,
      ),
    },
    [DESIGNER_BLUEPRINT_CAPABILITIES.setVariable],
  );
}

export function updateDesignerBlueprintHostEventName(
  rule: ScreenBlueprintRule,
  actionIndex: number,
  eventName: string,
): ScreenBlueprintRule {
  return withDesignerBlueprintCapabilities(
    {
      ...rule,
      actions: rule.actions.map((action, index) =>
        index === actionIndex && action.type === 'emit-host-event'
          ? { ...action, eventName }
          : action,
      ),
    },
    [DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent],
  );
}

export function removeDesignerBlueprintAction(
  rule: ScreenBlueprintRule,
  actionIndex: number,
): ScreenBlueprintRule {
  return pruneDesignerBlueprintCapabilities({
    ...rule,
    actions: rule.actions.filter((_action, index) => index !== actionIndex),
  });
}

export function expressionCapabilities(
  expression: ScreenBlueprintValueExpression,
): readonly string[] {
  if (expression === null || typeof expression !== 'object' || Array.isArray(expression)) return [];
  switch (expression.kind) {
    case 'event-payload':
      return [DESIGNER_BLUEPRINT_CAPABILITIES.eventPayload];
    case 'variable':
      return [DESIGNER_BLUEPRINT_CAPABILITIES.variable];
    case 'array':
      return expression.items.flatMap(expressionCapabilities);
    case 'object':
      return Object.values(expression.properties).flatMap(expressionCapabilities);
    default:
      return [];
  }
}

function withDesignerBlueprintCapabilities(
  rule: ScreenBlueprintRule,
  capabilities: readonly string[],
): ScreenBlueprintRule {
  return {
    ...rule,
    requiredCapabilities: [...new Set([...(rule.requiredCapabilities ?? []), ...capabilities])],
  };
}

function pruneDesignerBlueprintCapabilities(rule: ScreenBlueprintRule): ScreenBlueprintRule {
  const used = new Set<string>([DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent]);
  if (rule.condition !== undefined) {
    used.add(DESIGNER_BLUEPRINT_CAPABILITIES.condition);
    for (const capability of expressionCapabilities(rule.condition.left)) used.add(capability);
    if (rule.condition.right !== undefined) {
      for (const capability of expressionCapabilities(rule.condition.right)) used.add(capability);
    }
  }
  for (const action of rule.actions) {
    used.add(
      action.type === 'set-variable'
        ? DESIGNER_BLUEPRINT_CAPABILITIES.setVariable
        : DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent,
    );
    for (const capability of expressionCapabilities(
      action.type === 'set-variable' ? action.value : action.payload,
    )) {
      used.add(capability);
    }
  }
  const requiredCapabilities = rule.requiredCapabilities?.filter(
    (capability) => !isDesignerBlueprintCapability(capability) || used.has(capability),
  );
  return requiredCapabilities === undefined ? rule : { ...rule, requiredCapabilities };
}

function isDesignerBlueprintCapability(capability: string): boolean {
  return Object.values(DESIGNER_BLUEPRINT_CAPABILITIES).includes(
    capability as (typeof DESIGNER_BLUEPRINT_CAPABILITIES)[keyof typeof DESIGNER_BLUEPRINT_CAPABILITIES],
  );
}
