import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT,
  type BaseScreenDesignerElement,
  type ScreenProjectState,
} from '@base-screen/engine';
import type { BaseScreenViewerElement } from '@base-screen/renderer';
import type { BaseScreenMountElement, BaseScreenMountHandle } from './mount-handle.js';
import type {
  BaseScreenDesignerMountOptions,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerMountOptions,
  BaseScreenViewerRuntime,
} from './runtime.js';
import {
  type BaseScreenMountDiagnosticContext,
  type BaseScreenMountDiagnosticsCallback,
  type BaseScreenMountResult,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';
import { setBaseScreenMountCatalogOwnership } from './runtime-mounts.js';

export type BaseScreenMountControllerReady<TElement extends BaseScreenMountElement> = (
  handle: BaseScreenMountHandle<TElement>,
) => void | (() => void);

export interface BaseScreenMountController<TElement extends BaseScreenMountElement, TOptions> {
  readonly handle: BaseScreenMountHandle<TElement> | undefined;
  readonly diagnostics: readonly ScreenDiagnostic[];
  readonly diagnosticContext: BaseScreenMountDiagnosticContext | undefined;
  /** 保存后续 attach 的初始化快照；只有 catalog 新引用会热刷新当前实例，失败可显式重试。 */
  updateOptions(options: TOptions): ScreenParseResult<null>;
  attach(container: Element): Promise<BaseScreenMountResult<BaseScreenMountHandle<TElement>>>;
  /** 释放当前句柄；若 attach 仍在等待，Promise 落地后会立即释放并失败关闭。 */
  detach(): Promise<ScreenParseResult<null>>;
}

export interface CreateBaseScreenDesignerMountControllerOptions {
  readonly runtime: BaseScreenRuntime;
  readonly options: BaseScreenDesignerMountOptions;
  /** 挂载成功后先订阅再读取当前快照，随后转发同一权威项目会话的变化。 */
  readonly onProjectState?: (state: ScreenProjectState) => void;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onDiagnostics?: BaseScreenMountDiagnosticsCallback;
}

export interface CreateBaseScreenViewerMountControllerOptions {
  readonly runtime: BaseScreenViewerRuntime;
  readonly options: BaseScreenViewerMountOptions;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenViewerElement>;
  readonly onDiagnostics?: BaseScreenMountDiagnosticsCallback;
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
  ) => Promise<BaseScreenMountResult<BaseScreenMountHandle<TElement>>>;
  readonly onMounted?: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics?: BaseScreenMountDiagnosticsCallback;
}

function createMountController<
  TElement extends BaseScreenMountElement,
  TOptions extends { readonly catalog?: BaseScreenRuntimeCatalog },
