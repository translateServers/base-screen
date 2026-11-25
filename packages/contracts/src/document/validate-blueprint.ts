import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { canonicalByteLength } from '../json/canonical.js';
import type {
  ScreenBlueprint,
  ScreenBlueprintNode,
  ScreenBlueprintValueExpression,
} from '../types/document.js';
import type { ScreenJsonValue } from '../types/json.js';
import {
  deriveScreenBlueprintRules,
  isScreenBlueprintInputPort,
  isScreenBlueprintOutputPort,
  ScreenBlueprintRuleLimitError,
  screenBlueprintEdgeFieldRule,
} from './blueprint-graph.js';
import { validateBlueprintStrictKeys } from './blueprint-strict.js';
import {
  MAX_BLUEPRINT_CONDITION_DEPTH,
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
  MAX_BLUEPRINT_RULES,
} from './limits.js';
import { blueprintSchema } from './schema.js';
import { isJsonObject } from './strict-object.js';
import { addZodIssues, type DocumentDiagnosticPath } from './validate-support.js';

/**
 * 蓝图节点图的形状与图结构校验（ADR-0107 §2.1–§2.3）。
 *
 * 只依赖蓝图本身：节点 / 连线 id 唯一、实体与单例唯一、锚点属于节点种类、连线附加字段、
 * 重复连线、条件子图无环与深度、布局引用、表达式与派生规则上限。`componentId` / `variableId`
 * 是否存在于文档由 `references.ts` 判定。
 */
export function validateBlueprint(
  blueprint: unknown,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(blueprint)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['blueprint']),
      phase,
      'Blueprint must be an object.',
    );
    return false;
  }
  if (!validateBlueprintStrictKeys(blueprint, at, collector, phase)) return false;
  const result = blueprintSchema.safeParse(blueprint);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['blueprint'],
      () => 'DOCUMENT_FIELD_INVALID',
      at,
      collector,
      phase,
    );
    return false;
  }
  const graph = result.data as unknown as ScreenBlueprint;
  if (!validateBlueprintGraph(graph, at, collector, phase)) return false;
  let rules: ReturnType<typeof deriveScreenBlueprintRules>;
  try {
    rules = deriveScreenBlueprintRules(graph);
  } catch (error) {
    if (!(error instanceof ScreenBlueprintRuleLimitError)) throw error;
    collector.add('DOCUMENT_LIMIT_EXCEEDED', at(['blueprint', 'edges']), phase, error.message);
    return false;
  }
  if (rules.length > MAX_BLUEPRINT_RULES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['blueprint', 'nodes']),
      phase,
      `Blueprint has more than ${MAX_BLUEPRINT_RULES} trigger rules.`,
    );
    return false;
  }
  let clean = true;
  graph.nodes.forEach((node, index) => {
    if (node.kind !== 'condition') return;
    const base: DiagnosticSegment[] = ['blueprint', 'nodes', index, 'condition'];
    clean =
      validateBlueprintExpression(node.condition.left, [...base, 'left'], at, collector, phase) &&
      clean;
    if (node.condition.right !== undefined) {
      clean =
        validateBlueprintExpression(
          node.condition.right,
          [...base, 'right'],
          at,
          collector,
          phase,
        ) && clean;
    }
  });
  graph.edges.forEach((edge, index) => {
    if (edge.kind !== 'flow') return;
    for (const field of ['value', 'payload'] as const) {
      const expression = edge[field];
      if (expression === undefined) continue;
      clean =
        validateBlueprintExpression(
          expression,
          ['blueprint', 'edges', index, field],
          at,
          collector,
          phase,
        ) && clean;
    }
  });
  return clean;
}

