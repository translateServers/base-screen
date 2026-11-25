import type { ScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { getDesignerElementState } from '../../../src/designer-element/runtime/designer-element-state.js';
import { BaseScreenDesignerElement as DesignerElement } from '../../../src/index.js';

function materialEntry(): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type: 'base.text',
      tagName: 'base-text-material',
      name: 'text',
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
      designCapabilities: { resize: true, rotate: true, children: false },
    },
    constructor: class {} as never,
  };
}

function plainDocument(): ScreenDocument {
  return {
    canvas: { width: 800, height: 600, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

function invalidDocument(): ScreenDocument {
  return {
    canvas: { width: -1, height: 600, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  } as unknown as ScreenDocument;
}

function createDesigner() {
  const designer = new DesignerElement();
  Object.assign(designer, {
    dispatchEvent: () => true,
    shadowRoot: null,
    style: { setProperty: () => undefined },
    toggleAttribute: () => false,
  });
  const configured = designer.configure({
    catalog: createBaseScreenMaterialCatalog([materialEntry()]),
  });
  expect(configured.ok).toBe(true);
  return designer;
}

describe('designer replaceDocument lifecycle ready ordering', () => {
  it('re-arms ready before the replacement renders, not after it returns', () => {
    // session.replaceDocument 内部同步 render：ready 必须在这之前重新武装，
    // 否则新文档沿用旧文档的「已发」状态而漏发；放在其后返回又会清掉标志，
    // 让普通编辑的下一次渲染重复发。
    const designer = createDesigner();
    const state = getDesignerElementState(designer);
    const order: string[] = [];

    const originalReplace = state.session.replaceDocument.bind(state.session);
    state.session.replaceDocument = ((document: ScreenDocument) => {
      order.push('replace');
      return originalReplace(document);
    }) as typeof state.session.replaceDocument;

    const originalReset = state.canvasRuntimeController.resetLifecycleReady.bind(
      state.canvasRuntimeController,
    );
    state.canvasRuntimeController.resetLifecycleReady = () => {
      order.push('reset');
      originalReset();
    };

    expect(designer.replaceDocument(plainDocument()).ok).toBe(true);
    expect(order).toEqual(['reset', 'replace']);
  });

  it('keeps the ready state when a replacement is rejected', () => {
    const designer = createDesigner();
    const controller = getDesignerElementState(designer).canvasRuntimeController;
    // 模拟「当前文档已发过 ready」。
    controller.restoreLifecycleReady(true);

    expect(designer.replaceDocument(invalidDocument()).ok).toBe(false);
    // 失败的替换不能改变当前文档的 ready 状态（否则当前文档会补发一次 ready）。
    expect(controller.isLifecycleReadyFired()).toBe(true);
  });

  it('re-arms ready for a successful replacement', () => {
    const designer = createDesigner();
    const controller = getDesignerElementState(designer).canvasRuntimeController;
    controller.restoreLifecycleReady(true);

    expect(designer.replaceDocument(plainDocument()).ok).toBe(true);
    expect(controller.isLifecycleReadyFired()).toBe(false);
  });
});
