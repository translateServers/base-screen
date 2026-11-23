import {
  isScreenBlueprintInputPort,
  isScreenBlueprintOutputPort,
  readScreenBlueprintActionPort,
  type ScreenBlueprint,
  type ScreenBlueprintCondition,
  type ScreenBlueprintEdge,
  type ScreenBlueprintFlowEdge,
  type ScreenBlueprintLayoutNode,
  type ScreenBlueprintLayoutViewport,
  type ScreenBlueprintNode,
  type ScreenBlueprintNodeKind,
  type ScreenBlueprintSemanticRole,
  type ScreenBlueprintValueExpression,
  type ScreenBlueprintVisibilityTransition,
  type ScreenDocument,
  screenBlueprintEdgeFieldRule,
} from '@base-screen/contracts';

/**
 * 蓝图节点图的作者期操作（ADR-0107 §2.1、§2.6）。
 *
 * 全部是纯函数：输入当前蓝图（必要时连同文档），输出新蓝图或 `null`（拒绝）。结构合法性的最终裁决仍是
 * contracts 的文档解析；这里提前拒绝作者面能识别的非法操作（锚点不属于节点、重复连线、条件成环），
 * 并为新连线补齐目标锚点要求的附加字段默认值。
 */

export interface DesignerBlueprintNodePosition {
  readonly x: number;
  readonly y: number;
}

/** 单例节点 id：宿主（业务系统）与实例就绪。 */
export const HOST_BLUEPRINT_NODE_ID = 'host';
export const LIFECYCLE_BLUEPRINT_NODE_ID = 'lifecycle';
/** 语义连线在画布上的锚点：组件节点右侧的独立圆点，不进入文档。 */
export const SEMANTIC_BLUEPRINT_PORT = 'semantic';

export const DEFAULT_BLUEPRINT_TIMER_SECONDS = 5;
export const DEFAULT_BLUEPRINT_TRANSITION: ScreenBlueprintVisibilityTransition = {
  effect: 'fade',
  durationMs: 200,
  easing: 'ease-in-out-quad',
};
export const DEFAULT_BLUEPRINT_CONDITION: ScreenBlueprintCondition = {
  left: { kind: 'event-payload', path: [] },
  operator: 'exists',
};

export function componentBlueprintNodeId(componentId: string): string {
  return `component:${componentId}`;
}

export function variableBlueprintNodeId(variableId: string): string {
  return `variable:${variableId}`;
}

export function findBlueprintNode(
  blueprint: ScreenBlueprint,
  nodeId: string,
): ScreenBlueprintNode | undefined {
  return blueprint.nodes.find((node) => node.id === nodeId);
}

export function findBlueprintEdge(
  blueprint: ScreenBlueprint,
  edgeId: string,
): ScreenBlueprintEdge | undefined {
  return blueprint.edges.find((edge) => edge.id === edgeId);
}

export function findComponentBlueprintNode(
  blueprint: ScreenBlueprint,
  componentId: string,
): ScreenBlueprintNode | undefined {
  return blueprint.nodes.find(
    (node) => node.kind === 'component' && node.componentId === componentId,
  );
}

export function subCanvasBlueprintNodeId(canvasId: string): string {
  return `canvas:${canvasId}`;
}

export const MAIN_CANVAS_BLUEPRINT_NODE_ID = 'main-canvas';

export function findSubCanvasBlueprintNode(
  blueprint: ScreenBlueprint,
  canvasId: string,
): ScreenBlueprintNode | undefined {
  return blueprint.nodes.find((node) => node.kind === 'sub-canvas' && node.canvasId === canvasId);
}

export function findVariableBlueprintNode(
  blueprint: ScreenBlueprint,
  variableId: string,
): ScreenBlueprintNode | undefined {
  return blueprint.nodes.find((node) => node.kind === 'variable' && node.variableId === variableId);
}