function validateBlueprintGraph(
  graph: ScreenBlueprint,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  const fail = (path: DiagnosticSegment[], message: string): void => {
    collector.add('DOCUMENT_FIELD_INVALID', at(path), phase, message);
    clean = false;
  };
  const nodes = new Map<string, ScreenBlueprintNode>();
  const components = new Set<string>();
  const variables = new Set<string>();
  const subCanvases = new Set<string>();
  const singletons = new Set<string>();
  graph.nodes.forEach((node, index) => {
    const base: DiagnosticSegment[] = ['blueprint', 'nodes', index];
    if (nodes.has(node.id)) {
      fail([...base, 'id'], `Duplicate blueprint node id "${truncate(node.id)}".`);
      return;
    }
    nodes.set(node.id, node);
    if (node.kind === 'component') {
      if (components.has(node.componentId)) {
        fail(
          [...base, 'componentId'],
          `Component "${truncate(node.componentId)}" already has a blueprint node.`,
        );
      }
      components.add(node.componentId);
    } else if (node.kind === 'variable') {
      if (variables.has(node.variableId)) {
        fail(
          [...base, 'variableId'],
          `Variable "${truncate(node.variableId)}" already has a blueprint node.`,
        );
      }
      variables.add(node.variableId);
    } else if (node.kind === 'sub-canvas') {
      if (subCanvases.has(node.canvasId)) {
        fail(
          [...base, 'canvasId'],
          `Sub canvas "${truncate(node.canvasId)}" already has a blueprint node.`,
        );
      }
      subCanvases.add(node.canvasId);
    } else if (node.kind === 'host' || node.kind === 'lifecycle' || node.kind === 'main-canvas') {
      if (singletons.has(node.kind)) {
        fail([...base, 'kind'], `Blueprint must not have more than one ${node.kind} node.`);
      }
      singletons.add(node.kind);
    }
  });
  const edgeIds = new Set<string>();
  const flowKeys = new Set<string>();
  const semanticKeys = new Set<string>();
  const conditionNext = new Map<string, string[]>();
  graph.edges.forEach((edge, index) => {
    const base: DiagnosticSegment[] = ['blueprint', 'edges', index];
    if (edgeIds.has(edge.id)) {
      fail([...base, 'id'], `Duplicate blueprint edge id "${truncate(edge.id)}".`);
      return;
    }
    edgeIds.add(edge.id);
    const source = nodes.get(edge.from.node);
    const target = nodes.get(edge.to.node);
    if (source === undefined) {
      fail(
        [...base, 'from', 'node'],
        `Blueprint edge references unknown node "${truncate(edge.from.node)}".`,
      );
    }
    if (target === undefined) {
      fail(
        [...base, 'to', 'node'],
        `Blueprint edge references unknown node "${truncate(edge.to.node)}".`,
      );
    }
    if (source === undefined || target === undefined) return;
    if (edge.from.node === edge.to.node) {
      fail([...base, 'to', 'node'], 'Blueprint edge must not connect a node to itself.');
      return;
    }
    if (edge.kind === 'semantic') {
      if (source.kind !== 'component') {
        fail([...base, 'from', 'node'], 'Semantic edge must start at a component node.');
      }
      if (target.kind !== 'component') {
        fail([...base, 'to', 'node'], 'Semantic edge must end at a component node.');
      }
      const key = `${edge.from.node}\u0000${edge.to.node}`;
      if (semanticKeys.has(key)) fail(base, 'Duplicate semantic edge between the same nodes.');
      semanticKeys.add(key);
      return;
    }
    if (!isScreenBlueprintOutputPort(source.kind, edge.from.port)) {
      fail(
        [...base, 'from', 'port'],
        `Port "${truncate(edge.from.port)}" is not an output of a ${source.kind} node.`,
      );
      return;
    }
    if (!isScreenBlueprintInputPort(target.kind, edge.to.port)) {
      fail(
        [...base, 'to', 'port'],
        `Port "${truncate(edge.to.port)}" is not an input of a ${target.kind} node.`,
      );
      return;
    }
    const rule = screenBlueprintEdgeFieldRule(target.kind, edge.to.port);
    for (const field of ['value', 'payload'] as const) {
      const present = edge[field] !== undefined;
      if (rule[field] === 'required' && !present) {
        fail([...base, field], `Edge into "${truncate(edge.to.port)}" requires ${field}.`);
      } else if (rule[field] === 'forbidden' && present) {
        fail([...base, field], `Edge into "${truncate(edge.to.port)}" must not define ${field}.`);
      }
    }
    if (rule.stateId === 'required' && edge.stateId === undefined) {
      fail([...base, 'stateId'], `Edge into "${truncate(edge.to.port)}" requires stateId.`);
    } else if (rule.stateId === 'forbidden' && edge.stateId !== undefined) {
      fail([...base, 'stateId'], `Edge into "${truncate(edge.to.port)}" must not define stateId.`);
    }
    if (rule.transition === 'forbidden' && edge.transition !== undefined) {
      fail(
        [...base, 'transition'],
        `Edge into "${truncate(edge.to.port)}" must not define transition.`,
      );
    }
    const key = `${edge.from.node}\u0000${edge.from.port}\u0000${edge.to.node}\u0000${edge.to.port}`;
    if (flowKeys.has(key)) fail(base, 'Duplicate flow edge between the same ports.');
    flowKeys.add(key);
    if (source.kind === 'condition' && target.kind === 'condition') {
      const next = conditionNext.get(source.id);
      if (next === undefined) conditionNext.set(source.id, [target.id]);
      else next.push(target.id);
    }
  });
  if (!clean) return false;
  const conditionProblem = checkConditionSubgraph(graph.nodes, conditionNext);
  if (conditionProblem !== undefined) {
    collector.add(
      conditionProblem.code,
      at(['blueprint', 'nodes', conditionProblem.index]),
      phase,
      conditionProblem.message,
    );
    return false;
  }
  graph.layout?.nodes.forEach((layoutNode, index) => {
    if (!nodes.has(layoutNode.id)) {
      fail(
        ['blueprint', 'layout', 'nodes', index, 'id'],
        `Blueprint layout references unknown node id "${truncate(layoutNode.id)}".`,
      );
    }
  });
  return clean;
}

