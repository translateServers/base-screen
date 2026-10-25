import { screenJsonEquals } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog, BaseScreenMaterialCatalogEntry } from './contracts.js';

/** 两次 catalog 快照之间的物料身份差异；数组按 type 排序。 */
export interface BaseScreenMaterialCatalogDiff {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];
  /** changed 中 constructor / tagName / tabular adapter 发生变化的类型：必须重挂载。 */
  readonly implementationChanged: readonly string[];
}

/**
 * 两个目录项是否指向同一份可复用定义。
 *
 * Manifest 使用结构相等（catalog 构造时会克隆并冻结 Manifest，不能按引用比较）；
 * constructor、tagName 与 tabular adapter 仍按引用比较：任一变化都意味着代码身份变化。
 */
export function sameBaseScreenMaterialDefinition(
  left: BaseScreenMaterialCatalogEntry,
  right: BaseScreenMaterialCatalogEntry,
): boolean {
  return (
    sameBaseScreenMaterialIdentity(left, right) && screenJsonEquals(left.manifest, right.manifest)
  );
}

/** 代码身份：Manifest 内容之外的 constructor / tagName / adapter 身份。 */
function sameBaseScreenMaterialIdentity(
  left: BaseScreenMaterialCatalogEntry,
  right: BaseScreenMaterialCatalogEntry,
): boolean {
  return (
    left.manifest.type === right.manifest.type &&
    left.manifest.tagName === right.manifest.tagName &&
    left.constructor === right.constructor &&
    left.tabularDataAdapter === right.tabularDataAdapter
  );
}

export function diffBaseScreenMaterialCatalogs(
  before: BaseScreenMaterialCatalog,
  after: BaseScreenMaterialCatalog,
): BaseScreenMaterialCatalogDiff {
  const beforeEntries = new Map(
    before.list().map((entry) => [entry.manifest.type, entry] as const),
  );
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const implementationChanged: string[] = [];
  for (const entry of after.list()) {
    const type = entry.manifest.type;
    const previous = beforeEntries.get(type);
    if (previous === undefined) {
      added.push(type);
      continue;
    }
    if (sameBaseScreenMaterialDefinition(previous, entry)) {
      unchanged.push(type);
      continue;
    }
    changed.push(type);
    if (!sameBaseScreenMaterialIdentity(previous, entry)) implementationChanged.push(type);
  }
  const removed = [...beforeEntries.keys()].filter((type) => !after.has(type));
  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
    implementationChanged: implementationChanged.sort(),
  };
}