/** 在已用 id 之外分配 `<prefix>-<n>`；节点与连线共用一个 id 空间，便于选择与诊断定位。 */
export function allocateBlueprintId(blueprint: ScreenBlueprint, prefix: string): string {
  const used = new Set<string>();
  for (const node of blueprint.nodes) used.add(node.id);
  for (const edge of blueprint.edges) used.add(edge.id);
  for (let index = 1; ; index++) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function preferredId(blueprint: ScreenBlueprint, preferred: string, prefix: string): string {
  const taken =
    blueprint.nodes.some((node) => node.id === preferred) ||
    blueprint.edges.some((edge) => edge.id === preferred);
  return taken ? allocateBlueprintId(blueprint, prefix) : preferred;
}

export type DesignerBlueprintNodeSpec =
  | { readonly kind: 'component'; readonly componentId: string }
  | { readonly kind: 'variable'; readonly variableId: string }
  | { readonly kind: 'sub-canvas'; readonly canvasId: string }
  | { readonly kind: 'host' }
  | { readonly kind: 'lifecycle' }
  | { readonly kind: 'main-canvas' }
  | { readonly kind: 'timer'; readonly intervalSeconds?: number; readonly name?: string }
  | {
      readonly kind: 'condition';
      readonly condition?: ScreenBlueprintCondition;
      readonly name?: string;
    };

export interface DesignerBlueprintInsertResult {
  readonly blueprint: ScreenBlueprint;
  readonly nodeId: string;
  /** 实体 / 单例节点已存在时为 false：返回已有节点，蓝图只在给了位置时移动它。 */
  readonly created: boolean;
}

/**
 * 加入节点。组件 / 变量 / 宿主 / 实例就绪各自唯一：已有节点时不重复创建；定时器与条件每次新建。
 * 引用的组件或变量不存在于文档时拒绝。
 */
export function insertDesignerBlueprintNode(
  document: ScreenDocument,
  spec: DesignerBlueprintNodeSpec,
  position?: DesignerBlueprintNodePosition,
): DesignerBlueprintInsertResult | null {
  const blueprint = document.blueprint;
  let existing: ScreenBlueprintNode | undefined;
  let created: ScreenBlueprintNode;
  switch (spec.kind) {
    case 'component':
      if (!document.components.some((component) => component.id === spec.componentId)) return null;
      existing = findComponentBlueprintNode(blueprint, spec.componentId);
      created = {
        kind: 'component',
        id: preferredId(blueprint, componentBlueprintNodeId(spec.componentId), 'component'),
        componentId: spec.componentId,
      };
      break;
    case 'variable':
      if (!document.variables.some((variable) => variable.id === spec.variableId)) return null;
      existing = findVariableBlueprintNode(blueprint, spec.variableId);
      created = {
        kind: 'variable',
        id: preferredId(blueprint, variableBlueprintNodeId(spec.variableId), 'variable'),
        variableId: spec.variableId,
      };
      break;
    case 'sub-canvas':
      if (!(document.subCanvases ?? []).some((canvas) => canvas.id === spec.canvasId)) return null;
      existing = findSubCanvasBlueprintNode(blueprint, spec.canvasId);
      created = {
        kind: 'sub-canvas',
        id: preferredId(blueprint, subCanvasBlueprintNodeId(spec.canvasId), 'canvas'),
        canvasId: spec.canvasId,
      };
      break;
    case 'host':
    case 'lifecycle':
    case 'main-canvas':
      existing = blueprint.nodes.find((node) => node.kind === spec.kind);
      created = {
        kind: spec.kind,
        id: preferredId(
          blueprint,
          spec.kind === 'host'
            ? HOST_BLUEPRINT_NODE_ID
            : spec.kind === 'lifecycle'
              ? LIFECYCLE_BLUEPRINT_NODE_ID
              : MAIN_CANVAS_BLUEPRINT_NODE_ID,
          spec.kind,
        ),
      };
      break;
    case 'timer': {
      const intervalSeconds = spec.intervalSeconds ?? DEFAULT_BLUEPRINT_TIMER_SECONDS;
      if (!isTimerInterval(intervalSeconds)) return null;
      created = {
        kind: 'timer',
        id: allocateBlueprintId(blueprint, 'timer'),
        intervalSeconds,
        ...(spec.name === undefined ? {} : { name: spec.name }),
      };
      break;
    }
    case 'condition':
      created = {
        kind: 'condition',
        id: allocateBlueprintId(blueprint, 'condition'),
        condition: spec.condition ?? DEFAULT_BLUEPRINT_CONDITION,
        ...(spec.name === undefined ? {} : { name: spec.name }),
      };
      break;
  }
  if (existing !== undefined) {
    return {
      blueprint: position === undefined ? blueprint : placeNode(blueprint, existing.id, position),
      nodeId: existing.id,
      created: false,
    };
  }
  const withNode: ScreenBlueprint = { ...blueprint, nodes: [...blueprint.nodes, created] };
  return {
    blueprint: position === undefined ? withNode : placeNode(withNode, created.id, position),
    nodeId: created.id,
    created: true,
  };
}

export type DesignerBlueprintConnectionFailureReason =
  | 'invalid'
  | 'duplicate'
  | 'cycle'
  | 'unavailable';

export type DesignerBlueprintConnectionResult =
  | { readonly ok: true; readonly blueprint: ScreenBlueprint; readonly edgeId: string }
  | { readonly ok: false; readonly reason: DesignerBlueprintConnectionFailureReason };

export interface DesignerBlueprintConnectionContext {
  /** 组件节点的事件锚点是否可连（manifest 声明且能力可用）。 */
  readonly isEventAvailable: (componentId: string, eventName: string) => boolean;
  /** 宿主动作锚点是否已声明；宿主事件锚点总可连（事件名由作者决定）。 */
  readonly isHostActionAvailable: (actionId: string) => boolean;
}

/**
 * 连线：输出锚点 → 输入锚点；两端都是组件节点且锚点为 `semantic` 时连语义线。
 * 新连线按目标锚点补默认附加字段：变量 `set` 写入事件负载、宿主出口传递事件负载、组件显隐带淡入过渡。
 */
export function connectDesignerBlueprintPorts(
  blueprint: ScreenBlueprint,
  from: { readonly node: string; readonly port: string },
  to: { readonly node: string; readonly port: string },
  context: DesignerBlueprintConnectionContext,
): DesignerBlueprintConnectionResult {
  const source = findBlueprintNode(blueprint, from.node);
  const target = findBlueprintNode(blueprint, to.node);
  if (source === undefined || target === undefined || source.id === target.id) {
    return { ok: false, reason: 'invalid' };
  }
  if (from.port === SEMANTIC_BLUEPRINT_PORT || to.port === SEMANTIC_BLUEPRINT_PORT) {
    if (
      source.kind !== 'component' ||
      target.kind !== 'component' ||
      from.port !== SEMANTIC_BLUEPRINT_PORT ||
      to.port !== SEMANTIC_BLUEPRINT_PORT
    ) {
      return { ok: false, reason: 'invalid' };
    }
    if (
      blueprint.edges.some(
        (edge) =>
          edge.kind === 'semantic' && edge.from.node === source.id && edge.to.node === target.id,
      )
    ) {
      return { ok: false, reason: 'duplicate' };
    }
    const edgeId = allocateBlueprintId(blueprint, 'semantic');
    return {
      ok: true,
      edgeId,
      blueprint: {
        ...blueprint,
        edges: [
          ...blueprint.edges,
          {
            kind: 'semantic',
            id: edgeId,
            from: { node: source.id },
            to: { node: target.id },
            role: 'related',
          },
        ],
      },
    };
  }
  if (
    !isScreenBlueprintOutputPort(source.kind, from.port) ||
    !isScreenBlueprintInputPort(target.kind, to.port)
  ) {
    return { ok: false, reason: 'invalid' };
  }
  if (source.kind === 'component') {
    const eventName = from.port.slice('event:'.length);
    if (!context.isEventAvailable(source.componentId, eventName)) {
      return { ok: false, reason: 'unavailable' };
    }
  }
  const actionId = readScreenBlueprintActionPort(to.port);
  if (
    target.kind === 'host' &&
    actionId !== undefined &&
    !context.isHostActionAvailable(actionId)
  ) {
    return { ok: false, reason: 'unavailable' };
  }
  if (
    blueprint.edges.some(
      (edge) =>
        edge.kind === 'flow' &&
        edge.from.node === source.id &&
        edge.from.port === from.port &&
        edge.to.node === target.id &&
        edge.to.port === to.port,
    )
  ) {
    return { ok: false, reason: 'duplicate' };
  }
  if (
    source.kind === 'condition' &&
    target.kind === 'condition' &&
    conditionReaches(blueprint, target.id, source.id)
  ) {
    return { ok: false, reason: 'cycle' };
  }
  const rule = screenBlueprintEdgeFieldRule(target.kind, to.port);
  const edgeId = allocateBlueprintId(blueprint, 'edge');
  const edge: ScreenBlueprintFlowEdge = {
    kind: 'flow',
    id: edgeId,
    from: { node: source.id, port: from.port },
    to: { node: target.id, port: to.port },
    ...(rule.value === 'required' ? { value: { kind: 'event-payload', path: [] } } : {}),
    ...(rule.payload === 'required' ? { payload: { kind: 'event-payload', path: [] } } : {}),
    ...(rule.transition === 'optional' ? { transition: DEFAULT_BLUEPRINT_TRANSITION } : {}),
  };
  return { ok: true, edgeId, blueprint: { ...blueprint, edges: [...blueprint.edges, edge] } };
}

/** 条件子图里从 `fromId` 能否走到 `toId`（只沿条件 → 条件的连线）。 */
function conditionReaches(blueprint: ScreenBlueprint, fromId: string, toId: string): boolean {
  const kinds = new Map(blueprint.nodes.map((node) => [node.id, node.kind] as const));
  const stack = [fromId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === toId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of blueprint.edges) {
      if (
        edge.kind === 'flow' &&
        edge.from.node === current &&
        kinds.get(edge.to.node) === 'condition'
      ) {
        stack.push(edge.to.node);
      }
    }
  }
  return false;
}

