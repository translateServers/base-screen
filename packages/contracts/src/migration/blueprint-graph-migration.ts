import { serializeCanonicalJson } from '../json/canonical.js';
import type { ScreenJsonValue } from '../types/json.js';
import type { ScreenMigrationDecision } from './migrate-document.js';

/**
 * `blueprint.relations`（ADR-0091）→ 节点图（ADR-0107 §2.4）的唯一转换路径。
 *
 * - 被关系引用的组件 / 变量各生成一个节点，id 沿用旧布局 id（`component:<id>` / `variable:<id>`），
 *   旧布局位置原样保留；没被引用的组件不再生成节点。宿主 / 实例就绪各一个单例节点（`host` / `lifecycle`），
 *   每个不同间隔一个定时器节点（`timer:<秒>`）。
 * - 无条件的行为关系 → 一条 flow 连线，id 沿用关系 id；有条件时按旧派生分组（连续、同源、同条件）
 *   每组一个条件节点 + 一条 `来源 → judge` 连线，组内每条关系各一条 `yes → 目标` 连线（id 沿用关系 id）。
 * - 语义关系 → 语义连线；来源为变量 `request-state` 的关系运行时从未触发，丢弃并记录决策。
 * - 连线按原关系顺序写入，深度优先执行与旧规则逐条执行的动作顺序一致。
 *
 * 幂等：已有 `nodes` / `edges` 的文档、没有 `relations` 的文档原样返回。任何无法安全识别的形状
 * 都原样返回，让严格解析失败关闭，不做部分迁移。
 */
export interface BlueprintGraphMigration {
  readonly input: unknown;
  readonly decisions: readonly ScreenMigrationDecision[];
}

type Json = Record<string, unknown>;

interface Endpoint {
  readonly nodeId: string;
  readonly port: string;
}

