import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/engine';
import type { BaseScreenViewerElement } from '@base-screen/renderer';
import type { BaseScreenMountElement, BaseScreenMountHandle } from './mount-handle.js';
import type {
  BaseScreenDesignerMountOptions,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerMountOptions,
} from './runtime.js';
import { runtimeFailure, runtimeSuccess } from './runtime-diagnostics.js';
import { setBaseScreenMountCatalogOwnership } from './runtime-mounts.js';

export type BaseScreenMountControllerReady<TElement extends BaseScreenMountElement> = (
  handle: BaseScreenMountHandle<TElement>,
) => void | (() => void);

export interface BaseScreenMountController<TElement extends BaseScreenMountElement, TOptions> {
  readonly handle: BaseScreenMountHandle<TElement> | undefined;
  readonly diagnostics: readonly ScreenDiagnostic[];
  /** 保存后续 attach 的初始化快照；只有 catalog 新引用会热刷新当前实例，失败可显式重试。 */
  updateOptions(options: TOptions): ScreenParseResult<null>;
  attach(container: Element): Promise<ScreenParseResult<BaseScreenMountHandle<TElement>>>;
  /** 释放当前句柄；若 attach 仍在等待，Promise 落地后会立即释放并失败关闭。 */
  detach(): Promise<ScreenParseResult<null>>;
}

