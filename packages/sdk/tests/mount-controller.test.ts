import type { ScreenParseResult } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  BaseScreenDesignerElement,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerElement,
} from '../src/index.js';
import {
  createBaseScreenDesignerMountController,
  createBaseScreenMountHandle,
  createBaseScreenRuntime,
  createBaseScreenViewerMountController,
} from '../src/index.js';

type DesignerMountResult = ScreenParseResult<BaseScreenMountHandle<BaseScreenDesignerElement>>;

function createFakeElement() {
  return {
    append: vi.fn(),
    remove: vi.fn(),
    unload: vi.fn(),
    load: vi.fn(),
    configure: vi.fn(),
    refreshCatalog: vi.fn(
      (_catalog: BaseScreenRuntimeCatalog): ScreenParseResult<null> => ({
        ok: true,
        value: null,
        diagnostics: [],
      }),
    ),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function createContainer(): Element {
  return { append: vi.fn() } as unknown as Element;
}

function createDesignerHandle() {
  const fake = createFakeElement();
  const detach = vi.fn();
  const handle = createBaseScreenMountHandle({
    element: fake as unknown as BaseScreenDesignerElement,
    detach,
  });
  return { fake, detach, handle };
}

function createRuntime(
  mountDesigner: BaseScreenRuntime['mountDesigner'],
  mountViewer: BaseScreenRuntime['mountViewer'] = vi.fn(),
) {
  const dispose = vi.fn();
  return {
    dispose,
    runtime: {
      catalog: [] as unknown as BaseScreenRuntimeCatalog,
      mountDesigner,
      mountViewer,
      dispose,
    } as unknown as BaseScreenRuntime,
  };
}

describe('Base Screen mount controller', () => {
  it('forwards mount options, registers cleanup, and detaches without disposing runtime', async () => {
    const { fake, handle } = createDesignerHandle();
    const mountDesigner = vi.fn(async () => ({ ok: true, value: handle, diagnostics: [] }));
    const { runtime, dispose } = createRuntime(mountDesigner);
    const container = createContainer();
    const cleanup = vi.fn();
    const onMounted = vi.fn(() => cleanup);
    const onDiagnostics = vi.fn();
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: { projectId: 'screen-1' },
      onMounted,
      onDiagnostics,
    });

    const attached = await controller.attach(container);
    expect(attached.ok).toBe(true);
    expect(mountDesigner).toHaveBeenCalledWith(container, { projectId: 'screen-1' });
    expect(controller.handle).toBe(handle);
    expect(onMounted).toHaveBeenCalledWith(handle);
    expect(onDiagnostics).toHaveBeenCalledWith([]);

    const detached = await controller.detach();
    expect(detached.ok).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(controller.handle).toBeUndefined();
  });

  it('uses the latest options for a later attach', async () => {
    const { handle } = createDesignerHandle();
    const mountDesigner = vi.fn(async () => ({ ok: true, value: handle, diagnostics: [] }));
    const { runtime } = createRuntime(mountDesigner);
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: { projectId: 'first' },
    });
    controller.updateOptions({ projectId: 'second' });

    await controller.attach(createContainer());
    expect(mountDesigner).toHaveBeenCalledWith(expect.anything(), { projectId: 'second' });
  });

  it.each(['designer', 'viewer'] as const)(
    'hot refreshes %s catalog without loading, configuring or releasing the active instance',
    async (kind) => {
      const { fake, handle } = createDesignerHandle();
      const mount = vi.fn(async () => ({ ok: true as const, value: handle, diagnostics: [] }));
      const { runtime } = createRuntime(
        mount,
        mount as unknown as BaseScreenRuntime['mountViewer'],
      );
      const initial = [] as unknown as BaseScreenRuntimeCatalog;
      const next = [] as unknown as BaseScreenRuntimeCatalog;
      const createController =
        kind === 'designer'
          ? createBaseScreenDesignerMountController
          : createBaseScreenViewerMountController;
      const controller = createController({ runtime, options: { catalog: initial } });
      await controller.attach(createContainer());

      expect(controller.updateOptions({ catalog: next }).ok).toBe(true);
      expect(controller.updateOptions({ catalog: next }).ok).toBe(true);
      expect(fake.refreshCatalog).toHaveBeenCalledExactlyOnceWith(next);
      expect(mount).toHaveBeenCalledOnce();
      expect(fake.unload).not.toHaveBeenCalled();
      expect(fake.load).not.toHaveBeenCalled();
      expect(fake.configure).not.toHaveBeenCalled();
      expect(controller.handle).toBe(handle);
    },
  );

  it('keeps configure-only changes as a snapshot for the next attach', async () => {
    const first = createDesignerHandle();
    const second = createDesignerHandle();
    const mountDesigner = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: first.handle, diagnostics: [] })
      .mockResolvedValueOnce({ ok: true, value: second.handle, diagnostics: [] });
    const { runtime } = createRuntime(mountDesigner);
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: { backButton: false },
    });
    await controller.attach(createContainer());
    const options = { backButton: true };
    expect(controller.updateOptions(options).ok).toBe(true);
    options.backButton = false;
    expect(first.fake.configure).not.toHaveBeenCalled();
    expect(first.fake.refreshCatalog).not.toHaveBeenCalled();
    expect(first.fake.unload).not.toHaveBeenCalled();
    await controller.attach(createContainer());
    expect(mountDesigner).toHaveBeenLastCalledWith(expect.anything(), { backButton: true });
    expect(first.fake.unload).toHaveBeenCalledOnce();
  });

  it('keeps the current handle after a catalog failure and allows retrying the same reference', async () => {
    const { fake, handle } = createDesignerHandle();
    const mountDesigner = vi.fn(async () => ({
      ok: true as const,
      value: handle,
      diagnostics: [],
    }));
    const { runtime } = createRuntime(mountDesigner);
    const onDiagnostics = vi.fn();
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: {},
      onDiagnostics,
    });
    await controller.attach(createContainer());
    const failure = {
      ok: false as const,
      diagnostics: [
        {
          severity: 'error' as const,
          code: 'PLUGIN_CORE_LIFECYCLE_INVALID' as const,
          path: ['catalog'],
          message: 'Catalog refresh failed.',
        },
      ],
    };
    fake.refreshCatalog.mockReturnValueOnce(failure);
    const catalog = [] as unknown as BaseScreenRuntimeCatalog;
    expect(controller.updateOptions({ catalog })).toEqual(failure);
    expect(controller.handle).toBe(handle);
    expect(fake.unload).not.toHaveBeenCalled();
    expect(controller.diagnostics).toEqual(failure.diagnostics);
    fake.refreshCatalog.mockReturnValueOnce({ ...failure, diagnostics: [...failure.diagnostics] });
    const published = onDiagnostics.mock.calls.length;
    expect(controller.updateOptions({ catalog }).ok).toBe(false);
    expect(onDiagnostics).toHaveBeenCalledTimes(published);
    expect(controller.updateOptions({ catalog }).ok).toBe(true);
    expect(fake.refreshCatalog).toHaveBeenCalledTimes(3);
    expect(controller.diagnostics).toEqual([]);
    expect(onDiagnostics).toHaveBeenLastCalledWith([]);
  });

  it('applies the latest catalog after a pending attach while preserving its initialization snapshot', async () => {
    const { fake, handle } = createDesignerHandle();
    let resolveMount: ((result: DesignerMountResult) => void) | undefined;
    const mountDesigner = vi.fn(
      () =>
        new Promise<DesignerMountResult>((resolve) => {
          resolveMount = resolve;
        }),
    );
    const { runtime } = createRuntime(mountDesigner);
    const initial = [] as unknown as BaseScreenRuntimeCatalog;
    const next = [] as unknown as BaseScreenRuntimeCatalog;
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: { projectId: 'first', catalog: initial },
    });
    const attaching = controller.attach(createContainer());
    await vi.waitFor(() => expect(mountDesigner).toHaveBeenCalledOnce());
    controller.updateOptions({ projectId: 'second', catalog: next });
    resolveMount?.({ ok: true, value: handle, diagnostics: [] });
    expect((await attaching).ok).toBe(true);
    expect(mountDesigner).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      projectId: 'first',
      catalog: initial,
    });
    expect(fake.refreshCatalog).toHaveBeenCalledExactlyOnceWith(next);
    expect(fake.load).not.toHaveBeenCalled();
  });

  it('retains a successfully mounted instance when the pending catalog refresh fails', async () => {
    const { fake, handle } = createDesignerHandle();
    let resolveMount: ((result: DesignerMountResult) => void) | undefined;
    const { runtime } = createRuntime(
      vi.fn(
        () =>
          new Promise<DesignerMountResult>((resolve) => {
            resolveMount = resolve;
          }),
      ),
    );
    const onMounted = vi.fn();
    const controller = createBaseScreenDesignerMountController({ runtime, options: {}, onMounted });
    const attaching = controller.attach(createContainer());
    await vi.waitFor(() => expect(resolveMount).toBeDefined());
    const catalog = [] as unknown as BaseScreenRuntimeCatalog;
    controller.updateOptions({ catalog });
    fake.refreshCatalog.mockImplementationOnce(() => {
      throw new Error('Refresh failed.');
    });
    resolveMount?.({ ok: true, value: handle, diagnostics: [] });
    expect((await attaching).ok).toBe(false);
    expect(controller.handle).toBe(handle);
    expect(onMounted).toHaveBeenCalledWith(handle);
    expect(fake.unload).not.toHaveBeenCalled();
    expect(controller.updateOptions({ catalog }).ok).toBe(true);
    expect(controller.diagnostics).toEqual([]);
  });

  it('does not clear mount failure diagnostics when options update without an active handle', async () => {
    const failure: DesignerMountResult = {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'PROJECT_ADAPTER_INVALID',
          path: [],
          message: 'Invalid project adapter.',
        },
      ],
    };
    const { runtime } = createRuntime(vi.fn(async () => failure));
    const controller = createBaseScreenDesignerMountController({ runtime, options: {} });
    await controller.attach(createContainer());
    controller.updateOptions({ catalog: [] as unknown as BaseScreenRuntimeCatalog });
    expect(controller.diagnostics).toEqual(failure.diagnostics);
  });

  it('publishes mount failures instead of swallowing diagnostics', async () => {
    const failure: DesignerMountResult = {
      ok: false,
      diagnostics: [
        {
          severity: 'error' as const,
          code: 'PROJECT_ADAPTER_INVALID' as const,
          path: [],
          message: 'Project adapter is invalid.',
        },
      ],
    };
    const mountDesigner = vi.fn(async () => failure);
    const { runtime } = createRuntime(mountDesigner);
    const onDiagnostics = vi.fn();
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: {},
      onDiagnostics,
    });

    const attached = await controller.attach(createContainer());
    expect(attached.ok).toBe(false);
    expect(onDiagnostics).toHaveBeenCalledWith(failure.diagnostics);
    expect(controller.diagnostics).toEqual(failure.diagnostics);
    expect(controller.handle).toBeUndefined();
  });

  it('releases a late mount result after detach', async () => {
    const { fake, handle } = createDesignerHandle();
    let resolveMount: ((value: DesignerMountResult) => void) | undefined;
    const pending = new Promise<DesignerMountResult>((resolve) => {
      resolveMount = resolve;
    });
    const mountDesigner = vi.fn(() => pending);
    const { runtime } = createRuntime(mountDesigner);
    const onMounted = vi.fn();
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: {},
      onMounted,
    });

    const attachPromise = controller.attach(createContainer());
    await vi.waitFor(() => expect(mountDesigner).toHaveBeenCalledTimes(1));
    const detaching = controller.detach();
    resolveMount?.({ ok: true, value: handle, diagnostics: [] });
    expect((await detaching).ok).toBe(true);

    const attached = await attachPromise;
    expect(attached.ok).toBe(false);
    expect(attached.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    expect(onMounted).not.toHaveBeenCalled();
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });

  it('waits for stale mount disposal before a replacement attach can mount', async () => {
    const first = createDesignerHandle();
    const second = createDesignerHandle();
    let resolveMount: ((result: DesignerMountResult) => void) | undefined;
    const mountDesigner = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<DesignerMountResult>((resolve) => {
            resolveMount = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        expect(first.fake.unload).toHaveBeenCalledOnce();
        return { ok: true, value: second.handle, diagnostics: [] };
      });
    const { runtime } = createRuntime(mountDesigner);
    const controller = createBaseScreenDesignerMountController({ runtime, options: {} });
    const firstAttach = controller.attach(createContainer());
    await vi.waitFor(() => expect(mountDesigner).toHaveBeenCalledOnce());
    const detaching = controller.detach();
    const nextAttach = controller.attach(createContainer());
    await Promise.resolve();
    expect(mountDesigner).toHaveBeenCalledOnce();
    resolveMount?.({ ok: true, value: first.handle, diagnostics: [] });
    expect((await firstAttach).ok).toBe(false);
    expect((await detaching).ok).toBe(true);
    expect((await nextAttach).ok).toBe(true);
    expect(controller.handle).toBe(second.handle);
    expect(mountDesigner).toHaveBeenCalledTimes(2);
  });

  it('uses the live element catalog after an external runtime refresh', async () => {
    const { fake, handle } = createDesignerHandle();
    const { runtime } = createRuntime(
      vi.fn(async () => ({ ok: true, value: handle, diagnostics: [] })),
    );
    const initial = [] as unknown as BaseScreenRuntimeCatalog;
    const external = [] as unknown as BaseScreenRuntimeCatalog;
    const controller = createBaseScreenDesignerMountController({
      runtime,
      options: { catalog: initial },
    });
    await controller.attach(createContainer());
    Reflect.set(fake, 'catalog', external);
    expect(controller.updateOptions({ catalog: initial }).ok).toBe(true);
    expect(fake.refreshCatalog).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it('tracks explicit overrides and restored inheritance across runtime catalog updates', async () => {
    const registrations = new Map<string, CustomElementConstructor>();
    vi.stubGlobal('customElements', {
      get: (tagName: string) => registrations.get(tagName),
      define: (tagName: string, element: CustomElementConstructor) =>
        registrations.set(tagName, element),
    });
    const created = await createBaseScreenRuntime({ officialMaterials: false });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const runtime = created.value;
    const fake = {
      ...createFakeElement(),
      catalog: undefined as BaseScreenRuntimeCatalog | undefined,
      configure: vi.fn((options: { catalog: BaseScreenRuntimeCatalog }) => {
        fake.catalog = options.catalog;
        return { ok: true, value: null, diagnostics: [] };
      }),
    };
    fake.refreshCatalog.mockImplementation((catalog: BaseScreenRuntimeCatalog) => {
      fake.catalog = catalog;
      return { ok: true, value: null, diagnostics: [] };
    });
    const controller = createBaseScreenViewerMountController({
      runtime,
      options: {
        element: fake as unknown as BaseScreenViewerElement,
      },
    });
    try {
      await controller.attach(createContainer());
      const override = [] as unknown as BaseScreenRuntimeCatalog;
      const next = [] as unknown as BaseScreenRuntimeCatalog;
      expect(
        controller.updateOptions({
          element: fake as unknown as BaseScreenViewerElement,
          catalog: override,
        }).ok,
      ).toBe(true);
      expect(runtime.setCatalog(next).ok).toBe(true);
      expect(fake.catalog).toBe(override);
      expect(
        controller.updateOptions({ element: fake as unknown as BaseScreenViewerElement }).ok,
      ).toBe(true);
      expect(fake.catalog).toBe(next);
      const inherited = [] as unknown as BaseScreenRuntimeCatalog;
      expect(runtime.setCatalog(inherited).ok).toBe(true);
      expect(fake.catalog).toBe(inherited);
      const calls = fake.refreshCatalog.mock.calls.length;
      expect(
        controller.updateOptions({
          element: fake as unknown as BaseScreenViewerElement,
          catalog: inherited,
        }).ok,
      ).toBe(true);
      expect(fake.refreshCatalog).toHaveBeenCalledTimes(calls);
      expect(runtime.setCatalog(next).ok).toBe(true);
      expect(fake.catalog).toBe(inherited);
    } finally {
      await controller.detach();
      await runtime.dispose();
      vi.unstubAllGlobals();
    }
  });

  it('provides the same lifecycle for Viewer mounts', async () => {
    const fake = createFakeElement();
    const handle = createBaseScreenMountHandle({
      element: fake as unknown as BaseScreenViewerElement,
      detach: vi.fn(),
    });
    const mountViewer = vi.fn(async () => ({ ok: true, value: handle, diagnostics: [] }));
    const { runtime } = createRuntime(vi.fn(), mountViewer);
    const controller = createBaseScreenViewerMountController({
      runtime,
      options: { instanceId: 'host-viewer' },
    });

    const attached = await controller.attach(createContainer());
    expect(attached.ok).toBe(true);
    expect(mountViewer).toHaveBeenCalledWith(expect.anything(), {
      instanceId: 'host-viewer',
    });
    await controller.detach();
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });
});
