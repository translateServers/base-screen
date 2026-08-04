import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ScreenProjectController, type ScreenProjectScheduler } from './project-controller.js';

const document = (): ScreenDocument => ({
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
});

const envelope = (revision = 'rev-1', value = document()): ScreenProjectEnvelope => ({
  projectId: 'project-1',
  revision,
  name: 'Project',
  description: null,
  document: value,
  metadata: {},
});

const success = (value: ScreenProjectEnvelope): ScreenParseResult<ScreenProjectEnvelope> => ({
  ok: true,
  value,
  diagnostics: [],
});

const failure = (
  code: 'PROJECT_UNAVAILABLE' | 'PROJECT_CONFLICT',
): ScreenParseResult<ScreenProjectEnvelope> => ({
  ok: false,
  diagnostics: [{ severity: 'error', code, path: [], message: code }],
});

function adapter(overrides: Partial<ScreenProjectAdapter> = {}): ScreenProjectAdapter {
  return {
    capabilities: { publish: false },
    load: vi.fn(async () => success(envelope())),
    save: vi.fn(async () => success(envelope('rev-2'))),
    ...overrides,
  };
}

function controller(
  projectAdapter: ScreenProjectAdapter,
  current = document(),
  scheduler?: ScreenProjectScheduler,
) {
  let present = current;
  const changes: boolean[] = [];
  const instance = new ScreenProjectController({
    getDocument: () => present,
    replaceDocument: (next) => {
      present = next;
      return { ok: true, value: next, diagnostics: [] };
    },
    onDirtyChange: (dirty) => changes.push(dirty),
    ...(scheduler === undefined ? {} : { scheduler }),
  });
  expect(instance.bindAdapter(projectAdapter).ok).toBe(true);
  return {
    instance,
    changes,
    get present() {
      return present;
    },
    set present(value: ScreenDocument) {
      present = value;
    },
  };
}

