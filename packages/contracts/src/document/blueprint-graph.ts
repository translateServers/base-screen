import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintEdge,
  ScreenBlueprintFlowEdge,
  ScreenBlueprintNode,
  ScreenBlueprintNodeKind,
  ScreenBlueprintRule,
  ScreenBlueprintRuleStep,
  ScreenBlueprintTrigger,
  ScreenBlueprintValueExpression,
} from '../types/document.js';
import { SCREEN_BLUEPRINT_CAPABILITIES } from './blueprint-capabilities.js';
import { MAX_BLUEPRINT_RULE_STEPS } from './limits.js';

/**
 * 蓝图节点图的锚点词汇与派生规则（ADR-0107 §2.2、§2.3）。
 *
 * 锚点 id 是封闭词汇：固定词按节点种类取值；组件事件与宿主出口带 `event:` / `action:` 前缀，
 * 后缀分别沿用事件名（`VARIABLE_NAME_PATTERN`）与宿主动作 id（`COMPONENT_ID_PATTERN`）的词法。
 */

const EVENT_PORT_PATTERN = /^event:[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const ACTION_PORT_PATTERN = /^action:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const SCREEN_BLUEPRINT_EVENT_PORT_PREFIX = 'event:';
export const SCREEN_BLUEPRINT_ACTION_PORT_PREFIX = 'action:';

/** 组件显隐动作的三个输入锚点，锚点 id 即显隐操作。 */
export const SCREEN_BLUEPRINT_VISIBILITY_PORTS = ['show', 'hide', 'toggle'] as const;

/** 组件状态锚点（ADR-0110 §2.4）：只在组件声明了状态时可用（由 `references.ts` 判定）。 */
export const SCREEN_BLUEPRINT_COMPONENT_STATE_INPUT_PORTS = ['set-state', 'reset-state'] as const;
export const SCREEN_BLUEPRINT_COMPONENT_STATE_OUTPUT_PORT = 'state-changed';

/**
 * 从画布节点的输入（打开 / 关闭 / 切换）与输出（已打开 / 已关闭）锚点（ADR-0109 §2.4）。
 * 与显示方式无关：页面上的文案是「进入 / 返回 / 已进入 / 已离开」，锚点 id 不变。
 */
export const SCREEN_BLUEPRINT_SUB_CANVAS_INPUT_PORTS = ['open', 'close', 'toggle'] as const;
export const SCREEN_BLUEPRINT_SUB_CANVAS_OUTPUT_PORTS = ['opened', 'closed'] as const;
/** 主画布节点（页面导航）的输入与输出锚点。 */
export const SCREEN_BLUEPRINT_MAIN_CANVAS_INPUT_PORTS = ['previous', 'next', 'back'] as const;
export const SCREEN_BLUEPRINT_MAIN_CANVAS_OUTPUT_PORTS = ['page-changed'] as const;

/** 各节点种类的固定输入锚点（不含 `event:` / `action:` 前缀锚点）。 */
export const SCREEN_BLUEPRINT_FIXED_INPUT_PORTS: Readonly<
  Record<ScreenBlueprintNodeKind, readonly string[]>
> = {
  component: [
    'show',
    'hide',
    'toggle',
    'request-data',
    ...SCREEN_BLUEPRINT_COMPONENT_STATE_INPUT_PORTS,
  ],
  variable: ['set', 'request'],
  host: [],
  lifecycle: [],
  timer: [],
  condition: ['judge'],
  'sub-canvas': [...SCREEN_BLUEPRINT_SUB_CANVAS_INPUT_PORTS],
  'main-canvas': [...SCREEN_BLUEPRINT_MAIN_CANVAS_INPUT_PORTS],
};

/** 各节点种类的固定输出锚点（组件事件锚点 `event:<name>` 另计）。 */
export const SCREEN_BLUEPRINT_FIXED_OUTPUT_PORTS: Readonly<
  Record<ScreenBlueprintNodeKind, readonly string[]>
> = {
  component: [SCREEN_BLUEPRINT_COMPONENT_STATE_OUTPUT_PORT],
  variable: ['data-updated'],
  host: [],
  lifecycle: ['ready'],
  timer: ['tick'],
  condition: ['yes', 'no'],
  'sub-canvas': [...SCREEN_BLUEPRINT_SUB_CANVAS_OUTPUT_PORTS],
  'main-canvas': [...SCREEN_BLUEPRINT_MAIN_CANVAS_OUTPUT_PORTS],
};

/** 锚点 id 的词法（不判定属于哪个节点种类）；JSON Schema 与 zod 共用。 */
export const SCREEN_BLUEPRINT_PORT_PATTERN =
  '^(?:[a-z][a-z-]{0,31}|event:[A-Za-z_][A-Za-z0-9_]{0,127}|action:[A-Za-z0-9][A-Za-z0-9._:-]{0,127})$';

export function screenBlueprintEventPort(eventName: string): string {
  return `${SCREEN_BLUEPRINT_EVENT_PORT_PREFIX}${eventName}`;
}

export function screenBlueprintActionPort(actionId: string): string {
  return `${SCREEN_BLUEPRINT_ACTION_PORT_PREFIX}${actionId}`;
}

/** `event:<name>` → `name`；不是事件锚点时返回 `undefined`。 */
export function readScreenBlueprintEventPort(port: string): string | undefined {
  return EVENT_PORT_PATTERN.test(port)
    ? port.slice(SCREEN_BLUEPRINT_EVENT_PORT_PREFIX.length)
    : undefined;
}

/** `action:<id>` → `id`；不是动作锚点时返回 `undefined`。 */
export function readScreenBlueprintActionPort(port: string): string | undefined {
  return ACTION_PORT_PATTERN.test(port)
    ? port.slice(SCREEN_BLUEPRINT_ACTION_PORT_PREFIX.length)
    : undefined;
}

/** 输出锚点形态是否属于该节点种类（组件事件是否真在 manifest 中由编译期与作者面判定）。 */
export function isScreenBlueprintOutputPort(kind: ScreenBlueprintNodeKind, port: string): boolean {
  if (kind === 'component') {
    return EVENT_PORT_PATTERN.test(port) || port === SCREEN_BLUEPRINT_COMPONENT_STATE_OUTPUT_PORT;
  }
  return SCREEN_BLUEPRINT_FIXED_OUTPUT_PORTS[kind].includes(port);
}

/** 输入锚点形态是否属于该节点种类（宿主出口是否已声明由编译期与作者面判定）。 */
export function isScreenBlueprintInputPort(kind: ScreenBlueprintNodeKind, port: string): boolean {
  if (kind === 'host') return EVENT_PORT_PATTERN.test(port) || ACTION_PORT_PATTERN.test(port);
  return SCREEN_BLUEPRINT_FIXED_INPUT_PORTS[kind].includes(port);
}

/** 连线附加字段在该目标锚点上的要求：`required` 必填、`optional` 可选、`forbidden` 不得出现。 */
export interface ScreenBlueprintEdgeFieldRule {
  readonly value: 'required' | 'forbidden';
  /** 宿主出口必带；弹框 `open` / `toggle` 可带（打开参数）；其余不得出现。 */
  readonly payload: 'required' | 'optional' | 'forbidden';
  readonly transition: 'optional' | 'forbidden';
  /** 组件 `set-state` 必带；其余不得出现。 */
  readonly stateId: 'required' | 'forbidden';
}

export function screenBlueprintEdgeFieldRule(
  targetKind: ScreenBlueprintNodeKind,
  targetPort: string,
): ScreenBlueprintEdgeFieldRule {
  return {
    value: targetKind === 'variable' && targetPort === 'set' ? 'required' : 'forbidden',
    payload:
      targetKind === 'host'
        ? 'required'
        : targetKind === 'sub-canvas' && (targetPort === 'open' || targetPort === 'toggle')
          ? 'optional'
          : 'forbidden',
    transition:
      targetKind === 'component' &&
      (SCREEN_BLUEPRINT_VISIBILITY_PORTS as readonly string[]).includes(targetPort)
        ? 'optional'
        : 'forbidden',
    stateId: targetKind === 'component' && targetPort === 'set-state' ? 'required' : 'forbidden',
  };
}

/** 面向作者面的五类连线：交互联动、数据共享、流程控制、业务出口、语义关联。 */
export type ScreenBlueprintEdgeCategory = 'interaction' | 'data' | 'flow' | 'exit' | 'semantic';

export function readScreenBlueprintEdgeCategory(
  edge: ScreenBlueprintEdge,
  nodeKind: (nodeId: string) => ScreenBlueprintNodeKind | undefined,
): ScreenBlueprintEdgeCategory {
  if (edge.kind === 'semantic') return 'semantic';
  const source = nodeKind(edge.from.node);
  const target = nodeKind(edge.to.node);
  if (target === 'host') return 'exit';
  if (target === 'variable' || source === 'variable') return 'data';
  if (
    target === 'condition' ||
    source === 'condition' ||
    source === 'timer' ||
    source === 'lifecycle'
  ) {
    return 'flow';
  }
  return 'interaction';
}

/** 连线落在目标锚点上执行的运行时动作；目标不是动作锚点（如条件的 `judge`）时返回 `undefined`。 */
export function screenBlueprintEdgeAction(
  edge: ScreenBlueprintFlowEdge,
  target: ScreenBlueprintNode,
): ScreenBlueprintAction | undefined {
  const port = edge.to.port;
  if (target.kind === 'component') {
    if (port === 'show' || port === 'hide' || port === 'toggle') {
      return {
        type: 'component-visibility',
        componentId: target.componentId,
        operation: port,
        ...(edge.transition === undefined ? {} : { transition: edge.transition }),
      };
    }
    if (port === 'request-data') {
      return { type: 'request-component-data', componentId: target.componentId };
    }
    if (port === 'set-state' && edge.stateId !== undefined) {
      return {
        type: 'component-state',
        componentId: target.componentId,
        operation: 'set',
        stateId: edge.stateId,
      };
    }
    if (port === 'reset-state') {
      return { type: 'component-state', componentId: target.componentId, operation: 'reset' };
    }
    return undefined;
  }
  if (target.kind === 'variable') {
    if (port === 'set' && edge.value !== undefined) {
      return { type: 'set-variable', variableId: target.variableId, value: edge.value };
    }
    if (port === 'request') return { type: 'request-variable', variableId: target.variableId };
    return undefined;
  }
  if (target.kind === 'sub-canvas') {
    if (port === 'close') {
      return { type: 'canvas-visibility', canvasId: target.canvasId, operation: port };
    }
    if (port !== 'open' && port !== 'toggle') return undefined;
    return {
      type: 'canvas-visibility',
      canvasId: target.canvasId,
      operation: port,
      ...(edge.payload === undefined ? {} : { payload: edge.payload }),
    };
  }
  if (target.kind === 'main-canvas') {
    return port === 'previous' || port === 'next' || port === 'back'
      ? { type: 'page-navigation', operation: port }
      : undefined;
  }
  if (target.kind === 'host' && edge.payload !== undefined) {
    const eventName = readScreenBlueprintEventPort(port);
    if (eventName !== undefined) {
      return { type: 'emit-host-event', eventName, payload: edge.payload };
    }
    const actionId = readScreenBlueprintActionPort(port);
    if (actionId !== undefined) return { type: 'host-action', actionId, payload: edge.payload };
  }
  return undefined;
}

/** 输出锚点作为触发源时的运行时触发器；不是触发锚点（条件 `yes` / `no`）时返回 `undefined`。 */
export function screenBlueprintPortTrigger(
  node: ScreenBlueprintNode,
  port: string,
): ScreenBlueprintTrigger | undefined {
  switch (node.kind) {
    case 'component': {
      if (port === SCREEN_BLUEPRINT_COMPONENT_STATE_OUTPUT_PORT) {
        return {
          type: 'component-state-changed',
          componentId: node.componentId,
          eventName: 'state-changed',
        };
      }
      const eventName = readScreenBlueprintEventPort(port);
      return eventName === undefined
        ? undefined
        : { type: 'material-event', componentId: node.componentId, eventName };
    }
    case 'variable':
      return port === 'data-updated'
        ? { type: 'variable-event', variableId: node.variableId, eventName: 'data-updated' }
        : undefined;
    case 'lifecycle':
      return port === 'ready' ? { type: 'lifecycle', eventName: 'ready' } : undefined;
    case 'timer':
      return port === 'tick'
        ? { type: 'timer', eventName: 'tick', intervalSeconds: node.intervalSeconds }
        : undefined;
    case 'sub-canvas':
      return port === 'opened' || port === 'closed'
        ? { type: 'canvas-event', canvasId: node.canvasId, eventName: port }
        : undefined;
    case 'main-canvas':
      return port === 'page-changed'
        ? { type: 'page-changed', eventName: 'page-changed' }
        : undefined;
    default:
      return undefined;
  }
}

/** 规则编译失败的原因；只在路径爆炸时出现（结构合法性由解析器保证）。 */
export class ScreenBlueprintRuleLimitError extends Error {
  readonly ruleId: string;

  constructor(ruleId: string) {
    super(`Blueprint rule "${ruleId}" exceeds ${MAX_BLUEPRINT_RULE_STEPS} compiled steps.`);
    this.ruleId = ruleId;
  }
}

const derivedRuleCache = new WeakMap<ScreenBlueprint, readonly ScreenBlueprintRule[]>();

/**
 * 节点图 → 派生规则的唯一权威（ADR-0107 §2.3）。
 *
 * 每个启用节点的每个有连线的触发锚点编为一条规则；规则按 `nodes` 顺序、节点内按锚点首次出现顺序排列。
 * 步骤按深度优先展开：同一锚点的连线按 `edges` 中的顺序；条件节点展开为带 `yes` / `no` 分支的条件步骤；
 * 停用的条件截断路径，停用的动作目标被跳过。规则不持久化，WeakMap 缓存、纯读。
 * 解析器已拒绝条件子图成环；单条规则展开超过 `MAX_BLUEPRINT_RULE_STEPS` 步时抛出
 * `ScreenBlueprintRuleLimitError`（校验阶段把它转成 `DOCUMENT_LIMIT_EXCEEDED`）。
 */
export function deriveScreenBlueprintRules(
  blueprint: ScreenBlueprint,
): readonly ScreenBlueprintRule[] {
  const cached = derivedRuleCache.get(blueprint);
  if (cached !== undefined) return cached;
  const nodes = new Map<string, ScreenBlueprintNode>();
  for (const node of blueprint.nodes) nodes.set(node.id, node);
  const outgoing = new Map<string, ScreenBlueprintFlowEdge[]>();
  const triggerPorts = new Map<string, string[]>();
  for (const edge of blueprint.edges) {
    if (edge.kind !== 'flow') continue;
    const key = portKey(edge.from.node, edge.from.port);
    const list = outgoing.get(key);
    if (list === undefined) {
      outgoing.set(key, [edge]);
      const ports = triggerPorts.get(edge.from.node);
      if (ports === undefined) triggerPorts.set(edge.from.node, [edge.from.port]);
      else ports.push(edge.from.port);
    } else {
      list.push(edge);
    }
  }
  const rules: ScreenBlueprintRule[] = [];
  for (const node of blueprint.nodes) {
    if (node.enabled === false) continue;
    for (const port of triggerPorts.get(node.id) ?? []) {
      const trigger = screenBlueprintPortTrigger(node, port);
      if (trigger === undefined) continue;
      const ruleId = `${node.id}/${port}`;
      const capabilities = new Set<string>([triggerCapability(trigger)]);
      const budget = { steps: 0, ruleId };
      const steps = walk(node.id, port, nodes, outgoing, capabilities, budget, new Set());
      if (steps.length === 0) continue;
      rules.push({
        id: ruleId,
        nodeId: node.id,
        trigger,
        requiredCapabilities: [...capabilities].sort(),
        steps,
      });
    }
  }
  derivedRuleCache.set(blueprint, rules);
  return rules;
}

function walk(
  nodeId: string,
  port: string,
  nodes: ReadonlyMap<string, ScreenBlueprintNode>,
  outgoing: ReadonlyMap<string, readonly ScreenBlueprintFlowEdge[]>,
  capabilities: Set<string>,
  budget: { steps: number; readonly ruleId: string },
  visiting: Set<string>,
): ScreenBlueprintRuleStep[] {
  const steps: ScreenBlueprintRuleStep[] = [];
  for (const edge of outgoing.get(portKey(nodeId, port)) ?? []) {
    const target = nodes.get(edge.to.node);
    if (target === undefined || target.enabled === false) continue;
    budget.steps += 1;
    if (budget.steps > MAX_BLUEPRINT_RULE_STEPS)
      throw new ScreenBlueprintRuleLimitError(budget.ruleId);
    for (const capability of edge.requiredCapabilities ?? []) capabilities.add(capability);
    if (target.kind === 'condition') {
      // 解析器保证条件子图无环；这里的守卫只防御未经解析的输入。
      if (edge.to.port !== 'judge' || visiting.has(target.id)) continue;
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.condition);
      collectExpressionCapabilities(target.condition.left, capabilities);
      if (target.condition.right !== undefined) {
        collectExpressionCapabilities(target.condition.right, capabilities);
      }
      visiting.add(target.id);
      const yes = walk(target.id, 'yes', nodes, outgoing, capabilities, budget, visiting);
      const no = walk(target.id, 'no', nodes, outgoing, capabilities, budget, visiting);
      visiting.delete(target.id);
      steps.push({
        type: 'condition',
        edgeId: edge.id,
        nodeId: target.id,
        condition: target.condition,
        yes,
        no,
      });
      continue;
    }
    const action = screenBlueprintEdgeAction(edge, target);
    if (action === undefined) continue;
    collectActionCapabilities(action, capabilities);
    steps.push({ type: 'action', edgeId: edge.id, action });
  }
  return steps;
}