/** 删除节点：一并删除其全部连线与布局位置。 */
export function removeDesignerBlueprintNodes(
  blueprint: ScreenBlueprint,
  nodeIds: ReadonlySet<string>,
): ScreenBlueprint {
  if (!blueprint.nodes.some((node) => nodeIds.has(node.id))) return blueprint;
  return withLayout(
    {
      ...blueprint,
      nodes: blueprint.nodes.filter((node) => !nodeIds.has(node.id)),
      edges: blueprint.edges.filter(
        (edge) => !nodeIds.has(edge.from.node) && !nodeIds.has(edge.to.node),
      ),
    },
    blueprint.layout?.nodes.filter((node) => !nodeIds.has(node.id)),
  );
}

export function removeDesignerBlueprintEdges(
  blueprint: ScreenBlueprint,
  edgeIds: ReadonlySet<string>,
): ScreenBlueprint {
  if (!blueprint.edges.some((edge) => edgeIds.has(edge.id))) return blueprint;
  return { ...blueprint, edges: blueprint.edges.filter((edge) => !edgeIds.has(edge.id)) };
}

/** 删除选区：节点（含连线）与连线混合；空选区或全部不存在时返回 `null`。 */
export function deleteDesignerBlueprintSelection(
  blueprint: ScreenBlueprint,
  selection: { readonly nodes: readonly string[]; readonly edges: readonly string[] },
): ScreenBlueprint | null {
  const nodes = new Set(selection.nodes);
  const edges = new Set(selection.edges);
  const next = removeDesignerBlueprintEdges(removeDesignerBlueprintNodes(blueprint, nodes), edges);
  return next === blueprint ? null : next;
}

