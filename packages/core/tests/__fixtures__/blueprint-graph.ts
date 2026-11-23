import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintCondition,
  ScreenBlueprintEdge,
  ScreenBlueprintNode,
  ScreenBlueprintTrigger,
} from '@base-screen/contracts';

export interface LegacyRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly condition?: ScreenBlueprintCondition;
  readonly requiredCapabilities?: readonly string[];
  readonly actions: readonly ScreenBlueprintAction[];
}

/**
 * 测试夹具：把旧的「触发 + 条件 + 动作」规则写成节点图（ADR-0107）。
 *
 * 触发与目标实体各一个节点（`component:<id>` / `variable:<id>` / `host` / `lifecycle` / `timer:<秒>`）；
 * 带条件的规则生成条件节点 `<规则 id>:condition` 与进入其 `judge` 的连线 `<规则 id>:judge`；
 * 每个动作一条连线，首条沿用规则 id，其余为 `<规则 id>-<序号>`。
 */
export function graphFromRules(
  rules: readonly LegacyRule[],
): Pick<ScreenBlueprint, 'nodes' | 'edges'> {
  const nodes: ScreenBlueprintNode[] = [];
  const edges: ScreenBlueprintEdge[] = [];
  const ensure = (node: ScreenBlueprintNode): string => {
    if (!nodes.some((candidate) => candidate.id === node.id)) nodes.push(node);
    return node.id;
  };
  for (const rule of rules) {
    const source = triggerEndpoint(rule.trigger);
    ensure(source.node);
    let from = { node: source.node.id, port: source.port };
    if (rule.condition !== undefined) {
      const conditionId = `${rule.id}:condition`;
      ensure({ kind: 'condition', id: conditionId, condition: rule.condition });
      edges.push({
        kind: 'flow',
        id: `${rule.id}:judge`,
        from,
        to: { node: conditionId, port: 'judge' },
      });
      from = { node: conditionId, port: 'yes' };
    }
    rule.actions.forEach((action, index) => {
      const target = actionEndpoint(action);
      ensure(target.node);
      edges.push({
        kind: 'flow',
        id: index === 0 ? rule.id : `${rule.id}-${index}`,
        from,
        to: { node: target.node.id, port: target.port },
        ...target.fields,
        ...(rule.requiredCapabilities === undefined
          ? {}
          : { requiredCapabilities: rule.requiredCapabilities }),
      });
    });
  }
  return { nodes, edges };
}

function triggerEndpoint(trigger: ScreenBlueprintTrigger): {
  readonly node: ScreenBlueprintNode;
  readonly port: string;
} {
  if (trigger.type === 'material-event') {
    return {
      node: {
        kind: 'component',
        id: `component:${trigger.componentId}`,
        componentId: trigger.componentId,
      },
      port: `event:${trigger.eventName}`,
    };
  }
  if (trigger.type === 'lifecycle')
    return { node: { kind: 'lifecycle', id: 'lifecycle' }, port: 'ready' };
  if (trigger.type === 'timer') {
    return {
      node: {
        kind: 'timer',
        id: `timer:${trigger.intervalSeconds}`,
        intervalSeconds: trigger.intervalSeconds,
      },
      port: 'tick',
    };
  }
  if (trigger.type === 'canvas-event') {
    return {
      node: { kind: 'sub-canvas', id: `canvas:${trigger.canvasId}`, canvasId: trigger.canvasId },
      port: trigger.eventName,
    };
  }
  if (trigger.type === 'page-changed') {
    return { node: { kind: 'main-canvas', id: 'main-canvas' }, port: 'page-changed' };
  }
  return {
    node: {
      kind: 'variable',
      id: `variable:${trigger.variableId}`,
      variableId: trigger.variableId,
    },
    port: 'data-updated',
  };
}

function actionEndpoint(action: ScreenBlueprintAction): {
  readonly node: ScreenBlueprintNode;
  readonly port: string;
  readonly fields: Partial<
    Pick<Extract<ScreenBlueprintEdge, { kind: 'flow' }>, 'value' | 'payload' | 'transition'>
  >;
} {
  switch (action.type) {
    case 'component-visibility':
      return {
        node: {
          kind: 'component',
          id: `component:${action.componentId}`,
          componentId: action.componentId,
        },
        port: action.operation,
        fields: action.transition === undefined ? {} : { transition: action.transition },
      };
    case 'request-component-data':
      return {
        node: {
          kind: 'component',
          id: `component:${action.componentId}`,
          componentId: action.componentId,
        },
        port: 'request-data',
        fields: {},
      };
    case 'set-variable':
      return {
        node: {
          kind: 'variable',
          id: `variable:${action.variableId}`,
          variableId: action.variableId,
        },
        port: 'set',
        fields: { value: action.value },
      };
    case 'request-variable':
      return {
        node: {
          kind: 'variable',
          id: `variable:${action.variableId}`,
          variableId: action.variableId,
        },
        port: 'request',
        fields: {},
      };
    case 'emit-host-event':
      return {
        node: { kind: 'host', id: 'host' },
        port: `event:${action.eventName}`,
        fields: { payload: action.payload },
      };
    case 'host-action':
      return {
        node: { kind: 'host', id: 'host' },
        port: `action:${action.actionId}`,
        fields: { payload: action.payload },
      };
    case 'canvas-visibility':
      return {
        node: { kind: 'sub-canvas', id: `canvas:${action.canvasId}`, canvasId: action.canvasId },
        port: action.operation,
        fields: action.payload === undefined ? {} : { payload: action.payload },
      };
    case 'page-navigation':
      return {
        node: { kind: 'main-canvas', id: 'main-canvas' },
        port: action.operation,
        fields: {},
      };
  }
}