export interface CreateBaseScreenDesignerMountControllerOptions {
  readonly runtime: BaseScreenRuntime;
  readonly options: BaseScreenDesignerMountOptions;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export interface CreateBaseScreenViewerMountControllerOptions {
  readonly runtime: BaseScreenRuntime;
  readonly options: BaseScreenViewerMountOptions;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenViewerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

interface ControllerRequest<
  TElement extends BaseScreenMountElement,
  TOptions extends { readonly catalog?: BaseScreenRuntimeCatalog },
> {
  readonly options: TOptions;
  readonly readCatalog: (options: TOptions) => BaseScreenRuntimeCatalog;
  readonly readElementCatalog: (element: TElement) => BaseScreenRuntimeCatalog | undefined;
  readonly refreshCatalog: (
    element: TElement,
    catalog: BaseScreenRuntimeCatalog,
  ) => ScreenParseResult<unknown>;
  readonly mount: (
    container: Element,
    options: TOptions,
  ) => Promise<ScreenParseResult<BaseScreenMountHandle<TElement>>>;
  readonly onMounted?: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

function createMountController<
  TElement extends BaseScreenMountElement,
  TOptions extends { readonly catalog?: BaseScreenRuntimeCatalog },
>(request: ControllerRequest<TElement, TOptions>): BaseScreenMountController<TElement, TOptions> {
  let currentOptions = { ...request.options };
  let handle: BaseScreenMountHandle<TElement> | undefined;
  let appliedCatalog: BaseScreenRuntimeCatalog | undefined;
  let diagnostics: readonly ScreenDiagnostic[] = [];
  let lifecycleDiagnostics: readonly ScreenDiagnostic[] = [];
  let catalogDiagnostics: readonly ScreenDiagnostic[] = [];
  let generation = 0;
  let diagnosticsPublished = false;
  let pending: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(
    operation: () => Promise<ScreenParseResult<T>>,
  ): Promise<ScreenParseResult<T>> => {
    const result = pending.then(operation);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const publishDiagnostics = (next: readonly ScreenDiagnostic[]): void => {
    lifecycleDiagnostics = next;
    const combined = [...lifecycleDiagnostics, ...catalogDiagnostics];
    const unchanged =
      diagnosticsPublished &&
      combined.length === diagnostics.length &&
      combined.every((item, index) => {
        const previous = diagnostics[index];
        return (
          previous !== undefined &&
          item.code === previous.code &&
          item.severity === previous.severity &&
          item.message === previous.message &&
          item.path.length === previous.path.length &&
          item.path.every((part, position) => part === previous.path[position])
        );
      });
    diagnostics = combined;
    if (unchanged) return;
    diagnosticsPublished = true;
    request.onDiagnostics?.(diagnostics);
  };
  const refreshCatalog = (): ScreenParseResult<null> => {
    if (handle === undefined) return runtimeSuccess(null);
    const catalog = request.readCatalog(currentOptions);
    if (catalog === (request.readElementCatalog(handle.element) ?? appliedCatalog)) {
      appliedCatalog = catalog;
      setBaseScreenMountCatalogOwnership(handle, currentOptions.catalog, catalog);
      if (catalogDiagnostics.length > 0) {
        catalogDiagnostics = [];
        publishDiagnostics(lifecycleDiagnostics);
      }
      return runtimeSuccess(null);
    }
    let result: ScreenParseResult<unknown>;
    try {
      result = request.refreshCatalog(handle.element, catalog);
    } catch {
      result = runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen catalog refresh threw an error.',
        ['controller', 'catalog'],
      );
    }
    if (result.ok) {
      appliedCatalog = catalog;
      setBaseScreenMountCatalogOwnership(handle, currentOptions.catalog, catalog);
    }
    catalogDiagnostics = result.ok ? [] : result.diagnostics;
    publishDiagnostics(lifecycleDiagnostics);
    return result.ok ? runtimeSuccess(null) : result;
  };
  const releaseHandle = async (): Promise<ScreenParseResult<null>> => {
    const active = handle;
    handle = undefined;
    if (active === undefined) return runtimeSuccess(null);
    const result = await active.dispose();
    if (!result.ok) publishDiagnostics(result.diagnostics);
    return result;
  };
  const staleFailure = <T>(): ScreenParseResult<T> =>
    runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Base Screen mount controller was detached while attaching.',
      ['controller'],
    );

  return Object.freeze({
    get handle(): BaseScreenMountHandle<TElement> | undefined {
      return handle;
    },
    get diagnostics(): readonly ScreenDiagnostic[] {
      return diagnostics;
    },
    updateOptions(options: TOptions): ScreenParseResult<null> {
      currentOptions = { ...options };
      return refreshCatalog();
    },
    attach(container: Element): Promise<ScreenParseResult<BaseScreenMountHandle<TElement>>> {
      const currentGeneration = ++generation;
      return enqueue(async () => {
        if (currentGeneration !== generation) return staleFailure();
        const released = await releaseHandle();
        if (!released.ok) return released;
        if (currentGeneration !== generation) return staleFailure();

        // 固定本次初始化快照；等待项目加载期间只补齐最新 catalog，不重新 configure/load。
        const mountOptions = currentOptions;
        const mountCatalog = request.readCatalog(mountOptions);
        let mounted: ScreenParseResult<BaseScreenMountHandle<TElement>>;
        try {
          mounted = await request.mount(container, mountOptions);
        } catch {
          mounted = runtimeFailure(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            'Base Screen mount request threw an error.',
            ['controller', 'mount'],
          );
        }
        if (currentGeneration !== generation) {
          const disposal = mounted.ok ? await mounted.value.dispose() : mounted;
          const stale = staleFailure<BaseScreenMountHandle<TElement>>();
          if (!disposal.ok) {
            const failed = {
              ok: false as const,
              diagnostics: [...stale.diagnostics, ...disposal.diagnostics],
            };
            publishDiagnostics(failed.diagnostics);
            return failed;
          }
          return stale;
        }
        if (!mounted.ok) {
          publishDiagnostics(mounted.diagnostics);
          return mounted;
        }

        const active = mounted.value;
        handle = active;
        appliedCatalog = mountCatalog;
        catalogDiagnostics = [];
        publishDiagnostics([]);
        const refreshed = refreshCatalog();
        try {
          const cleanup = request.onMounted?.(active);
          if (typeof cleanup === 'function') active.onDispose(cleanup);
        } catch {
          await releaseHandle();
          const failed = runtimeFailure<BaseScreenMountHandle<TElement>>(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            'Base Screen mounted callback threw an error.',
            ['controller', 'onMounted'],
          );
          publishDiagnostics(failed.diagnostics);
          return failed;
        }
        return refreshed.ok ? mounted : refreshed;
      });
    },
    detach(): Promise<ScreenParseResult<null>> {
      generation += 1;
      return enqueue(releaseHandle);
    },
  });
}

export function createBaseScreenDesignerMountController(
  options: CreateBaseScreenDesignerMountControllerOptions,
): BaseScreenMountController<BaseScreenDesignerElement, BaseScreenDesignerMountOptions> {
  return createMountController({
    options: options.options,
    ...(options.onMounted !== undefined ? { onMounted: options.onMounted } : {}),
    ...(options.onDiagnostics !== undefined ? { onDiagnostics: options.onDiagnostics } : {}),
    readCatalog: (mountOptions) => mountOptions.catalog ?? options.runtime.catalog,
    readElementCatalog: (element) => element.catalog,
    refreshCatalog: (element, catalog) => element.refreshCatalog(catalog),
    mount: (container, mountOptions) => options.runtime.mountDesigner(container, mountOptions),
  });
}

export function createBaseScreenViewerMountController(
  options: CreateBaseScreenViewerMountControllerOptions,
): BaseScreenMountController<BaseScreenViewerElement, BaseScreenViewerMountOptions> {
  return createMountController({
    options: options.options,
    ...(options.onMounted !== undefined ? { onMounted: options.onMounted } : {}),
    ...(options.onDiagnostics !== undefined ? { onDiagnostics: options.onDiagnostics } : {}),
    readCatalog: (mountOptions) => mountOptions.catalog ?? options.runtime.catalog,
    readElementCatalog: (element) => element.catalog,
    refreshCatalog: (element, catalog) => element.refreshCatalog(catalog),
    mount: (container, mountOptions) => options.runtime.mountViewer(container, mountOptions),
  });
}
