import { parseBaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenMaterialEditorDescriptor } from '../src/index.js';

const propsSchema = {
  kind: 'object' as const,
  properties: {
    title: { kind: 'string' as const, minLength: 1 },
    value: { kind: 'number' as const },
  },
  required: ['title'],
};

describe('createBaseScreenMaterialEditorDescriptor', () => {
  it('AE-DC-C06 builds a valid descriptor from pure JSON data', () => {
    const result = createBaseScreenMaterialEditorDescriptor(
      {
        appearance: [
          {
            id: 'text',
            label: '文本',
            fields: [
              { id: 'title', target: 'props', path: ['title'], label: '标题', control: 'text' },
            ],
          },
        ],
      },
      { propsSchema },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appearance?.[0]?.fields[0]?.path).toEqual(['title']);
  });

  it('AE-DC-C06 fails closed with located diagnostics for invalid input', () => {
    const result = createBaseScreenMaterialEditorDescriptor(
      {
        appearance: [
          {
            id: 'text',
            label: '文本',
            fields: [
              { id: 'title', target: 'props', path: ['missing'], label: '标题', control: 'text' },
            ],
          },
        ],
      },
      { propsSchema },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.path[0]).toBe('editorDescriptor');
  });

  it('AE-DC-C06 is schema-validating without DOM or side effects', () => {
    const result = createBaseScreenMaterialEditorDescriptor(
      { appearance: [] },
      { propsSchema, styleSchema: propsSchema },
    );
    expect(result.ok).toBe(true);
    const manifest = parseBaseScreenMaterialManifest({
      type: 'base.echarts',
      tagName: 'base-screen-echarts',
      name: 'ECharts',
      category: '数据',
      keywords: [],
      defaultSize: { width: 480, height: 280 },
      defaultProps: { title: '图表' },
      defaultStyle: {},
      propsSchema,
      propertyPanel: [],
      styleSchema: { kind: 'object', properties: {}, required: [] },
      stylePanel: [],
      events: [],
      dataCapabilities: ['static'],
      designCapabilities: { resize: true, rotate: true, children: false },
      editorDescriptor: { appearance: [] },
    });
    expect(manifest.ok).toBe(true);
  });
});
