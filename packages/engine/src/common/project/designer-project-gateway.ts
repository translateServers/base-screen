import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshot,
  ScreenProjectSnapshotPort,
  ScreenProjectSummary,
} from '@base-screen/contracts';

export interface DesignerProjectGatewayCapabilities {
  readonly directory: boolean;
  readonly preview: boolean;
  readonly snapshots: boolean;
}

export interface DesignerProjectGatewayOptions {
  readonly getProjectCatalogPort: () => ScreenProjectCatalogPort | undefined;
  readonly getProjectPreviewPort: () => ScreenProjectPreviewPort | undefined;
  readonly getProjectSnapshotPort: () => ScreenProjectSnapshotPort | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getProject: () => ScreenProjectEnvelope | undefined;
  readonly replaceDocument: (document: ScreenDocument) => ScreenParseResult<ScreenDocument>;
  readonly loadProject: (projectId: string) => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
}

// 宿主端口门面：集中承载项目目录、预览与快照端口的可用性守卫、
// 中止信号和结果映射，元素与控制器只需消费本网关，不再各自拼装端口调用。
export class DesignerProjectGateway {
  constructor(private readonly options: DesignerProjectGatewayOptions) {}

  get capabilities(): DesignerProjectGatewayCapabilities {
    return {
      directory: this.options.getProjectCatalogPort() !== undefined,
      preview: this.options.getProjectPreviewPort() !== undefined,
      snapshots: this.options.getProjectSnapshotPort() !== undefined,
    };
  }

  listProjects(
    query = '',
    published: boolean | undefined = undefined,
  ): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>> {
    const port = this.options.getProjectCatalogPort();
    if (port === undefined) return Promise.resolve(projectCatalogUnavailable());
    return port.list({ query, published, signal: new AbortController().signal });
  }

  createProject(name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const port = this.options.getProjectCatalogPort();
    if (port === undefined) return Promise.resolve(projectCatalogUnavailable());
    return port.create({ name, signal: new AbortController().signal });
  }

  cloneProject(projectId: string, name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const port = this.options.getProjectCatalogPort();
    if (port === undefined) return Promise.resolve(projectCatalogUnavailable());
    return port.clone({ projectId, name, signal: new AbortController().signal });
  }

  deleteProject(projectId: string, revision: string): Promise<ScreenParseResult<void>> {
    const port = this.options.getProjectCatalogPort();
    if (port === undefined) return Promise.resolve(projectCatalogUnavailable());
    return port.delete({ projectId, revision, signal: new AbortController().signal });
  }

  importProject(
    name: string,
    document: ScreenDocument,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const port = this.options.getProjectCatalogPort();
    if (port === undefined) return Promise.resolve(projectCatalogUnavailable());
    return port.import({ name, document, signal: new AbortController().signal });
  }

  exportProject(projectId: string, revision: string): Promise<ScreenParseResult<ScreenDocument>> {
    const port = this.options.getProjectCatalogPort();
    if (port === undefined) return Promise.resolve(projectCatalogUnavailable());
    return port.export({ projectId, revision, signal: new AbortController().signal });
  }

  previewProject(published: boolean): Promise<ScreenParseResult<ScreenDocument>> {
    const project = this.options.getProject();
    const port = this.options.getProjectPreviewPort();
    if (project === undefined || port === undefined) {
      return Promise.resolve(projectPreviewUnavailable());
    }
    return port
      .load({
        projectId: project.projectId,
        revision: project.revision,
        published,
        signal: new AbortController().signal,
      })
      .then((result) =>
        result.ok
          ? { ok: true, value: result.value.document, diagnostics: [] }
          : { ok: false, diagnostics: result.diagnostics },
      );
  }

  listSnapshots(): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>> {
    const project = this.options.getProject();
    const port = this.options.getProjectSnapshotPort();
    if (project === undefined || port === undefined) {
      return Promise.resolve(snapshotPortUnavailable());
    }
    return port.list(project.projectId, new AbortController().signal);
  }

  createSnapshot(name: string): Promise<ScreenParseResult<ScreenProjectSnapshot>> {
    const project = this.options.getProject();
    const document = this.options.getDocument();
    const port = this.options.getProjectSnapshotPort();
    if (project === undefined || document === undefined || port === undefined) {
      return Promise.resolve(snapshotPortUnavailable());
    }
    return port.create({
      projectId: project.projectId,
      revision: project.revision,
      name,
      document,
      signal: new AbortController().signal,
    });
  }

  restoreSnapshot(snapshotId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const project = this.options.getProject();
    const port = this.options.getProjectSnapshotPort();
    if (project === undefined || port === undefined) {
      return Promise.resolve(snapshotPortUnavailable());
    }
    return port
      .restore(project.projectId, snapshotId, new AbortController().signal)
      .then((result) => {
        if (!result.ok) return result;
        const replaced = this.options.replaceDocument(result.value.document);
        return replaced.ok
          ? this.options.loadProject(result.value.projectId)
          : { ok: false, diagnostics: replaced.diagnostics };
      });
  }
}

function lifecycleUnavailable(message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message };
}

function projectCatalogUnavailable<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [lifecycleUnavailable('Project catalog capability is unavailable.')],
  };
}

function projectPreviewUnavailable<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [lifecycleUnavailable('Project preview capability is unavailable.')],
  };
}

function snapshotPortUnavailable<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [lifecycleUnavailable('Project snapshot capability is unavailable.')],
  };
}
