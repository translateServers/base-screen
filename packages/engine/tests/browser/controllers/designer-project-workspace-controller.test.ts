import type {
  ScreenParseResult,
  ScreenProjectEnvelope,
  ScreenProjectSnapshot,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import { DesignerProjectWorkspaceController } from '../../../src/browser/controllers/designer-project-workspace-controller.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  ariaLabel = '';
  className = '';
  hidden = false;
  placeholder = '';
  textContent = '';
  type = '';
  value = '';

  constructor(readonly ownerDocument: FakeDocument) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  querySelector<T extends FakeElement>(selector: string): T | null {
    return (
      (descendants(this).find((element) => matches(element, selector)) as T | undefined) ?? null
    );
  }

  setAttribute(): void {}

  remove(): void {}

  closest<T extends FakeElement>(selector: string): T | null {
    return matches(this, selector) ? (this as unknown as T) : null;
  }
}

class FakeDocument {
  createElement(): FakeElement {
    return new FakeElement(this);
  }
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function matches(element: FakeElement, selector: string): boolean {
  if (selector === '[data-project-workspace-action]')
    return element.dataset.projectWorkspaceAction !== undefined;
  if (selector === '[data-project-name]') return element.dataset.projectName !== undefined;
  if (selector === '[data-project-id]') return element.dataset.projectId !== undefined;
  if (selector === '[data-project-revision]') return element.dataset.projectRevision !== undefined;
  if (selector === '[data-snapshot-id]') return element.dataset.snapshotId !== undefined;
  if (selector === '[data-project-results]') return element.dataset.projectResults !== undefined;
  if (selector === '[data-snapshot-results]') return element.dataset.snapshotResults !== undefined;
  return false;
}

const project: ScreenProjectEnvelope = {
  projectId: 'project-1',
  name: '项目一',
  description: null,
  revision: 'revision-1',
  document: {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  },
  metadata: {},
};

const success = <T>(value: T): ScreenParseResult<T> => ({ ok: true, value, diagnostics: [] });

describe('DesignerProjectWorkspaceController', () => {
  it('R2 仅在宿主能力可用时展示目录、预览和快照操作', () => {
    const ownerDocument = new FakeDocument();
    const workspace = new FakeElement(ownerDocument);
    const controller = new DesignerProjectWorkspaceController({
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      getCapabilities: () => ({ directory: false, preview: false, snapshots: false }),
      getProject: () => undefined,
      listProjects: vi.fn(),
      listSnapshots: vi.fn(),
      loadProject: vi.fn(),
      previewProject: vi.fn(),
      report: vi.fn(),
      restoreSnapshot: vi.fn(),
    });

    controller.connect(workspace as unknown as HTMLElement);
    controller.open();

    expect(workspace.hidden).toBe(false);
    expect(descendants(workspace).some((element) => element.textContent === '项目目录')).toBe(
      false,
    );
    expect(descendants(workspace).some((element) => element.textContent === '项目预览')).toBe(
      false,
    );
    expect(descendants(workspace).some((element) => element.textContent === '项目快照')).toBe(
      false,
    );
    expect(
      descendants(workspace).some(
        (element) => element.textContent === '宿主未提供项目目录、预览或快照能力。',
      ),
    ).toBe(true);
  });

  it('R2 使用既有公共方法加载目录、快照和预览，并提供中文状态', async () => {
    const ownerDocument = new FakeDocument();
    const workspace = new FakeElement(ownerDocument);
    const projects: readonly ScreenProjectSummary[] = [
      {
        projectId: 'project-1',
        name: '项目一',
        description: null,
        revision: 'revision-1',
        published: false,
      },
    ];
    const snapshots: readonly ScreenProjectSnapshot[] = [
      { id: 'snapshot-1', name: '初始快照', createdAt: '2026-08-05T00:00:00.000Z' },
    ];
    const listProjects = vi.fn(async () => success(projects));
    const listSnapshots = vi.fn(async () => success(snapshots));
    const previewProject = vi.fn(async () => success({}));
    const controller = new DesignerProjectWorkspaceController({
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      getCapabilities: () => ({ directory: true, preview: true, snapshots: true }),
      getProject: () => project,
      listProjects,
      listSnapshots,
      loadProject: vi.fn(async () => success(project)),
      previewProject,
      report: vi.fn(),
      restoreSnapshot: vi.fn(async () => success(project)),
    });

    controller.connect(workspace as unknown as HTMLElement);
    controller.open();
    await Promise.resolve();
    controller.onClick(action(ownerDocument, 'snapshots') as unknown as Element);
    controller.onClick(action(ownerDocument, 'preview-published') as unknown as Element);
    await Promise.resolve();

    expect(listProjects).toHaveBeenCalledOnce();
    expect(listSnapshots).toHaveBeenCalledOnce();
    expect(previewProject).toHaveBeenCalledWith(true);
    expect(descendants(workspace).some((element) => element.textContent === '项目一')).toBe(true);
    expect(descendants(workspace).some((element) => element.textContent === '初始快照')).toBe(true);
    expect(
      descendants(workspace).some((element) => element.textContent === '已获取已发布预览。'),
    ).toBe(true);
  });
});

function action(ownerDocument: FakeDocument, projectWorkspaceAction: string): FakeElement {
  const target = new FakeElement(ownerDocument);
  target.dataset.projectWorkspaceAction = projectWorkspaceAction;
  return target;
}
