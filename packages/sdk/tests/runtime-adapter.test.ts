import type { ScreenDocument, ScreenProjectAdapter } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  BaseScreenDesignerElement,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenRuntimeHost,
} from '../src/index.js';
import { adoptBaseScreenRuntime, createBaseScreenMountHandle } from '../src/index.js';

function createCatalog(): BaseScreenRuntimeCatalog {
  return {
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn(() => []),
  } as unknown as BaseScreenRuntimeCatalog;
}

function createFakeDesigner() {
  return {
    append: vi.fn(),
    remove: vi.fn(),
    unload: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    configure: vi.fn(() => ({ ok: true, value: null, diagnostics: [] })),
    load: vi.fn(async () => ({ ok: true, value: {}, diagnostics: [] })),
    document: undefined as ScreenDocument | undefined,
  };
}

function createHost(disposed = false) {
  const host = {
    instanceId: 'host-runtime',
    manager: {} as BaseScreenRuntime['manager'],
    catalog: createCatalog(),
    pluginCatalog: {} as BaseScreenRuntime['pluginCatalog'],
    pluginPanels: {} as BaseScreenRuntime['pluginPanels'],
    inspectorControls: {} as BaseScreenRuntime['inspectorControls'],
    runtimeContributions: {} as BaseScreenRuntime['runtimeContributions'],
    pluginCommandPort: {} as BaseScreenRuntime['pluginCommandPort'],
    bindDesigner: vi.fn(),
    disposed,
    dispose: vi.fn(async () => undefined),
  };
  return host as unknown as BaseScreenRuntimeHost;
}