/** 文档删除了组件 / 变量：移除引用它们的实体节点（及连线、布局）。 */
export function pruneDesignerBlueprintEntities(
  blueprint: ScreenBlueprint,
  removed: {
    readonly componentIds?: ReadonlySet<string>;
    readonly variableIds?: ReadonlySet<string>;
    readonly subCanvasIds?: ReadonlySet<string>;
  },
): ScreenBlueprint {
  const nodeIds = new Set<string>();
  for (const node of blueprint.nodes) {
    if (node.kind === 'component' && removed.componentIds?.has(node.componentId)) {
      nodeIds.add(node.id);
    }
    if (node.kind === 'sub-canvas' && removed.subCanvasIds?.has(node.canvasId)) {
      nodeIds.add(node.id);
    }
    if (node.kind === 'variable' && removed.variableIds?.has(node.variableId)) nodeIds.add(node.id);
  }
  return nodeIds.size === 0 ? blueprint : removeDesignerBlueprintNodes(blueprint, nodeIds);
}

export type DesignerBlueprintNodePatch =
  | { readonly type: 'name'; readonly name: string | null }
  | { readonly type: 'interval'; readonly intervalSeconds: number }
  | { readonly type: 'condition'; readonly condition: ScreenBlueprintCondition }
  | { readonly type: 'enabled'; readonly enabled: boolean };

export function updateDesignerBlueprintNode(
  blueprint: ScreenBlueprint,
  nodeId: string,
  patch: DesignerBlueprintNodePatch,
): ScreenBlueprint | null {
  const node = findBlueprintNode(blueprint, nodeId);
  if (node === undefined) return null;
  let next: ScreenBlueprintNode;
  switch (patch.type) {
    case 'name': {
      if (node.kind !== 'timer' && node.kind !== 'condition') return null;
      const { name: _name, ...rest } = node;
      const trimmed = patch.name?.trim() ?? '';
      next = trimmed === '' ? rest : { ...rest, name: trimmed };
      break;
    }
    case 'interval':
      if (node.kind !== 'timer' || !isTimerInterval(patch.intervalSeconds)) return null;
      next = { ...node, intervalSeconds: patch.intervalSeconds };
      break;
    case 'condition':
      if (node.kind !== 'condition') return null;
      next = { ...node, condition: patch.condition };
      break;
    case 'enabled': {
      const { enabled: _enabled, ...rest } = node;
      next = patch.enabled ? rest : { ...rest, enabled: false };
      break;
    }
  }
  return replaceNode(blueprint, next);
}

export function setDesignerBlueprintNodesEnabled(
  blueprint: ScreenBlueprint,
  nodeIds: ReadonlySet<string>,
  enabled: boolean,
): ScreenBlueprint {
  let next = blueprint;
  for (const id of nodeIds) {
    next = updateDesignerBlueprintNode(next, id, { type: 'enabled', enabled }) ?? next;
  }
  return next;
}

export type DesignerBlueprintEdgePatch =
  | { readonly type: 'value'; readonly value: ScreenBlueprintValueExpression }
  /** `null` 去掉参数：只对参数可选的锚点（弹框打开 / 切换）有效。 */
  | { readonly type: 'payload'; readonly payload: ScreenBlueprintValueExpression | null }
  | { readonly type: 'transition'; readonly transition: ScreenBlueprintVisibilityTransition | null }
  | { readonly type: 'role'; readonly role: ScreenBlueprintSemanticRole }
  /** 改目标锚点（如显示 → 隐藏）；附加字段按新锚点的要求保留、补齐或去掉。 */
  | { readonly type: 'target-port'; readonly port: string };

