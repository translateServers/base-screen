import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenDesignerElement } from '@base-screen/engine';
import {
  BASE_SCREEN_OFFICIAL_GROUP_MATERIAL_TYPE,
  BASE_SCREEN_OFFICIAL_TOOL_MATERIAL_TYPES,
} from './material.js';
import type { BaseScreenRuntime, BaseScreenRuntimeCatalog } from './runtime.js';
import {
  nullResult,
  runtimeDiagnostic,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';
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
  let disposed = false;
  let boundDesigner: BaseScreenDesignerElement | undefined;
  let disposePromise: Promise<ScreenParseResult<null>> | undefined;
  const bindDesigner = (element: BaseScreenDesignerElement | null): ScreenParseResult<null> => {
    if (disposed || host.disposed) {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen host runtime is already disposed.',
        ['host'],
      );
    }
    if (mounts.designer !== undefined && mounts.designer !== element) {
      return runtimeFailure(
        'PLUGIN_CORE_SESSION_INVALID',
        'Dispose the mounted Designer handle before changing its binding.',
        ['designer'],
      );
    }
    if (element !== null && boundDesigner !== undefined && boundDesigner !== element) {
      return runtimeFailure(
        'PLUGIN_CORE_SESSION_INVALID',
        'A runtime supports one Designer session. Release the current Designer or create a separate runtime.',
        ['designer'],
      );
    }
    try {
      host.bindDesigner(element);
      boundDesigner = element ?? undefined;
      return runtimeSuccess(null);
    } catch {
      return runtimeFailure('PLUGIN_CORE_LIFECYCLE_INVALID', 'Host Designer binding failed.', [
        'host',
        'designer',
      ]);
    }
  };
  const mounts = createBaseScreenRuntimeMounts({
    createDesignerElement: () => new BaseScreenDesignerElement(),
    toolMaterialTypes: BASE_SCREEN_OFFICIAL_TOOL_MATERIAL_TYPES,
    groupMaterialType: BASE_SCREEN_OFFICIAL_GROUP_MATERIAL_TYPE,
    instanceId: host.instanceId,
    readCatalog: () => host.catalog,
    pluginCatalog: host.pluginCatalog,
    pluginPanels: host.pluginPanels,
    inspectorControls: host.inspectorControls,
    runtimeContributions: host.runtimeContributions,
    pluginCommandPort: host.pluginCommandPort,
    bindDesigner,
    releaseDesigner: (element) => {
      if (boundDesigner === element) {
        try {
          host.bindDesigner(null);
        } finally {
          boundDesigner = undefined;
        }
      }
    },
    isDisposed: () => disposed || host.disposed,
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
      return disposed || host.disposed;
    },
    bindDesigner,
    setCatalog(catalog, options = {}) {
      if (disposed || host.disposed) {
        return runtimeFailure(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen host runtime is already disposed.',
          ['host'],
        );
      }
      if (options.target !== 'future-mounts') {
        const refreshed = mounts.refreshCatalog(host.catalog, catalog);
        if (!refreshed.ok) return refreshed;
      }
      host.catalog = catalog;
      return runtimeSuccess(null);
    },
    mountDesigner: mounts.mountDesigner,
    mountViewer: mounts.mountViewer,
    dispose() {
      disposed = true;
      disposePromise ??= Promise.resolve().then(async (): Promise<ScreenParseResult<null>> => {
        const mounted = await mounts.disposeAll();
        const diagnostics: ScreenDiagnostic[] = [...mounted.diagnostics];
        try {
          host.bindDesigner(null);
        } catch {
          diagnostics.push(
            runtimeDiagnostic('PLUGIN_CORE_LIFECYCLE_INVALID', 'Host Designer unbinding failed.', [
              'host',
              'designer',
            ]),
          );
        } finally {
          boundDesigner = undefined;
        }
        try {
          await host.dispose();
        } catch {
          diagnostics.push(
            runtimeDiagnostic(
              'PLUGIN_CORE_LIFECYCLE_INVALID',
              'Base Screen host runtime disposal failed.',
              ['host'],
            ),
          );
        }
        return nullResult(diagnostics);
      });
      return disposePromise;
    },
  } satisfies BaseScreenRuntime);
}
