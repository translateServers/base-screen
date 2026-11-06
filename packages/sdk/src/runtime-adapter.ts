import type { BaseScreenDesignerElement } from '@base-screen/engine';
import type { BaseScreenRuntime, BaseScreenRuntimeCatalog } from './runtime.js';
import { runtimeFailure, runtimeSuccess } from './runtime-diagnostics.js';
import { createBaseScreenRuntimeMounts } from './runtime-mounts.js';

/**
 * 既有宿主 runtime 的组合层投影：manager、catalog 与插件贡献仍归宿主所有，
 * 组合层只补齐挂载句柄、catalog 替换和销毁编排。
 */
export interface BaseScreenRuntimeHost {
  readonly instanceId: string;
  readonly manager: BaseScreenRuntime['manager'];
  /** 可写：在线物料上下架会整体替换宿主 catalog。 */
  catalog: BaseScreenRuntimeCatalog;
  readonly pluginCatalog: BaseScreenRuntime['pluginCatalog'];
  readonly pluginPanels: BaseScreenRuntime['pluginPanels'];
  readonly inspectorControls: BaseScreenRuntime['inspectorControls'];
  readonly runtimeContributions: BaseScreenRuntime['runtimeContributions'];
  readonly pluginCommandPort: BaseScreenRuntime['pluginCommandPort'];
  bindDesigner(element: BaseScreenDesignerElement | null): void;
  readonly disposed: boolean;
  dispose(): Promise<void>;
}

/**
 * 把已经激活的 HostRuntime 适配成 BaseScreenRuntime。
 *
 * 不创建 plugin manager、不重复注册元素，适合宿主已经拥有 manager/catalog、
 * 在线物料热更新与自定义命令端口的场景。调用 dispose() 会先释放组合层挂载句柄，
 * 再委托宿主释放自己的 manager。
 */
export function adoptBaseScreenRuntime(host: BaseScreenRuntimeHost): BaseScreenRuntime {
  const mounts = createBaseScreenRuntimeMounts({
    instanceId: host.instanceId,
    readCatalog: () => host.catalog,
    pluginCatalog: host.pluginCatalog,
    pluginPanels: host.pluginPanels,
    inspectorControls: host.inspectorControls,
    runtimeContributions: host.runtimeContributions,
    pluginCommandPort: host.pluginCommandPort,
    bindDesigner: (element) => host.bindDesigner(element),
    releaseDesigner: () => host.bindDesigner(null),
    isDisposed: () => host.disposed,
  });

  return Object.freeze({
    instanceId: host.instanceId,
    manager: host.manager,
    get catalog(): BaseScreenRuntimeCatalog {
      return host.catalog;
    },
    pluginCatalog: host.pluginCatalog,
    pluginPanels: host.pluginPanels,
    inspectorControls: host.inspectorControls,
    runtimeContributions: host.runtimeContributions,
    pluginCommandPort: host.pluginCommandPort,
    get disposed(): boolean {
      return host.disposed;
    },
    bindDesigner: (element) => host.bindDesigner(element),
    setCatalog(catalog) {
      if (host.disposed) {
        return runtimeFailure(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen host runtime is already disposed.',
          ['host'],
        );
      }
      host.catalog = catalog;
      return runtimeSuccess(null);
    },
    mountDesigner: mounts.mountDesigner,
    mountViewer: mounts.mountViewer,
    async dispose() {
      const mounted = await mounts.disposeAll();
      if (!mounted.ok) return mounted;
      try {
        await host.dispose();
        return runtimeSuccess(null);
      } catch {
        return runtimeFailure(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen host runtime disposal failed.',
          ['host'],
        );
      }
    },
  } satisfies BaseScreenRuntime);
}
