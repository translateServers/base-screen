import type { ScreenDiagnostic } from '@base-screen/contracts';
import {
  type BaseScreenDesignerElement,
  type BaseScreenDesignerMountOptions,
  type BaseScreenMountController,
  type BaseScreenMountControllerReady,
  type BaseScreenMountDiagnosticContext,
  type BaseScreenMountDiagnosticsCallback,
  type BaseScreenMountElement,
  type BaseScreenRuntime,
  type BaseScreenViewerElement,
  type BaseScreenViewerMountOptions,
  type BaseScreenViewerRuntime,
  createBaseScreenDesignerMountController,
  createBaseScreenViewerMountController,
  type ScreenProjectState,
} from '@base-screen/sdk';
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted as onVueMounted,
  type PropType,
  type Ref,
  ref,
  type SlotsType,
  type VNode,
  watch,
} from 'vue';

export interface BaseScreenDesignerProps {
  /** `null` 表示尚未就绪：不挂载、不保留诊断，等它变为非空后再挂载。 */
  readonly runtime: BaseScreenRuntime | null;
  /** 初始化快照；`null` 表示尚未就绪。文档/项目身份变化重挂载，catalog 新引用热刷新。 */
  readonly mountOptions: BaseScreenDesignerMountOptions | null;
  /** 强制重挂载；catalog 新引用热刷新，其余非身份配置只保存为后续挂载的初始化快照。 */
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onProjectState?: (state: ScreenProjectState) => void;
  readonly onDiagnostics?: BaseScreenMountDiagnosticsCallback;
}

export interface BaseScreenViewerProps {
  /** `null` 表示尚未就绪：不挂载、不保留诊断，等它变为非空后再挂载。 */
  readonly runtime: BaseScreenViewerRuntime | null;
  /** 初始化快照；`null` 表示尚未就绪。文档/项目身份变化重挂载，catalog 新引用热刷新。 */
  readonly mountOptions: BaseScreenViewerMountOptions | null;
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenViewerElement>;
  readonly onDiagnostics?: BaseScreenMountDiagnosticsCallback;
}

interface CreateControllerInput<
  TElement extends BaseScreenMountElement,
  TOptions,
  TRuntime extends BaseScreenViewerRuntime,
> {
  readonly runtime: TRuntime;
  readonly options: TOptions;
  readonly onMounted: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics: BaseScreenMountDiagnosticsCallback;
  readonly onProjectState: ((state: ScreenProjectState) => void) | undefined;
}

interface UseBaseScreenMountOptions<
  TElement extends BaseScreenMountElement,
  TOptions,
  TRuntime extends BaseScreenViewerRuntime,
> {
  readonly runtime: () => TRuntime | null;
  readonly mountOptions: () => TOptions | null;
  readonly remountKey: () => string | number | undefined;
  readonly identity: readonly (() => unknown)[];
  readonly onMounted: () => BaseScreenMountControllerReady<TElement> | undefined;
  readonly onDiagnostics: () => BaseScreenMountDiagnosticsCallback | undefined;
  readonly onProjectState?: () => ((state: ScreenProjectState) => void) | undefined;
  readonly createController: (
    input: CreateControllerInput<TElement, TOptions, TRuntime>,
  ) => BaseScreenMountController<TElement, TOptions>;
}

/** 未就绪不是错误：诊断清空，回调不会被调用。 */
const EMPTY_DIAGNOSTICS: readonly ScreenDiagnostic[] = Object.freeze([]);

interface BaseScreenMountState {
  readonly containerRef: Ref<HTMLElement | null>;
  readonly diagnostics: Ref<readonly ScreenDiagnostic[]>;
  readonly diagnosticContext: Ref<BaseScreenMountDiagnosticContext | undefined>;
}

function useBaseScreenMount<
  TElement extends BaseScreenMountElement,
  TOptions extends { readonly catalog?: unknown },
  TRuntime extends BaseScreenViewerRuntime,
