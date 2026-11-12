import type {
  BaseScreenDesignerElement,
  BaseScreenDesignerMountOptions,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerMountOptions,
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
    expectTypeOf<BaseScreenDesignerProps['runtime']>().toEqualTypeOf<BaseScreenRuntime>();
    expectTypeOf<
      BaseScreenDesignerProps['mountOptions']
    >().toEqualTypeOf<BaseScreenDesignerMountOptions>();
    expectTypeOf<
      BaseScreenViewerProps['mountOptions']
    >().toEqualTypeOf<BaseScreenViewerMountOptions>();
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
      expect(onDiagnostics).toHaveBeenCalledExactlyOnceWith([]);
    } finally {
      for (const slot of hooks.slots) slot.cleanup?.();
      hooks.slots = [];
    }
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
