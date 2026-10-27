import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
} from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import { describe, expect, it } from 'vitest';
import { DesignerSession } from '../../../src/common/session/designer-session.js';

function document(name = '文本'): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [
      {
        id: 'text-1',
        type: 'base.text',
        name,
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: { text: name },
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { relations: [] },
  };
}

function createSession(renderDocument: (document: ScreenDocument) => ScreenParseResult<void>) {
  const selections: ScreenInteractionState[] = [];
  const changes: (ScreenDocument | undefined)[] = [];
  const session = new DesignerSession({
    renderDocument,
    renderInteraction: () => undefined,
    emitChange: (document) => changes.push(document),
    emitSelectionChange: (interaction) => selections.push(interaction),
    onProjectChange: () => undefined,
    onDirtyChange: () => undefined,
    onConflict: () => undefined,
    onReady: () => undefined,
  });
  return { session, selections, changes };
}

describe('DesignerSession', () => {
  it('clears selection when replacing the document', () => {
    const { session, selections } = createSession(() => ({
      ok: true,
      value: undefined,
      diagnostics: [],
    }));
    expect(session.replaceDocument(document())).toMatchObject({ ok: true });
    session.reduceSelection({
      type: 'replace-selection',
      componentIds: ['text-1'],
      focusedComponentId: 'text-1',
    });

    expect(session.replaceDocument(document('新文本'))).toMatchObject({ ok: true });
    expect(session.interaction).toEqual({ selectedComponentIds: [], focusedComponentId: null });
    expect(selections.at(-1)).toEqual({ selectedComponentIds: [], focusedComponentId: null });
  });

  it('keeps selection and undo history across a successful save', async () => {
    const { session } = createSession(() => ({
      ok: true,
      value: undefined,
      diagnostics: [],
    }));
    const projectAdapter: ScreenProjectAdapter = {
      capabilities: { publish: false },
      load: async ({ projectId }) => ({
        ok: true,
        value: {
          projectId,
          revision: 'rev-1',
          name: 'Project',
          description: null,
          document: document(),
          metadata: {},
        },
        diagnostics: [],
      }),
      save: async ({ projectId, revision, document: submitted }) => ({
        ok: true,
        value: {
          projectId,
          revision: `${revision}-next`,
          name: 'Project',
          description: null,
          document: submitted,
          metadata: {},
        },
        diagnostics: [],
      }),
    };
    expect(session.bindProjectAdapter(projectAdapter).ok).toBe(true);
    await expect(session.load('project-1')).resolves.toMatchObject({ ok: true });
    session.reduceSelection({
      type: 'replace-selection',
      componentIds: ['text-1'],
      focusedComponentId: 'text-1',
    });
    expect(
      session.executeCommand({
        type: 'update-components',
        componentIds: ['text-1'],
        patch: { name: '改过名' },
      }).ok,
    ).toBe(true);
    const saved = session.document;
    expect(session.canUndo).toBe(true);
    expect(session.dirty).toBe(true);

    await expect(session.save()).resolves.toMatchObject({ ok: true });

    // 自动保存落在「内容与提交快照一致」这一支时不得替换文档：替换会清选区、重建物料并重置历史。
    expect(session.interaction).toEqual({
      selectedComponentIds: ['text-1'],
      focusedComponentId: 'text-1',
    });
    expect(session.canUndo).toBe(true);
    expect(session.document).toBe(saved);
    expect(session.dirty).toBe(false);
  });

  it('keeps document, history, and selection unchanged when rendering a transaction fails', () => {
    let reject = false;
    const { session } = createSession(() =>
      reject
        ? {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
                path: [],
                message: 'render rejected',
              },
            ],
          }
        : { ok: true, value: undefined, diagnostics: [] },
    );
    session.replaceDocument(document());
    session.reduceSelection({
      type: 'replace-selection',
      componentIds: ['text-1'],
      focusedComponentId: 'text-1',
    });
    reject = true;

    const result = session.executeCommand({
      type: 'update-components',
      componentIds: ['text-1'],
      patch: { name: '不会提交' },
    });

    expect(result.ok).toBe(false);
    expect(session.document?.components[0]?.name).toBe('文本');
    expect(session.canUndo).toBe(false);
    expect(session.interaction.focusedComponentId).toBe('text-1');
  });

  it('commits a canvas background image transaction with history and change events', () => {
    const { session, changes } = createSession(() => ({
      ok: true,
      value: undefined,
      diagnostics: [],
    }));
    session.replaceDocument(document());

    const result = session.executeCommand({
      type: 'update-canvas',
      patch: { backgroundImage: 'https://cdn.x/screens/bg.png', backgroundImageFit: 'contain' },
    });

    expect(result.ok).toBe(true);
    expect(session.document?.canvas.backgroundImage).toBe('https://cdn.x/screens/bg.png');
    expect(session.document?.canvas.backgroundImageFit).toBe('contain');
    expect(session.canUndo).toBe(true);
    expect(changes.at(-1)?.canvas.backgroundImage).toBe('https://cdn.x/screens/bg.png');
  });

  it('rejects an invalid canvas background image with zero side effects', () => {
    const { session, changes } = createSession(() => ({
      ok: true,
      value: undefined,
      diagnostics: [],
    }));
    session.replaceDocument(document());

    const result = session.executeCommand({
      type: 'update-canvas',
      patch: { backgroundImage: 'javascript:alert(1)' },
    });

    expect(result.ok).toBe(false);
    expect(session.document?.canvas.backgroundImage).toBeUndefined();
    expect(session.canUndo).toBe(false);
    expect(changes).toHaveLength(1); // 只有 replaceDocument 的一次变更
  });

  it('clears the canvas background image via null patch values', () => {
    const { session } = createSession(() => ({
      ok: true,
      value: undefined,
      diagnostics: [],
    }));
    session.replaceDocument({
      ...document(),
      canvas: {
        width: 960,
        height: 540,
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.x/bg.png',
        backgroundImageFit: 'cover',
      },
    });

    const result = session.executeCommand({
      type: 'update-canvas',
      patch: { backgroundImage: null, backgroundImageFit: null },
    });

    expect(result.ok).toBe(true);
    expect(session.document?.canvas.backgroundImage).toBeUndefined();
    expect(session.document?.canvas.backgroundImageFit).toBeUndefined();
    expect(session.canUndo).toBe(true);
  });
});
