import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
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
    blueprint: { rules: [] },
  };
}

function createSession(renderDocument: (document: ScreenDocument) => ScreenParseResult<void>) {
  const selections: ScreenInteractionState[] = [];
  const session = new DesignerSession({
    renderDocument,
    renderInteraction: () => undefined,
    emitChange: () => undefined,
    emitSelectionChange: (interaction) => selections.push(interaction),
    onProjectChange: () => undefined,
    onDirtyChange: () => undefined,
    onConflict: () => undefined,
    onReady: () => undefined,
  });
  return { session, selections };
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

  it('keeps document, history, and selection unchanged when rendering a transaction fails', () => {
    let reject = false;
    const { session } = createSession((next) =>
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
});
