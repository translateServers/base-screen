import type {
  ScreenDiagnostic,
  ScreenParseResult,
  ScreenProjectEnvelope,
  ScreenProjectSnapshot,
  ScreenProjectSummary,
} from '@base-screen/contracts';

export interface DesignerProjectWorkspaceCapabilities {
  readonly directory: boolean;
  readonly preview: boolean;
  readonly snapshots: boolean;
}

export interface DesignerProjectWorkspaceCallbacks {
  readonly createProject: (name: string) => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  readonly deleteProject: (projectId: string, revision: string) => Promise<ScreenParseResult<void>>;
  readonly getCapabilities: () => DesignerProjectWorkspaceCapabilities;
  readonly getProject: () => ScreenProjectEnvelope | undefined;
  readonly listProjects: () => Promise<ScreenParseResult<readonly ScreenProjectSummary[]>>;
  readonly listSnapshots: () => Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>>;
  readonly loadProject: (projectId: string) => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  readonly previewProject: (published: boolean) => Promise<ScreenParseResult<unknown>>;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly restoreSnapshot: (
    snapshotId: string,
  ) => Promise<ScreenParseResult<ScreenProjectEnvelope>>;
}

export class DesignerProjectWorkspaceController {
  #feedback: HTMLElement | undefined;
  #workspace: HTMLElement | undefined;

  constructor(private readonly callbacks: DesignerProjectWorkspaceCallbacks) {}

  connect(workspace: HTMLElement): void {
    this.#workspace = workspace;
    this.render();
  }

