import type { ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenRuntimeCatalog,
  BaseScreenSetCatalogOptions,
  BaseScreenViewerRuntime,
} from './runtime.js';
import {
  collectFailureDiagnostics,
  nullResult,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';
import {
  type BaseScreenRuntimeMountContext,
  createBaseScreenRuntimeMounts,
} from './runtime-mounts.js';
import type { BaseScreenRuntimeRegistration } from './runtime-registration.js';

interface RuntimeLifecycleOptions {
  readonly createDesignerElement?: BaseScreenRuntimeMountContext['createDesignerElement'];
  readonly toolMaterialTypes?: BaseScreenRuntimeMountContext['toolMaterialTypes'];
  readonly groupMaterialType?: string;
  readonly bindDesigner: BaseScreenRuntimeMountContext['bindDesigner'];
  readonly releaseDesigner: BaseScreenRuntimeMountContext['releaseDesigner'];
  readonly onDispose?: () => void;
}

/** 注册后的运行时共用目录事务、挂载跟踪和销毁，浏览器能力由调用方注入。 */
export function createBaseScreenRuntimeLifecycle(
  registration: BaseScreenRuntimeRegistration,
  options: RuntimeLifecycleOptions,
) {
  const { instanceId, manager, snapshot, pluginCommandPort } = registration;
  let disposed = false;
  let currentCatalog = snapshot.materials;
  let disposePromise: Promise<ScreenParseResult<null>> | undefined;
  const mounts = createBaseScreenRuntimeMounts({
    instanceId,
    readCatalog: () => currentCatalog,
    pluginCatalog: snapshot.plugins,
    pluginPanels: snapshot.panels,
    inspectorControls: snapshot.inspectorControls,
    runtimeContributions: snapshot.contributions,
    pluginCommandPort,
    ...(options.createDesignerElement === undefined
      ? {}
      : { createDesignerElement: options.createDesignerElement }),
    ...(options.toolMaterialTypes === undefined
      ? {}
      : { toolMaterialTypes: options.toolMaterialTypes }),
    ...(options.groupMaterialType === undefined
      ? {}
      : { groupMaterialType: options.groupMaterialType }),
    bindDesigner: options.bindDesigner,
    releaseDesigner: options.releaseDesigner,
    isDisposed: () => disposed,
  });
  const runtime: BaseScreenViewerRuntime = Object.freeze({
    instanceId,
    manager,
    get catalog() {
      return currentCatalog;
    },
    pluginCatalog: snapshot.plugins,
    pluginPanels: snapshot.panels,
    inspectorControls: snapshot.inspectorControls,
    runtimeContributions: snapshot.contributions,
    pluginCommandPort,
    get disposed() {
      return disposed;
    },
    setCatalog(
      catalog: BaseScreenRuntimeCatalog,
      updateOptions: BaseScreenSetCatalogOptions = {},
    ): ScreenParseResult<null> {
      if (disposed) {
        return runtimeFailure(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen runtime is already disposed.',
          ['runtime'],
        );
      }
      if (updateOptions.target !== 'future-mounts') {
        const refreshed = mounts.refreshCatalog(currentCatalog, catalog);
        if (!refreshed.ok) return refreshed;
      }
      currentCatalog = catalog;
      return runtimeSuccess(null);
    },
    mountViewer: mounts.mountViewer,
    dispose() {
      disposed = true;
      disposePromise ??= Promise.resolve().then(async () => {
        const results: ScreenParseResult<unknown>[] = [await mounts.disposeAll()];
        options.onDispose?.();
        results.push(await manager.dispose());
        return nullResult(collectFailureDiagnostics(results));
      });
      return disposePromise;
    },
  });
  return { runtime, mounts };
}
