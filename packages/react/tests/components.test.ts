import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerElement,
  BaseScreenViewerMountOptions,
  BaseScreenViewerRuntime,
} from '@base-screen/sdk';
import { createElement } from 'react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as { value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }[],
  pending: [] as (() => void)[],
}));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useRef: (initial: unknown) => {
      const slot = hooks.slots[hooks.cursor] ?? { value: { current: initial } };
      hooks.slots[hooks.cursor++] = slot;
      return slot.value;
    },
    useState: (initial: unknown) => {
      const slot = hooks.slots[hooks.cursor] ?? { value: initial };
      hooks.slots[hooks.cursor++] = slot;
      return [
        slot.value,
        (value: unknown) => {
          slot.value = value;
        },
      ];
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
      const slot = hooks.slots[hooks.cursor] ?? {};
      hooks.slots[hooks.cursor++] = slot;
      if (slot.deps !== undefined && deps.every((dep, index) => Object.is(dep, slot.deps?.[index])))
        return;
      slot.deps = deps;
      hooks.pending.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() ?? undefined;
      });
    },
  };
});

import {
  BaseScreenDesigner,
  type BaseScreenDesignerProps,
  BaseScreenViewer,
  type BaseScreenViewerProps,
} from '../src/index.js';

describe('React composition components', () => {
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
    'refreshes catalog after commit and remounts only on identity changes',
    async (Component) => {
      hooks.cursor = 0;
      hooks.slots = [];
      hooks.pending = [];
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
      const render = (mountOptions: BaseScreenDesignerMountOptions, remountKey?: string) => {
        hooks.cursor = 0;
        const node = Component({
          runtime,
          mountOptions: mountOptions as BaseScreenDesignerMountOptions &
            BaseScreenViewerMountOptions,
          ...(remountKey ? { remountKey } : {}),
        });
        const ref = (node.props as { ref: { current: unknown } }).ref;
        ref.current = {};
      };
      const commit = async () => {
        for (const effect of hooks.pending.splice(0)) effect();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      };
      try {
        render({ projectId: 'first', catalog: initial });
        await commit();
        expect(mount).toHaveBeenCalledOnce();
        render({ projectId: 'first', catalog: next });
        expect(refreshCatalog).not.toHaveBeenCalled();
        await commit();
        expect(refreshCatalog).toHaveBeenCalledExactlyOnceWith(next);
        expect(mount).toHaveBeenCalledOnce();
        expect(unload).not.toHaveBeenCalled();
        render({ projectId: 'first', catalog: next, children: [] });
        await commit();
        expect(mount).toHaveBeenCalledOnce();
        expect(refreshCatalog).toHaveBeenCalledOnce();
        render({ projectId: 'second', catalog: next });
        await commit();
        expect(mount).toHaveBeenCalledTimes(2);
        expect(unload).toHaveBeenCalledOnce();
        render({ projectId: 'second', catalog: next }, 'explicit');
        await commit();
        expect(mount).toHaveBeenCalledTimes(3);
        render({ projectId: 'second', catalog: next, element: handle.element }, 'explicit');
        await commit();
        expect(mount).toHaveBeenCalledTimes(4);
      } finally {
        for (const slot of hooks.slots) slot.cleanup?.();
        hooks.slots = [];
      }
    },
  );

  it('mounts and unmounts a lightweight Viewer without disposing the shared runtime', async () => {
    hooks.cursor = 0;
    hooks.slots = [];
    hooks.pending = [];
    const registrations = new Map<string, CustomElementConstructor>();
    vi.stubGlobal('customElements', {
      get: (name: string) => registrations.get(name),
      define: (name: string, constructor: CustomElementConstructor) => {
        registrations.set(name, constructor);
      },
    });
    let runtime: BaseScreenViewerRuntime | undefined;
    try {
      const { createBaseScreenViewerRuntime } = await import('@base-screen/sdk/viewer');
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
      const node = BaseScreenViewer({ runtime, mountOptions: { element }, onMounted });
      (node.props as { ref: { current: unknown } }).ref.current = { append: vi.fn() };
      for (const effect of hooks.pending.splice(0)) effect();
      await vi.waitFor(() => expect(onMounted).toHaveBeenCalledOnce());
      expect(onMounted.mock.calls[0]?.[0].element).toBe(element);
      expect(element.configure).toHaveBeenCalledOnce();
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
      await vi.waitFor(() => expect(unload).toHaveBeenCalledOnce());
      expect(remove).toHaveBeenCalledOnce();
      expect(runtime.disposed).toBe(false);
    } finally {
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
      await runtime?.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('waits for the previous pending Designer load to release before mounting a new identity', async () => {
    hooks.cursor = 0;
    hooks.slots = [];
    hooks.pending = [];
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
    const onDiagnostics = vi.fn();
    const render = (projectId: string) => {
      hooks.cursor = 0;
      const node = BaseScreenDesigner({ runtime, mountOptions: { projectId }, onDiagnostics });
      (node.props as { ref: { current: unknown } }).ref.current = {};
      for (const effect of hooks.pending.splice(0)) effect();
    };
    try {
      render('first');
      await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
      render('second');
      await Promise.resolve();
      expect(mount).toHaveBeenCalledOnce();
      resolveFirst?.({ ok: true, value: handle, diagnostics: [] });
      await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
      expect(mount).toHaveBeenLastCalledWith(expect.anything(), { projectId: 'second' });
      render('second');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(mount).toHaveBeenCalledTimes(2);
      expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith([], undefined);
    } finally {
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
    }
  });

  it('mounts only once runtime and mount options are ready, and releases when they go back', async () => {
    hooks.cursor = 0;
    hooks.slots = [];
    hooks.pending = [];
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
    const onMounted = vi.fn();
    const onDiagnostics = vi.fn();
    const render = (
      nextRuntime: BaseScreenRuntime | null,
      mountOptions: BaseScreenDesignerMountOptions | null,
    ) => {
      hooks.cursor = 0;
      const node = BaseScreenDesigner({
        runtime: nextRuntime,
        mountOptions,
        onMounted,
        onDiagnostics,
      });
      (node.props as { ref: { current: unknown } }).ref.current = {};
    };
    const commit = async () => {
      for (const effect of hooks.pending.splice(0)) effect();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    try {
      // 宿主还在准备 runtime 与端口：组件不挂载，也不报告诊断。
      render(null, null);
      await commit();
      expect(mount).not.toHaveBeenCalled();
      expect(onDiagnostics).not.toHaveBeenCalled();
      // 只有 runtime 到位还不够——端口随 mountOptions 一起提交。
      render(runtime, null);
      await commit();
      expect(mount).not.toHaveBeenCalled();
      // 两者齐备即挂载，不需要宿主再套一层条件渲染。
      render(runtime, { projectId: 'ready' });
      await commit();
      expect(mount).toHaveBeenCalledOnce();
      expect(onMounted).toHaveBeenCalledOnce();
      // 退回未就绪：释放句柄（runtime 本身不释放）。
      render(null, null);
      await commit();
      expect(disposed).toHaveBeenCalledOnce();
    } finally {
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
    }
  });

  it('passes failure context to callbacks and fallback, then ignores an obsolete disposal failure', async () => {
    hooks.cursor = 0;
    hooks.slots = [];
    hooks.pending = [];
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
    const onDiagnostics = vi.fn();
    const renderFallback = vi.fn(() => null);
    const render = (projectId: string) => {
      hooks.cursor = 0;
      const node = BaseScreenDesigner({
        runtime,
        mountOptions: { projectId },
        onDiagnostics,
        renderFallback,
      });
      (node.props as { ref: { current: unknown } }).ref.current = {};
    };
    const commit = async () => {
      for (const effect of hooks.pending.splice(0)) effect();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    try {
      render('failed');
      await commit();
      render('failed');
      const context = { phase: 'load', instanceAvailable: false, recovery: 'remount' };
      expect(onDiagnostics).toHaveBeenLastCalledWith(failure.diagnostics, context);
      expect(renderFallback).toHaveBeenLastCalledWith(failure.diagnostics, context);
      render('active');
      await commit();
      onDiagnostics.mockClear();
      render('replacement');
      await commit();
      expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith([], undefined);
    } finally {
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
    }
  });

  it('forwards the initial project state, uses the latest consumer, and stops after unmount', async () => {
    hooks.cursor = 0;
    hooks.slots = [];
    hooks.pending = [];
    const target = new EventTarget();
    const state: import('@base-screen/sdk').ScreenProjectState = {
      phase: 'ready',
      dirty: false,
      project: { projectId: 'first', name: 'Project', revision: 'r1' },
    };
    const { createBaseScreenMountHandle } = await import('@base-screen/sdk');
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
    const render = (onProjectState: (value: typeof state) => void) => {
      hooks.cursor = 0;
      const node = BaseScreenDesigner({
        runtime,
        mountOptions: { projectId: 'first' },
        onProjectState,
      });
      (node.props as { ref: { current: unknown } }).ref.current = {};
    };
    const commit = async () => {
      for (const effect of hooks.pending.splice(0)) effect();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    try {
      render(first);
      await commit();
      expect(first).toHaveBeenCalledExactlyOnceWith(state);
      render(latest);
      await commit();
      target.dispatchEvent(new Event('base-screen-project-state-change'));
      expect(latest).toHaveBeenCalledExactlyOnceWith(state);
      expect(first).toHaveBeenCalledOnce();
      expect(mount).toHaveBeenCalledOnce();
    } finally {
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
    }
    target.dispatchEvent(new Event('base-screen-project-state-change'));
    expect(latest).toHaveBeenCalledOnce();
    await handle.dispose();
  });

  it('creates plain React elements without mounting Custom Elements', () => {
    const runtime = {} as BaseScreenRuntime;
    const element = createElement(BaseScreenDesigner, { runtime, mountOptions: {} });
    expect(element.type).toBe(BaseScreenDesigner);
    expect(element.props.runtime).toBe(runtime);
    expect(typeof BaseScreenDesigner).toBe('function');
    expect(typeof BaseScreenViewer).toBe('function');
  });
});