  clear(): void {
    if (this.#workspace !== undefined) this.#workspace.hidden = true;
  }

  onClick(target: Element): boolean {
    const control = target.closest<HTMLButtonElement>('[data-project-workspace-action]');
    const action = control?.dataset.projectWorkspaceAction;
    if (action === undefined) return false;
    if (action === 'close') {
      this.clear();
      return true;
    }
    if (action === 'open') {
      this.open();
      return true;
    }
    if (action === 'directory') {
      void this.listProjects();
      return true;
    }
    if (action === 'snapshots') {
      void this.listSnapshots();
      return true;
    }
    if (action === 'create') {
      const name = this.#workspace
        ?.querySelector<HTMLInputElement>('[data-project-name]')
        ?.value.trim();
      if (name === undefined || name.length === 0) {
        this.setFeedback('请输入项目名称。');
        return true;
      }
      void this.callbacks.createProject(name).then((result) => {
        if (result.ok) {
          this.setFeedback('项目已创建。');
          void this.callbacks
            .loadProject(result.value.projectId)
            .then((loaded) => this.report(loaded));
        } else {
          this.report(result);
        }
      });
      return true;
    }
    if (action === 'preview-draft' || action === 'preview-published') {
      void this.callbacks.previewProject(action === 'preview-published').then((result) => {
        if (result.ok)
          this.setFeedback(
            action === 'preview-published' ? '已获取已发布预览。' : '已获取草稿预览。',
          );
        else this.report(result);
      });
      return true;
    }
    const projectId = control?.closest<HTMLElement>('[data-project-id]')?.dataset.projectId;
    if (action === 'load' && projectId !== undefined) {
      void this.callbacks.loadProject(projectId).then((result) => {
        if (result.ok) {
          this.setFeedback('项目已加载。');
          this.render();
        } else {
          this.report(result);
        }
      });
      return true;
    }
    if (action === 'delete' && projectId !== undefined) {
      const revision =
        control?.closest<HTMLElement>('[data-project-revision]')?.dataset.projectRevision;
      if (revision === undefined) return true;
      void this.callbacks.deleteProject(projectId, revision).then((result) => {
        if (result.ok) {
          this.setFeedback('项目已删除。');
          void this.listProjects();
        } else {
          this.report(result);
        }
      });
      return true;
    }
    const snapshotId = control?.closest<HTMLElement>('[data-snapshot-id]')?.dataset.snapshotId;
    if (action === 'restore' && snapshotId !== undefined) {
      void this.callbacks.restoreSnapshot(snapshotId).then((result) => {
        if (result.ok) {
          this.setFeedback('快照已恢复。');
          this.render();
        } else {
          this.report(result);
        }
      });
      return true;
    }
    return true;
  }

  open(): void {
    if (this.#workspace === undefined) return;
    this.#workspace.hidden = false;
    this.render();
    if (this.callbacks.getCapabilities().directory) void this.listProjects();
  }

  render(): void {
    const workspace = this.#workspace;
    if (workspace === undefined) return;
    const capabilities = this.callbacks.getCapabilities();
    const project = this.callbacks.getProject();
    workspace.replaceChildren();
    const header = workspace.ownerDocument.createElement('header');
    const title = workspace.ownerDocument.createElement('h2');
    title.textContent = '项目';
    const close = this.button('关闭项目面板', 'close');
    header.append(title, close);
    workspace.appendChild(header);
    this.#feedback = workspace.ownerDocument.createElement('p');
    this.#feedback.className = 'designer-empty-state';
    this.#feedback.dataset.projectWorkspaceFeedback = 'true';
    this.#feedback.setAttribute('role', 'status');
    this.#feedback.setAttribute('aria-live', 'polite');
    this.#feedback.textContent =
      project === undefined ? '请选择或创建项目。' : `当前项目：${project.name}`;
    workspace.appendChild(this.#feedback);
    if (capabilities.directory) this.renderDirectory(workspace);
    if (project !== undefined && capabilities.preview) this.renderPreview(workspace);
    if (project !== undefined && capabilities.snapshots) this.renderSnapshots(workspace);
    if (!capabilities.directory && !capabilities.preview && !capabilities.snapshots) {
      this.setFeedback('宿主未提供项目目录、预览或快照能力。');
    }
  }

  private renderDirectory(workspace: HTMLElement): void {
    const section = this.section('项目目录');
    const name = workspace.ownerDocument.createElement('input');
    name.className = 'designer-control designer-input';
    name.dataset.projectName = 'true';
    name.placeholder = '项目名称';
    name.setAttribute('aria-label', '新项目名称');
    section.append(name, this.button('创建项目', 'create'), this.button('刷新目录', 'directory'));
    workspace.appendChild(section);
  }

  private renderPreview(workspace: HTMLElement): void {
    const section = this.section('项目预览');
    section.append(
      this.button('预览草稿', 'preview-draft'),
      this.button('预览已发布版本', 'preview-published'),
    );
    workspace.appendChild(section);
  }

  private renderSnapshots(workspace: HTMLElement): void {
    const section = this.section('项目快照');
    section.appendChild(this.button('查看快照', 'snapshots'));
    workspace.appendChild(section);
  }

  private async listProjects(): Promise<void> {
    const result = await this.callbacks.listProjects();
    if (!result.ok) {
      this.report(result);
      return;
    }
    const workspace = this.#workspace;
    if (workspace === undefined) return;
    workspace.querySelector<HTMLElement>('[data-project-results]')?.remove();
    const results = this.section('目录结果');
    results.dataset.projectResults = 'true';
    for (const project of result.value) {
      const item = workspace.ownerDocument.createElement('div');
      item.className = 'designer-project-item';
      item.dataset.projectId = project.projectId;
      item.dataset.projectRevision = project.revision;
      item.textContent = project.name;
      item.append(this.button('加载', 'load'), this.button('删除', 'delete'));
      results.appendChild(item);
    }
    if (result.value.length === 0) results.appendChild(this.empty('没有可用项目。'));
    workspace.appendChild(results);
    this.setFeedback(`已显示 ${result.value.length} 个项目。`);
  }

  private async listSnapshots(): Promise<void> {
    const result = await this.callbacks.listSnapshots();
    if (!result.ok) {
      this.report(result);
      return;
    }
    const workspace = this.#workspace;
    if (workspace === undefined) return;
    workspace.querySelector<HTMLElement>('[data-snapshot-results]')?.remove();
    const results = this.section('快照结果');
    results.dataset.snapshotResults = 'true';
    for (const snapshot of result.value) {
      const item = workspace.ownerDocument.createElement('div');
      item.className = 'designer-project-item';
      item.dataset.snapshotId = snapshot.id;
      item.textContent = snapshot.name;
      item.appendChild(this.button('恢复', 'restore'));
      results.appendChild(item);
    }
    if (result.value.length === 0) results.appendChild(this.empty('没有可用快照。'));
    workspace.appendChild(results);
    this.setFeedback(`已显示 ${result.value.length} 个快照。`);
  }

  private button(label: string, action: string): HTMLButtonElement {
    const button = this.#workspace!.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button';
    button.dataset.projectWorkspaceAction = action;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  private section(title: string): HTMLElement {
    const section = this.#workspace!.ownerDocument.createElement('section');
    section.className = 'designer-project-section';
    const heading = this.#workspace!.ownerDocument.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  }

  private empty(message: string): HTMLElement {
    const empty = this.#workspace!.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.textContent = message;
    return empty;
  }

  private report(result: ScreenParseResult<unknown>): void {
    this.callbacks.report(result.diagnostics);
    this.setFeedback('操作未完成，请重试。');
  }

  private setFeedback(message: string): void {
    if (this.#feedback !== undefined) this.#feedback.textContent = message;
  }
}