/** 规则内全部动作（深度优先顺序，含所有分支）；能力检查与静态分析用。 */
export function screenBlueprintRuleActions(
  rule: ScreenBlueprintRule,
): readonly ScreenBlueprintAction[] {
  const actions: ScreenBlueprintAction[] = [];
  const visit = (steps: readonly ScreenBlueprintRuleStep[]): void => {
    for (const step of steps) {
      if (step.type === 'action') actions.push(step.action);
      else {
        visit(step.yes);
        visit(step.no);
      }
    }
  };
  visit(rule.steps);
  return actions;
}

function portKey(nodeId: string, port: string): string {
  return `${nodeId}\u0000${port}`;
}

function triggerCapability(trigger: ScreenBlueprintTrigger): string {
  switch (trigger.type) {
    case 'material-event':
      return SCREEN_BLUEPRINT_CAPABILITIES.materialEvent;
    case 'variable-event':
      return SCREEN_BLUEPRINT_CAPABILITIES.variableEvent;
    case 'lifecycle':
      return SCREEN_BLUEPRINT_CAPABILITIES.lifecycle;
    case 'timer':
      return SCREEN_BLUEPRINT_CAPABILITIES.timer;
    case 'canvas-event':
      return SCREEN_BLUEPRINT_CAPABILITIES.canvasEvent;
    case 'page-changed':
      return SCREEN_BLUEPRINT_CAPABILITIES.pageChanged;
    case 'component-state-changed':
      return SCREEN_BLUEPRINT_CAPABILITIES.componentStateChanged;
  }
}

function collectActionCapabilities(action: ScreenBlueprintAction, capabilities: Set<string>): void {
  switch (action.type) {
    case 'set-variable':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.setVariable);
      collectExpressionCapabilities(action.value, capabilities);
      return;
    case 'emit-host-event':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.emitHostEvent);
      collectExpressionCapabilities(action.payload, capabilities);
      return;
    case 'host-action':
      collectExpressionCapabilities(action.payload, capabilities);
      return;
    case 'component-visibility':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.componentVisibility);
      return;
    case 'request-variable':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestVariable);
      return;
    case 'request-component-data':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestComponentData);
      return;
    case 'canvas-visibility':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.canvasVisibility);
      if (action.payload !== undefined) collectExpressionCapabilities(action.payload, capabilities);
      return;
    case 'page-navigation':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.pageNavigation);
      return;
    case 'component-state':
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.componentState);
      return;
  }
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
