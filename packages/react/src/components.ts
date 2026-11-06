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
  readonly runtime: BaseScreenRuntime;
  readonly mountOptions: BaseScreenDesignerMountOptions;
  /** 改变该值会释放当前句柄并重新挂载；普通 options 变化只更新后续 attach 的快照。 */
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly renderFallback?: (diagnostics: readonly ScreenDiagnostic[]) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export interface BaseScreenViewerProps {
  readonly runtime: BaseScreenRuntime;
  readonly mountOptions: BaseScreenViewerMountOptions;
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
  readonly options: TOptions;
  readonly onMounted: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

type CreateController<TElement extends BaseScreenMountElement, TOptions> = (
  input: CreateControllerInput<TElement, TOptions>,
) => BaseScreenMountController<TElement, TOptions>;

interface UseBaseScreenMountOptions<TElement extends BaseScreenMountElement, TOptions> {
  readonly runtime: BaseScreenRuntime;
  readonly mountOptions: TOptions;
  readonly remountKey: string | number | undefined;
  readonly identity: readonly unknown[];
  readonly onMounted: BaseScreenMountControllerReady<TElement> | undefined;
  readonly onDiagnostics: ((diagnostics: readonly ScreenDiagnostic[]) => void) | undefined;
  readonly createController: CreateController<TElement, TOptions>;
}

function useBaseScreenMount<TElement extends BaseScreenMountElement, TOptions>(
  options: UseBaseScreenMountOptions<TElement, TOptions>,
): {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly diagnostics: readonly ScreenDiagnostic[];
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagnostics, setDiagnostics] = useState<readonly ScreenDiagnostic[]>([]);
  const optionsRef = useRef(options.mountOptions);
  optionsRef.current = options.mountOptions;
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
  controllerRef.current?.updateOptions(optionsRef.current);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const controller = createControllerRef.current({
      options: optionsRef.current,
      onMounted: (handle) => callbacksRef.current.onMounted?.(handle),
      onDiagnostics: (next) => {
        setDiagnostics(next);
        callbacksRef.current.onDiagnostics?.(next);
      },
    });
    controllerRef.current = controller;
    void controller.attach(container);
    return () => {
      controllerRef.current = null;
      setDiagnostics([]);
      void controller.detach();
    };
  }, [options.runtime, options.remountKey, ...options.identity]);

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
    identity: [
      mountOptions.projectId,
      mountOptions.document,
      mountOptions.catalog,
      mountOptions.element,
    ],
    createController: (input) =>
      createBaseScreenDesignerMountController({
        runtime,
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
      mountOptions.projectId,
      mountOptions.document,
      mountOptions.documentRevision,
      mountOptions.instanceId,
      mountOptions.mode,
      mountOptions.catalog,
      mountOptions.element,
    ],
    createController: (input) =>
      createBaseScreenViewerMountController({
        runtime,
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