describe('adoptBaseScreenRuntime', () => {
  it('mounts through the host manager and catalogs without disposing the host on handle release', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    const fake = createFakeDesigner();
    const projectAdapter = {} as ScreenProjectAdapter;
    const container = { append: vi.fn() } as unknown as Element;
    const mounted = await runtime.mountDesigner(container, {
      element: fake as unknown as BaseScreenDesignerElement,
      projectId: 'screen-1',
      projectAdapter,
    });

    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    expect(host.bindDesigner).toHaveBeenCalledWith(fake);
    expect(fake.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: host.catalog,
        pluginCatalog: host.pluginCatalog,
        pluginPanels: host.pluginPanels,
        inspectorControls: host.inspectorControls,
        runtimeContributions: host.runtimeContributions,
        pluginCommandPort: host.pluginCommandPort,
        projectAdapter,
      }),
    );
    expect(fake.load).toHaveBeenCalledWith('screen-1');

    const released = await mounted.value.dispose();
    expect(released.ok).toBe(true);
    expect(host.bindDesigner).toHaveBeenCalledWith(null);
    expect(host.dispose).not.toHaveBeenCalled();
  });

  it('reads the live host catalog and disposes the host only at runtime teardown', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    const nextCatalog = createCatalog();

    expect(runtime.catalog).toBe(host.catalog);
    expect(runtime.setCatalog(nextCatalog).ok).toBe(true);
    expect(host.catalog).toBe(nextCatalog);
    expect(runtime.catalog).toBe(nextCatalog);

    const disposed = await runtime.dispose();
    expect(disposed.ok).toBe(true);
    expect(host.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects a second Designer before host binding and releases the first binding on teardown', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    const first = createFakeDesigner();
    const second = createFakeDesigner();
    const container = { append: vi.fn() } as unknown as Element;
    const mounted = await runtime.mountDesigner(container, {
      element: first as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    expect(runtime.bindDesigner(second as unknown as BaseScreenDesignerElement).ok).toBe(false);
    expect(host.bindDesigner).toHaveBeenCalledTimes(1);
    const rejected = await runtime.mountDesigner(container, {
      element: second as unknown as BaseScreenDesignerElement,
    });
    expect(rejected.ok).toBe(false);
    expect(second.configure).not.toHaveBeenCalled();
    if (mounted.ok) await mounted.value.dispose();
    expect(
      (
        await runtime.mountDesigner(container, {
          element: second as unknown as BaseScreenDesignerElement,
        })
      ).ok,
    ).toBe(true);
    await runtime.dispose();
    await runtime.dispose();
    expect(host.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.disposed).toBe(true);
  });

  it('caches handle disposal before invoking reentrant cleanup', async () => {
    const fake = createFakeDesigner();
    const detach = vi.fn();
    const handle = createBaseScreenMountHandle({
      element: fake as unknown as BaseScreenDesignerElement,
      detach,
    });
    let reentered: ReturnType<typeof handle.dispose> | undefined;
    const cleanup = vi.fn(() => {
      reentered = handle.dispose();
    });
    handle.onDispose(cleanup);

    const disposal = handle.dispose();
    expect(handle.disposed).toBe(true);
    expect(handle.dispose()).toBe(disposal);
    expect((await disposal).ok).toBe(true);
    expect(reentered).toBe(disposal);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(fake.unload).toHaveBeenCalledOnce();
    expect(fake.remove).toHaveBeenCalledOnce();
    expect(detach).toHaveBeenCalledOnce();
  });

  it('caches runtime disposal before mounted cleanup reenters it', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    const fake = createFakeDesigner();
    const mounted = await runtime.mountDesigner({ append: vi.fn() } as unknown as Element, {
      element: fake as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    let reentered: ReturnType<typeof runtime.dispose> | undefined;
    const cleanup = vi.fn(() => {
      reentered = runtime.dispose();
    });
    mounted.value.onDispose(cleanup);

    const disposal = runtime.dispose();
    expect(runtime.disposed).toBe(true);
    expect(runtime.dispose()).toBe(disposal);
    expect((await disposal).ok).toBe(true);
    expect(reentered).toBe(disposal);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(fake.unload).toHaveBeenCalledOnce();
    expect(fake.remove).toHaveBeenCalledOnce();
    expect(host.dispose).toHaveBeenCalledOnce();
  });

  it('still disposes the host and all mounts when Designer unbinding throws', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    const designer = createFakeDesigner();
    const viewer = createFakeDesigner();
    const container = { append: vi.fn() } as unknown as Element;
    expect(
      (
        await runtime.mountDesigner(container, {
          element: designer as unknown as BaseScreenDesignerElement,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await runtime.mountViewer(container, {
          element: viewer as never,
        })
      ).ok,
    ).toBe(true);
    vi.mocked(host.bindDesigner).mockImplementation((element) => {
      if (element === null) throw new Error('解绑失败');
    });

    const disposal = runtime.dispose();
    const result = await disposal;
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['mount', 'detach'] }),
        expect.objectContaining({ path: ['host', 'designer'] }),
      ]),
    );
    expect(runtime.dispose()).toBe(disposal);
    expect(host.dispose).toHaveBeenCalledOnce();
    for (const fake of [designer, viewer]) {
      expect(fake.unload).toHaveBeenCalledOnce();
      expect(fake.remove).toHaveBeenCalledOnce();
    }
  });

  it('aggregates host unbinding and disposal errors after releasing the mounts', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    vi.mocked(host.bindDesigner).mockImplementation(() => {
      throw new Error('解绑失败');
    });
    vi.mocked(host.dispose).mockRejectedValue(new Error('销毁失败'));

    const result = await runtime.dispose();
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      ['host', 'designer'],
      ['host'],
    ]);
    expect(host.dispose).toHaveBeenCalledOnce();
  });

  it('releases the local Designer binding even when the host rejects handle detachment', async () => {
    const host = createHost();
    const runtime = adoptBaseScreenRuntime(host);
    const container = { append: vi.fn() } as unknown as Element;
    const first = createFakeDesigner();
    const mounted = await runtime.mountDesigner(container, {
      element: first as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    vi.mocked(host.bindDesigner).mockImplementation((element) => {
      if (element === null) throw new Error('解绑失败');
    });

    expect((await mounted.value.dispose()).ok).toBe(false);
    const second = createFakeDesigner();
    expect(
      (
        await runtime.mountDesigner(container, {
          element: second as unknown as BaseScreenDesignerElement,
        })
      ).ok,
    ).toBe(true);
    await runtime.dispose();
    expect(host.dispose).toHaveBeenCalledOnce();
  });

  it('fails closed when the adopted host is already disposed', async () => {
    const host = createHost(true);
    const runtime = adoptBaseScreenRuntime(host);
    const mounted = await runtime.mountDesigner({ append: vi.fn() } as unknown as Element, {});
    expect(mounted.ok).toBe(false);
    expect(mounted.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
  });
});
