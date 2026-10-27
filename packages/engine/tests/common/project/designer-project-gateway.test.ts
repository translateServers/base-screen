import type {
  ScreenDocument,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshot,
  ScreenProjectSnapshotPort,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import { DesignerProjectGateway } from '../../../src/common/project/designer-project-gateway.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
};

const project: ScreenProjectEnvelope = {
  projectId: 'project-1',
  revision: 'revision-1',
  name: '项目一',
  description: null,
  document,
  metadata: {},
};

const summary: ScreenProjectSummary = {
  projectId: 'project-1',
  name: '项目一',
  description: null,
  revision: 'revision-1',
  published: false,
};

const snapshot: ScreenProjectSnapshot = {
  id: 'snapshot-1',
  name: '快照一',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function ok<T>(value: T) {
  return { ok: true as const, value, diagnostics: [] };
}

function fail(message: string) {
  return {
    ok: false as const,
    diagnostics: [
      {
        severity: 'error' as const,
        code: 'PROJECT_UNAVAILABLE' as const,
        path: [],
        message,
      },
    ],
  };
}

function lifecycleFailure(result: ScreenParseResultLike) {
  return (
    !result.ok &&
    result.diagnostics[0]?.code === 'PLUGIN_CORE_LIFECYCLE_INVALID' &&
    result.diagnostics[0]?.severity === 'error'
  );
}

type ScreenParseResultLike = {
  readonly ok: boolean;
  readonly diagnostics: readonly { readonly code: string; readonly severity: string }[];
};

interface GatewayHarness {
  readonly gateway: DesignerProjectGateway;
  readonly catalog: ScreenProjectCatalogPort;
  readonly preview: ScreenProjectPreviewPort;
  readonly snapshots: ScreenProjectSnapshotPort;
  readonly replaceDocument: ReturnType<typeof vi.fn>;
  readonly loadProject: ReturnType<typeof vi.fn>;
  readonly setProject: (value: ScreenProjectEnvelope | undefined) => void;
  readonly setDocument: (value: ScreenDocument | undefined) => void;
}

function createGateway(): GatewayHarness {
  const ports: Record<string, unknown> = {};
  const catalog = (ports.catalog = {
    list: vi.fn(async () => ok([summary])),
    create: vi.fn(async () => ok(project)),
    clone: vi.fn(async () => ok(project)),
    delete: vi.fn(async () => ok(undefined)),
    import: vi.fn(async () => ok(project)),
    export: vi.fn(async () => ok(document)),
  }) as ScreenProjectCatalogPort;
  const preview = (ports.preview = {
    load: vi.fn(async (): Promise<ScreenParseResultLike> => ok({ label: '预览', document })),
  }) as unknown as ScreenProjectPreviewPort;
  const snapshots = (ports.snapshots = {
    list: vi.fn(async () => ok([snapshot])),
    create: vi.fn(async () => ok(snapshot)),
    restore: vi.fn(async () => ok(project)),
    delete: vi.fn(async () => ok(undefined)),
  }) as unknown as ScreenProjectSnapshotPort;
  let currentProject: ScreenProjectEnvelope | undefined = project;
  let currentDocument: ScreenDocument | undefined = document;
  const replaceDocument = vi.fn(() => ok(document));
  const loadProject = vi.fn(async () => ok(project));
  const gateway = new DesignerProjectGateway({
    getProjectCatalogPort: () => catalog,
    getProjectPreviewPort: () => preview,
    getProjectSnapshotPort: () => snapshots,
    getDocument: () => currentDocument,
    getProject: () => currentProject,
    replaceDocument,
    loadProject,
  });
  return {
    gateway,
    catalog,
    preview,
    snapshots,
    replaceDocument,
    loadProject,
    setProject: (value) => {
      currentProject = value;
    },
    setDocument: (value) => {
      currentDocument = value;
    },
  };
}

describe('DesignerProjectGateway', () => {
  it('reports capabilities from available host ports', () => {
    const harness = createGateway();
    expect(harness.gateway.capabilities).toEqual({
      directory: true,
      preview: true,
      snapshots: true,
    });
    const bare = new DesignerProjectGateway({
      getProjectCatalogPort: () => undefined,
      getProjectPreviewPort: () => undefined,
      getProjectSnapshotPort: () => undefined,
      getDocument: () => document,
      getProject: () => undefined,
      replaceDocument: vi.fn(),
      loadProject: vi.fn(),
    });
    expect(bare.capabilities).toEqual({ directory: false, preview: false, snapshots: false });
  });

  it('guards catalog operations with lifecycle diagnostics when the port is missing', async () => {
    const harness = createGateway();
    const bare = new DesignerProjectGateway({
      getProjectCatalogPort: () => undefined,
      getProjectPreviewPort: () => undefined,
      getProjectSnapshotPort: () => undefined,
      getDocument: () => document,
      getProject: () => project,
      replaceDocument: vi.fn(),
      loadProject: vi.fn(),
    });
    const failures = [
      await bare.listProjects(),
      await bare.createProject('项目'),
      await bare.cloneProject('project-1', '项目'),
      await bare.deleteProject('project-1', 'revision-1'),
      await bare.importProject('项目', document),
      await bare.exportProject('project-1', 'revision-1'),
      await bare.previewProject(false),
      await bare.listSnapshots(),
      await bare.createSnapshot('快照'),
      await bare.restoreSnapshot('snapshot-1'),
    ];
    for (const failure of failures) {
      expect(lifecycleFailure(failure)).toBe(true);
    }
    expect(harness.catalog.list).not.toHaveBeenCalled();
  });

  it('delegates catalog operations with query and published filters', async () => {
    const harness = createGateway();
    await harness.gateway.listProjects('查询', true);
    expect(harness.catalog.list).toHaveBeenCalledWith(
      expect.objectContaining({ query: '查询', published: true }),
    );
    await harness.gateway.exportProject('project-1', 'revision-1');
    expect(harness.catalog.export).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', revision: 'revision-1' }),
    );
  });

  it('maps preview load results to the document value', async () => {
    const harness = createGateway();
    await expect(harness.gateway.previewProject(true)).resolves.toEqual(ok(document));
    expect(harness.preview.load).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', revision: 'revision-1', published: true }),
    );
    vi.mocked(harness.preview.load).mockResolvedValueOnce(fail('预览失败。'));
    await expect(harness.gateway.previewProject(false)).resolves.toEqual(fail('预览失败。'));
  });

  it('guards snapshot creation without a loaded document or project', async () => {
    const harness = createGateway();
    harness.setProject(undefined);
    expect(lifecycleFailure(await harness.gateway.createSnapshot('快照'))).toBe(true);
    harness.setProject(project);
    harness.setDocument(undefined);
    expect(lifecycleFailure(await harness.gateway.createSnapshot('快照'))).toBe(true);
    harness.setDocument(document);
    await expect(harness.gateway.createSnapshot('快照')).resolves.toEqual(ok(snapshot));
    expect(harness.snapshots.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', revision: 'revision-1', name: '快照' }),
    );
  });

  it('restores a snapshot by replacing the document and reloading the project', async () => {
    const harness = createGateway();
    await expect(harness.gateway.restoreSnapshot('snapshot-1')).resolves.toEqual(ok(project));
    expect(harness.replaceDocument).toHaveBeenCalledWith(document);
    expect(harness.loadProject).toHaveBeenCalledWith('project-1');
  });

  it('passes through restore and replace failures without reloading', async () => {
    const harness = createGateway();
    vi.mocked(harness.snapshots.restore).mockResolvedValueOnce(fail('恢复失败。'));
    await expect(harness.gateway.restoreSnapshot('snapshot-1')).resolves.toEqual(
      fail('恢复失败。'),
    );
    expect(harness.replaceDocument).not.toHaveBeenCalled();
    vi.mocked(harness.replaceDocument).mockReturnValueOnce(fail('替换失败。'));
    await expect(harness.gateway.restoreSnapshot('snapshot-1')).resolves.toEqual(
      fail('替换失败。'),
    );
    expect(harness.loadProject).not.toHaveBeenCalled();
  });
});
