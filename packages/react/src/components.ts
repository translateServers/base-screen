import type { ScreenDiagnostic } from '@base-screen/contracts';
import {
  type BaseScreenDesignerElement,
  type BaseScreenDesignerMountOptions,
  type BaseScreenMountController,
  type BaseScreenMountControllerReady,
  type BaseScreenMountElement,
  type BaseScreenRuntime,
  type BaseScreenViewerElement,
  type BaseScreenViewerMountOptions,
  createBaseScreenDesignerMountController,
  createBaseScreenViewerMountController,
} from '@base-screen/sdk';
import {
  type CSSProperties,
  createElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface BaseScreenDesignerProps {
  /** `null` 表示尚未就绪：不挂载、不保留诊断，等它变为非空后再挂载。 */
  readonly runtime: BaseScreenRuntime | null;
  /** 初始化快照；`null` 表示尚未就绪。文档/项目身份变化重挂载，catalog 新引用热刷新。 */
  readonly mountOptions: BaseScreenDesignerMountOptions | null;
  /** 强制重挂载；catalog 新引用热刷新，其余非身份配置只保存为后续挂载的初始化快照。 */
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly renderFallback?: (diagnostics: readonly ScreenDiagnostic[]) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface BaseScreenViewerProps {
  /** `null` 表示尚未就绪：不挂载、不保留诊断，等它变为非空后再挂载。 */
  readonly runtime: BaseScreenRuntime | null;
  /** 初始化快照；`null` 表示尚未就绪。文档/项目身份变化重挂载，catalog 新引用热刷新。 */
  readonly mountOptions: BaseScreenViewerMountOptions | null;
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenViewerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly renderFallback?: (diagnostics: readonly ScreenDiagnostic[]) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

interface ControllerCallbacks<TElement extends BaseScreenMountElement> {
  readonly onMounted: BaseScreenMountControllerReady<TElement> | undefined;
  readonly onDiagnostics: ((diagnostics: readonly ScreenDiagnostic[]) => void) | undefined;
}

interface CreateControllerInput<TElement extends BaseScreenMountElement, TOptions> {
  readonly runtime: BaseScreenRuntime;
  readonly options: TOptions;
  readonly onMounted: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

type CreateController<TElement extends BaseScreenMountElement, TOptions> = (
  input: CreateControllerInput<TElement, TOptions>,
) => BaseScreenMountController<TElement, TOptions>;

interface UseBaseScreenMountOptions<TElement extends BaseScreenMountElement, TOptions> {
  readonly runtime: BaseScreenRuntime | null;
  readonly mountOptions: TOptions | null;
  readonly remountKey: string | number | undefined;
  readonly identity: readonly unknown[];
  readonly onMounted: BaseScreenMountControllerReady<TElement> | undefined;
  readonly onDiagnostics: ((diagnostics: readonly ScreenDiagnostic[]) => void) | undefined;
  readonly createController: CreateController<TElement, TOptions>;
}

/** 未就绪不是错误：诊断清空，回调不会被调用。 */
const EMPTY_DIAGNOSTICS: readonly ScreenDiagnostic[] = Object.freeze([]);

function useBaseScreenMount<
  TElement extends BaseScreenMountElement,
  TOptions extends { readonly catalog?: unknown },
>(
  options: UseBaseScreenMountOptions<TElement, TOptions>,
): {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly diagnostics: readonly ScreenDiagnostic[];
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagnostics, setDiagnostics] = useState<readonly ScreenDiagnostic[]>([]);
  const callbacksRef = useRef<ControllerCallbacks<TElement>>({
    onMounted: options.onMounted,
    onDiagnostics: options.onDiagnostics,
  });
  callbacksRef.current = {
    onMounted: options.onMounted,
    onDiagnostics: options.onDiagnostics,
  };
  const createControllerRef = useRef(options.createController);
  createControllerRef.current = options.createController;
  const controllerRef = useRef<BaseScreenMountController<TElement, TOptions> | null>(null);
  const detachRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const container = containerRef.current;
    const runtime = options.runtime;
    const mountOptions = options.mountOptions;
    // 还没就绪（宿主仍在准备 runtime / 端口）：不建控制器，上一轮诊断也作废。
    if (container === null || runtime === null || mountOptions === null) {
      setDiagnostics(EMPTY_DIAGNOSTICS);
      return;
    }
    const controller = createControllerRef.current({
      runtime,
      options: mountOptions,
      onMounted: (handle) => callbacksRef.current.onMounted?.(handle),
      onDiagnostics: (next) => {
        setDiagnostics(next);
        callbacksRef.current.onDiagnostics?.(next);
      },
    });
    controllerRef.current = controller;
    let cancelled = false;
    void detachRef.current.then(() => {
      if (!cancelled) return controller.attach(container);
    });
    return () => {
      cancelled = true;
      controllerRef.current = null;
      setDiagnostics(EMPTY_DIAGNOSTICS);
      const previous = detachRef.current;
      const detached = controller.detach();
      detachRef.current = Promise.all([previous, detached]);
    };
  }, [options.runtime, options.mountOptions === null, options.remountKey, ...options.identity]);

  useEffect(() => {
    const mountOptions = options.mountOptions;
    if (mountOptions === null) return;
    controllerRef.current?.updateOptions(mountOptions);
  }, [options.mountOptions, options.mountOptions?.catalog]);

  return { containerRef, diagnostics };
}

function renderMountDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  renderFallback: ((diagnostics: readonly ScreenDiagnostic[]) => ReactNode) | undefined,
): ReactNode {
  if (diagnostics.length === 0) return null;
  if (renderFallback !== undefined) return renderFallback(diagnostics);
  return createElement(
    'div',
    { role: 'alert' },
    diagnostics.map((item) => item.message).join('; '),
  );
}

export function BaseScreenDesigner(props: BaseScreenDesignerProps): ReactElement {
  const {
    runtime,
    mountOptions,
    remountKey,
    onMounted,
    onDiagnostics,
    renderFallback,
    className,
    style,
  } = props;
  const mounted = useBaseScreenMount({
    runtime,
    mountOptions,
    remountKey,
    onMounted,
    onDiagnostics,
    identity: [mountOptions?.projectId, mountOptions?.document, mountOptions?.element],
    createController: (input) =>
      createBaseScreenDesignerMountController({
        runtime: input.runtime,
        options: input.options,
        onMounted: input.onMounted,
        onDiagnostics: input.onDiagnostics,
      }),
  });
  return createElement(
    'div',
    { ref: mounted.containerRef, className, style },
    renderMountDiagnostics(mounted.diagnostics, renderFallback),
  );
}

export function BaseScreenViewer(props: BaseScreenViewerProps): ReactElement {
  const {
    runtime,
    mountOptions,
    remountKey,
    onMounted,
    onDiagnostics,
    renderFallback,
    className,
    style,
  } = props;
  const mounted = useBaseScreenMount({
    runtime,
    mountOptions,
    remountKey,
    onMounted,
    onDiagnostics,
    identity: [
      mountOptions?.projectId,
      mountOptions?.document,
      mountOptions?.documentRevision,
      mountOptions?.element,
    ],
    createController: (input) =>
      createBaseScreenViewerMountController({
        runtime: input.runtime,
        options: input.options,
        onMounted: input.onMounted,
        onDiagnostics: input.onDiagnostics,
      }),
  });
  return createElement(
    'div',
    { ref: mounted.containerRef, className, style },
    renderMountDiagnostics(mounted.diagnostics, renderFallback),
  );
}