>(request: ControllerRequest<TElement, TOptions>): BaseScreenMountController<TElement, TOptions> {
  let currentOptions = { ...request.options };
  let handle: BaseScreenMountHandle<TElement> | undefined;
  let appliedCatalog: BaseScreenRuntimeCatalog | undefined;
  let diagnostics: readonly ScreenDiagnostic[] = [];
  let diagnosticContext: BaseScreenMountDiagnosticContext | undefined;
  let lifecycleDiagnostics: readonly ScreenDiagnostic[] = [];
  let lifecycleContext: BaseScreenMountDiagnosticContext | undefined;
  let catalogDiagnostics: readonly ScreenDiagnostic[] = [];
  let generation = 0;
  let diagnosticsPublished = false;
  let pending: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(
    operation: () => Promise<BaseScreenMountResult<T>>,
  ): Promise<BaseScreenMountResult<T>> => {
    const result = pending.then(operation);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const publishDiagnostics = (
    next: readonly ScreenDiagnostic[],
    context: BaseScreenMountDiagnosticContext | undefined = lifecycleContext,
  ): void => {
    lifecycleDiagnostics = next;
    lifecycleContext = next.length === 0 ? undefined : context;
    const combined = [...lifecycleDiagnostics, ...catalogDiagnostics];
    const nextContext: BaseScreenMountDiagnosticContext | undefined =
      lifecycleContext ??
      (catalogDiagnostics.length > 0
        ? {
            phase: 'catalog',
            instanceAvailable: handle !== undefined,
            recovery: handle !== undefined ? 'retry-catalog' : 'remount',
          }
        : undefined);
    const unchanged =
      diagnosticsPublished &&
      nextContext?.phase === diagnosticContext?.phase &&
      nextContext?.instanceAvailable === diagnosticContext?.instanceAvailable &&
      nextContext?.recovery === diagnosticContext?.recovery &&
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
    diagnosticContext = nextContext;
    if (unchanged) return;
    diagnosticsPublished = true;
    request.onDiagnostics?.(diagnostics, diagnosticContext);
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
  const disposeHandle = async (
    active: BaseScreenMountHandle<TElement>,
  ): Promise<BaseScreenMountResult<null>> => {
    try {
      const result = await active.dispose();
      return result.ok ? result : { ...result, mountPhase: 'dispose' };
    } catch {
      return {
        ...runtimeFailure<null>(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen mount disposal threw an error.',
          ['controller', 'dispose'],
        ),
        mountPhase: 'dispose',
      };
    }
  };
  const releaseHandle = async (publish = true): Promise<BaseScreenMountResult<null>> => {
    const active = handle;
    handle = undefined;
    const result = active === undefined ? runtimeSuccess(null) : await disposeHandle(active);
    catalogDiagnostics = [];
    if (publish) {
      publishDiagnostics(
        result.ok ? [] : result.diagnostics,
        result.ok
          ? undefined
          : {
              phase: 'dispose',
              instanceAvailable: false,
              recovery: 'none',
            },
      );
    }
    return result;
  };
  const staleFailure = <T>(): BaseScreenMountResult<T> => ({
    ...runtimeFailure<T>(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Base Screen mount controller was detached while attaching.',
      ['controller'],
    ),
    mountPhase: 'mount',
  });

  return Object.freeze({
    get handle(): BaseScreenMountHandle<TElement> | undefined {
      return handle;
    },
    get diagnostics(): readonly ScreenDiagnostic[] {
      return diagnostics;
    },
    get diagnosticContext(): BaseScreenMountDiagnosticContext | undefined {
      return diagnosticContext;
    },
    updateOptions(options: TOptions): ScreenParseResult<null> {
      currentOptions = { ...options };
      return refreshCatalog();
    },
    attach(container: Element): Promise<BaseScreenMountResult<BaseScreenMountHandle<TElement>>> {
      const currentGeneration = ++generation;
      return enqueue(async () => {
        if (currentGeneration !== generation) return staleFailure();
        const released = await releaseHandle(false);
        if (!released.ok) {
          publishDiagnostics(released.diagnostics, {
            phase: 'dispose',
            instanceAvailable: false,
            recovery: 'none',
          });
          return released;
        }
        if (currentGeneration !== generation) return staleFailure();

        // 固定本次初始化快照；等待项目加载期间只补齐最新 catalog，不重新 configure/load。
        const mountOptions = currentOptions;
        const mountCatalog = request.readCatalog(mountOptions);
        let mounted: BaseScreenMountResult<BaseScreenMountHandle<TElement>>;
        try {
          mounted = await request.mount(container, mountOptions);
        } catch {
          mounted = {
            ...runtimeFailure(
              'PLUGIN_CORE_LIFECYCLE_INVALID',
              'Base Screen mount request threw an error.',
              ['controller', 'mount'],
            ),
            mountPhase: 'mount',
          };
        }
        if (currentGeneration !== generation) {
          const disposal = mounted.ok ? await disposeHandle(mounted.value) : mounted;
          const stale = staleFailure<BaseScreenMountHandle<TElement>>();
          if (!disposal.ok) {
            const failed: BaseScreenMountResult<BaseScreenMountHandle<TElement>> = {
              ok: false,
              diagnostics: [...disposal.diagnostics, ...stale.diagnostics],
              mountPhase: disposal.mountPhase ?? 'mount',
            };
            publishDiagnostics(failed.diagnostics, {
              phase: failed.mountPhase ?? 'mount',
              instanceAvailable: false,
              recovery: 'none',
            });
            return failed;
          }
          return stale;
        }
        if (!mounted.ok) {
          publishDiagnostics(mounted.diagnostics, {
            phase: mounted.mountPhase ?? 'mount',
            instanceAvailable: false,
            recovery: 'remount',
          });
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
          const catalogFailures = catalogDiagnostics;
          const disposal = await releaseHandle(false);
          const primary = runtimeFailure<BaseScreenMountHandle<TElement>>(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            'Base Screen mounted callback threw an error.',
            ['controller', 'onMounted'],
          );
          const failed: BaseScreenMountResult<BaseScreenMountHandle<TElement>> = {
            ok: false,
            diagnostics: [...primary.diagnostics, ...catalogFailures, ...disposal.diagnostics],
            mountPhase: 'mounted',
          };
          publishDiagnostics(failed.diagnostics, {
            phase: 'mounted',
            instanceAvailable: false,
            recovery: 'remount',
          });
          return failed;
        }
        return refreshed.ok ? mounted : { ...refreshed, mountPhase: 'catalog' };
      });
    },
    detach(): Promise<ScreenParseResult<null>> {
      generation += 1;
      return enqueue(() => releaseHandle());
    },
  });
}

export function createBaseScreenDesignerMountController(
  options: CreateBaseScreenDesignerMountControllerOptions,
): BaseScreenMountController<BaseScreenDesignerElement, BaseScreenDesignerMountOptions> {
  return createMountController({
    options: options.options,
    onMounted: (handle) => {
      if (options.onProjectState !== undefined) {
        const publish = (): void => {
          if (!handle.disposed) options.onProjectState?.(handle.element.getProjectState());
        };
        handle.on(BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT, publish);
        publish();
      }
      return options.onMounted?.(handle);
    },
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
