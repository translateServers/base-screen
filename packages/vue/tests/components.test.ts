import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerElement,
  BaseScreenViewerMountOptions,
  BaseScreenViewerRuntime,
} from 'base-screen';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createRenderer, h, nextTick, shallowRef } from 'vue';
import {
  BaseScreenDesigner,
  type BaseScreenDesignerProps,
  BaseScreenViewer,
  type BaseScreenViewerProps,
} from '../src/index.js';

describe('Vue composition components', () => {
  it('does not register product elements from the default entry', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('exposes the runtime and mount option contracts', () => {
    expectTypeOf<BaseScreenDesignerProps['runtime']>().toEqualTypeOf<BaseScreenRuntime | null>();
    expectTypeOf<
      BaseScreenViewerProps['runtime']
    >().toEqualTypeOf<BaseScreenViewerRuntime | null>();
    expectTypeOf<
      BaseScreenDesignerProps['mountOptions']
    >().toEqualTypeOf<BaseScreenDesignerMountOptions | null>();
    expectTypeOf<
      BaseScreenViewerProps['mountOptions']
    >().toEqualTypeOf<BaseScreenViewerMountOptions | null>();
  });

  it.each([BaseScreenDesigner, BaseScreenViewer])(
    'refreshes catalog after render and preserves the instance until identity changes',
    async (Component) => {
      class HostNode {
        parent: HostNode | null = null;
      }
      const renderer = createRenderer<HostNode, HostNode>({
        createElement: () => new HostNode(),
        createText: () => new HostNode(),
        createComment: () => new HostNode(),
        setText: () => {},
        setElementText: () => {},
        parentNode: (node) => node.parent,
        nextSibling: () => null,
        patchProp: () => {},
        insert: (node, parent) => {
          node.parent = parent;
        },
        remove: () => {},
      });
      const refreshCatalog = vi.fn(() => ({ ok: true, value: null, diagnostics: [] }));
      const unload = vi.fn();
      const handle = {
        element: { refreshCatalog },
        dispose: vi.fn(async () => {
          unload();
          return { ok: true, value: null, diagnostics: [] };
        }),
        onDispose: vi.fn(),
      } as unknown as BaseScreenMountHandle<BaseScreenDesignerElement>;
      const mount = vi.fn(async () => ({ ok: true, value: handle, diagnostics: [] }));
      const runtime = {
        catalog: [],
        mountDesigner: mount,
        mountViewer: mount,
      } as unknown as BaseScreenRuntime;
      const initial = [] as unknown as BaseScreenRuntimeCatalog;
      const next = [] as unknown as BaseScreenRuntimeCatalog;
      const options = shallowRef<BaseScreenDesignerMountOptions>({
        projectId: 'first',
        catalog: initial,
      });
      const remountKey = shallowRef('initial');
      const app = renderer.createApp({
        render: () =>
          h(Component as import('vue').Component, {
            runtime,
            mountOptions: options.value,
            remountKey: remountKey.value,
          }),
      });
      const flush = async () => {
        await nextTick();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      };
      app.mount(new HostNode());
      try {
        await flush();
        expect(mount).toHaveBeenCalledOnce();
        options.value = { projectId: 'first', catalog: next };
        expect(refreshCatalog).not.toHaveBeenCalled();
        await flush();
        expect(refreshCatalog).toHaveBeenCalledExactlyOnceWith(next);
        expect(mount).toHaveBeenCalledOnce();
        expect(unload).not.toHaveBeenCalled();
        options.value = { projectId: 'first', catalog: next, children: [] };
        await flush();
        expect(mount).toHaveBeenCalledOnce();
        expect(refreshCatalog).toHaveBeenCalledOnce();
        options.value = { projectId: 'second', catalog: next };
        await flush();
        expect(mount).toHaveBeenCalledTimes(2);
        expect(unload).toHaveBeenCalledOnce();
        remountKey.value = 'explicit';
        await flush();
        expect(mount).toHaveBeenCalledTimes(3);
        options.value = { projectId: 'second', catalog: next, element: handle.element };
        await flush();
        expect(mount).toHaveBeenCalledTimes(4);
      } finally {
        app.unmount();
      }
    },
  );

  it('mounts and unmounts a lightweight Viewer without disposing the shared runtime', async () => {
    class HostNode {
      parent: HostNode | null = null;
      append = vi.fn();
    }
    const renderer = createRenderer<HostNode, HostNode>({
      createElement: () => new HostNode(),
      createText: () => new HostNode(),
      createComment: () => new HostNode(),
      setText: () => {},
      setElementText: () => {},
      parentNode: (node) => node.parent,
      nextSibling: () => null,
      patchProp: () => {},
      insert: (node, parent) => {
        node.parent = parent;
      },
      remove: () => {},
    });
    const registrations = new Map<string, CustomElementConstructor>();
    vi.stubGlobal('customElements', {
      get: (name: string) => registrations.get(name),
      define: (name: string, constructor: CustomElementConstructor) => {
        registrations.set(name, constructor);
      },
    });
    let runtime: BaseScreenViewerRuntime | undefined;
    let unmount: (() => void) | undefined;
    try {
      const { createBaseScreenViewerRuntime } = await import('base-screen/viewer');
      const result = await createBaseScreenViewerRuntime();
      if (!result.ok) throw new Error('Viewer runtime 创建失败');
      runtime = result.value;
      expect('mountDesigner' in runtime).toBe(false);
      const unload = vi.fn();
      const remove = vi.fn();
      const element = Object.assign(new EventTarget(), {
        configure: vi.fn(() => ({ ok: true as const, value: null, diagnostics: [] })),
        unload,
        remove,
      }) as unknown as BaseScreenViewerElement;
      const onMounted = vi.fn();
      const app = renderer.createApp(BaseScreenViewer, {
        runtime,
        mountOptions: { element },
        onMounted,
      });
      app.mount(new HostNode());
      unmount = () => app.unmount();
      await vi.waitFor(() => expect(onMounted).toHaveBeenCalledOnce());
      expect(onMounted.mock.calls[0]?.[0].element).toBe(element);
      expect(element.configure).toHaveBeenCalledOnce();
      app.unmount();
      unmount = undefined;
      await vi.waitFor(() => expect(unload).toHaveBeenCalledOnce());
      expect(remove).toHaveBeenCalledOnce();
      expect(runtime.disposed).toBe(false);
    } finally {
      unmount?.();
      await runtime?.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('waits for a pending Designer load to release before mounting the next identity', async () => {
    class HostNode {
      parent: HostNode | null = null;
    }
    const renderer = createRenderer<HostNode, HostNode>({
      createElement: () => new HostNode(),
      createText: () => new HostNode(),
      createComment: () => new HostNode(),
      setText: () => {},
      setElementText: () => {},
      parentNode: (node) => node.parent,
      nextSibling: () => null,
      patchProp: () => {},
      insert: (node, parent) => {
        node.parent = parent;
      },
      remove: () => {},
    });
    const disposed = vi.fn();
    const handle = {
      element: {},
      onDispose: vi.fn(),
      dispose: vi.fn(async () => {
        disposed();
        return { ok: true as const, value: null, diagnostics: [] };
      }),
    } as unknown as BaseScreenMountHandle<BaseScreenDesignerElement>;
    let resolveFirst:
      | ((value: { ok: true; value: typeof handle; diagnostics: [] }) => void)
      | undefined;
    const mount = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        expect(disposed).toHaveBeenCalledOnce();
        return { ok: true, value: handle, diagnostics: [] };
      });
    const runtime = { catalog: [], mountDesigner: mount } as unknown as BaseScreenRuntime;
    const projectId = shallowRef('first');
    const onDiagnostics = vi.fn();
    const app = renderer.createApp({
      render: () =>
        h(BaseScreenDesigner, {
          runtime,
          mountOptions: { projectId: projectId.value },
          onDiagnostics,
        }),
    });
    app.mount(new HostNode());
    try {
      await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
      projectId.value = 'second';
      await nextTick();
      expect(mount).toHaveBeenCalledOnce();
      resolveFirst?.({ ok: true, value: handle, diagnostics: [] });
      await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
      expect(mount).toHaveBeenLastCalledWith(expect.anything(), { projectId: 'second' });
      await nextTick();
      expect(mount).toHaveBeenCalledTimes(2);
      expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith([], undefined);
    } finally {
      app.unmount();
    }
  });

  it('mounts only once runtime and mount options are ready, and releases when they go back', async () => {
    class HostNode {
      parent: HostNode | null = null;
    }
    const renderer = createRenderer<HostNode, HostNode>({
      createElement: () => new HostNode(),
      createText: () => new HostNode(),
      createComment: () => new HostNode(),
      setText: () => {},
      setElementText: () => {},
      parentNode: (node) => node.parent,
      nextSibling: () => null,
      patchProp: () => {},
      insert: (node, parent) => {
        node.parent = parent;
      },
      remove: () => {},
    });
    const disposed = vi.fn();
    const handle = {
      element: {},
      onDispose: vi.fn(),
      dispose: vi.fn(async () => {
        disposed();
        return { ok: true as const, value: null, diagnostics: [] };
      }),
    } as unknown as BaseScreenMountHandle<BaseScreenDesignerElement>;
    const mount = vi.fn(async () => ({ ok: true, value: handle, diagnostics: [] }));
    const runtime = { catalog: [], mountDesigner: mount } as unknown as BaseScreenRuntime;
    const runtimeRef = shallowRef<BaseScreenRuntime | null>(null);
    const optionsRef = shallowRef<BaseScreenDesignerMountOptions | null>(null);
    const onMounted = vi.fn();
    const onDiagnostics = vi.fn();
    const app = renderer.createApp({
      render: () =>
        h(BaseScreenDesigner, {
          runtime: runtimeRef.value,
          mountOptions: optionsRef.value,
          onMounted,
          onDiagnostics,
        }),
    });
    const flush = async () => {
      await nextTick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    app.mount(new HostNode());
    try {
      // 宿主还在准备 runtime 与端口：组件不挂载，也不报告诊断。
      await flush();
      expect(mount).not.toHaveBeenCalled();
      expect(onDiagnostics).not.toHaveBeenCalled();
      // 只有 runtime 到位还不够——端口随 mountOptions 一起提交。
      runtimeRef.value = runtime;
      await flush();
      expect(mount).not.toHaveBeenCalled();
      // 两者齐备即挂载，不需要宿主再套一层 v-if。
      optionsRef.value = { projectId: 'ready' };
      await flush();
      expect(mount).toHaveBeenCalledOnce();
      expect(onMounted).toHaveBeenCalledOnce();
      // 退回未就绪：释放句柄（runtime 本身不释放）。
      optionsRef.value = null;
      await flush();
      expect(disposed).toHaveBeenCalledOnce();
    } finally {
      app.unmount();
    }
  });

  it('passes failure context to callbacks and fallback, then ignores an obsolete disposal failure', async () => {
    class HostNode {
      parent: HostNode | null = null;
    }
    const renderer = createRenderer<HostNode, HostNode>({
      createElement: () => new HostNode(),
      createText: () => new HostNode(),
      createComment: () => new HostNode(),
      setText: () => {},
      setElementText: () => {},
      parentNode: (node) => node.parent,
      nextSibling: () => null,
      patchProp: () => {},
      insert: (node, parent) => {
        node.parent = parent;
      },
      remove: () => {},
    });
    const diagnostic = {
      severity: 'error',
      code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
      path: [],
      message: 'failed',
    } as const;
    const failure = { ok: false, diagnostics: [diagnostic], mountPhase: 'load' } as const;
    const handle = {
      element: {},
      onDispose: vi.fn(),
      dispose: vi.fn(async () => ({ ok: false, diagnostics: [diagnostic] })),
    } as unknown as BaseScreenMountHandle<BaseScreenDesignerElement>;
    const mount = vi
      .fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValue({ ok: true, value: handle, diagnostics: [] });
    const runtime = { catalog: [], mountDesigner: mount } as unknown as BaseScreenRuntime;
    const projectId = shallowRef('failed');
    const onDiagnostics = vi.fn();
    const fallback = vi.fn(() => []);
    const app = renderer.createApp({
      render: () =>
        h(
          BaseScreenDesigner,
          {
            runtime,
            mountOptions: { projectId: projectId.value },
            onDiagnostics,
          },
          { fallback },
        ),
    });
    const flush = async () => {
      await nextTick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    app.mount(new HostNode());
    try {
      await flush();
      const context = { phase: 'load', instanceAvailable: false, recovery: 'remount' };
      expect(onDiagnostics).toHaveBeenLastCalledWith(failure.diagnostics, context);
      expect(fallback).toHaveBeenLastCalledWith({ diagnostics: failure.diagnostics, context });
      projectId.value = 'active';
      await flush();
      onDiagnostics.mockClear();
      projectId.value = 'replacement';
      await flush();
      expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith([], undefined);
    } finally {
      app.unmount();
    }
  });

  it('forwards the initial project state, uses the latest consumer, and stops after unmount', async () => {
    class HostNode {
      parent: HostNode | null = null;
    }
    const renderer = createRenderer<HostNode, HostNode>({
      createElement: () => new HostNode(),
      createText: () => new HostNode(),
      createComment: () => new HostNode(),
      setText: () => {},
      setElementText: () => {},
      parentNode: (node) => node.parent,
      nextSibling: () => null,
      patchProp: () => {},
      insert: (node, parent) => {
        node.parent = parent;
      },
      remove: () => {},
    });
    const target = new EventTarget();
    const state: import('base-screen').ScreenProjectState = {
      phase: 'ready',
      dirty: false,
      project: { projectId: 'first', name: 'Project', revision: 'r1' },
    };
    const { createBaseScreenMountHandle } = await import('base-screen');
    const handle = createBaseScreenMountHandle({
      element: Object.assign(target, {
        getProjectState: () => structuredClone(state),
        unload: () => {},
        remove: () => {},
      }) as unknown as BaseScreenDesignerElement,
      detach: () => {},
    });
    const mount = vi.fn(async () => ({ ok: true as const, value: handle, diagnostics: [] }));
    const runtime = { catalog: [], mountDesigner: mount } as unknown as BaseScreenRuntime;
    const first = vi.fn();
    const latest = vi.fn();
    const consumer = shallowRef<(value: typeof state) => void>(first);
    const app = renderer.createApp({
      render: () =>
        h(BaseScreenDesigner, {
          runtime,
          mountOptions: { projectId: 'first' },
          onProjectState: consumer.value,
        }),
    });
    app.mount(new HostNode());
    try {
      await vi.waitFor(() => expect(first).toHaveBeenCalledExactlyOnceWith(state));
      consumer.value = latest;
      await nextTick();
      target.dispatchEvent(new Event('base-screen-project-state-change'));
      expect(latest).toHaveBeenCalledExactlyOnceWith(state);
      expect(first).toHaveBeenCalledOnce();
      expect(mount).toHaveBeenCalledOnce();
    } finally {
      app.unmount();
    }
    target.dispatchEvent(new Event('base-screen-project-state-change'));
    expect(latest).toHaveBeenCalledOnce();
    await handle.dispose();
  });

  it('declares composition props without mounting Custom Elements', () => {
    expect(Reflect.get(BaseScreenDesigner, 'name')).toBe('BaseScreenDesigner');
    expect(Reflect.get(BaseScreenViewer, 'name')).toBe('BaseScreenViewer');
    expect(typeof Reflect.get(BaseScreenDesigner, 'setup')).toBe('function');
    expect(typeof Reflect.get(BaseScreenViewer, 'setup')).toBe('function');
  });
});
