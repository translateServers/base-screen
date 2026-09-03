import type { ScreenBlueprintLayoutNode, ScreenDocument } from '@base-screen/contracts';

export interface DesignerBlueprintNodePosition {
  readonly x: number;
  readonly y: number;
}

export type DesignerBlueprintUnconnectedNodeKind = 'condition' | 'set-variable' | 'emit-host-event';

export interface DesignerBlueprintUnconnectedNodeId {
  readonly kind: DesignerBlueprintUnconnectedNodeKind;
  readonly variableToken?: string;
}

export function componentBlueprintNodeId(componentId: string): string {
  return `component:${componentId}`;
}

export function variableBlueprintNodeId(variableId: string): string {
  return `variable:${variableId}`;
}

export function conditionBlueprintNodeId(ruleId: string): string {
  return `condition:${ruleId}`;
}

export function actionBlueprintNodeId(ruleId: string, actionIndex: number): string {
  return `action:${ruleId}:${actionIndex}`;
}

export function nextDesignerBlueprintUnconnectedNodeId(
  nodes: readonly ScreenBlueprintLayoutNode[],
  kind: DesignerBlueprintUnconnectedNodeKind,
  variableId?: string,
): string {
  const used = new Set(nodes.map((node) => node.id));
  const variableToken =
    kind === 'set-variable'
      ? variableId === undefined
        ? 'auto'
        : designerBlueprintVariableToken(variableId)
      : undefined;
  let sequence = 1;
  while (true) {
    const id =
      kind === 'set-variable'
        ? `unconnected:${kind}:${variableToken}:${sequence}`
        : `unconnected:${kind}:${sequence}`;
    if (!used.has(id)) return id;
    sequence++;
  }
}

export function parseDesignerBlueprintUnconnectedNodeId(
  id: string,
): DesignerBlueprintUnconnectedNodeId | null {
  const segments = id.split(':');
  if (segments[0] !== 'unconnected') return null;
  const sequence = Number(segments.at(-1));
  if (!Number.isInteger(sequence) || sequence < 1) return null;
  if (segments.length === 3 && (segments[1] === 'condition' || segments[1] === 'emit-host-event')) {
    return { kind: segments[1] };
  }
  if (
    segments.length === 4 &&
    segments[1] === 'set-variable' &&
    segments[2] !== undefined &&
    /^[a-z0-9]+$/u.test(segments[2])
  ) {
    return { kind: segments[1], variableToken: segments[2] };
  }
  return null;
}

export function resolveDesignerBlueprintUnconnectedVariable(
  document: ScreenDocument,
  node: DesignerBlueprintUnconnectedNodeId,
): string | undefined {
  if (node.kind !== 'set-variable') return undefined;
  if (node.variableToken === 'auto') return document.variables[0]?.id;
  const matches = document.variables.filter(
    (variable) => designerBlueprintVariableToken(variable.id) === node.variableToken,
  );
  return matches.length === 1 ? matches[0]?.id : undefined;
}

export function materializeDesignerBlueprintLayoutNodes(
  document: ScreenDocument,
): readonly ScreenBlueprintLayoutNode[] {
  if (document.blueprint.layout !== undefined) return document.blueprint.layout.nodes;
  const nodes = new Map<string, ScreenBlueprintLayoutNode>();
  const componentIndexes = new Map(
    document.components.map((component, index) => [component.id, index] as const),
  );
  const addComponent = (componentId: string): void => {
    const index = componentIndexes.get(componentId) ?? 0;
    const id = componentBlueprintNodeId(componentId);
    if (!nodes.has(id)) nodes.set(id, { id, x: 72, y: 72 + index * 252 });
  };
  document.blueprint.rules.forEach((rule, ruleIndex) => {
    if (rule.trigger.type === 'material-event') addComponent(rule.trigger.componentId);
    else {
      const variableId = variableBlueprintNodeId(rule.trigger.variableId);
      if (!nodes.has(variableId))
        nodes.set(variableId, { id: variableId, x: 72, y: 72 + ruleIndex * 252 });
    }
    if (rule.condition !== undefined) {
      const id = conditionBlueprintNodeId(rule.id);
      nodes.set(id, { id, x: 440, y: 72 + ruleIndex * 164 });
    }
    rule.actions.forEach((action, actionIndex) => {
      if (action.type === 'component-visibility') {
        addComponent(action.componentId);
        return;
      }
      const id = actionBlueprintNodeId(rule.id, actionIndex);
      nodes.set(id, { id, x: 784, y: 72 + (ruleIndex * 3 + actionIndex) * 132 });
    });
  });
  return [...nodes.values()];
}

function designerBlueprintVariableToken(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