>(options: UseBaseScreenMountOptions<TElement, TOptions, TRuntime>): BaseScreenMountState {
  const containerRef = ref<HTMLElement | null>(null);
  const diagnostics = ref<readonly ScreenDiagnostic[]>([]);
  const diagnosticContext = ref<BaseScreenMountDiagnosticContext | undefined>();
  let controller: BaseScreenMountController<TElement, TOptions> | undefined;
  let generation = 0;
  let disposed = false;
  let detaching: Promise<unknown> = Promise.resolve();

  const publishDiagnostics: BaseScreenMountDiagnosticsCallback = (next, context) => {
    if (disposed) return;
    diagnostics.value = next;
    diagnosticContext.value = context;
    options.onDiagnostics()?.(next, context);
  };
  const detachCurrent = (): void => {
    const active = controller;
    controller = undefined;
    if (active !== undefined) detaching = Promise.all([detaching, active.detach()]);
  };
  const attach = async (token: number): Promise<void> => {
    await detaching;
    if (token !== generation || disposed) return;
    const container = containerRef.value;
    const runtime = options.runtime();
    const mountOptions = options.mountOptions();
    if (container === null) return;
    // 还没就绪（宿主仍在准备 runtime / 端口）：不建控制器，上一轮诊断也作废。
    if (runtime === null || mountOptions === null) {
      diagnostics.value = EMPTY_DIAGNOSTICS;
      diagnosticContext.value = undefined;
      return;
    }
    const current = options.createController({
      runtime,
      options: mountOptions,
      onMounted: (handle) => {
        if (token === generation && !disposed) return options.onMounted()?.(handle);
      },
      onProjectState:
        options.onProjectState?.() === undefined
          ? undefined
          : (state) => {
              if (token === generation && !disposed) options.onProjectState?.()?.(state);
            },
      onDiagnostics: (next, context) => {
        if (token === generation) publishDiagnostics(next, context);
      },
    });
    controller = current;
    await current.attach(container);
    if (token !== generation && controller === current) {
      controller = undefined;
      await current.detach();
    }
  };
  const scheduleAttach = (): void => {
    const token = ++generation;
    queueMicrotask(() => void attach(token));
  };

  onVueMounted(scheduleAttach);
  watch(
    [
      options.runtime,
      options.remountKey,
      () => options.mountOptions() !== null,
      ...options.identity,
    ],
    () => {
      generation += 1;
      detachCurrent();
      diagnostics.value = EMPTY_DIAGNOSTICS;
      diagnosticContext.value = undefined;
      scheduleAttach();
    },
    { flush: 'post' },
  );
  watch(
    [options.mountOptions, () => options.mountOptions()?.catalog],
    () => {
      const mountOptions = options.mountOptions();
      if (mountOptions === null) return;
      controller?.updateOptions(mountOptions);
    },
    { flush: 'post' },
  );
  onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
    detachCurrent();
  });

  return {
    containerRef,
    diagnostics,
    diagnosticContext,
  };
}

function renderDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  fallback: () => VNode[] | undefined,
): VNode[] {
  if (diagnostics.length === 0) return [];
  const rendered = fallback();
  if (rendered !== undefined) return rendered;
  return [h('div', { role: 'alert' }, diagnostics.map((item) => item.message).join('; '))];
}

const remountKeyProp = {
  type: [String, Number] as unknown as PropType<string | number>,
  default: undefined,
};

// setup-function 重载的公共声明在 Vue 3.5 的最低 peer 版本中同样有效，
// 避免暴露随 Vue patch 增加泛型参数的 options-object 推断结果。
const BaseScreenDesignerComponent = /*#__PURE__*/ defineComponent<
  BaseScreenDesignerProps,
  {},
  string,
  SlotsType<{
    fallback: {
      diagnostics: readonly ScreenDiagnostic[];
      context: BaseScreenMountDiagnosticContext | undefined;
    };
  }>
