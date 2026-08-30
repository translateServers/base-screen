import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createDesignerQuickStyleTransaction,
  designerQuickStyleActionApplied,
  designerQuickStyleActionSupported,
} from '../../../../src/common/operations/style/designer-quick-style.js';

const CHART_MANIFEST: BaseScreenMaterialManifest = {
  type: 'test.chart',
  tagName: 'test-chart',
  name: '图表',
  category: '数据',
  keywords: [],
  defaultSize: { width: 320, height: 200 },
  defaultProps: {},
  defaultStyle: {},
  propsSchema: {
    kind: 'object',
    properties: {
      title: {
        kind: 'object',
        properties: { show: { kind: 'boolean' }, fontSize: { kind: 'number' } },
        required: [],
      },
      legend: {
        kind: 'object',
        properties: { show: { kind: 'boolean' }, fontSize: { kind: 'number' } },
        required: [],
      },
      grid: {
        kind: 'object',
        properties: { show: { kind: 'boolean' } },
        required: [],
      },
      tooltip: {
        kind: 'object',
        properties: { show: { kind: 'boolean' } },
        required: [],
      },
      advanced: {
        kind: 'object',
        properties: { showDataLabels: { kind: 'boolean' } },
        required: [],
      },
      series: {
        kind: 'array',
        items: {
          kind: 'object',
          properties: { color: { kind: 'string' }, name: { kind: 'string' } },
          required: [],
        },
      },
    },
    required: [],
  },
  propertyPanel: [],
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      gridColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 1, maximum: 100 },
    },
    required: [],
  },
  stylePanel: [],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};

function component(id = 'chart-1', locked = false): ScreenComponentNode {
  return {
    id,
    type: 'test.chart',
    name: 'Chart',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    rotation: 0,
    zIndex: 0,
    status: { locked, hidden: false },
    props: {
      title: { show: true, fontSize: 12 },
      legend: { show: true, fontSize: 12 },
      grid: { show: true },
      tooltip: { show: true },
      advanced: { showDataLabels: false },
      series: [{ color: '#38bdf8', name: 'sales' }],
    },
    style: {
      backgroundColor: '#111827',
      color: '#f9fafb',
      gridColor: '#374151',
      fontSize: 12,
    },
    dataSource: null,
  };
}

function document(components: readonly ScreenComponentNode[] = [component()]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

function catalog(): BaseScreenMaterialCatalog {
  return createBaseScreenMaterialCatalog([
    { manifest: CHART_MANIFEST, constructor: class {} as never },
  ]);
}

function transaction(action: Parameters<typeof createDesignerQuickStyleTransaction>[3]) {
  return createDesignerQuickStyleTransaction(
    document(),
    { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' },
    catalog(),
    action,
  );
}

describe('designer quick style operations', () => {
  it('applies a supported preset only to declared style fields', () => {
    const result = transaction({ kind: 'preset', value: 3 });
    expect(result?.ok).toBe(true);
    if (result === undefined || !result.ok) return;
    const applied = applyScreenDocumentTransaction(document(), result.value);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.document.components[0]?.style).toMatchObject({
      backgroundColor: '#071a2b',
      color: '#7dd3fc',
      gridColor: '#164e63',
      fontSize: 12,
    });
  });

  it('updates chart series and shared colors in one transaction', () => {
    const result = transaction({ kind: 'colors', value: '#fb7185' });
    expect(result?.ok).toBe(true);
    if (result === undefined || !result.ok) return;
    const applied = applyScreenDocumentTransaction(document(), result.value);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.document.components[0]?.style.color).toBe('#fb7185');
    expect(applied.document.components[0]?.props.series).toEqual([
      { color: '#fb7185', name: 'sales' },
    ]);
  });

  it('derives active quick controls from canonical component values', () => {
    const initial = component();
    expect(
      designerQuickStyleActionApplied(initial, CHART_MANIFEST, { kind: 'preset', value: 0 }),
    ).toBe(true);
    expect(
      designerQuickStyleActionApplied(initial, CHART_MANIFEST, { kind: 'preset', value: 1 }),
    ).toBe(false);
    expect(
      designerQuickStyleActionApplied(initial, CHART_MANIFEST, {
        kind: 'info',
        value: 'common',
      }),
    ).toBe(true);

    const result = transaction({ kind: 'colors', value: '#4ade80' });
    expect(result?.ok).toBe(true);
    if (result === undefined || !result.ok) return;
    const applied = applyScreenDocumentTransaction(document(), result.value);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const updated = applied.document.components[0]!;
    expect(
      designerQuickStyleActionApplied(updated, CHART_MANIFEST, {
        kind: 'colors',
        value: '#4ade80',
      }),
    ).toBe(true);
    expect(
      designerQuickStyleActionApplied(updated, CHART_MANIFEST, {
        kind: 'colors',
        value: '#38bdf8',
      }),
    ).toBe(false);
  });

  it('applies text size and detailed information visibility', () => {
    const text = transaction({ kind: 'text', value: 16 });
    const info = transaction({ kind: 'info', value: 'detailed' });
    expect(text?.ok).toBe(true);
    expect(info?.ok).toBe(true);
    if (text === undefined || !text.ok || info === undefined || !info.ok) return;
    const textApplied = applyScreenDocumentTransaction(document(), text.value);
    const infoApplied = applyScreenDocumentTransaction(document(), info.value);
    expect(textApplied.ok).toBe(true);
    expect(infoApplied.ok).toBe(true);
    if (!textApplied.ok || !infoApplied.ok) return;
    expect(textApplied.document.components[0]?.props.title).toEqual({ show: true, fontSize: 16 });
    expect(textApplied.document.components[0]?.style.fontSize).toBe(16);
    expect(infoApplied.document.components[0]?.props.advanced).toEqual({ showDataLabels: true });
  });

  it('skips locked components and rejects unsupported actions', () => {
    const locked = createDesignerQuickStyleTransaction(
      document([component('chart-1', true)]),
      { selectedComponentIds: ['chart-1'], focusedComponentId: 'chart-1' },
      catalog(),
      { kind: 'colors', value: '#fb7185' },
    );
    expect(locked).toBeUndefined();
    expect(
      designerQuickStyleActionSupported(
        { ...CHART_MANIFEST, styleSchema: { kind: 'object', properties: {}, required: [] } },
        { kind: 'preset', value: 0 },
      ),
    ).toBe(false);
  });
});
