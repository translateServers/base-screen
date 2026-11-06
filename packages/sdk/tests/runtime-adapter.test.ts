import type { ScreenDocument, ScreenProjectAdapter } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  BaseScreenDesignerElement,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenRuntimeHost,
} from '../src/index.js';
import { adoptBaseScreenRuntime } from '../src/index.js';

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

  it('fails closed when the adopted host is already disposed', async () => {
    const host = createHost(true);
    const runtime = adoptBaseScreenRuntime(host);
    const mounted = await runtime.mountDesigner({ append: vi.fn() } as unknown as Element, {});
    expect(mounted.ok).toBe(false);
    expect(mounted.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
  });
});
