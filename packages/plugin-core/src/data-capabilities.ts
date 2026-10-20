import type { ScreenDataSourceSource, ScreenValueRef } from '@base-screen/contracts';

/** 物料声明的取数能力（manifest `dataCapabilities` 的元素）。 */
export type BaseScreenDataCapability = 'static' | 'dataset' | 'host-resource' | 'variable';

/**
 * 一个取值引用是否被物料的数据能力接受。
 *
 * 旧的四形态（`dataSource.type`）与取值引用是同一件事的两种写法，映射固定：
 * - `inline` ↔ `static`
 * - `variable` ↔ `variable`
 * - `data-source-field` 按**来源**分：`dataset` → `dataset`，`host-resource` → `host-resource`；
 *   `host-catalog` / `url-query` 在旧模型里就是变量来源，因此与 `variable` 同权。
 *
 * 物料 manifest 契约不变：声明仍写在 `dataCapabilities` 里，这里只提供唯一判定入口，
 * 避免渲染器自己拼一套映射。
 *
 * @param capabilities 物料声明的数据能力。
 * @param ref 组件 `dataValue` 的取值引用。
 * @param source 该引用指向的数据源实例来源（`data-source-field` 时必填）。
 */
export function screenValueRefAccepted(
  capabilities: readonly BaseScreenDataCapability[],
  ref: ScreenValueRef,
  source: ScreenDataSourceSource | undefined,
): boolean {
  switch (ref.kind) {
    case 'inline':
      return capabilities.includes('static');
    case 'variable':
      return capabilities.includes('variable');
    default:
      if (source === undefined) return false;
      switch (source.kind) {
        case 'dataset':
          return capabilities.includes('dataset');
        case 'host-resource':
          return capabilities.includes('host-resource');
        default:
          return capabilities.includes('variable');
      }
  }
}
