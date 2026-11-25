import {
  readScreenBlueprintActionPort,
  readScreenBlueprintEdgeCategory,
  readScreenBlueprintEventPort,
  SCREEN_BLUEPRINT_CAPABILITIES,
  SCREEN_BLUEPRINT_FIXED_INPUT_PORTS,
  SCREEN_BLUEPRINT_FIXED_OUTPUT_PORTS,
  type ScreenBlueprintCondition,
  type ScreenBlueprintEdge,
  type ScreenBlueprintNode,
  type ScreenDocument,
  screenBlueprintPortTrigger,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { readDesignerVariableViews } from '../designer-variable-view.js';
import {
  hasDesignerBlueprintCapability,
  isDesignerBlueprintHostActionDeclared,
  listDesignerBlueprintHostActions,
} from './designer-blueprint-capabilities.js';
import {
  DESIGNER_BLUEPRINT_NODE_BORDER as CARD_BORDER,
  DESIGNER_BLUEPRINT_NODE_GAP as CARD_GAP,
  DESIGNER_BLUEPRINT_NODE_HEADER_HEIGHT as CARD_HEADER,
  DESIGNER_BLUEPRINT_NODE_MIN_HEIGHT as CARD_MIN_HEIGHT,
  DESIGNER_BLUEPRINT_NODE_PADDING as CARD_PADDING,
  DESIGNER_BLUEPRINT_NODE_ROW_HEIGHT as CARD_ROW,
} from './designer-blueprint-geometry.js';
import {
  blueprintNodeKindOf,
  type DesignerBlueprintConnectionContext,
  findComponentBlueprintNode,
  findVariableBlueprintNode,
  readDesignerBlueprintEdgeOrder,
} from './designer-blueprint-graph.js';
import type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasPort,
  BaseScreenBlueprintCanvasSimulationTrigger,
} from './designer-blueprint-protocol.js';

export * from './designer-blueprint-graph.js';
export type { DesignerBlueprintEventOption } from './designer-blueprint-model-types.js';

/**
 * 投影所需的作者面文案。common/operations 不依赖 ui-text 子层（engine-import 门禁），
 * 由浏览器层传入 `DESIGNER_UI_TEXT.blueprint`；这里只声明结构。
 */
export interface DesignerBlueprintProjectionText {
  readonly graph: {
    readonly nodeKinds: Readonly<Record<ScreenBlueprintNode['kind'], string>>;
    readonly nodeKindHints: Readonly<Record<ScreenBlueprintNode['kind'], string>>;
    readonly ports: Readonly<Record<string, string>>;
    /** 从画布锚点文案按显示方式区分（锚点 id 相同）：页面「进入 / 返回」，弹框「打开 / 关闭」。 */
    readonly subCanvasPorts: Readonly<Record<'page' | 'popup', Readonly<Record<string, string>>>>;
    readonly mainCanvasPorts: Readonly<Record<string, string>>;
    readonly subCanvasKinds: Readonly<Record<'page' | 'popup', string>>;
    readonly hostEventPort: (name: string) => string;
    readonly hostActionPort: (name: string) => string;
    readonly newHostEventPort: string;
    readonly missingEventPort: (name: string) => string;
    readonly unavailablePort: string;
    readonly missingEntity: string;
    readonly timerTitle: (seconds: number) => string;
    readonly conditionTitle: string;
  };
  readonly variableKind: Readonly<Record<'static' | 'data-source' | 'url-query', string>>;
  readonly semanticRoles: Readonly<Record<'related' | 'detail' | 'group' | 'drill-down', string>>;
  readonly conditionOperator: (operator: string) => string;
  readonly hostActionUndeclared: (actionId: string) => string;
}
const COLUMN_GAP = 260;
const ROW_GAP = 176;
const ORIGIN = 80;

