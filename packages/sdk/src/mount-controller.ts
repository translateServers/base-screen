import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/engine';
import type { BaseScreenViewerElement } from '@base-screen/renderer';
import type { BaseScreenMountElement, BaseScreenMountHandle } from './mount-handle.js';
import type {
  BaseScreenDesignerMountOptions,
  BaseScreenRuntime,
  BaseScreenViewerMountOptions,
} from './runtime.js';
import { runtimeFailure, runtimeSuccess } from './runtime-diagnostics.js';

export type BaseScreenMountControllerReady<TElement extends BaseScreenMountElement> = (
  handle: BaseScreenMountHandle<TElement>,
) => void | (() => void);

export interface BaseScreenMountController<TElement extends BaseScreenMountElement, TOptions> {
  readonly handle: BaseScreenMountHandle<TElement> | undefined;
  readonly diagnostics: readonly ScreenDiagnostic[];
  /** 更新后续 attach 使用的 options；不会重挂载已连接的实例。 */
  updateOptions(options: TOptions): void;
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

interface ControllerRequest<TElement extends BaseScreenMountElement, TOptions> {
  readonly options: TOptions;
  readonly mount: (
    container: Element,
    options: TOptions,
  ) => Promise<ScreenParseResult<BaseScreenMountHandle<TElement>>>;
  readonly onMounted?: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

function createMountController<TElement extends BaseScreenMountElement, TOptions>(
  request: ControllerRequest<TElement, TOptions>,
): BaseScreenMountController<TElement, TOptions> {
  let currentOptions = request.options;
  let handle: BaseScreenMountHandle<TElement> | undefined;
  let diagnostics: readonly ScreenDiagnostic[] = [];
  let generation = 0;

  const publishDiagnostics = (next: readonly ScreenDiagnostic[]): void => {
    diagnostics = next;
    request.onDiagnostics?.(next);
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
    updateOptions(options: TOptions): void {
      currentOptions = options;
    },
    async attach(container: Element): Promise<ScreenParseResult<BaseScreenMountHandle<TElement>>> {
      const currentGeneration = ++generation;
      await releaseHandle();
      if (currentGeneration !== generation) return staleFailure();

      let mounted: ScreenParseResult<BaseScreenMountHandle<TElement>>;
      try {
        mounted = await request.mount(container, currentOptions);
      } catch {
        mounted = runtimeFailure(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen mount request threw an error.',
          ['controller', 'mount'],
        );
      }
      if (currentGeneration !== generation) {
        if (mounted.ok) await mounted.value.dispose();
        return staleFailure();
      }
      if (!mounted.ok) {
        publishDiagnostics(mounted.diagnostics);
        return mounted;
      }

      const active = mounted.value;
      handle = active;
      publishDiagnostics([]);
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
      return mounted;
    },
    async detach(): Promise<ScreenParseResult<null>> {
      generation += 1;
      return releaseHandle();
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
    mount: (container, mountOptions) => options.runtime.mountViewer(container, mountOptions),
  });
}
