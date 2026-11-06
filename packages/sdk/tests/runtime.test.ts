import type { ScreenDocument, ScreenProjectAdapter } from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BaseScreenDesignerElement,
  BaseScreenRuntime,
  BaseScreenViewerElement,
} from '../src/index.js';
import { createBaseScreenRuntime } from '../src/index.js';

const runtimes: BaseScreenRuntime[] = [];

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
  return Object.assign(
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
    },
    overrides,
  );
}

function createContainer() {
  return { append: vi.fn() } as unknown as Element;
}

afterEach(async () => {
  const pending = runtimes.splice(0);
  for (const runtime of pending) await runtime.dispose();
  vi.unstubAllGlobals();
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
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
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
