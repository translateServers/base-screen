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
  readonly runtime: BaseScreenRuntime;
  /** 初始化快照；文档/项目身份变化重挂载，catalog 新引用热刷新，其余配置在下次挂载生效。 */
  readonly mountOptions: BaseScreenDesignerMountOptions;
  /** 强制重挂载；catalog 新引用热刷新，其余非身份配置只保存为后续挂载的初始化快照。 */
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export interface BaseScreenViewerProps {
  readonly runtime: BaseScreenRuntime;
  /** 初始化快照；文档/项目身份变化重挂载，catalog 新引用热刷新，其余配置在下次挂载生效。 */
  readonly mountOptions: BaseScreenViewerMountOptions;
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenViewerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

interface CreateControllerInput<TElement extends BaseScreenMountElement, TOptions> {
  readonly options: TOptions;
  readonly onMounted: BaseScreenMountControllerReady<TElement>;
  readonly onDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

interface UseBaseScreenMountOptions<TElement extends BaseScreenMountElement, TOptions> {
  readonly runtime: () => BaseScreenRuntime;
  readonly mountOptions: () => TOptions;
  readonly remountKey: () => string | number | undefined;
  readonly identity: readonly (() => unknown)[];
  readonly onMounted: () => BaseScreenMountControllerReady<TElement> | undefined;
  readonly onDiagnostics: () => ((diagnostics: readonly ScreenDiagnostic[]) => void) | undefined;
  readonly createController: (
    input: CreateControllerInput<TElement, TOptions>,
  ) => BaseScreenMountController<TElement, TOptions>;
}

interface BaseScreenMountState {
  readonly containerRef: Ref<HTMLElement | null>;
  readonly diagnostics: Ref<readonly ScreenDiagnostic[]>;
}

function useBaseScreenMount<
  TElement extends BaseScreenMountElement,
  TOptions extends { readonly catalog?: unknown },
>(options: UseBaseScreenMountOptions<TElement, TOptions>): BaseScreenMountState {
  const containerRef = ref<HTMLElement | null>(null);
  const diagnostics = ref<readonly ScreenDiagnostic[]>([]);
  let controller: BaseScreenMountController<TElement, TOptions> | undefined;
  let generation = 0;
  let disposed = false;
  let detaching: Promise<unknown> = Promise.resolve();

  const publishDiagnostics = (next: readonly ScreenDiagnostic[]): void => {
    if (disposed) return;
    diagnostics.value = next;
    options.onDiagnostics()?.(next);
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
    if (container === null) return;
    const current = options.createController({
      options: options.mountOptions(),
      onMounted: (handle) => options.onMounted()?.(handle),
      onDiagnostics: publishDiagnostics,
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
    [options.runtime, options.remountKey, ...options.identity],
    () => {
      detachCurrent();
      scheduleAttach();
    },
    { flush: 'post' },
  );
  watch(
    [options.mountOptions, () => options.mountOptions().catalog],
    () => {
      controller?.updateOptions(options.mountOptions());
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
const BaseScreenDesignerComponent = defineComponent<
  BaseScreenDesignerProps,
  {},
  string,
  SlotsType<{ fallback: { diagnostics: readonly ScreenDiagnostic[] } }>
>(
  (props, { slots }) => {
    const mounted = useBaseScreenMount({
      runtime: () => props.runtime,
      mountOptions: () => props.mountOptions,
      remountKey: () => props.remountKey,
      onMounted: () => props.onMounted,
      onDiagnostics: () => props.onDiagnostics,
      identity: [
        () => props.mountOptions.projectId,
        () => props.mountOptions.document,
        () => props.mountOptions.element,
      ],
      createController: (input) =>
        createBaseScreenDesignerMountController({
          runtime: props.runtime,
          options: input.options,
          onMounted: input.onMounted,
          onDiagnostics: input.onDiagnostics,
        }),
    });
    return () => {
      return h(
        'div',
        { ref: mounted.containerRef },
        renderDiagnostics(mounted.diagnostics.value, () =>
          slots.fallback?.({ diagnostics: mounted.diagnostics.value }),
        ),
      );
    };
  },
  {
    name: 'BaseScreenDesigner',
    slots: Object as SlotsType<{ fallback: { diagnostics: readonly ScreenDiagnostic[] } }>,
    props: {
      runtime: { type: Object as PropType<BaseScreenRuntime>, required: true },
      mountOptions: {
        type: Object as PropType<BaseScreenDesignerMountOptions>,
        required: true,
      },
      remountKey: remountKeyProp,
      onMounted: {
        type: Function as PropType<BaseScreenMountControllerReady<BaseScreenDesignerElement>>,
        default: undefined,
      },
      onDiagnostics: {
        type: Function as PropType<(diagnostics: readonly ScreenDiagnostic[]) => void>,
        default: undefined,
      },
    },
  },
);

export const BaseScreenDesigner = BaseScreenDesignerComponent;

const BaseScreenViewerComponent = defineComponent<
  BaseScreenViewerProps,
  {},
  string,
  SlotsType<{ fallback: { diagnostics: readonly ScreenDiagnostic[] } }>
>(
  (props, { slots }) => {
    const mounted = useBaseScreenMount({
      runtime: () => props.runtime,
      mountOptions: () => props.mountOptions,
      remountKey: () => props.remountKey,
      onMounted: () => props.onMounted,
      onDiagnostics: () => props.onDiagnostics,
      identity: [
        () => props.mountOptions.projectId,
        () => props.mountOptions.document,
        () => props.mountOptions.documentRevision,
        () => props.mountOptions.element,
      ],
      createController: (input) =>
        createBaseScreenViewerMountController({
          runtime: props.runtime,
          options: input.options,
          onMounted: input.onMounted,
          onDiagnostics: input.onDiagnostics,
        }),
    });
    return () => {
      return h(
        'div',
        { ref: mounted.containerRef },
        renderDiagnostics(mounted.diagnostics.value, () =>
          slots.fallback?.({ diagnostics: mounted.diagnostics.value }),
        ),
      );
    };
  },
  {
    name: 'BaseScreenViewer',
    slots: Object as SlotsType<{ fallback: { diagnostics: readonly ScreenDiagnostic[] } }>,
    props: {
      runtime: { type: Object as PropType<BaseScreenRuntime>, required: true },
      mountOptions: {
        type: Object as PropType<BaseScreenViewerMountOptions>,
        required: true,
      },
      remountKey: remountKeyProp,
      onMounted: {
        type: Function as PropType<BaseScreenMountControllerReady<BaseScreenViewerElement>>,
        default: undefined,
      },
      onDiagnostics: {
        type: Function as PropType<(diagnostics: readonly ScreenDiagnostic[]) => void>,
        default: undefined,
      },
    },
  },
);

export const BaseScreenViewer = BaseScreenViewerComponent;