export function updateDesignerBlueprintEdge(
  blueprint: ScreenBlueprint,
  edgeId: string,
  patch: DesignerBlueprintEdgePatch,
): ScreenBlueprint | null {
  const edge = findBlueprintEdge(blueprint, edgeId);
  if (edge === undefined) return null;
  if (patch.type === 'role') {
    return edge.kind === 'semantic' ? replaceEdge(blueprint, { ...edge, role: patch.role }) : null;
  }
  if (edge.kind !== 'flow') return null;
  const target = findBlueprintNode(blueprint, edge.to.node);
  if (target === undefined) return null;
  const rule = screenBlueprintEdgeFieldRule(target.kind, edge.to.port);
  switch (patch.type) {
    case 'value':
      return rule.value === 'required'
        ? replaceEdge(blueprint, { ...edge, value: patch.value })
        : null;
    case 'payload': {
      if (rule.payload === 'forbidden') return null;
      if (patch.payload !== null)
        return replaceEdge(blueprint, { ...edge, payload: patch.payload });
      if (rule.payload !== 'optional') return null;
      const { payload: _payload, ...rest } = edge;
      return replaceEdge(blueprint, rest);
    }
    case 'transition': {
      if (rule.transition !== 'optional') return null;
      const { transition: _transition, ...rest } = edge;
      return replaceEdge(
        blueprint,
        patch.transition === null ? rest : { ...rest, transition: patch.transition },
      );
    }
    case 'target-port': {
      if (!isScreenBlueprintInputPort(target.kind, patch.port)) return null;
      if (
        blueprint.edges.some(
          (other) =>
            other.kind === 'flow' &&
            other.id !== edge.id &&
            other.from.node === edge.from.node &&
            other.from.port === edge.from.port &&
            other.to.node === edge.to.node &&
            other.to.port === patch.port,
        )
      ) {
        return null;
      }
      const nextRule = screenBlueprintEdgeFieldRule(target.kind, patch.port);
      const { value, payload, transition, ...rest } = edge;
      return replaceEdge(blueprint, {
        ...rest,
        to: { node: edge.to.node, port: patch.port },
        ...(nextRule.value === 'required'
          ? { value: value ?? { kind: 'event-payload', path: [] } }
          : {}),
        ...(nextRule.payload === 'required'
          ? { payload: payload ?? { kind: 'event-payload', path: [] } }
          : nextRule.payload === 'optional' && payload !== undefined
            ? { payload }
            : {}),
        ...(nextRule.transition === 'optional' && transition !== undefined ? { transition } : {}),
      });
    }
  }
}

/**
 * 调整同源连线的执行顺序（深度优先按 `edges` 顺序，ADR-0107 §2.3）：与同一输出锚点的上一条 / 下一条
 * 连线交换位置。已在端点时返回 `null`。
 */
export function reorderDesignerBlueprintEdge(
  blueprint: ScreenBlueprint,
  edgeId: string,
  direction: 'earlier' | 'later',
): ScreenBlueprint | null {
  const index = blueprint.edges.findIndex((edge) => edge.id === edgeId);
  const edge = blueprint.edges[index];
  if (edge === undefined || edge.kind !== 'flow') return null;
  const siblings = blueprint.edges
    .map((candidate, position) => ({ candidate, position }))
    .filter(
      ({ candidate }) =>
        candidate.kind === 'flow' &&
        candidate.from.node === edge.from.node &&
        candidate.from.port === edge.from.port,
    );
  const order = siblings.findIndex(({ position }) => position === index);
  const swap = siblings[direction === 'earlier' ? order - 1 : order + 1];
  if (swap === undefined) return null;
  const edges = [...blueprint.edges];
  edges[index] = swap.candidate;
  edges[swap.position] = edge;
  return { ...blueprint, edges };
}

/** 同源连线中的执行序号（从 1 起）与同源总数；不是 flow 连线时返回 `undefined`。 */
export function readDesignerBlueprintEdgeOrder(
  blueprint: ScreenBlueprint,
  edgeId: string,
): { readonly order: number; readonly count: number } | undefined {
  const edge = findBlueprintEdge(blueprint, edgeId);
  if (edge === undefined || edge.kind !== 'flow') return undefined;
  const siblings = blueprint.edges.filter(
    (candidate) =>
      candidate.kind === 'flow' &&
      candidate.from.node === edge.from.node &&
      candidate.from.port === edge.from.port,
  );
  return { order: siblings.indexOf(edge) + 1, count: siblings.length };
}

