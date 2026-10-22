import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  insertComponent,
  parseInsertionIntent,
} from '../../../src/designer-element/api/designer-element-insert-component.js';
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

function entry(
  type: string,
  defaultSize: { width: number; height: number },
): BaseScreenMaterialCatalogEntry {
  return {
    manifest: {
      type,
      tagName: `${type.replaceAll('.', '-')}-material`,
      name: type,
      category: 'Base',
      keywords: [],
      defaultSize,
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
      entry('base.text', { width: 120, height: 40 }),
      entry('base.panel', { width: 400, height: 300 }),
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

describe('designer-element insert component api', () => {
  it('requires a loaded document before inserting', () => {
    const designer = createDesigner();
    expect(failureCodes(insertComponent(designer, { materialType: 'base.text' }))).toEqual([
      'AUTHORING_SOURCE_INVALID',
    ]);
  });

  it('rejects a material that is not in the configured catalog', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);

    expect(
      failureCodes(insertComponent(designer, { materialType: 'base.unknown' })),
    ).not.toHaveLength(0);
    expect(designer.getDocument()?.components).toHaveLength(0);
  });

  it('inserts at the canvas center with manifest defaults and selects it', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);

    const document = okValue(
      insertComponent(designer, { materialType: 'base.text', name: '标题' }),
    );

    expect(document.components).toHaveLength(1);
    const component = document.components[0];
    expect(component).toBeDefined();
    if (component === undefined) return;
    expect(component.name).toBe('标题');
    expect(component.size).toEqual({ width: 120, height: 40 });
    // 800x600 画布中心。注意：这里 position 是左上角对齐中心点，而非减去自身一半居中；
    // insertHostResource 走 centeredHostResourcePosition 才是真正的居中（见另一个测试文件）。
    // 两个宿主入口的「中心」语义目前不一致，此处只锁住可观察的当前行为。
    expect(component.position).toEqual({ x: 400, y: 300 });
    expect(getDesignerElementState(designer).session.interaction.focusedComponentId).toBe(
      component.id,
    );
  });

  it('clamps an oversized request so the component stays inside the canvas', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);

    const document = okValue(
      insertComponent(designer, {
        materialType: 'base.panel',
        position: { x: -120, y: 900 },
      }),
    );
    expect(document.components[0]?.position).toEqual({ x: 0, y: 300 });
  });

  it('is undoable as a single transaction', () => {
    const designer = createDesigner();
    expect(designer.replaceDocument(emptyDocument()).ok).toBe(true);
    okValue(insertComponent(designer, { materialType: 'base.text' }));

    expect(designer.undo().ok).toBe(true);
    expect(designer.getDocument()?.components).toHaveLength(0);
  });

  it('parses insertion intents strictly', () => {
    expect(failureCodes(parseInsertionIntent(null))).not.toHaveLength(0);
    expect(failureCodes(parseInsertionIntent({}))).not.toHaveLength(0);
    expect(failureCodes(parseInsertionIntent({ materialType: 42 }))).not.toHaveLength(0);
    expect(okValue(parseInsertionIntent({ materialType: 'base.text' }))).toEqual(
      expect.objectContaining({ materialType: 'base.text' }),
    );
  });
});
