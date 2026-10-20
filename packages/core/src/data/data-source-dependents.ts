import type { ScreenDocument } from '@base-screen/contracts';

/**
 * 引用了指定数据源实例的组件 id（按文档顺序）。
 *
 * 实例结果变化时，读它的组件必须重投影：值不在组件上，而在「实例 + 取值引用」这条链上，
 * 因此「组件被 patch」不是唯一的重绘判据。这里只读组件 `dataValue`：旧 `dataSource`
 * 四形态没有文档级实例，随 T05 消失。
 *
 * @param document 读取哪份文档的组件（通常取命令执行后的文档）。
 * @param dataSourceIds 本次发生变化的实例 id。
 */
export function componentsReferencingDataSources(
  document: ScreenDocument,
  dataSourceIds: Iterable<string>,
): readonly string[] {
  const targets = new Set(dataSourceIds);
  if (targets.size === 0) return [];
  const affected: string[] = [];
  for (const component of document.components) {
    const ref = component.dataValue;
    if (ref?.kind !== 'data-source-field') continue;
    if (targets.has(ref.dataSourceId)) affected.push(component.id);
  }
  return affected;
}
