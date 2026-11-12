import type { ScreenDocument, ScreenProjectAdapter } from '@base-screen/contracts';
import {
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenTextMaterialElement,
} from '@base-screen/material';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BaseScreenDesignerElement,
  BaseScreenRuntime,
  BaseScreenViewerElement,
  BaseScreenViewerRuntime,
} from '../src/index.js';
import { createBaseScreenRuntime } from '../src/index.js';
import { createBaseScreenViewerRuntime } from '../src/viewer.js';

const runtimes: BaseScreenViewerRuntime[] = [];

function installCustomElements(): Map<string, CustomElementConstructor> {
  const registrations = new Map<string, CustomElementConstructor>();
  vi.stubGlobal('customElements', {
    get: (tagName: string) => registrations.get(tagName),
    define: (tagName: string, constructor: CustomElementConstructor) => {
      registrations.set(tagName, constructor);
    },
  });
  return registrations;
}

async function createRuntime(
  options: Parameters<typeof createBaseScreenRuntime>[0] = {},
): Promise<BaseScreenRuntime> {
  const result = await createBaseScreenRuntime(options);
  if (!result.ok) {
    throw new Error(result.diagnostics[0]?.message ?? 'runtime creation failed');
  }
  runtimes.push(result.value);
  return result.value;
}

function createFakeElement(overrides: Record<string, unknown> = {}) {
  const fake = Object.assign(
    {
      append: vi.fn(),
      remove: vi.fn(),
      unload: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      configure: vi.fn(() => ({ ok: true, value: null, diagnostics: [] })),
      load: vi.fn(async () => ({ ok: true, value: {}, diagnostics: [] })),
      executeCommand: vi.fn(() => ({
        ok: true,
        value: {} as ScreenDocument,
        diagnostics: [],
      })),
      selection: { selectedComponentIds: [], focusedComponentId: null },
      document: undefined,
      catalog: undefined as BaseScreenRuntime['catalog'] | undefined,
      refreshCatalog: vi.fn(),
    },
    overrides,
  );
  if (overrides.configure === undefined) {
    fake.configure = vi.fn((...args: unknown[]) => {
      const configuration = args[0] as { catalog: BaseScreenRuntime['catalog'] };
      fake.catalog = configuration.catalog;
      return { ok: true, value: null, diagnostics: [] };
    });
  }
  if (overrides.refreshCatalog === undefined) {
    fake.refreshCatalog = vi.fn((catalog: BaseScreenRuntime['catalog']) => {
      fake.catalog = catalog;
      return { ok: true, value: null, diagnostics: [] };
    });
  }
  return fake;
}

function createContainer() {
  return { append: vi.fn() } as unknown as Element;
}

afterEach(async () => {
  const pending = runtimes.splice(0);
  for (const runtime of pending) await runtime.dispose();
  vi.unstubAllGlobals();
});

