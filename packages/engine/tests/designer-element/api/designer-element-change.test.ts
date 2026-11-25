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
