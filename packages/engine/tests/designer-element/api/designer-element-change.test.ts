import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function component(): ScreenComponentNode {
  return {
    id: 'title',
    type: 'base.text',
    name: '标题',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 56 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function document(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#ffffff' },
    components: [component()],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function configuredDesigner(withDocument: boolean): BaseScreenDesignerElement {
  const designer = new BaseScreenDesignerElement();
  Object.assign(designer, {
    dispatchEvent: () => true,
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  const configured = designer.configure({
    catalog: createBaseScreenMaterialCatalog([
      {
        manifest: {
          type: 'base.text',
          tagName: 'base-text',
          name: '文本',
          category: 'Test',
          keywords: [],
          defaultSize: { width: 320, height: 56 },
          defaultProps: {},
          defaultStyle: {},
          propsSchema: { kind: 'object', properties: {}, required: [] },
          propertyPanel: [],
          styleSchema: { kind: 'object', properties: {}, required: [] },
          stylePanel: [],
          events: [],
          dataCapabilities: ['static'] as never,
          designCapabilities: { resize: true, rotate: true, children: false },
        },
        constructor: class {} as never,
      },
    ]),
  });
  expect(configured.ok).toBe(true);
  if (withDocument) expect(designer.replaceDocument(document()).ok).toBe(true);
  return designer;
}

function proposal(
  commands: Parameters<BaseScreenDesignerElement['submitChangeProposal']>[0]['commands'],
) {
  return {
    title: '测试提案',
    rationale: '锁定拒绝诊断',
    scope: '标题',
    commands,
  };
}

const rename = {
  type: 'update-components',
  componentIds: ['title'],
  patch: { name: '新标题' },
} as const;

describe('BaseScreenDesignerElement.submitChangeProposal diagnostics', () => {
  it('reports a missing document', () => {
    const result = configuredDesigner(false).submitChangeProposal(proposal([rename]));
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_DOCUMENT_UNAVAILABLE', severity: 'error', path: [] }],
    });
  });

  it('reports an empty command list', () => {
    const result = configuredDesigner(true).submitChangeProposal(proposal([]));
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_PROPOSAL_EMPTY', severity: 'error', path: [] }],
    });
  });

  it('reports a valid command list with no effect', () => {
    const result = configuredDesigner(true).submitChangeProposal(
      proposal([
        {
          type: 'update-components',
          componentIds: ['title'],
          patch: { name: '标题' },
        },
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_PROPOSAL_NO_EFFECT', severity: 'error', path: [] }],
    });
  });

  it('reports an unavailable preview', () => {
    const result = configuredDesigner(true).submitChangeProposal(proposal([rename]));
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_PREVIEW_UNAVAILABLE', severity: 'error', path: [] }],
    });
  });

  it('reports a pending draft without replacing it', () => {
    const designer = configuredDesigner(true);
    const state = getDesignerElementState(designer);
    state.changeController.setGhostHandlers({ render: () => true, clear: () => undefined });

    expect(designer.submitChangeProposal(proposal([rename])).ok).toBe(true);
    const result = designer.submitChangeProposal(
      proposal([
        {
          type: 'update-components',
          componentIds: ['title'],
          patch: { name: '另一个标题' },
        },
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_DRAFT_PENDING', severity: 'error', path: [] }],
    });
    expect(designer.readPendingChange()?.title).toBe('测试提案');
  });

  it('never returns ok:false without diagnostics', () => {
    const designers = [configuredDesigner(false), configuredDesigner(true)];
    for (const designer of designers) {
      const result = designer.submitChangeProposal(proposal([rename]));
      if (!result.ok) expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });
});

describe('BaseScreenDesignerElement streaming proposals (ADR-0112 §2.5)', () => {
  function streamingDesigner(): BaseScreenDesignerElement {
    const designer = configuredDesigner(true);
    getDesignerElementState(designer).changeController.setGhostHandlers({
      render: () => true,
      clear: () => undefined,
    });
    return designer;
  }

  const skeleton = proposal([rename]);
  const fill = {
    type: 'update-components',
    componentIds: ['title'],
    patch: { zIndex: 3 },
  } as const;

  it('mounts a skeleton that cannot be adopted until it is finished', () => {
    const designer = streamingDesigner();
    const begun = designer.beginChangeProposal(skeleton);
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(designer.readPendingChange()).toMatchObject({ id: begun.value.id, streaming: true });
    expect(designer.adoptAllChanges()).toBe(false);
    expect(designer.adoptChangeUnit('title')).toBe(false);

    const extended = designer.extendChangeProposal(begun.value.id, [fill]);
    expect(extended.ok).toBe(true);
    expect(designer.finishChangeProposal(begun.value.id).ok).toBe(true);
    expect(designer.readPendingChange()).not.toHaveProperty('streaming');
    expect(designer.adoptAllChanges()).toBe(true);
    const title = designer.document?.components.find((item) => item.id === 'title');
    expect(title).toMatchObject({ name: '新标题', zIndex: 3 });
  });

  it('rejects streamed commands that move existing components and keeps the previous draft', () => {
    const designer = streamingDesigner();
    const begun = designer.beginChangeProposal(skeleton);
    if (!begun.ok) throw new Error('expected skeleton to mount');
    const moved = designer.extendChangeProposal(begun.value.id, [
      { type: 'update-components', componentIds: ['title'], patch: { position: { x: 10, y: 0 } } },
    ]);
    expect(moved).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_STREAM_GEOMETRY_CHANGED' }],
    });
    expect(designer.readPendingChange()).toMatchObject({ id: begun.value.id, streaming: true });
  });

  it('reports a stream that is not active', () => {
    const designer = streamingDesigner();
    expect(designer.extendChangeProposal('change-404', [fill])).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_STREAM_NOT_ACTIVE' }],
    });
    const begun = designer.beginChangeProposal(skeleton);
    if (!begun.ok) throw new Error('expected skeleton to mount');
    expect(designer.finishChangeProposal(begun.value.id).ok).toBe(true);
    expect(designer.finishChangeProposal(begun.value.id)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_STREAM_NOT_ACTIVE' }],
    });
    expect(designer.extendChangeProposal(begun.value.id, [fill])).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'CHANGE_STREAM_NOT_ACTIVE' }],
    });
  });

  it('leaves no draft behind when generation is cancelled', () => {
    const designer = streamingDesigner();
    const begun = designer.beginChangeProposal(skeleton);
    if (!begun.ok) throw new Error('expected skeleton to mount');
    designer.discardPendingChange();
    expect(designer.readPendingChange()).toBeUndefined();
    expect(designer.extendChangeProposal(begun.value.id, [fill]).ok).toBe(false);
    expect(designer.document?.components[0]?.name).toBe('标题');
  });
});
