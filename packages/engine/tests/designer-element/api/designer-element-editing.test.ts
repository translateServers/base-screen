import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { parseScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  exportDocument,
  importDocument,
  reparent,
  togglePreview,
} from '../../../src/designer-element/api/designer-element-editing.js';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement } from '../../../src/index.js';

function emptyDocument(): ScreenDocument {
  return {
    canvas: { width: 800, height: 600, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
}

function materialEntry(
  type: string,
  tagName: string,
  acceptsChildren: boolean,
): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type,
      tagName,
      name: type,
      category: 'Base',
      keywords: [],
      defaultSize: { width: 200, height: 100 },
      defaultProps: {},
      defaultStyle: {},
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      events: [],
      dataCapabilities: ['static'],
      designCapabilities: { resize: true, rotate: true, children: acceptsChildren },
    },
    constructor: class {} as never,
  };
}

function createDesigner(): BaseScreenDesignerElement {
  const designer = new BaseScreenDesignerElement();
  Object.assign(designer, {
    dispatchEvent: () => true,
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  const configured = designer.configure({
    catalog: createBaseScreenMaterialCatalog([
      materialEntry('base.text', 'base-text-material', false),
      materialEntry('base.container', 'base-container-material', true),
    ]),
  });
  expect(configured.ok).toBe(true);
  return designer;
}

function okValue<T>(result: ScreenParseResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.diagnostics.map((item) => item.code).join(',')}`);
  }
  return result.value;
}

function failureCodes<T>(result: ScreenParseResult<T>): readonly string[] {
  if (result.ok) throw new Error('expected a failed result');
  return result.diagnostics.map((item) => item.code);
}

describe('designer-element editing api', () => {
  it('rejects export when no document is loaded', () => {
    const designer = createDesigner();
    expect(failureCodes(exportDocument(designer))).toEqual(['PLUGIN_CORE_LIFECYCLE_INVALID']);
  });

  it('exports a document that parses back to the same shape', () => {
    const designer = createDesigner();
    const document = emptyDocument();
    expect(designer.replaceDocument(document).ok).toBe(true);

    const serialized = okValue(exportDocument(designer));
    const reparsed = parseScreenDocument(JSON.parse(serialized));
    expect(reparsed.ok).toBe(true);

    // 导出会补全规范化默认字段（缺省 dataSources 落成 []），因此 round-trip 不是严格恒等；
    // 这里同时锁住「哪些字段原样保留」与「哪些字段被补全」两件事。
    const parsed = okValue(reparsed);
    expect(parsed.canvas).toEqual(document.canvas);
    expect(parsed.components).toEqual(document.components);
    expect(parsed.variables).toEqual(document.variables);
    expect(parsed.blueprint).toEqual(document.blueprint);
    expect(parsed.dataSources).toEqual([]);
  });

  it('rejects an invalid import without touching the loaded document', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);

    expect(failureCodes(importDocument(designer, { canvas: 'not-an-object' }))).not.toHaveLength(0);
    expect(designer.getDocument()?.canvas).toEqual({
      width: 800,
      height: 600,
      backgroundColor: '#000000',
    });
  });

  it('replaces the document on a valid import', () => {
    const designer = createDesigner();
    const next = {
      ...emptyDocument(),
      canvas: { width: 1024, height: 768, backgroundColor: '#fff' },
    };

    expect(okValue(importDocument(designer, next)).canvas).toEqual(next.canvas);
    expect(designer.getDocument()?.canvas).toEqual(next.canvas);
  });

  it('refuses a parent whose manifest does not accept children', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);
    okValue(designer.insertComponent({ materialType: 'base.text', name: 'label' }));
    okValue(designer.insertComponent({ materialType: 'base.container', name: 'box' }));
    const state = getDesignerElementState(designer);
    const text = state.session.document?.components.find((item) => item.name === 'label');
    const container = state.session.document?.components.find((item) => item.name === 'box');
    expect(text).toBeDefined();
    expect(container).toBeDefined();
    if (text === undefined || container === undefined) return;

    // 容器接受子节点
    expect(reparent(designer, [text.id], container.id).ok).toBe(true);
    // 文本不接受子节点
    expect(failureCodes(reparent(designer, [container.id], text.id))).toEqual([
      'PLUGIN_CORE_LIFECYCLE_INVALID',
    ]);
  });

  it('reports missing document instead of a stale result when reparenting', () => {
    const designer = createDesigner();
    expect(failureCodes(reparent(designer, ['missing'], null))).toEqual([
      'PLUGIN_CORE_LIFECYCLE_INVALID',
    ]);
  });

  it('prefers the host preview handler and stops when it reports handled', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);
    const state = getDesignerElementState(designer);
    let seen: ScreenDocument | undefined;
    state.previewHandler = (document) => {
      seen = document;
      return true;
    };

    expect(togglePreview(designer).ok).toBe(true);
    expect(seen).toEqual(designer.getDocument());
  });

  it('treats a throwing preview handler as unhandled and falls through', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);
    const state = getDesignerElementState(designer);
    state.previewHandler = () => {
      throw new Error('host exploded');
    };

    const result = togglePreview(designer);
    // 没有 viewer 注册时继续落到「需要注册 viewer」的失败分支，而不是把宿主异常抛出去
    expect(failureCodes(result)).toEqual(['PLUGIN_CORE_LIFECYCLE_INVALID']);
  });
});