/**
 * 复制节点：只复制可重复的定时器与条件节点，连同复制集合内部的连线；实体与单例节点不可复制。
 * 新节点相对原节点平移 `offset`。没有可复制节点时返回 `null`。
 */
export function duplicateDesignerBlueprintNodes(
  blueprint: ScreenBlueprint,
  nodeIds: readonly string[],
  offset: DesignerBlueprintNodePosition = { x: 32, y: 32 },
): { readonly blueprint: ScreenBlueprint; readonly nodeIds: readonly string[] } | null {
  const sources = blueprint.nodes.filter(
    (node) => nodeIds.includes(node.id) && (node.kind === 'timer' || node.kind === 'condition'),
  );
  if (sources.length === 0) return null;
  let next = blueprint;
  const mapping = new Map<string, string>();
  for (const node of sources) {
    const id = allocateBlueprintId(next, node.kind);
    mapping.set(node.id, id);
    next = { ...next, nodes: [...next.nodes, { ...node, id }] };
    const position = blueprint.layout?.nodes.find((entry) => entry.id === node.id);
    if (position !== undefined) {
      next = placeNode(next, id, { x: position.x + offset.x, y: position.y + offset.y });
    }
  }
  for (const edge of blueprint.edges) {
    if (edge.kind !== 'flow') continue;
    const from = mapping.get(edge.from.node);
    const to = mapping.get(edge.to.node);
    if (from === undefined || to === undefined) continue;
    next = {
      ...next,
      edges: [
        ...next.edges,
        {
          ...edge,
          id: allocateBlueprintId(next, 'edge'),
          from: { node: from, port: edge.from.port },
          to: { node: to, port: edge.to.port },
        },
      ],
    };
  }
  return { blueprint: next, nodeIds: [...mapping.values()] };
}

/** 布局提交：只保留仍存在的节点的位置。 */
export function commitDesignerBlueprintLayout(
  blueprint: ScreenBlueprint,
  nodes: readonly ScreenBlueprintLayoutNode[],
  viewport?: ScreenBlueprintLayoutViewport,
): ScreenBlueprint {
  const ids = new Set(blueprint.nodes.map((node) => node.id));
  const effectiveViewport = viewport ?? blueprint.layout?.viewport;
  return {
    ...blueprint,
    layout: {
      nodes: nodes.filter((node) => ids.has(node.id)),
      ...(effectiveViewport === undefined ? {} : { viewport: effectiveViewport }),
    },
  };
}

export function commitDesignerBlueprintViewport(
  blueprint: ScreenBlueprint,
  viewport: ScreenBlueprintLayoutViewport,
): ScreenBlueprint {
  return { ...blueprint, layout: { nodes: blueprint.layout?.nodes ?? [], viewport } };
}

/** 蓝图里引用该变量的位置：变量节点、条件表达式、连线写入值 / 负载。 */
export function designerBlueprintReferencesVariable(
  blueprint: ScreenBlueprint,
  variableId: string,
): boolean {
  if (findVariableBlueprintNode(blueprint, variableId) !== undefined) return true;
  for (const node of blueprint.nodes) {
    if (
      node.kind === 'condition' &&
      (expressionReferencesVariable(node.condition.left, variableId) ||
        (node.condition.right !== undefined &&
          expressionReferencesVariable(node.condition.right, variableId)))
    ) {
      return true;
    }
  }
  return blueprint.edges.some(
    (edge) =>
      edge.kind === 'flow' &&
      ((edge.value !== undefined && expressionReferencesVariable(edge.value, variableId)) ||
        (edge.payload !== undefined && expressionReferencesVariable(edge.payload, variableId))),
  );
}

export function expressionReferencesVariable(
  expression: ScreenBlueprintValueExpression,
  variableId: string,
): boolean {
  if (expression.kind === 'variable') return expression.variableId === variableId;
  if (expression.kind === 'array') {
    return expression.items.some((item) => expressionReferencesVariable(item, variableId));
  }
  if (expression.kind === 'object') {
    return Object.values(expression.properties).some((item) =>
      expressionReferencesVariable(item, variableId),
    );
  }
  return false;
}