export function migrateRelationBlueprint(input: unknown): BlueprintGraphMigration {
  const unchanged = { input, decisions: [] };
  if (!isObject(input) || !isObject(input.blueprint)) return unchanged;
  const blueprint = input.blueprint;
  if ('nodes' in blueprint || 'edges' in blueprint || !('relations' in blueprint)) {
    return unchanged;
  }
  if (Object.keys(blueprint).some((key) => key !== 'relations' && key !== 'layout')) {
    return unchanged;
  }
  const relations = blueprint.relations;
  if (!Array.isArray(relations)) return unchanged;

  const nodes: Json[] = [];
  const nodeIds = new Set<string>();
  const edges: Json[] = [];
  const edgeIds = new Set<string>();
  const flowKeys = new Set<string>();
  const semanticKeys = new Set<string>();
  const decisions: ScreenMigrationDecision[] = [];
  const usedIds = new Set<string>();
  for (const relation of relations) {
    if (isObject(relation) && typeof relation.id === 'string') usedIds.add(relation.id);
  }
  let conditionCounter = 0;
  let edgeCounter = 0;
  const allocate = (prefix: string, next: () => number): string => {
    for (;;) {
      const candidate = `${prefix}-${next()}`;
      if (!usedIds.has(candidate) && !nodeIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
    }
  };
  const ensureNode = (id: string, node: Json): string => {
    if (!nodeIds.has(id)) {
      nodeIds.add(id);
      nodes.push(node);
    }
    return id;
  };
  const pushEdge = (edge: Json, key: string, index: number): boolean => {
    if (flowKeys.has(key) || semanticKeys.has(key) || edgeIds.has(edge.id as string)) {
      decisions.push({
        kind: 'blueprint-edge',
        path: ['blueprint', 'relations', index],
        action: 'rejected',
        detail: 'Relation duplicated an earlier relation between the same ports and was dropped.',
      });
      return false;
    }
    (edge.kind === 'semantic' ? semanticKeys : flowKeys).add(key);
    edgeIds.add(edge.id as string);
    edges.push(edge);
    return true;
  };

  let previousGroupKey: string | undefined;
  let currentCondition: string | undefined;
  for (let index = 0; index < relations.length; index++) {
    const relation = relations[index];
    if (!isObject(relation) || typeof relation.id !== 'string') return unchanged;
    if (relation.type === 'semantic') {
      // 旧派生规则跳过语义关系，不打断行为关系的分组。
      const from = componentEndpoint(relation.source);
      const to = componentEndpoint(relation.target);
      if (from === undefined || to === undefined || typeof relation.role !== 'string') {
        return unchanged;
      }
      ensureNode(from, {
        kind: 'component',
        id: from,
        componentId: componentIdOf(relation.source),
      });
      ensureNode(to, { kind: 'component', id: to, componentId: componentIdOf(relation.target) });
      const created = pushEdge(
        {
          kind: 'semantic',
          id: relation.id,
          from: { node: from },
          to: { node: to },
          role: relation.role,
        },
        `semantic\u0000${from}\u0000${to}`,
        index,
      );
      if (created) {
        decisions.push({
          kind: 'blueprint-edge',
          path: ['blueprint', 'relations', index],
          action: 'mapped',
          detail: 'Semantic relation became a semantic edge.',
          createdEdgeIds: [relation.id],
        });
      }
      continue;
    }
    if (relation.type !== 'behavior') return unchanged;
    const source = sourceEndpoint(relation.source);
    if (source === null) return unchanged;
    if (source === 'request-state') {
      // 旧派生规则里它自成一组：后续同源同条件的关系不与之前的组合并。
      previousGroupKey = `request-state\u0000${index}`;
      currentCondition = undefined;
      decisions.push({
        kind: 'blueprint-edge',
        path: ['blueprint', 'relations', index],
        action: 'rejected',
        detail:
          'Relation was triggered by variable request-state, which the runtime never emits; it was dropped.',
      });
      continue;
    }
    ensureNode(source.endpoint.nodeId, source.node);
    const target = targetEndpoint(relation.target, relation.effect);
    if (target === null) return unchanged;
    ensureNode(target.endpoint.nodeId, target.node);
    const condition = relation.condition;
    if (condition !== undefined && !isObject(condition)) return unchanged;
    const capabilities = relation.requiredCapabilities;
    if (capabilities !== undefined && !Array.isArray(capabilities)) return unchanged;
    const groupKey = `${source.endpoint.nodeId}\u0000${source.endpoint.port}\u0000${
      condition === undefined
        ? 'null'
        : serializeCanonicalJson(condition as unknown as ScreenJsonValue)
    }`;
    const createdEdgeIds: string[] = [];
    let from: Endpoint = source.endpoint;
    if (condition !== undefined) {
      if (previousGroupKey !== groupKey || currentCondition === undefined) {
        currentCondition = allocate('condition', () => ++conditionCounter);
        ensureNode(currentCondition, { kind: 'condition', id: currentCondition, condition });
        const judgeId = allocate('edge', () => ++edgeCounter);
        pushEdge(
          {
            kind: 'flow',
            id: judgeId,
            from: { node: source.endpoint.nodeId, port: source.endpoint.port },
            to: { node: currentCondition, port: 'judge' },
          },
          `${source.endpoint.nodeId}\u0000${source.endpoint.port}\u0000${currentCondition}\u0000judge`,
          index,
        );
        createdEdgeIds.push(judgeId);
        decisions.push({
          kind: 'blueprint-node',
          path: ['blueprint', 'relations', index, 'condition'],
          action: 'mapped',
          detail: `Relation condition became condition node "${currentCondition}".`,
        });
      }
      from = { nodeId: currentCondition, port: 'yes' };
    } else {
      currentCondition = undefined;
    }
    previousGroupKey = groupKey;
    const edge: Json = {
      kind: 'flow',
      id: relation.id,
      from: { node: from.nodeId, port: from.port },
      to: { node: target.endpoint.nodeId, port: target.endpoint.port },
      ...target.fields,
      ...(capabilities === undefined ? {} : { requiredCapabilities: capabilities }),
    };
    if (
      pushEdge(
        edge,
        `${from.nodeId}\u0000${from.port}\u0000${target.endpoint.nodeId}\u0000${target.endpoint.port}`,
        index,
      )
    ) {
      createdEdgeIds.push(relation.id);
    }
    if (createdEdgeIds.length > 0) {
      decisions.push({
        kind: 'blueprint-edge',
        path: ['blueprint', 'relations', index],
        action: 'mapped',
        detail:
          condition === undefined
            ? 'Behavior relation became a flow edge.'
            : 'Conditional behavior relation became a flow edge from a condition node.',
        createdEdgeIds,
      });
    }
  }

  const layout = blueprint.layout;
  let migratedLayout: Json | undefined;
  if (layout !== undefined) {
    if (!isObject(layout)) return unchanged;
    const layoutNodes = layout.nodes;
    if (layoutNodes !== undefined && !Array.isArray(layoutNodes)) return unchanged;
    const kept: unknown[] = [];
    let dropped = 0;
    for (const node of layoutNodes ?? []) {
      if (!isObject(node) || typeof node.id !== 'string') return unchanged;
      if (nodeIds.has(node.id)) kept.push(node);
      else dropped += 1;
    }
    if (dropped > 0) {
      decisions.push({
        kind: 'blueprint-layout',
        path: ['blueprint', 'layout', 'nodes'],
        action: 'rejected',
        detail: `Dropped ${dropped} layout position(s) for components or variables that no longer have a blueprint node.`,
      });
    }
    migratedLayout = {
      nodes: kept,
      ...(layout.viewport === undefined ? {} : { viewport: layout.viewport }),
    };
  }
  return {
    input: {
      ...input,
      blueprint: {
        nodes,
        edges,
        ...(migratedLayout === undefined ? {} : { layout: migratedLayout }),
      },
    },
    decisions,
  };
}

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function componentIdOf(value: unknown): string {
  return (value as { componentId: string }).componentId;
}

function componentEndpoint(value: unknown): string | undefined {
  if (!isObject(value) || value.kind !== 'component' || typeof value.componentId !== 'string') {
    return undefined;
  }
  return `component:${value.componentId}`;
}

function sourceEndpoint(
  source: unknown,
): { readonly endpoint: Endpoint; readonly node: Json } | 'request-state' | null {
  if (!isObject(source) || !isObject(source.event)) return null;
  const eventName = source.event.eventName;
  if (source.kind === 'component' && typeof source.componentId === 'string') {
    if (typeof eventName !== 'string') return null;
    const id = `component:${source.componentId}`;
    return {
      endpoint: { nodeId: id, port: `event:${eventName}` },
      node: { kind: 'component', id, componentId: source.componentId },
    };
  }
  if (source.kind === 'variable' && typeof source.variableId === 'string') {
    if (eventName === 'request-state') return 'request-state';
    if (eventName !== 'data-updated') return null;
    const id = `variable:${source.variableId}`;
    return {
      endpoint: { nodeId: id, port: 'data-updated' },
      node: { kind: 'variable', id, variableId: source.variableId },
    };
  }
  if (source.kind === 'lifecycle' && eventName === 'ready') {
    return {
      endpoint: { nodeId: 'lifecycle', port: 'ready' },
      node: { kind: 'lifecycle', id: 'lifecycle' },
    };
  }
  if (source.kind === 'timer' && eventName === 'tick' && Number.isInteger(source.intervalSeconds)) {
    const id = `timer:${source.intervalSeconds as number}`;
    return {
      endpoint: { nodeId: id, port: 'tick' },
      node: { kind: 'timer', id, intervalSeconds: source.intervalSeconds },
    };
  }
  return null;
}

function targetEndpoint(
  target: unknown,
  effect: unknown,
): { readonly endpoint: Endpoint; readonly node: Json; readonly fields: Json } | null {
  if (!isObject(target) || !isObject(effect)) return null;
  if (target.kind === 'component' && typeof target.componentId === 'string') {
    const id = `component:${target.componentId}`;
    const node = { kind: 'component', id, componentId: target.componentId };
    if (effect.type === 'component-visibility') {
      const operation = effect.operation;
      if (operation !== 'show' && operation !== 'hide' && operation !== 'toggle') return null;
      return {
        endpoint: { nodeId: id, port: operation },
        node,
        fields: effect.transition === undefined ? {} : { transition: effect.transition },
      };
    }
    if (effect.type === 'request-component-data') {
      return { endpoint: { nodeId: id, port: 'request-data' }, node, fields: {} };
    }
    return null;
  }
  if (target.kind === 'variable' && typeof target.variableId === 'string') {
    const id = `variable:${target.variableId}`;
    const node = { kind: 'variable', id, variableId: target.variableId };
    if (effect.type === 'set-variable' && effect.value !== undefined) {
      return { endpoint: { nodeId: id, port: 'set' }, node, fields: { value: effect.value } };
    }
    if (effect.type === 'request-variable') {
      return { endpoint: { nodeId: id, port: 'request' }, node, fields: {} };
    }
    return null;
  }
  if (target.kind === 'host') {
    const node = { kind: 'host', id: 'host' };
    if (effect.type === 'emit-host-event' && typeof effect.eventName === 'string') {
      if (effect.payload === undefined) return null;
      return {
        endpoint: { nodeId: 'host', port: `event:${effect.eventName}` },
        node,
        fields: { payload: effect.payload },
      };
    }
    if (effect.type === 'host-action' && typeof effect.actionId === 'string') {
      if (effect.payload === undefined) return null;
      return {
        endpoint: { nodeId: 'host', port: `action:${effect.actionId}` },
        node,
        fields: { payload: effect.payload },
      };
    }
  }
  return null;
}
