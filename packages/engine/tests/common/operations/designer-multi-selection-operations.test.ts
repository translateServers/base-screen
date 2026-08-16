import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  commonStyleFields,
  createMultiSelectionGeometryTransaction,
  createMultiSelectionStyleTransaction,
} from '../../../src/common/operations/designer-multi-selection-operations.js';

function component(id: string, type: string, locked = false): ScreenComponentNode {
  return {
    id,
    type,
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked, hidden: false },
    props: {},
    style: { fill: '#000000', borderWidth: 1, color: '#ffffff', fontSize: 12 },
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

const SHAPE_MANIFEST: BaseScreenMaterialManifest = {
  type: 'test.shape',
  tagName: 'test-shape',
  name: '形状',
  category: '测试',
  keywords: [],
  defaultSize: { width: 100, height: 50 },
  defaultProps: {},
  defaultStyle: {},
  styleSchema: {
    kind: 'object',
    properties: {
      fill: { kind: 'string' },
      borderWidth: { kind: 'number', minimum: 0, maximum: 100 },
    },
    required: [],
  },
  stylePanel: [
    { style: 'fill', label: '填充', control: 'color' },
    { style: 'borderWidth', label: '边框宽度', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};

const TEXT_MANIFEST: BaseScreenMaterialManifest = {
  ...SHAPE_MANIFEST,
  type: 'test.text',
  tagName: 'test-text',
  name: '文本',
  styleSchema: {
    kind: 'object',
    properties: {
      color: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 1 },
    },
    required: [],
  },
  stylePanel: [
    { style: 'color', label: '颜色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
  ],
};

function catalog(): BaseScreenMaterialCatalog {
  return createBaseScreenMaterialCatalog([
    { manifest: SHAPE_MANIFEST, constructor: class {} as never },
    { manifest: TEXT_MANIFEST, constructor: class {} as never },
  ]);
}

describe('designer multi selection operations', () => {
  it('computes the intersection of style fields across selected components', () => {
    const source = document([component('a', 'test.text'), component('b', 'test.text')]);

    expect(commonStyleFields(source, ['a', 'b'], catalog())).toEqual(['color', 'fontSize']);
  });

  it('returns an empty intersection for mixed material types', () => {
    const source = document([component('text', 'test.text'), component('shape', 'test.shape')]);

    expect(commonStyleFields(source, ['text', 'shape'], catalog())).toEqual([]);
  });

  it('returns empty for missing catalog or unknown types', () => {
    const source = document([component('a', 'test.text')]);
    expect(commonStyleFields(source, ['a'], undefined)).toEqual([]);
    expect(commonStyleFields(source, ['a'], catalog())).toEqual(['color', 'fontSize']);
    expect(commonStyleFields(source, ['missing'], catalog())).toEqual([]);
  });

  it('builds one update-components command per non-locked selected component', () => {
    const source = document([
      component('a', 'test.text'),
      component('b', 'test.text', true),
      component('c', 'test.text'),
    ]);

    const transaction = createMultiSelectionStyleTransaction(
      source,
      ['a', 'b', 'c'],
      'color',
      '#ff0000',
      catalog(),
    );
    expect(transaction).toBeDefined();
    if (transaction === undefined || !transaction.ok) return;
    expect(transaction.value.commands).toHaveLength(2);
    expect(
      transaction.value.commands
        .filter((c) => c.type === 'update-components')
        .map((c) => c.componentIds),
    ).toEqual([['a'], ['c']]);

    const result = applyScreenDocumentTransaction(source, transaction.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.find((c) => c.id === 'a')?.style.color).toBe('#ff0000');
    expect(result.document.components.find((c) => c.id === 'b')?.style.color).toBe('#ffffff');
    expect(result.document.components.find((c) => c.id === 'c')?.style.color).toBe('#ff0000');
  });

  it('rejects a style field outside the intersection', () => {
    const source = document([component('text', 'test.text'), component('shape', 'test.shape')]);
    expect(
      createMultiSelectionStyleTransaction(
        source,
        ['text', 'shape'],
        'color',
        '#ff0000',
        catalog(),
      ),
    ).toBeUndefined();
  });

  it('returns undefined when every selected component is locked', () => {
    const source = document([component('a', 'test.text', true)]);
    expect(
      createMultiSelectionStyleTransaction(source, ['a'], 'color', '#ff0000', catalog()),
    ).toBeUndefined();
  });

  it('builds a geometry transaction clamping and rounding size values', () => {
    const source = document([component('a', 'test.shape'), component('b', 'test.shape')]);

    const transaction = createMultiSelectionGeometryTransaction(
      source,
      ['a', 'b'],
      'width',
      123.456,
    );
    expect(transaction).toBeDefined();
    if (transaction === undefined || !transaction.ok) return;
    const result = applyScreenDocumentTransaction(source, transaction.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components.map((c) => c.size.width)).toEqual([123.46, 123.46]);
  });

  it('rejects invalid geometry values for the whole batch', () => {
    const source = document([component('a', 'test.shape')]);
    expect(createMultiSelectionGeometryTransaction(source, ['a'], 'width', 0)).toBeUndefined();
    expect(createMultiSelectionGeometryTransaction(source, ['a'], 'width', -5)).toBeUndefined();
    expect(createMultiSelectionGeometryTransaction(source, ['a'], 'rotation', 180)).toBeUndefined();
    expect(
      createMultiSelectionGeometryTransaction(source, ['a'], 'width', Number.NaN),
    ).toBeUndefined();
  });

  it('accepts the rotation range boundaries', () => {
    const source = document([component('a', 'test.shape')]);
    const transaction = createMultiSelectionGeometryTransaction(source, ['a'], 'rotation', -180);
    expect(transaction).toBeDefined();
    if (transaction === undefined || !transaction.ok) return;
    const result = applyScreenDocumentTransaction(source, transaction.value);
    expect(result.ok).toBe(true);
  });

  it('applies rotation patches without size changes', () => {
    const source = document([component('a', 'test.shape')]);
    const transaction = createMultiSelectionGeometryTransaction(source, ['a'], 'rotation', 45);
    expect(transaction).toBeDefined();
    if (transaction === undefined || !transaction.ok) return;
    const result = applyScreenDocumentTransaction(source, transaction.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.components[0]?.rotation).toBe(45);
    expect(result.document.components[0]?.size).toEqual({ width: 100, height: 50 });
  });
});