/** 连线上游最近的触发节点（跳过条件节点）；用于判断写入值能否取事件字段。 */
export function designerBlueprintEdgeTriggers(
  blueprint: ScreenBlueprint,
  edgeId: string,
): readonly { readonly node: ScreenBlueprintNode; readonly port: string }[] {
  const edge = findBlueprintEdge(blueprint, edgeId);
  if (edge === undefined || edge.kind !== 'flow') return [];
  const result: { node: ScreenBlueprintNode; port: string }[] = [];
  const seen = new Set<string>();
  const visit = (nodeId: string, port: string): void => {
    const node = findBlueprintNode(blueprint, nodeId);
    if (node === undefined) return;
    if (node.kind !== 'condition') {
      if (!result.some((entry) => entry.node.id === node.id && entry.port === port)) {
        result.push({ node, port });
      }
      return;
    }
    if (seen.has(node.id)) return;
    seen.add(node.id);
    for (const incoming of blueprint.edges) {
      if (incoming.kind === 'flow' && incoming.to.node === node.id) {
        visit(incoming.from.node, incoming.from.port);
      }
    }
  };
  visit(edge.from.node, edge.from.port);
  return result;
}

export function blueprintNodeKindOf(
  blueprint: ScreenBlueprint,
): (nodeId: string) => ScreenBlueprintNodeKind | undefined {
  const kinds = new Map(blueprint.nodes.map((node) => [node.id, node.kind] as const));
  return (nodeId) => kinds.get(nodeId);
}

/**
 * 把分片节点图并入文档蓝图（ADR-0100 F5、ADR-0107）：组件节点的 `componentId`（分片 key）改写为新组件 id，
 * 节点 / 连线 id 在文档内去重；宿主与实例就绪并入文档已有单例；与已有连线重复的连线跳过。
 */
export function mergeDesignerBlueprintFragment(
  blueprint: ScreenBlueprint,
  fragment: {
    readonly nodes: readonly ScreenBlueprintNode[];
    readonly edges: readonly ScreenBlueprintEdge[];
  },
  componentIdsByKey: ReadonlyMap<string, string>,
): { readonly blueprint: ScreenBlueprint; readonly edgeIds: readonly string[] } {
  let next = blueprint;
  const nodeIds = new Map<string, string>();
  for (const node of fragment.nodes) {
    if (node.kind === 'host' || node.kind === 'lifecycle') {
      const existing = next.nodes.find((candidate) => candidate.kind === node.kind);
      if (existing !== undefined) {
        nodeIds.set(node.id, existing.id);
        continue;
      }
    }
    const id = uniqueBlueprintId(next, node.id);
    nodeIds.set(node.id, id);
    const mapped: ScreenBlueprintNode =
      node.kind === 'component'
        ? { ...node, id, componentId: componentIdsByKey.get(node.componentId) ?? node.componentId }
        : { ...node, id };
    next = { ...next, nodes: [...next.nodes, mapped] };
  }
  const edgeIds: string[] = [];
  for (const edge of fragment.edges) {
    const from = nodeIds.get(edge.from.node);
    const to = nodeIds.get(edge.to.node);
    if (from === undefined || to === undefined) continue;
    const duplicate = next.edges.some(
      (candidate) =>
        candidate.kind === edge.kind &&
        candidate.from.node === from &&
        candidate.to.node === to &&
        (candidate.kind === 'semantic' ||
          (edge.kind === 'flow' &&
            candidate.from.port === edge.from.port &&
            candidate.to.port === edge.to.port)),
    );
    if (duplicate) continue;
    const id = uniqueBlueprintId(next, edge.id);
    edgeIds.push(id);
    const mapped: ScreenBlueprintEdge =
      edge.kind === 'semantic'
        ? { ...edge, id, from: { node: from }, to: { node: to } }
        : {
            ...edge,
            id,
            from: { node: from, port: edge.from.port },
            to: { node: to, port: edge.to.port },
          };
    next = { ...next, edges: [...next.edges, mapped] };
  }
  return { blueprint: next, edgeIds };
}

/**
 * 从文档蓝图取出只涉及所选组件的子图（「将选区存为分片」）：组件节点的 `componentId` 改写为分片 key；
 * 两端都在子图里的连线保留，连到子图外的连线与引用变量的连线计为舍弃。条件 / 定时器 / 宿主 /
 * 实例就绪节点只在被保留的连线用到时带上。
 */
