import type { ScreenParseResult } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  BaseScreenDesignerElement,
  BaseScreenMountHandle,
  BaseScreenRuntime,
  BaseScreenViewerElement,
} from '../src/index.js';
import {
  createBaseScreenDesignerMountController,
  createBaseScreenMountHandle,
  createBaseScreenViewerMountController,
} from '../src/index.js';

type DesignerMountResult = ScreenParseResult<BaseScreenMountHandle<BaseScreenDesignerElement>>;

function createFakeElement() {
  return {
    append: vi.fn(),
    remove: vi.fn(),
    unload: vi.fn(),
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
    const detached = await controller.detach();
    expect(detached.ok).toBe(true);
    resolveMount?.({ ok: true, value: handle, diagnostics: [] });

    const attached = await attachPromise;
    expect(attached.ok).toBe(false);
    expect(attached.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    expect(onMounted).not.toHaveBeenCalled();
    expect(fake.unload).toHaveBeenCalledTimes(1);
    expect(fake.remove).toHaveBeenCalledTimes(1);
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
