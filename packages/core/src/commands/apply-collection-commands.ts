import {
  isScreenComponentId,
  type ScreenBlueprint,
  type ScreenDocument,
  screenJsonEquals,
} from '@base-screen/contracts';
import { componentsReferencingDataSources } from '../data/data-source-dependents.js';
import { isRecord } from './command-input.js';
import {
  finalizeScreenCommand,
  invalidScreenCommand,
  screenCommandDiagnostic,
  screenCommandFailure,
  screenCommandSuccess,
} from './command-result.js';
import type { ScreenCommandResult } from './types.js';

/**
 * 文档级集合的按 id 局部命令（ADR-0115 D4，上位设计 Q3）。
 *
 * 整体替换命令（`replace-data-sources` / `replace-variables` / `replace-blueprint`）在提案里拆不开：
 * 两组改动各写一份整集合，先采纳的那组会被后采纳的那组覆盖回去。这里的命令只动点名的那几项，
 * 其余项原样保留，所以一份提案里的「版面」与「联动」可以各自独立采纳、以任意顺序采纳。
 *
 * - 新增：id 已存在即失败（`CORE_COMMAND_INVALID`），不做隐式覆盖；
 * - 删除 / 更新：目标不存在即失败（`CORE_COMMAND_TARGET_MISSING`）；
 * - 引用完整性（删变量时还有人引用、连线指向不存在的节点）一律交给文档校验，失败关闭。
 */

/** 追加数据源实例。 */
export function applyAddDataSourcesCommand(
  document: ScreenDocument,
  dataSources: unknown,
): ScreenCommandResult {
  if (!Array.isArray(dataSources) || dataSources.length === 0) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Data sources to add must be a non-empty array.', ['dataSources']),
    );
  }
  const taken = new Set((document.dataSources ?? []).map((instance) => instance.id));
  const duplicate = duplicateIndex(dataSources, taken);
  if (duplicate !== undefined) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Data source id already exists.', ['dataSources', duplicate, 'id']),
    );
  }
  const finalized = finalizeScreenCommand(
    document,
    { ...document, dataSources: [...(document.dataSources ?? []), ...dataSources] },
    [],
  );
  if (!finalized.ok) return finalized;
  const added = dataSources.map((instance) => (instance as { id: string }).id);
  return {
    ...finalized,
    changedComponentIds: componentsReferencingDataSources(finalized.document, added),
  };
}

/**
 * 合并一个数据源实例的参数：给出的参数写入，`null` 删除该参数，没给的保持原样。
 * 读这个实例的组件计为变更（参数变了，结果要重取）。
 */
export function applyUpdateDataSourceParamsCommand(
  document: ScreenDocument,
  dataSourceId: unknown,
  params: unknown,
): ScreenCommandResult {
  if (typeof dataSourceId !== 'string' || !isScreenComponentId(dataSourceId)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Data source id is invalid.', ['dataSourceId']),
    );
  }
  if (!isRecord(params) || Object.keys(params).length === 0) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Params patch must be a non-empty object.', ['params']),
    );
  }
  const list = document.dataSources ?? [];
  const index = list.findIndex((instance) => instance.id === dataSourceId);
  const target = list[index];
  if (target === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['dataSourceId'],
        'Data source target does not exist.',
      ),
    );
  }
  const next: Record<string, unknown> = { ...target.params };
  for (const [name, value] of Object.entries(params)) {
    if (value === null) delete next[name];
    else next[name] = value;
  }
  if (screenJsonEquals(target.params, next)) return screenCommandSuccess(document, []);
  const dataSources = list.map((instance, at) =>
    at === index ? { ...instance, params: next } : instance,
  );
  const finalized = finalizeScreenCommand(document, { ...document, dataSources }, []);
  if (!finalized.ok) return finalized;
  return {
    ...finalized,
    changedComponentIds: componentsReferencingDataSources(finalized.document, [dataSourceId]),
  };
}

/** 追加变量。 */
export function applyAddVariablesCommand(
  document: ScreenDocument,
  variables: unknown,
): ScreenCommandResult {
  if (!Array.isArray(variables) || variables.length === 0) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Variables to add must be a non-empty array.', ['variables']),
    );
  }
  const taken = new Set(document.variables.map((variable) => variable.id));
  const duplicate = duplicateIndex(variables, taken);
  if (duplicate !== undefined) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Variable id already exists.', ['variables', duplicate, 'id']),
    );
  }
  return finalizeScreenCommand(
    document,
    { ...document, variables: [...document.variables, ...variables] },
    [],
  );
}