describe('createBaseScreenViewerRuntime', () => {
  it('registers only Viewer and explicitly selected materials', async () => {
    const registrations = installCustomElements();
    const created = await createBaseScreenViewerRuntime({
      materials: [
        {
          manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
          constructor: BaseScreenTextMaterialElement,
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    runtimes.push(created.value);
    expect([...registrations.keys()].sort()).toEqual(
      [BASE_SCREEN_TEXT_MATERIAL_MANIFEST.tagName, 'base-screen-viewer'].sort(),
    );
    expect(created.value.catalog.list()).toHaveLength(1);
    expect('mountDesigner' in created.value).toBe(false);
    expect('bindDesigner' in created.value).toBe(false);
  });

  it('refreshes inherited Viewer catalogs and disposes tracked mounts', async () => {
    installCustomElements();
    const created = await createBaseScreenViewerRuntime();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const runtime = created.value;
    runtimes.push(runtime);
    const inherited = createFakeElement();
    const independent = createFakeElement();
    const first = await runtime.mountViewer(createContainer(), {
      element: inherited as unknown as BaseScreenViewerElement,
    });
    const second = await runtime.mountViewer(createContainer(), {
      element: independent as unknown as BaseScreenViewerElement,
      catalog: runtime.catalog,
    });
    expect(first.ok && second.ok).toBe(true);
    const empty = { get: () => undefined, has: () => false, list: () => [] };
    expect(runtime.setCatalog(empty).ok).toBe(true);
    expect(runtime.catalog).toBe(empty);
    expect(inherited.catalog).toBe(empty);
    expect(independent.catalog).not.toBe(empty);
    const disposed = runtime.dispose();
    expect(runtime.disposed).toBe(true);
    expect(runtime.dispose()).toBe(disposed);
    expect((await disposed).ok).toBe(true);
    expect(runtime.manager.status).toBe('disposed');
    expect(inherited.unload).toHaveBeenCalledOnce();
    expect(independent.unload).toHaveBeenCalledOnce();
    expect((await runtime.mountViewer(createContainer(), {})).ok).toBe(false);
  });
});

describe('createBaseScreenRuntime', () => {
  it('fails closed when Custom Elements are unavailable', async () => {
    vi.unstubAllGlobals();
    const result = await createBaseScreenRuntime({ officialMaterials: false });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
  });

  it('registers product elements and official materials in one activation plan', async () => {
    const registrations = installCustomElements();
    const runtime = await createRuntime({ instanceId: 'host-runtime' });
    expect(registrations.size).toBe(10);
    expect(runtime.catalog.list()).toHaveLength(8);
    expect(runtime.manager.status).toBe('active');
    expect(runtime.pluginCommandPort.execute).toBeTypeOf('function');
    expect(runtime.runtimeContributions.getResourceType).toBeTypeOf('function');

    const firstDisposal = await runtime.dispose();
    const secondDisposal = await runtime.dispose();
    expect(firstDisposal.ok).toBe(true);
    expect(secondDisposal.ok).toBe(true);
    expect(runtime.disposed).toBe(true);
    expect(runtime.manager.status).toBe('disposed');
  });

  it('accepts bridge catalog entries and preserves their dataset adapters without host registration glue', async () => {
    const registrations = installCustomElements();
    class HostMetric extends BaseScreenTextMaterialElement {
      static override readonly manifest = {
        ...BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
        type: 'host.metric',
        tagName: 'host-metric',
      };
    }
    const adapter = {
      adapt: () => ({ ok: true as const, value: null, diagnostics: [] }),
    };
    const entry = {
      manifest: HostMetric.manifest,
      constructor: HostMetric,
      tabularDataAdapter: adapter,
    };
    const runtime = await createRuntime({ officialMaterials: false, materials: [entry] });
    expect(registrations.get('host-metric')).toBe(HostMetric);
    expect(runtime.catalog.get('host.metric')?.tabularDataAdapter).toBe(adapter);
    expect(runtime.catalog.list()).toHaveLength(1);
  });

  it('rejects a bridge entry with a conflicting adapter before registering product elements', async () => {
    const registrations = installCustomElements();
    class HostMetric extends BaseScreenTextMaterialElement {
      static override readonly manifest = {
        ...BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
        type: 'host.metric',
        tagName: 'host-metric',
      };
      static readonly tabularDataAdapter = {
        adapt: () => ({ ok: true as const, value: null, diagnostics: [] }),
      };
    }
    const result = await createBaseScreenRuntime({
      officialMaterials: false,
      materials: [
        {
          manifest: HostMetric.manifest,
          constructor: HostMetric,
          tabularDataAdapter: { adapt: HostMetric.tabularDataAdapter.adapt },
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_IDENTITY_CONFLICT');
    expect(registrations.size).toBe(0);
  });

  it('does not publish a runtime when any plugin activation fails', async () => {
    installCustomElements();
    const result = await createBaseScreenRuntime({
      officialMaterials: false,
      plugins: [
        {
          manifest: {
            id: 'failing-plugin',
            dependencies: [],
            capabilities: [],
            contributions: [],
          },
          activate() {
            throw new Error('activation failed');
          },
          deactivate() {},
          dispose() {},
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((item) => item.code === 'PLUGIN_CORE_LIFECYCLE_INVALID')).toBe(
      true,
    );
  });

  it('mounts a Viewer with runtime defaults and releases tracked listeners', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const fake = createFakeElement();
    const element = fake as unknown as BaseScreenViewerElement;
    const container = createContainer();
    const child = {} as Node;
    const mounted = await runtime.mountViewer(container, {
      element,
      children: [child],
      instanceId: 'host-viewer',
    });
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;

    expect(fake.append).toHaveBeenCalledWith(child);
    expect(container.append).toHaveBeenCalledWith(element);
    expect(fake.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: runtime.catalog,
        runtimeContributions: runtime.runtimeContributions,
        instanceId: 'host-viewer',
      }),
    );

    const listener = vi.fn();
    const cleanup = vi.fn();
    mounted.value.on('base-screen-diagnostic', listener);
    mounted.value.onDispose(cleanup);
    const disposed = await mounted.value.dispose();
    expect(disposed.ok).toBe(true);
    expect(mounted.value.disposed).toBe(true);
    expect(fake.removeEventListener).toHaveBeenCalledWith(
      'base-screen-diagnostic',
      listener,
      undefined,
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('cleans up a Designer when configure fails', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const fake = createFakeElement({
      configure: vi.fn(() => ({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
            path: [],
            message: 'configure failed',
          },
        ],
      })),
    });
    const mounted = await runtime.mountDesigner(createContainer(), {
      element: fake as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(false);
    expect(mounted.mountPhase).toBe('configure');
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it.each(['configure', 'load', 'document', 'mount'] as const)(
    'preserves the %s failure phase when cleanup also fails',
    async (phase) => {
      installCustomElements();
      const runtime = await createRuntime({ officialMaterials: false });
      const fake = createFakeElement();
      fake.unload.mockImplementation(() => {
        throw new Error('cleanup');
      });
      const container = createContainer();
      if (phase === 'configure')
        fake.configure.mockImplementationOnce(() => {
          throw new Error('configure');
        });
      if (phase === 'load') fake.load.mockRejectedValueOnce(new Error('load'));
      if (phase === 'document')
        Object.defineProperty(fake, 'document', {
          set() {
            throw new Error('document');
          },
        });
      if (phase === 'mount')
        vi.mocked(container.append).mockImplementationOnce(() => {
          throw new Error('mount');
        });
      const result = await runtime.mountDesigner(container, {
        element: fake as unknown as BaseScreenDesignerElement,
        ...(phase === 'load'
          ? { projectId: 'screen', projectAdapter: {} as ScreenProjectAdapter }
          : {}),
        ...(phase === 'document' ? { document: {} as ScreenDocument } : {}),
      });
      expect(result.ok).toBe(false);
      expect(result.mountPhase).toBe(phase);
      expect(result.diagnostics).toHaveLength(2);
    },
  );

  it('marks pre-mount validation and disposed-runtime failures as mount', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const invalid = await runtime.mountDesigner(createContainer(), { projectId: 'screen' });
    expect(invalid.ok).toBe(false);
    expect(invalid.mountPhase).toBe('mount');
    await runtime.dispose();
    const disposed = await runtime.mountViewer(createContainer(), {});
    expect(disposed.ok).toBe(false);
    expect(disposed.mountPhase).toBe('mount');
  });

  it('provides official tool and group defaults and respects explicit overrides', async () => {
    installCustomElements();
    const runtime = await createRuntime();
    const fake = createFakeElement();
    const mounted = await runtime.mountDesigner(createContainer(), {
      element: fake as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    expect(fake.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        toolMaterialTypes: {
          text: 'base.text',
          rectangle: 'base.rectangle',
          ellipse: 'base.ellipse',
          image: 'base.image',
        },
        groupMaterialType: 'base.container',
      }),
    );
    if (mounted.ok) await mounted.value.dispose();
    const custom = createFakeElement();
    await runtime.mountDesigner(createContainer(), {
      element: custom as unknown as BaseScreenDesignerElement,
      toolMaterialTypes: {},
      groupMaterialType: 'host.group',
    });
    expect(custom.configure).toHaveBeenCalledWith(
      expect.objectContaining({ toolMaterialTypes: {}, groupMaterialType: 'host.group' }),
    );
  });

  it('rejects a second Designer without changing the active binding and permits reuse after release', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const first = createFakeElement();
    const second = createFakeElement();
    const mounted = await runtime.mountDesigner(createContainer(), {
      element: first as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    expect(runtime.bindDesigner(second as unknown as BaseScreenDesignerElement).ok).toBe(false);
    const rejected = await runtime.mountDesigner(createContainer(), {
      element: second as unknown as BaseScreenDesignerElement,
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.diagnostics[0]?.code).toBe('PLUGIN_CORE_SESSION_INVALID');
    expect(second.configure).not.toHaveBeenCalled();
    expect(second.remove).not.toHaveBeenCalled();
    if (mounted.ok) await mounted.value.dispose();
    expect(
      (
        await runtime.mountDesigner(createContainer(), {
          element: second as unknown as BaseScreenDesignerElement,
        })
      ).ok,
    ).toBe(true);
  });

  it('refreshes inherited catalogs, keeps explicit overrides, and rolls back on failure', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const previous = runtime.catalog;
    const next = { get: vi.fn(), has: vi.fn(() => false), list: vi.fn(() => []) };
    const first = createFakeElement();
    const second = createFakeElement({
      refreshCatalog: vi.fn(() => ({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
            path: [],
            message: 'invalid catalog',
          },
        ],
      })),
    });
    const override = createFakeElement();
    for (const fake of [first, second]) {
      await runtime.mountViewer(createContainer(), {
        element: fake as unknown as BaseScreenViewerElement,
      });
    }
    await runtime.mountViewer(createContainer(), {
      element: override as unknown as BaseScreenViewerElement,
      catalog: previous,
    });
    const failed = runtime.setCatalog(next);
    expect(failed.ok).toBe(false);
    expect(runtime.catalog).toBe(previous);
    expect(first.catalog).toBe(previous);
    expect(first.refreshCatalog).toHaveBeenNthCalledWith(1, next);
    expect(first.refreshCatalog).toHaveBeenNthCalledWith(2, previous);
    expect(override.refreshCatalog).not.toHaveBeenCalled();
    expect(runtime.setCatalog(next, { target: 'future-mounts' }).ok).toBe(true);
    expect(runtime.catalog).toBe(next);
    expect(first.catalog).toBe(previous);
  });

  it('refreshes older inherited mounts after a future-only catalog update', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const previous = runtime.catalog;
    const future = { get: vi.fn(), has: vi.fn(() => false), list: vi.fn(() => []) };
    const next = { get: vi.fn(), has: vi.fn(() => false), list: vi.fn(() => []) };
    const older = createFakeElement();
    const newer = createFakeElement();
    await runtime.mountViewer(createContainer(), {
      element: older as unknown as BaseScreenViewerElement,
    });
    expect(runtime.setCatalog(future, { target: 'future-mounts' }).ok).toBe(true);
    expect(older.catalog).toBe(previous);
    await runtime.mountViewer(createContainer(), {
      element: newer as unknown as BaseScreenViewerElement,
    });
    expect(newer.catalog).toBe(future);

    expect(runtime.setCatalog(next).ok).toBe(true);
    expect(older.catalog).toBe(next);
    expect(newer.catalog).toBe(next);
    expect(older.refreshCatalog).toHaveBeenCalledOnce();
    expect(newer.refreshCatalog).toHaveBeenCalledOnce();
  });

  it('releases the Designer binding when catalog role lookup throws during initialization', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const first = createFakeElement();
    const failed = await runtime.mountDesigner(createContainer(), {
      element: first as unknown as BaseScreenDesignerElement,
      catalog: {
        get: vi.fn(),
        list: vi.fn(() => []),
        has: () => {
          throw new Error('catalog unavailable');
        },
      },
    });
    expect(failed.ok).toBe(false);
    expect(first.configure).not.toHaveBeenCalled();
    expect(first.unload).toHaveBeenCalledOnce();
    expect(first.remove).toHaveBeenCalledOnce();

    const replacement = createFakeElement();
    const mounted = await runtime.mountDesigner(createContainer(), {
      element: replacement as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    expect(replacement.configure).toHaveBeenCalledOnce();
  });

  it('caches created runtime disposal before mounted cleanup reenters it', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    const fake = createFakeElement();
    const mounted = await runtime.mountDesigner(createContainer(), {
      element: fake as unknown as BaseScreenDesignerElement,
    });
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    let reentered: ReturnType<typeof runtime.dispose> | undefined;
    mounted.value.onDispose(() => {
      reentered = runtime.dispose();
    });

    const disposal = runtime.dispose();
    expect(runtime.disposed).toBe(true);
    expect(runtime.dispose()).toBe(disposal);
    expect((await disposal).ok).toBe(true);
    expect(reentered).toBe(disposal);
    expect(runtime.manager.status).toBe('disposed');
    expect(fake.unload).toHaveBeenCalledOnce();
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it('declares only explicitly authorized Blueprint capabilities', async () => {
    installCustomElements();
    const runtime = await createRuntime({
      officialMaterials: false,
      blueprintCapabilities: ['blueprint.value.variable'],
    });
    expect(runtime.runtimeContributions.hasBlueprintCapability('blueprint.value.variable')).toBe(
      true,
    );
    expect(
      runtime.runtimeContributions.hasBlueprintCapability('blueprint.trigger.material-event'),
    ).toBe(false);
  });

  it('fails a pending project load when the runtime is disposed', async () => {
    installCustomElements();
    const runtime = await createRuntime({ officialMaterials: false });
    let resolveLoad: ((value: unknown) => void) | undefined;
    const loadPromise = new Promise<unknown>((resolve) => {
      resolveLoad = resolve;
    });
    const fake = createFakeElement({ load: vi.fn(() => loadPromise) });
    const mountPromise = runtime.mountDesigner(createContainer(), {
      element: fake as unknown as BaseScreenDesignerElement,
      projectId: 'screen-1',
      projectAdapter: {} as ScreenProjectAdapter,
    });

    const disposal = await runtime.dispose();
    expect(disposal.ok).toBe(true);
    resolveLoad?.({ ok: true, value: {}, diagnostics: [] });
    const mounted = await mountPromise;
    expect(mounted.ok).toBe(false);
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });
});