export function buildDesignerBlueprintEventOptions(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly DesignerBlueprintEventOption[] {
  const materialEventAvailable = hasDesignerBlueprintCapability(
    runtimeContributions,
    SCREEN_BLUEPRINT_CAPABILITIES.materialEvent,
  );
  return document.components.flatMap((component) => {
    const manifest = catalog?.get(component.type)?.manifest;
    const descriptors = new Map(
      (manifest?.editorDescriptor?.events ?? []).map((descriptor) => [descriptor.name, descriptor]),
    );
    return (manifest?.events ?? []).map((name) => {
      const descriptor = descriptors.get(name);
      const requiredCapability = descriptor?.requiredCapability;
      const blueprintAllowed =
        descriptor?.triggerContexts === undefined ||
        descriptor.triggerContexts.includes('blueprint');
      return {
        componentId: component.id,
        componentName: component.name,
        materialType: component.type,
        name,
        label: descriptor?.label ?? name,
        available:
          blueprintAllowed &&
          materialEventAvailable &&
          (requiredCapability === undefined ||
            hasDesignerBlueprintCapability(runtimeContributions, requiredCapability)),
        ...(requiredCapability === undefined ? {} : { requiredCapability }),
      };
    });
  });
}

/** 连线判定所需的可用性上下文：事件锚点看 manifest 与能力，动作锚点看插件声明。 */
export function buildDesignerBlueprintConnectionContext(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): DesignerBlueprintConnectionContext {
  const events = buildDesignerBlueprintEventOptions(document, catalog, runtimeContributions);
  return {
    isEventAvailable: (componentId, eventName) =>
      events.some(
        (event) => event.componentId === componentId && event.name === eventName && event.available,
      ),
    isHostActionAvailable: (actionId) =>
      isDesignerBlueprintHostActionDeclared(runtimeContributions, actionId),
    componentStateIds: (componentId) =>
      document.components
        .find((component) => component.id === componentId)
        ?.states?.items.map((item) => item.id) ?? [],
  };
}

/** 左侧节点库的一项：文档里的组件 / 变量，标出是否已在图中。 */
export interface DesignerBlueprintLibraryEntry {
  readonly kind: 'component' | 'variable';
  readonly entityId: string;
  readonly name: string;
  readonly subtitle: string;
  readonly depth: number;
  readonly nodeId?: string;
  readonly eventCount: number;
}

export function buildDesignerBlueprintComponentLibrary(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly DesignerBlueprintLibraryEntry[] {
  const events = buildDesignerBlueprintEventOptions(document, catalog, runtimeContributions);
  const depths = componentDepths(document);
  return document.components.map((component) => {
    const node = findComponentBlueprintNode(document.blueprint, component.id);
    return {
      kind: 'component',
      entityId: component.id,
      name: component.name,
      subtitle: component.type,
      depth: depths.get(component.id) ?? 0,
      ...(node === undefined ? {} : { nodeId: node.id }),
      eventCount: events.filter((event) => event.componentId === component.id && event.available)
        .length,
    };
  });
}

export function buildDesignerBlueprintVariableLibrary(
  document: ScreenDocument,
  text: DesignerBlueprintProjectionText,
): readonly DesignerBlueprintLibraryEntry[] {
  return readDesignerVariableViews(document).map((variable) => {
    const node = findVariableBlueprintNode(document.blueprint, variable.id);
    return {
      kind: 'variable',
      entityId: variable.id,
      name: variable.name,
      subtitle: text.variableKind[variable.type],
      depth: 0,
      ...(node === undefined ? {} : { nodeId: node.id }),
      eventCount: 1,
    };
  });
}

/**
 * 文档节点图 → 画布图。节点、连线一一对应文档，不再派生结构 / 依赖边（ADR-0107 D2）。
 * 没有布局位置的节点按连线分层自动摆放：列 = 距最近触发源的最长路径，行 = 列内顺序。
 */
export function buildDesignerBlueprintGraph(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  text: DesignerBlueprintProjectionText,
): BaseScreenBlueprintCanvasGraph {
  const TEXT = text.graph;
  const blueprint = document.blueprint;
  const events = buildDesignerBlueprintEventOptions(document, catalog, runtimeContributions);
  const hostActions = listDesignerBlueprintHostActions(runtimeContributions);
  const components = new Map(document.components.map((component) => [component.id, component]));
  const variables = new Map(readDesignerVariableViews(document).map((view) => [view.id, view]));
  const subCanvases = new Map((document.subCanvases ?? []).map((canvas) => [canvas.id, canvas]));
  const saved = new Map(blueprint.layout?.nodes.map((node) => [node.id, node] as const));
  const positions = autoLayout(blueprint.nodes, blueprint.edges);
  const connectedPorts = new Set<string>();
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const edge of blueprint.edges) {
    outbound.set(edge.from.node, (outbound.get(edge.from.node) ?? 0) + 1);
    inbound.set(edge.to.node, (inbound.get(edge.to.node) ?? 0) + 1);
    if (edge.kind === 'flow') {
      connectedPorts.add(`${edge.from.node}\u0000out\u0000${edge.from.port}`);
      connectedPorts.add(`${edge.to.node}\u0000in\u0000${edge.to.port}`);
    }
  }
  const port = (
    node: ScreenBlueprintNode,
    direction: 'in' | 'out',
    id: string,
    label: string,
    available = true,
  ): BaseScreenBlueprintCanvasPort => ({
    id,
    direction,
    label,
    available,
    connected: connectedPorts.has(`${node.id}\u0000${direction}\u0000${id}`),
    ...(available ? {} : { unavailableReason: TEXT.unavailablePort }),
  });
  const usedPorts = (node: ScreenBlueprintNode, direction: 'in' | 'out'): string[] => {
    const ports: string[] = [];
    for (const edge of blueprint.edges) {
      if (edge.kind !== 'flow') continue;
      const end = direction === 'out' ? edge.from : edge.to;
      if (end.node === node.id && !ports.includes(end.port)) ports.push(end.port);
    }
    return ports;
  };
  const nodes: BaseScreenBlueprintCanvasNode[] = blueprint.nodes.map(
    (node): BaseScreenBlueprintCanvasNode => {
      const position = saved.get(node.id) ?? positions.get(node.id) ?? { x: ORIGIN, y: ORIGIN };
      const fixedInputs = SCREEN_BLUEPRINT_FIXED_INPUT_PORTS[node.kind].map((id) =>
        port(node, 'in', id, TEXT.ports[id] ?? id),
      );
      const fixedOutputs = SCREEN_BLUEPRINT_FIXED_OUTPUT_PORTS[node.kind].map((id) =>
        port(node, 'out', id, TEXT.ports[id] ?? id),
      );
      const base = {
        id: node.id,
        kind: node.kind,
        x: position.x,
        y: position.y,
        enabled: node.enabled !== false,
        semantic: false,
        renamable: node.kind === 'timer' || node.kind === 'condition',
        duplicable: node.kind === 'timer' || node.kind === 'condition',
        inboundCount: inbound.get(node.id) ?? 0,
        outboundCount: outbound.get(node.id) ?? 0,
      };
      switch (node.kind) {
        case 'component': {
          const component = components.get(node.componentId);
          const declared = events.filter((event) => event.componentId === node.componentId);
          const outputs = declared.map((event) =>
            port(node, 'out', `event:${event.name}`, event.label, event.available),
          );
          // 状态锚点（ADR-0110 §2.4）只在组件声明了状态时出现。
          const stateful = component?.states !== undefined;
          if (stateful) {
            outputs.push(
              port(node, 'out', 'state-changed', TEXT.ports['state-changed'] ?? 'state'),
            );
          }
          for (const used of usedPorts(node, 'out')) {
            if (outputs.some((candidate) => candidate.id === used)) continue;
            const name = readScreenBlueprintEventPort(used) ?? used;
            outputs.push(port(node, 'out', used, TEXT.missingEventPort(name), false));
          }
          return {
            ...base,
            title: component?.name ?? node.componentId,
            subtitle: component === undefined ? TEXT.missingEntity : component.type,
            outputs,
            inputs: stateful
              ? fixedInputs
              : fixedInputs.filter(
                  (candidate) => candidate.id !== 'set-state' && candidate.id !== 'reset-state',
                ),
            semantic: true,
            componentId: node.componentId,
            ...(component === undefined
              ? {}
              : { materialType: component.type, hidden: component.status.hidden }),
          };
        }
        case 'variable': {
          const variable = variables.get(node.variableId);
          return {
            ...base,
            title: variable?.name ?? node.variableId,
            subtitle:
              variable === undefined ? TEXT.missingEntity : text.variableKind[variable.type],
            outputs: fixedOutputs,
            inputs: fixedInputs,
            variableId: node.variableId,
            ...(variable === undefined ? {} : { variableType: variable.type }),
          };
        }
        case 'host': {
          const inputs: BaseScreenBlueprintCanvasPort[] = [];
          for (const used of usedPorts(node, 'in')) {
            const eventName = readScreenBlueprintEventPort(used);
            if (eventName !== undefined) {
              inputs.push(port(node, 'in', used, TEXT.hostEventPort(eventName)));
            }
          }
          inputs.push(
            port(
              node,
              'in',
              `event:${nextHostEventName(blueprint, node.id)}`,
              TEXT.newHostEventPort,
            ),
          );
          for (const action of hostActions) {
            inputs.push(
              port(node, 'in', `action:${action.actionId}`, TEXT.hostActionPort(action.name)),
            );
          }
          for (const used of usedPorts(node, 'in')) {
            const actionId = readScreenBlueprintActionPort(used);
            if (actionId === undefined || inputs.some((candidate) => candidate.id === used))
              continue;
            inputs.push(port(node, 'in', used, text.hostActionUndeclared(actionId), false));
          }
          return {
            ...base,
            title: TEXT.nodeKinds.host,
            subtitle: TEXT.nodeKindHints.host,
            outputs: [],
            inputs,
          };
        }
        case 'lifecycle':
          return {
            ...base,
            title: TEXT.nodeKinds.lifecycle,
            subtitle: TEXT.nodeKindHints.lifecycle,
            outputs: fixedOutputs,
            inputs: [],
          };
        case 'timer':
          return {
            ...base,
            title: node.name ?? TEXT.timerTitle(node.intervalSeconds),
            subtitle: TEXT.nodeKinds.timer,
            outputs: fixedOutputs,
            inputs: [],
            intervalSeconds: node.intervalSeconds,
            ...(node.name === undefined ? {} : { name: node.name }),
          };
        case 'sub-canvas': {
          const subCanvas = subCanvases.get(node.canvasId);
          const labels = TEXT.subCanvasPorts[subCanvas?.display ?? 'popup'];
          return {
            ...base,
            title: subCanvas?.name ?? node.canvasId,
            subtitle:
              subCanvas === undefined ? TEXT.missingEntity : TEXT.subCanvasKinds[subCanvas.display],
            outputs: SCREEN_BLUEPRINT_FIXED_OUTPUT_PORTS['sub-canvas'].map((id) =>
              port(node, 'out', id, labels[id] ?? id),
            ),
            inputs: SCREEN_BLUEPRINT_FIXED_INPUT_PORTS['sub-canvas'].map((id) =>
              port(node, 'in', id, labels[id] ?? id),
            ),
            canvasId: node.canvasId,
            ...(subCanvas === undefined ? {} : { canvasDisplay: subCanvas.display }),
          };
        }
        case 'main-canvas':
          return {
            ...base,
            title: TEXT.nodeKinds['main-canvas'],
            subtitle: TEXT.nodeKindHints['main-canvas'],
            outputs: SCREEN_BLUEPRINT_FIXED_OUTPUT_PORTS['main-canvas'].map((id) =>
              port(node, 'out', id, TEXT.mainCanvasPorts[id] ?? id),
            ),
            inputs: SCREEN_BLUEPRINT_FIXED_INPUT_PORTS['main-canvas'].map((id) =>
              port(node, 'in', id, TEXT.mainCanvasPorts[id] ?? id),
            ),
          };
        case 'condition':
          return {
            ...base,
            title: node.name ?? TEXT.conditionTitle,
            subtitle: describeCondition(node.condition, text),
            outputs: fixedOutputs,
            inputs: fixedInputs,
            condition: node.condition,
            ...(node.name === undefined ? {} : { name: node.name }),
          };
      }
    },
  );
  restackUnsavedNodes(nodes, saved);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const kindOf = blueprintNodeKindOf(blueprint);
  const edges = blueprint.edges.map((edge): BaseScreenBlueprintCanvasEdge => {
    const source = nodeById.get(edge.from.node);
    const target = nodeById.get(edge.to.node);
    const active = source?.enabled !== false && target?.enabled !== false;
    if (edge.kind === 'semantic') {
      return {
        id: edge.id,
        kind: 'semantic',
        category: 'semantic',
        source: edge.from.node,
        sourcePort: 'semantic',
        target: edge.to.node,
        targetPort: 'semantic',
        label: text.semanticRoles[edge.role],
        role: edge.role,
        active,
      };
    }
    const order = readDesignerBlueprintEdgeOrder(blueprint, edge.id);
    const targetPort = target?.inputs.find((candidate) => candidate.id === edge.to.port);
    return {
      id: edge.id,
      kind: 'flow',
      category: readScreenBlueprintEdgeCategory(edge, kindOf),
      source: edge.from.node,
      sourcePort: edge.from.port,
      target: edge.to.node,
      targetPort: edge.to.port,
      label: targetPort?.label ?? edge.to.port,
      ...(order === undefined ? {} : { order: order.order, siblingCount: order.count }),
      ...(edge.value === undefined ? {} : { value: edge.value }),
      ...(edge.payload === undefined ? {} : { payload: edge.payload }),
      ...(edge.transition === undefined ? {} : { transition: edge.transition }),
      ...(edge.stateId === undefined ? {} : { stateId: edge.stateId }),
      active,
    };
  });
  return {
    nodes,
    edges,
    ...(blueprint.layout?.viewport === undefined ? {} : { viewport: blueprint.layout.viewport }),
  };
}

/** 可模拟的触发锚点：启用节点上已有连线的触发输出（事件、就绪、tick、值更新）。 */
export function buildDesignerBlueprintSimulationTriggers(
  graph: BaseScreenBlueprintCanvasGraph,
  document: ScreenDocument,
): readonly BaseScreenBlueprintCanvasSimulationTrigger[] {
  const triggers: BaseScreenBlueprintCanvasSimulationTrigger[] = [];
  for (const node of document.blueprint.nodes) {
    if (node.enabled === false) continue;
    const projected = graph.nodes.find((candidate) => candidate.id === node.id);
    for (const output of projected?.outputs ?? []) {
      if (!output.connected) continue;
      if (screenBlueprintPortTrigger(node, output.id) === undefined) continue;
      triggers.push({
        nodeId: node.id,
        port: output.id,
        label: `${projected?.title ?? node.id} · ${output.label}`,
      });
    }
  }
  return triggers;
}

/** 宿主节点「新业务事件」锚点的事件名：`event1`、`event2`… 中第一个未被连线占用的。 */
function nextHostEventName(
  blueprint: { readonly edges: readonly ScreenBlueprintEdge[] },
  hostId: string,
): string {
  const used = new Set(
    blueprint.edges.flatMap((edge) =>
      edge.kind === 'flow' && edge.to.node === hostId ? [edge.to.port] : [],
    ),
  );
  for (let index = 1; ; index++) {
    if (!used.has(`event:event${index}`)) return `event${index}`;
  }
}

function describeCondition(
  condition: ScreenBlueprintCondition,
  text: DesignerBlueprintProjectionText,
): string {
  const side = (expression: typeof condition.left): string => {
    switch (expression.kind) {
      case 'literal':
        return JSON.stringify(expression.value) ?? 'null';
      case 'event-payload':
        return expression.path.length === 0 ? 'payload' : `payload.${expression.path.join('.')}`;
      case 'variable':
        return expression.variableId;
      default:
        return expression.kind;
    }
  };
  const operator = text.conditionOperator(condition.operator);
  return condition.right === undefined
    ? `${side(condition.left)} ${operator}`
    : `${side(condition.left)} ${operator} ${side(condition.right)}`;
}

/**
 * 卡片几何来自 `designer-blueprint-geometry.ts`（标题 44 + 上下内边距 25 + 描边 2 + 每行锚点 27，
 * 最小 108），与画布 `height()` 同一公式。
 * 自动摆放的节点按实际卡片高度在列内重新堆叠，避免高卡片互相压住；已保存位置的节点不动。
 */

export function estimateDesignerBlueprintNodeHeight(node: BaseScreenBlueprintCanvasNode): number {
  const rows = node.inputs.length + node.outputs.length + (node.semantic ? 1 : 0);
  return Math.max(CARD_MIN_HEIGHT, CARD_HEADER + CARD_PADDING + CARD_BORDER + rows * CARD_ROW);
}

function restackUnsavedNodes(
  nodes: BaseScreenBlueprintCanvasNode[],
  saved: ReadonlyMap<string, unknown>,
): void {
  const columns = new Map<number, number[]>();
  nodes.forEach((node, index) => {
    if (saved.has(node.id)) return;
    const list = columns.get(node.x) ?? [];
    list.push(index);
    columns.set(node.x, list);
  });
  for (const indexes of columns.values()) {
    let y = ORIGIN;
    for (const index of indexes) {
      const node = nodes[index]!;
      nodes[index] = { ...node, y };
      y += estimateDesignerBlueprintNodeHeight(node) + CARD_GAP;
    }
  }
}

function autoLayout(
  nodes: readonly ScreenBlueprintNode[],
  edges: readonly ScreenBlueprintEdge[],
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.kind !== 'flow') continue;
    const list = incoming.get(edge.to.node);
    if (list === undefined) incoming.set(edge.to.node, [edge.from.node]);
    else list.push(edge.from.node);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let value = 0;
    for (const parent of incoming.get(id) ?? []) value = Math.max(value, visit(parent) + 1);
    visiting.delete(id);
    depth.set(id, Math.min(value, 12));
    return depth.get(id)!;
  };
  const rows = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const column = visit(node.id);
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    positions.set(node.id, { x: ORIGIN + column * COLUMN_GAP, y: ORIGIN + row * ROW_GAP });
  }
  return positions;
}

function componentDepths(document: ScreenDocument): ReadonlyMap<string, number> {
  const byId = new Map(document.components.map((component) => [component.id, component] as const));
  const depths = new Map<string, number>();
  for (const component of document.components) {
    let depth = 0;
    let parentId = component.parentId;
    const seen = new Set<string>([component.id]);
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    depths.set(component.id, depth);
  }
  return depths;
}