/** 删除变量；还有组件、数据源或蓝图引用它时由文档校验拒绝。 */
export function applyRemoveVariablesCommand(
  document: ScreenDocument,
  variableIds: unknown,
): ScreenCommandResult {
  const ids = readIds(variableIds);
  if (ids === undefined) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Variable ids must be a non-empty array of ids.', ['variableIds']),
    );
  }
  const known = new Set(document.variables.map((variable) => variable.id));
  const missing = ids.findIndex((id) => !known.has(id));
  if (missing >= 0) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['variableIds', missing],
        'Variable target does not exist.',
      ),
    );
  }
  const removed = new Set(ids);
  return finalizeScreenCommand(
    document,
    { ...document, variables: document.variables.filter((variable) => !removed.has(variable.id)) },
    [],
  );
}

/** 追加蓝图节点与连线（任一侧可为空数组，两侧不能都为空）。 */
export function applyAddBlueprintElementsCommand(
  document: ScreenDocument,
  nodes: unknown,
  edges: unknown,
): ScreenCommandResult {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length + edges.length === 0) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Blueprint nodes and edges must be arrays, not both empty.', []),
    );
  }
  const nodeTaken = new Set(document.blueprint.nodes.map((node) => node.id));
  const nodeDuplicate = duplicateIndex(nodes, nodeTaken);
  if (nodeDuplicate !== undefined) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Blueprint node id already exists.', ['nodes', nodeDuplicate, 'id']),
    );
  }
  const edgeTaken = new Set(document.blueprint.edges.map((edge) => edge.id));
  const edgeDuplicate = duplicateIndex(edges, edgeTaken);
  if (edgeDuplicate !== undefined) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Blueprint edge id already exists.', ['edges', edgeDuplicate, 'id']),
    );
  }
  const blueprint = {
    ...document.blueprint,
    nodes: [...document.blueprint.nodes, ...nodes],
    edges: [...document.blueprint.edges, ...edges],
  };
  return finalizeScreenCommand(document, { ...document, blueprint }, []);
}

/**
 * 删除蓝图节点与连线。删节点时连带删掉接在它上面的连线与它的布局位置——只删节点、留下悬空连线
 * 的文档本来就不合法，让调用方逐条列出这些连线没有意义。
 */
export function applyRemoveBlueprintElementsCommand(
  document: ScreenDocument,
  nodeIds: unknown,
  edgeIds: unknown,
): ScreenCommandResult {
  const nodes = readIds(nodeIds, true);
  const edges = readIds(edgeIds, true);
  if (nodes === undefined || edges === undefined || nodes.length + edges.length === 0) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Blueprint node and edge ids must be arrays, not both empty.', []),
    );
  }
  const knownNodes = new Set(document.blueprint.nodes.map((node) => node.id));
  const missingNode = nodes.findIndex((id) => !knownNodes.has(id));
  if (missingNode >= 0) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['nodeIds', missingNode],
        'Blueprint node does not exist.',
      ),
    );
  }
  const knownEdges = new Set(document.blueprint.edges.map((edge) => edge.id));
  const missingEdge = edges.findIndex((id) => !knownEdges.has(id));
  if (missingEdge >= 0) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['edgeIds', missingEdge],
        'Blueprint edge does not exist.',
      ),
    );
  }
  const removedNodes = new Set(nodes);
  const removedEdges = new Set(edges);
  const touches = (edge: ScreenBlueprint['edges'][number]): boolean =>
    removedNodes.has(edge.from.node) || removedNodes.has(edge.to.node);
  const layout = document.blueprint.layout;
  const blueprint: ScreenBlueprint = {
    ...document.blueprint,
    nodes: document.blueprint.nodes.filter((node) => !removedNodes.has(node.id)),
    edges: document.blueprint.edges.filter((edge) => !removedEdges.has(edge.id) && !touches(edge)),
    ...(layout === undefined
      ? {}
      : {
          layout: { ...layout, nodes: layout.nodes.filter((node) => !removedNodes.has(node.id)) },
        }),
  };
  return finalizeScreenCommand(document, { ...document, blueprint }, []);
}

/** 第一个缺 id、id 重复（与已有或彼此）的元素下标；都合格返回 undefined。 */
function duplicateIndex(items: readonly unknown[], taken: ReadonlySet<string>): number | undefined {
  const seen = new Set(taken);
  for (const [index, item] of items.entries()) {
    const id = isRecord(item) && typeof item.id === 'string' ? item.id : undefined;
    if (id === undefined || seen.has(id)) return index;
    seen.add(id);
  }
  return undefined;
}

/** id 数组：元素都是字符串且不重复；`allowEmpty` 时空数组合法。 */
function readIds(value: unknown, allowEmpty = false): readonly string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return undefined;
  if (value.some((id) => typeof id !== 'string')) return undefined;
  const ids = value as string[];
  return new Set(ids).size === ids.length ? ids : undefined;
}
