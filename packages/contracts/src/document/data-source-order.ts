import type { ScreenDiagnostic } from '../types/diagnostics.js';
import type { ScreenDataSource, ScreenDocument } from '../types/document.js';

/**
 * 数据源参数图的形状：节点是实例 id，边 `X → Y` 表示「实例 X 的某个参数取自实例 Y 的输出」，
 * 即 `Y` 必须先求值。
 *
 * 自引用边与悬空边不参与建图：前者由 `DATA_SOURCE_PARAM_SELF_REFERENCE` 单独诊断，
 * 后者由 `VALUE_REF_TARGET_MISSING` 单独诊断，二者都不是排序或成环问题。
 */
interface DataSourceParamGraph {
  /** 按文档顺序去重后的实例（同 id 只保留首次出现）。 */
  readonly instances: readonly ScreenDataSource[];
  /** id → 在 `document.dataSources` 中的下标（首次出现）。 */
  readonly positions: ReadonlyMap<string, number>;
  /** 去重且排除了自引用/悬空边之后的依赖表：`X → [Y...]` 表示 X 依赖 Y。 */
  readonly dependencies: ReadonlyMap<string, readonly string[]>;
}

function buildParamGraph(document: ScreenDocument): DataSourceParamGraph {
  const declared = document.dataSources ?? [];
  const instances: ScreenDataSource[] = [];
  const positions = new Map<string, number>();
  declared.forEach((instance, index) => {
    if (positions.has(instance.id)) return;
    positions.set(instance.id, index);
    instances.push(instance);
  });
  const dependencies = new Map<string, string[]>();
  for (const instance of instances) dependencies.set(instance.id, []);
  for (const instance of instances) {
    const targets = dependencies.get(instance.id);
    if (targets === undefined) continue;
    for (const param of Object.values(instance.params)) {
      if (param.kind !== 'data-source-field') continue;
      const target = param.dataSourceId;
      if (target === instance.id) continue;
      if (!positions.has(target)) continue;
      if (!targets.includes(target)) targets.push(target);
    }
  }
  return { instances, positions, dependencies };
}

function sortByDocumentOrder(ids: string[], positions: ReadonlyMap<string, number>): void {
  ids.sort((left, right) => (positions.get(left) ?? 0) - (positions.get(right) ?? 0));
}

/**
 * 数据源实例的求值顺序：唯一实现（Kahn，依赖已满足的实例按文档顺序出队，因此结果确定）。
 *
 * 语义是「依赖在前」：若 X 的参数取自 Y 的输出，则 Y 一定排在 X 之前，消费者按此顺序
 * 发起请求即可保证参数读到的是已就绪结果。成环的实例不会被输出——环在解析期已被拒绝，
 * 能被解析的文档不会走到这里。
 */
export function screenDataSourceOrder(document: ScreenDocument): readonly string[] {
  const { instances, positions, dependencies } = buildParamGraph(document);
  const dependents = new Map<string, string[]>();
  for (const instance of instances) dependents.set(instance.id, []);
  const pending = new Map<string, number>();
  for (const instance of instances) {
    const targets = dependencies.get(instance.id) ?? [];
    pending.set(instance.id, targets.length);
    for (const target of targets) dependents.get(target)?.push(instance.id);
  }
  const ready = instances
    .filter((instance) => pending.get(instance.id) === 0)
    .map((instance) => instance.id);
  sortByDocumentOrder(ready, positions);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (pending.get(dependent) ?? 0) - 1;
      pending.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
    sortByDocumentOrder(ready, positions);
  }
  return order;
}

/**
 * 数据源参数成环诊断：每个强连通分量一条，路径取该分量内文档下标最小的实例上
 * 指向分量内部的最小参数名（字典序）——同一文档重复调用结果完全一致。
 */
export function diagnoseDataSourceCycles(document: ScreenDocument): readonly ScreenDiagnostic[] {
  const { instances, positions, dependencies } = buildParamGraph(document);
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const components = stronglyConnectedComponents(
    instances.map((instance) => instance.id),
    dependencies,
  );
  const reports: ScreenDiagnostic[] = [];
  for (const component of components) {
    if (component.length < 2) continue;
    const members = new Set(component);
    const ordered = [...component];
    sortByDocumentOrder(ordered, positions);
    const head = ordered[0];
    if (head === undefined) continue;
    const instance = byId.get(head);
    if (instance === undefined) continue;
    reports.push({
      severity: 'error',
      code: 'DATA_SOURCE_PARAM_CYCLE',
      path: [
        'dataSources',
        positions.get(head) ?? 0,
        'params',
        firstCycleParam(instance, members),
        'dataSourceId',
      ],
      message: `Data source parameters form a cycle across ${ordered.length} data sources.`,
    });
  }
  return reports.sort((left, right) => Number(left.path[1]) - Number(right.path[1]));
}

function firstCycleParam(instance: ScreenDataSource, members: ReadonlySet<string>): string {
  const names = Object.keys(instance.params).sort();
  for (const name of names) {
    const param = instance.params[name];
    if (
      param !== undefined &&
      param.kind === 'data-source-field' &&
      members.has(param.dataSourceId)
    ) {
      return name;
    }
  }
  return names[0] ?? '';
}

/** Tarjan 强连通分量；节点上限受文档限制约束，递归深度与实例数同阶。 */
function stronglyConnectedComponents(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): readonly (readonly string[])[] {
  const visitIndex = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let nextIndex = 0;

  const visit = (node: string): void => {
    visitIndex.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of edges.get(node) ?? []) {
      if (!visitIndex.has(target)) {
        visit(target);
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, lowLink.get(target) ?? 0));
      } else if (onStack.has(target)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, visitIndex.get(target) ?? 0));
      }
    }
    if (lowLink.get(node) !== visitIndex.get(node)) return;
    const component: string[] = [];
    for (;;) {
      const member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    components.push(component);
  };

  for (const node of nodes) {
    if (!visitIndex.has(node)) visit(node);
  }
  return components;
}