>(
  (props, { slots }) => {
    const mounted = useBaseScreenMount({
      runtime: () => props.runtime,
      mountOptions: () => props.mountOptions,
      remountKey: () => props.remountKey,
      onMounted: () => props.onMounted,
      onDiagnostics: () => props.onDiagnostics,
      identity: [
        () => props.mountOptions?.projectId,
        () => props.mountOptions?.document,
        () => props.mountOptions?.element,
      ],
      onProjectState: () => props.onProjectState,
      createController: (input) =>
        createBaseScreenDesignerMountController({
          runtime: input.runtime,
          options: input.options,
          onMounted: input.onMounted,
          ...(input.onProjectState === undefined ? {} : { onProjectState: input.onProjectState }),
          onDiagnostics: input.onDiagnostics,
        }),
    });
    return () => {
      return h(
        'div',
        { ref: mounted.containerRef },
        renderDiagnostics(mounted.diagnostics.value, () =>
          slots.fallback?.({
            diagnostics: mounted.diagnostics.value,
            context: mounted.diagnosticContext.value,
          }),
        ),
      );
    };
  },
  {
    name: 'BaseScreenDesigner',
    slots: Object as SlotsType<{
      fallback: {
        diagnostics: readonly ScreenDiagnostic[];
        context: BaseScreenMountDiagnosticContext | undefined;
      };
    }>,
    props: {
      // `null` 列入 type 数组：required 的 prop 也会跑类型断言，只有显式列出才接受「未就绪」。
      runtime: {
        type: [Object, null] as unknown as PropType<BaseScreenRuntime | null>,
        required: true,
      },
      mountOptions: {
        type: [Object, null] as unknown as PropType<BaseScreenDesignerMountOptions | null>,
        required: true,
      },
      remountKey: remountKeyProp,
      onMounted: {
        type: Function as PropType<BaseScreenMountControllerReady<BaseScreenDesignerElement>>,
        default: undefined,
      },
      onProjectState: {
        type: Function as PropType<(state: ScreenProjectState) => void>,
        default: undefined,
      },
      onDiagnostics: {
        type: Function as PropType<BaseScreenMountDiagnosticsCallback>,
        default: undefined,
      },
    },
  },
);

export const BaseScreenDesigner = BaseScreenDesignerComponent;

const BaseScreenViewerComponent = /*#__PURE__*/ defineComponent<
  BaseScreenViewerProps,
  {},
  string,
  SlotsType<{
    fallback: {
      diagnostics: readonly ScreenDiagnostic[];
      context: BaseScreenMountDiagnosticContext | undefined;
    };
  }>
>(
  (props, { slots }) => {
    const mounted = useBaseScreenMount({
      runtime: () => props.runtime,
      mountOptions: () => props.mountOptions,
      remountKey: () => props.remountKey,
      onMounted: () => props.onMounted,
      onDiagnostics: () => props.onDiagnostics,
      identity: [
        () => props.mountOptions?.projectId,
        () => props.mountOptions?.document,
        () => props.mountOptions?.documentRevision,
        () => props.mountOptions?.element,
      ],
      createController: (input) =>
        createBaseScreenViewerMountController({
          runtime: input.runtime,
          options: input.options,
          onMounted: input.onMounted,
          ...(input.onProjectState === undefined ? {} : { onProjectState: input.onProjectState }),
          onDiagnostics: input.onDiagnostics,
        }),
    });
    return () => {
      return h(
        'div',
        { ref: mounted.containerRef },
        renderDiagnostics(mounted.diagnostics.value, () =>
          slots.fallback?.({
            diagnostics: mounted.diagnostics.value,
            context: mounted.diagnosticContext.value,
          }),
        ),
      );
    };
  },
  {
    name: 'BaseScreenViewer',
    slots: Object as SlotsType<{
      fallback: {
        diagnostics: readonly ScreenDiagnostic[];
        context: BaseScreenMountDiagnosticContext | undefined;
      };
    }>,
    props: {
      // `null` 列入 type 数组：required 的 prop 也会跑类型断言，只有显式列出才接受「未就绪」。
      runtime: {
        type: [Object, null] as unknown as PropType<BaseScreenViewerRuntime | null>,
        required: true,
      },
      mountOptions: {
        type: [Object, null] as unknown as PropType<BaseScreenViewerMountOptions | null>,
        required: true,
      },
      remountKey: remountKeyProp,
      onMounted: {
        type: Function as PropType<BaseScreenMountControllerReady<BaseScreenViewerElement>>,
        default: undefined,
      },
      onDiagnostics: {
        type: Function as PropType<BaseScreenMountDiagnosticsCallback>,
        default: undefined,
      },
    },
  },
);

export const BaseScreenViewer = BaseScreenViewerComponent;
