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
  type Component,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted as onVueMounted,
  type PropType,
  type Ref,
  ref,
  type VNode,
  watch,
} from 'vue';

export interface BaseScreenDesignerProps {
  readonly runtime: BaseScreenRuntime;
  readonly mountOptions: BaseScreenDesignerMountOptions;
  /** 改变该值会释放当前句柄并重新挂载；普通 options 变化只更新后续 attach 的快照。 */
  readonly remountKey?: string | number;
  readonly onMounted?: BaseScreenMountControllerReady<BaseScreenDesignerElement>;
  readonly onDiagnostics?: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export interface BaseScreenViewerProps {
  readonly runtime: BaseScreenRuntime;
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
  updateOptions(): void;
}

function useBaseScreenMount<TElement extends BaseScreenMountElement, TOptions>(
  options: UseBaseScreenMountOptions<TElement, TOptions>,
): BaseScreenMountState {
  const containerRef = ref<HTMLElement | null>(null);
  const diagnostics = ref<readonly ScreenDiagnostic[]>([]);
  let controller: BaseScreenMountController<TElement, TOptions> | undefined;
  let generation = 0;
  let disposed = false;

  const publishDiagnostics = (next: readonly ScreenDiagnostic[]): void => {
    if (disposed) return;
    diagnostics.value = next;
    options.onDiagnostics()?.(next);
  };
  const detachCurrent = (): void => {
    const active = controller;
    controller = undefined;
    if (active !== undefined) void active.detach();
  };
  const attach = async (token: number): Promise<void> => {
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
  onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
    detachCurrent();
  });

  return {
    containerRef,
    diagnostics,
    updateOptions: () => controller?.updateOptions(options.mountOptions()),
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

const BaseScreenDesignerComponent = defineComponent({
  name: 'BaseScreenDesigner',
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
  setup(props, { slots }) {
    const mounted = useBaseScreenMount({
      runtime: () => props.runtime,
      mountOptions: () => props.mountOptions,
      remountKey: () => props.remountKey,
      onMounted: () => props.onMounted,
      onDiagnostics: () => props.onDiagnostics,
      identity: [
        () => props.mountOptions.projectId,
        () => props.mountOptions.document,
        () => props.mountOptions.catalog,
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
      mounted.updateOptions();
      return h(
        'div',
        { ref: mounted.containerRef },
        renderDiagnostics(mounted.diagnostics.value, () =>
          slots.fallback?.({ diagnostics: mounted.diagnostics.value }),
        ),
      );
    };
  },
});

export const BaseScreenDesigner: Component = BaseScreenDesignerComponent;

const BaseScreenViewerComponent = defineComponent({
  name: 'BaseScreenViewer',
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
  setup(props, { slots }) {
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
        () => props.mountOptions.instanceId,
        () => props.mountOptions.mode,
        () => props.mountOptions.catalog,
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
      mounted.updateOptions();
      return h(
        'div',
        { ref: mounted.containerRef },
        renderDiagnostics(mounted.diagnostics.value, () =>
          slots.fallback?.({ diagnostics: mounted.diagnostics.value }),
        ),
      );
    };
  },
});

export const BaseScreenViewer: Component = BaseScreenViewerComponent;
