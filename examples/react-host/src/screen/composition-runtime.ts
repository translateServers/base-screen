import { adoptBaseScreenRuntime, type BaseScreenRuntime } from '@base-screen/sdk';
import { loadHostRuntime } from './host-runtime';

let runtimePromise: Promise<BaseScreenRuntime> | undefined;

/**
 * React 编辑页复用应用级 HostRuntime 单例；组合层只补挂载与销毁编排，
 * 不新建插件管理器，也不复制宿主的在线物料状态。
 */
export function loadReactDesignerRuntime(): Promise<BaseScreenRuntime> {
  runtimePromise ??= loadHostRuntime()
    .then((host) => adoptBaseScreenRuntime(host))
    .catch((error: unknown) => {
      runtimePromise = undefined;
      throw error;
    });
  return runtimePromise;
}
