import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import { nullResult, runtimeDiagnostic } from './runtime-diagnostics.js';

/** Designer 与 Viewer 都由宿主追加到 DOM，并通过 `unload()` 终结实例。 */
export interface BaseScreenMountElement extends Element {
  unload(): void;
}

export interface BaseScreenMountHandle<TElement extends BaseScreenMountElement> {
  /** 完整底层元素 API；组合层不拦截命令、端口、slot 或热更新。 */
  readonly element: TElement;
  readonly disposed: boolean;
  /** 自动登记的监听器会在 dispose 时按逆序移除。 */
  on(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  /** 登记宿主自有资源清理；已经 dispose 时立即执行。 */
  onDispose(cleanup: () => void): () => void;
  dispose(): Promise<ScreenParseResult<null>>;
}

export interface CreateBaseScreenMountHandleOptions<TElement extends BaseScreenMountElement> {
  readonly element: TElement;
  readonly detach: () => void;
}

export function createBaseScreenMountHandle<TElement extends BaseScreenMountElement>(
  options: CreateBaseScreenMountHandleOptions<TElement>,
): BaseScreenMountHandle<TElement> {
  const cleanups: Array<() => void> = [];
  let disposed = false;
  let disposePromise: Promise<ScreenParseResult<null>> | undefined;

  const registerCleanup = (cleanup: () => void): (() => void) => {
    if (disposed) {
      cleanup();
      return () => undefined;
    }
    cleanups.push(cleanup);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = cleanups.indexOf(cleanup);
      if (index >= 0) cleanups.splice(index, 1);
      cleanup();
    };
  };

  const handle: BaseScreenMountHandle<TElement> = {
    element: options.element,
    get disposed(): boolean {
      return disposed;
    },
    on(type, listener, listenerOptions) {
      if (disposed) return () => undefined;
      options.element.addEventListener(type, listener, listenerOptions);
      return registerCleanup(() =>
        options.element.removeEventListener(type, listener, listenerOptions),
      );
    },
    onDispose(cleanup) {
      return registerCleanup(cleanup);
    },
    dispose() {
      disposed = true;
      disposePromise ??= Promise.resolve().then((): ScreenParseResult<null> => {
        const diagnostics: ScreenDiagnostic[] = [];
        for (const cleanup of [...cleanups].reverse()) {
          try {
            cleanup();
          } catch {
            diagnostics.push(
              runtimeDiagnostic('PLUGIN_CORE_LIFECYCLE_INVALID', 'Mount cleanup failed.', [
                'mount',
                'cleanup',
              ]),
            );
          }
        }
        cleanups.length = 0;
        const steps: readonly (readonly [string, () => void])[] = [
          ['unload', () => options.element.unload()],
          ['remove', () => options.element.remove()],
          ['detach', options.detach],
        ];
        for (const [name, step] of steps) {
          try {
            step();
          } catch {
            diagnostics.push(
              runtimeDiagnostic('PLUGIN_CORE_LIFECYCLE_INVALID', `Mount ${name} failed.`, [
                'mount',
                name,
              ]),
            );
          }
        }
        return nullResult(diagnostics);
      });
      return disposePromise;
    },
  };
  return Object.freeze(handle);
}