export function extractDesignerBlueprintFragment(
  blueprint: ScreenBlueprint,
  componentKeys: ReadonlyMap<string, string>,
): {
  readonly nodes: readonly ScreenBlueprintNode[];
  readonly edges: readonly ScreenBlueprintEdge[];
  readonly dropped: number;
} {
  const nodes = new Map(blueprint.nodes.map((node) => [node.id, node]));
  const inside = (node: ScreenBlueprintNode | undefined): boolean =>
    node !== undefined &&
    node.kind !== 'variable' &&
    // 主 / 从画布是文档级画板（ADR-0109），分片带不走：连到画布节点的连线计为舍弃。
    node.kind !== 'sub-canvas' &&
    node.kind !== 'main-canvas' &&
    (node.kind !== 'component' || componentKeys.has(node.componentId));
  const touches = (node: ScreenBlueprintNode | undefined): boolean =>
    node?.kind === 'component' && componentKeys.has(node.componentId);
  const kept: ScreenBlueprintEdge[] = [];
  let dropped = 0;
  for (const edge of blueprint.edges) {
    const source = nodes.get(edge.from.node);
    const target = nodes.get(edge.to.node);
    if (!touches(source) && !touches(target) && !(inside(source) && inside(target))) continue;
    const usesVariable =
      edge.kind === 'flow' &&
      ((edge.value !== undefined && expressionUsesAnyVariable(edge.value)) ||
        (edge.payload !== undefined && expressionUsesAnyVariable(edge.payload)));
    if (!inside(source) || !inside(target) || usesVariable) {
      if (touches(source) || touches(target)) dropped++;
      continue;
    }
    kept.push(edge);
  }
  // 只保留至少连到一个所选组件的连通分量，避免把文档里无关的条件链带进分片。
  const used = new Set<string>();
  let changed = true;
  for (const node of blueprint.nodes) if (touches(node)) used.add(node.id);
  while (changed) {
    changed = false;
    for (const edge of kept) {
      const a = used.has(edge.from.node);
      const b = used.has(edge.to.node);
      if (a !== b) {
        used.add(edge.from.node);
        used.add(edge.to.node);
        changed = true;
      }
    }
  }
  const edges = kept.filter((edge) => used.has(edge.from.node) && used.has(edge.to.node));
  const conditionUsesVariable = (node: ScreenBlueprintNode): boolean =>
    node.kind === 'condition' &&
    (expressionUsesAnyVariable(node.condition.left) ||
      (node.condition.right !== undefined && expressionUsesAnyVariable(node.condition.right)));
  const blocked = new Set(blueprint.nodes.filter(conditionUsesVariable).map((node) => node.id));
  const finalEdges = edges.filter(
    (edge) => !blocked.has(edge.from.node) && !blocked.has(edge.to.node),
  );
  dropped += edges.length - finalEdges.length;
  const finalIds = new Set<string>();
  for (const node of blueprint.nodes) if (touches(node)) finalIds.add(node.id);
  for (const edge of finalEdges) {
    finalIds.add(edge.from.node);
    finalIds.add(edge.to.node);
  }
  const extracted = blueprint.nodes
    .filter((node) => finalIds.has(node.id) && !blocked.has(node.id))
    .map((node) =>
      node.kind === 'component'
        ? { ...node, componentId: componentKeys.get(node.componentId) ?? node.componentId }
        : node,
    );
  return { nodes: extracted, edges: finalEdges, dropped };
}

function expressionUsesAnyVariable(expression: ScreenBlueprintValueExpression): boolean {
  if (expression.kind === 'variable') return true;
  if (expression.kind === 'array') return expression.items.some(expressionUsesAnyVariable);
  if (expression.kind === 'object') {
    return Object.values(expression.properties).some(expressionUsesAnyVariable);
  }
  return false;
}

function uniqueBlueprintId(blueprint: ScreenBlueprint, base: string): string {
  const taken = (id: string) =>
    blueprint.nodes.some((node) => node.id === id) ||
    blueprint.edges.some((edge) => edge.id === id);
  if (!taken(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (candidate.length <= 128 && !taken(candidate)) return candidate;
    if (candidate.length > 128) return allocateBlueprintId(blueprint, 'node');
  }
}

export function isTimerInterval(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 86_400;
}

function replaceNode(blueprint: ScreenBlueprint, next: ScreenBlueprintNode): ScreenBlueprint {
  return {
    ...blueprint,
    nodes: blueprint.nodes.map((node) => (node.id === next.id ? next : node)),
  };
}

function replaceEdge(blueprint: ScreenBlueprint, next: ScreenBlueprintEdge): ScreenBlueprint {
  return {
    ...blueprint,
    edges: blueprint.edges.map((edge) => (edge.id === next.id ? next : edge)),
  };
}

function placeNode(
  blueprint: ScreenBlueprint,
  nodeId: string,
  position: DesignerBlueprintNodePosition,
): ScreenBlueprint {
  const nodes = blueprint.layout?.nodes ?? [];
  const entry = { id: nodeId, x: Math.round(position.x), y: Math.round(position.y) };
  const exists = nodes.some((node) => node.id === nodeId);
  return withLayout(
    blueprint,
    exists
      ? nodes.map((node) => (node.id === nodeId ? { ...node, ...entry } : node))
      : [...nodes, entry],
  );
}

function withLayout(
  blueprint: ScreenBlueprint,
  nodes: readonly ScreenBlueprintLayoutNode[] | undefined,
): ScreenBlueprint {
  if (nodes === undefined) return blueprint;
  return {
    ...blueprint,
    layout: {
      nodes,
      ...(blueprint.layout?.viewport === undefined ? {} : { viewport: blueprint.layout.viewport }),
    },
  };
}
