import type { ScreenDataBinding, ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import { canonicalJsonString } from '../canonical-json.js';

/**
 * 挂载物料的**投影**状态。请求与缓存已上移到数据源实例（`DataSourceRuntime`）：
 * 这里只剩「这个组件怎么把实例结果投影成自己的 dataState」，不再持有 raw identity、
 * 原始值或请求槽位——同一实例被多个组件引用时，那些东西必须是共享的一份。
 */
export type MountedProjectionState = {
  /** 投影身份：由组件字段映射派生（`path` + `dataBinding`），只影响本地重投影。 */
  projectionKey: string | undefined;
  /** Material-facing data state（idle/loading/ready/error）。 */
  dataState: BaseScreenMaterialDataState;
};

export function createMountedProjectionState(): MountedProjectionState {
  return { projectionKey: undefined, dataState: { status: 'idle' } };
}

/**
 * 投影身份：字段映射的规范序列化。
 *
 * 与请求键分开是硬约束：映射变化只重跑本地投影，绝不重新发请求。
 */
export function getProjectionKey(binding: ScreenDataBinding | null): string {
  return canonicalJsonString(binding as unknown as ScreenJsonValue);
}
