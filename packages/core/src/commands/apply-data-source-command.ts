import {
  type ScreenDataSource,
  type ScreenDocument,
  screenJsonEquals,
} from '@base-screen/contracts';
import { componentsReferencingDataSources } from '../data/data-source-dependents.js';
import {
  finalizeScreenCommand,
  invalidScreenCommand,
  screenCommandFailure,
  screenCommandSuccess,
} from './command-result.js';
import type { ScreenCommandResult } from './types.js';

/**
 * 整组替换文档级数据源实例。
 *
 * 结构共享：新集合里与旧集合**同 id 且内容相等**的实例按引用复用旧对象，因此下游
 * 「引用未变」的短路判据（`getNetChangedComponentIds`、历史快照 diff）仍然成立，
 * 不会因为一次整组替换把全部实例判成变更。
 *
 * 变更组件 = 引用了本次被改写实例的组件：值不在组件上，而在「实例 + 取值引用」这条链上，
 * 所以实例变了，读它的组件必须重投影。
 *
 * @param document 当前文档。
 * @param dataSources 新的实例集合（未校验的原始值，交由 `finalizeScreenCommand` 解析）。
 */
export function applyReplaceDataSourcesCommand(
  document: ScreenDocument,
  dataSources: unknown,
): ScreenCommandResult {
  if (!Array.isArray(dataSources)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Data sources must be an array.', ['dataSources']),
    );
  }
  const previous = document.dataSources ?? [];
  const previousById = new Map(previous.map((instance) => [instance.id, instance]));
  const next = dataSources.map((instance) => {
    const id = readInstanceId(instance);
    if (id === undefined) return instance;
    const before = previousById.get(id);
    return before !== undefined && screenJsonEquals(before, instance) ? before : instance;
  });
  if (isSameInstances(previous, next)) {
    return screenCommandSuccess(document, []);
  }
  const finalized = finalizeScreenCommand(document, { ...document, dataSources: next }, []);
  if (!finalized.ok) return finalized;
  const dependents = componentsReferencingDataSources(
    finalized.document,
    changedDataSourceIds(previous, finalized.document.dataSources ?? []),
  );
  return { ...finalized, changedComponentIds: dependents };
}

/**
 * 两侧集合里内容不相等的实例 id（新增、删除、改写都算变更）。
 *
 * 命令级 `changedComponentIds` 与事务级「净变更组件」共用这一条判据，避免两处口径不同。
 */
export function changedDataSourceIds(
  before: readonly ScreenDataSource[],
  after: readonly ScreenDataSource[],
): readonly string[] {
  const beforeById = new Map(before.map((instance) => [instance.id, instance]));
  const afterById = new Map(after.map((instance) => [instance.id, instance]));
  const changed: string[] = [];
  for (const [id, instance] of beforeById) {
    const next = afterById.get(id);
    if (next === undefined || !screenJsonEquals(instance, next)) changed.push(id);
  }
  for (const id of afterById.keys()) {
    if (!beforeById.has(id)) changed.push(id);
  }
  return changed;
}

/** 引用相等即「没变」：上面已对未变实例做结构共享。 */
function isSameInstances(before: readonly ScreenDataSource[], after: readonly unknown[]): boolean {
  return (
    before.length === after.length && after.every((instance, index) => instance === before[index])
  );
}

function readInstanceId(instance: unknown): string | undefined {
  if (instance === null || typeof instance !== 'object' || Array.isArray(instance)) {
    return undefined;
  }
  const id = (instance as { readonly id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}
