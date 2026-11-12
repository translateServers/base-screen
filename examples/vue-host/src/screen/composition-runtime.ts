import { type HostRuntime, loadHostRuntime } from './host-runtime';

/** 编辑页与查看页共享同一个标准 runtime 及宿主在线物料状态。 */
export function loadVueDesignerRuntime(): Promise<HostRuntime> {
  return loadHostRuntime();
}