/** 条件子图（条件 → 条件）必须无环，且最长条件链不超过 `MAX_BLUEPRINT_CONDITION_DEPTH`。 */
function checkConditionSubgraph(
  nodes: readonly ScreenBlueprintNode[],
  next: ReadonlyMap<string, readonly string[]>,
):
  | {
      readonly code: 'DOCUMENT_FIELD_INVALID' | 'DOCUMENT_LIMIT_EXCEEDED';
      readonly index: number;
      readonly message: string;
    }
  | undefined {
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  let cycleAt: string | undefined;
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) {
      cycleAt ??= id;
      return 0;
    }
    visiting.add(id);
    let longest = 0;
    for (const child of next.get(id) ?? []) longest = Math.max(longest, visit(child));
    visiting.delete(id);
    const value = longest + 1;
    depth.set(id, value);
    return value;
  };
  for (const node of nodes) {
    if (node.kind !== 'condition') continue;
    const value = visit(node.id);
    if (cycleAt !== undefined) {
      return {
        code: 'DOCUMENT_FIELD_INVALID',
        index: indexOf.get(cycleAt) ?? 0,
        message: 'Blueprint condition nodes must not form a cycle.',
      };
    }
    if (value > MAX_BLUEPRINT_CONDITION_DEPTH) {
      return {
        code: 'DOCUMENT_LIMIT_EXCEEDED',
        index: indexOf.get(node.id) ?? 0,
        message: `Blueprint condition chain exceeds ${MAX_BLUEPRINT_CONDITION_DEPTH} nodes.`,
      };
    }
  }
  return undefined;
}

function truncate(value: string): string {
  return value.length > 64 ? `${value.slice(0, 61)}...` : value;
}

function validateBlueprintExpression(
  expression: ScreenBlueprintValueExpression,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  if (
    canonicalByteLength(expression as unknown as ScreenJsonValue) > MAX_BLUEPRINT_EXPRESSION_BYTES
  ) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(base),
      phase,
      `Blueprint expression exceeds ${MAX_BLUEPRINT_EXPRESSION_BYTES} UTF-8 bytes.`,
    );
    clean = false;
  }
  const budget = { containers: 0 };
  return walkBlueprintExpression(expression, base, 1, budget, at, collector, phase) && clean;
}

function walkBlueprintExpression(
  expression: ScreenBlueprintValueExpression,
  base: DiagnosticSegment[],
  depth: number,
  budget: { containers: number },
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (depth > MAX_BLUEPRINT_EXPRESSION_DEPTH) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(base),
      phase,
      `Blueprint expression nesting exceeds ${MAX_BLUEPRINT_EXPRESSION_DEPTH}.`,
    );
    return false;
  }
  if (expression.kind !== 'array' && expression.kind !== 'object') return true;
  budget.containers++;
  if (budget.containers > MAX_BLUEPRINT_EXPRESSION_CONTAINERS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(base),
      phase,
      `Blueprint expression has more than ${MAX_BLUEPRINT_EXPRESSION_CONTAINERS} containers.`,
    );
    return false;
  }
  let clean = true;
  if (expression.kind === 'array') {
    for (let index = 0; index < expression.items.length; index++) {
      if (
        !walkBlueprintExpression(
          expression.items[index]!,
          [...base, 'items', index],
          depth + 1,
          budget,
          at,
          collector,
          phase,
        )
      ) {
        clean = false;
      }
    }
    return clean;
  }
  if (Object.keys(expression.properties).length > MAX_BLUEPRINT_EXPRESSION_CONTAINERS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at([...base, 'properties']),
      phase,
      `Blueprint expression object has more than ${MAX_BLUEPRINT_EXPRESSION_CONTAINERS} properties.`,
    );
    return false;
  }
  for (const [key, value] of Object.entries(expression.properties)) {
    if (
      !walkBlueprintExpression(
        value,
        [...base, 'properties', key],
        depth + 1,
        budget,
        at,
        collector,
        phase,
      )
    ) {
      clean = false;
    }
  }
  return clean;
}
