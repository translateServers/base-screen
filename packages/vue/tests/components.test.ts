import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerMountOptions,
} from '@base-screen/sdk';
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
      expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith([]);
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

  it('declares composition props without mounting Custom Elements', () => {
    expect(Reflect.get(BaseScreenDesigner, 'name')).toBe('BaseScreenDesigner');
    expect(Reflect.get(BaseScreenViewer, 'name')).toBe('BaseScreenViewer');
    expect(typeof Reflect.get(BaseScreenDesigner, 'setup')).toBe('function');
    expect(typeof Reflect.get(BaseScreenViewer, 'setup')).toBe('function');
  });
});