describe('ScreenProjectController', () => {
  it('fails closed for inconsistent publish capability', () => {
    const instance = new ScreenProjectController({
      getDocument: () => document(),
      replaceDocument: (value) => ({ ok: true, value, diagnostics: [] }),
    });
    expect(instance.bindAdapter(adapter({ capabilities: { publish: true } }))).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_ADAPTER_INVALID' }],
    });
  });

  it('reparses successful envelopes and exposes only fixed throw diagnostics', async () => {
    const secret = 'canary-project-secret';
    const projectAdapter = adapter({
      load: vi.fn(async () => {
        throw new Error(secret);
      }),
    });
    const { instance } = controller(projectAdapter);
    const result = await instance.load('project-1');
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_UNAVAILABLE' }] });
    expect(JSON.stringify(result)).not.toContain(secret);

    projectAdapter.load = vi.fn(async () =>
      success({ ...envelope(), document: 'invalid' as unknown as ScreenDocument }),
    );
    const invalid = await instance.load('project-1');
    expect(invalid).toMatchObject({ ok: false, diagnostics: [{ code: 'DOCUMENT_NOT_OBJECT' }] });
  });

  it('retries unavailable loads with injected 250/1000 scheduler delays', async () => {
    const scheduler: ScreenProjectScheduler = { wait: vi.fn(async () => undefined) };
    const projectAdapter = adapter({
      load: vi
        .fn()
        .mockResolvedValueOnce(failure('PROJECT_UNAVAILABLE'))
        .mockResolvedValueOnce(failure('PROJECT_UNAVAILABLE'))
        .mockResolvedValueOnce(success(envelope())),
    });
    const { instance } = controller(projectAdapter, document(), scheduler);
    await expect(instance.load('project-1')).resolves.toMatchObject({ ok: true });
    expect(scheduler.wait).toHaveBeenNthCalledWith(1, 250, expect.anything());
    expect(scheduler.wait).toHaveBeenNthCalledWith(2, 1000, expect.anything());
  });

  it('ignores aborted late loads and cancels their signal', async () => {
    let resolveFirst: ((result: ScreenParseResult<ScreenProjectEnvelope>) => void) | undefined;
    const projectAdapter = adapter({
      load: vi
        .fn()
        .mockImplementationOnce(
          (request) =>
            new Promise((resolve) => {
              resolveFirst = resolve;
              expect(request.signal.aborted).toBe(false);
            }),
        )
        .mockResolvedValueOnce(success(envelope('new'))),
    });
    const { instance } = controller(projectAdapter);
    const first = instance.load('project-1');
    const second = instance.load('project-1');
    resolveFirst?.(success(envelope('old')));
    await expect(first).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_ABORTED' }],
    });
    await expect(second).resolves.toMatchObject({ ok: true, value: { revision: 'new' } });
  });

  it('rejects a load envelope for another project without replacing the document', async () => {
    const projectAdapter = adapter({ load: vi.fn(async () => success(envelope('rev-2'))) });
    const session = controller(projectAdapter);
    const result = await session.instance.load('another-project');
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_ADAPTER_INVALID' }],
    });
    expect(session.present).toEqual(document());
    expect(session.instance.project).toBeUndefined();
    expect(session.instance.phase).toBe('error');
  });

  it('single-flights equal save snapshots and preserves edits made while saving', async () => {
    let resolveSave: ((result: ScreenParseResult<ScreenProjectEnvelope>) => void) | undefined;
    const projectAdapter = adapter({
      save: vi.fn(
        () =>
          new Promise<ScreenParseResult<ScreenProjectEnvelope>>((resolve) => {
            resolveSave = resolve;
          }),
      ),
    });
    const session = controller(projectAdapter);
    await session.instance.load('project-1');
    const first = session.instance.save();
    const second = session.instance.save();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf('function'));
    session.present = {
      ...document(),
      canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    };
    session.instance.notifyDocumentChanged();
    resolveSave?.(success(envelope('rev-2')));
    await expect(first).resolves.toMatchObject({ ok: true, value: { revision: 'rev-2' } });
    expect(session.present.canvas.width).toBe(100);
    expect(session.instance.dirty).toBe(true);
    expect(projectAdapter.save).toHaveBeenCalledTimes(1);
  });

  it('serializes save and publish, requires a clean project, and preserves conflict state', async () => {
    const published = vi.fn(async () => success(envelope('rev-3')));
    const projectAdapter = adapter({
      capabilities: { publish: true },
      publish: published,
      save: vi.fn(async () => failure('PROJECT_CONFLICT')),
    });
    const session = controller(projectAdapter);
    await session.instance.load('project-1');
    await expect(session.instance.publish()).resolves.toMatchObject({ ok: true });
    session.present = {
      ...document(),
      canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    };
    session.instance.notifyDocumentChanged();
    await expect(session.instance.publish()).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_DIRTY' }],
    });
    const before = session.present;
    await expect(session.instance.save()).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_CONFLICT' }],
    });
    expect(session.instance.phase).toBe('conflict');
    expect(session.present).toBe(before);
    expect(session.instance.project?.revision).toBe('rev-3');
  });

  it('allows an explicit publish retry after an unavailable failure', async () => {
    const published = vi
      .fn()
      .mockResolvedValueOnce(failure('PROJECT_UNAVAILABLE'))
      .mockResolvedValueOnce(success(envelope('rev-2')));
    const session = controller(adapter({ capabilities: { publish: true }, publish: published }));
    await session.instance.load('project-1');
    await expect(session.instance.publish()).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_UNAVAILABLE' }],
    });
    expect(session.instance.phase).toBe('error');
    await expect(session.instance.retryLastProjectOperation()).resolves.toMatchObject({
      ok: true,
      value: { revision: 'rev-2' },
    });
    expect(published).toHaveBeenCalledTimes(2);
  });

  it('requires explicit discard before reloading a dirty conflict and can continue editing', async () => {
    const projectAdapter = adapter({ save: vi.fn(async () => failure('PROJECT_CONFLICT')) });
    const session = controller(projectAdapter);
    await session.instance.load('project-1');
    session.present = {
      ...document(),
      canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    };
    session.instance.notifyDocumentChanged();
    await expect(session.instance.save()).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_CONFLICT' }],
    });
    const before = session.present;
    await expect(session.instance.reloadRemote()).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_DIRTY' }],
    });
    expect(session.instance.continueEditing()).toMatchObject({ ok: true });
    expect(session.instance.phase).toBe('ready');
    expect(session.present).toBe(before);

    await expect(session.instance.save()).resolves.toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_CONFLICT' }],
    });
    projectAdapter.load = vi.fn(async () => success(envelope('remote')));
    await expect(session.instance.reloadRemote(true)).resolves.toMatchObject({
      ok: true,
      value: { revision: 'remote' },
    });
    expect(session.present.canvas.width).toBe(1920);
    expect(session.instance.dirty).toBe(false);
  });
});
