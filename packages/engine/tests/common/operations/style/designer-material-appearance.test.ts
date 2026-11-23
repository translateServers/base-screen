import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  designerMaterialAppearance,
  designerMaterialEditorKeys,
  isDesignerMaterialEditorKey,
} from '../../../../src/common/operations/style/designer-material-appearance.js';

function manifest(overrides: Partial<BaseScreenMaterialManifest> = {}): BaseScreenMaterialManifest {
  return {
    type: 'test.flat',
    tagName: 'test-flat',
    name: '扁平',
    category: '测试',
    keywords: [],
    defaultSize: { width: 100, height: 100 },
    defaultProps: { decimals: 1, shape: 'circle', note: '' },
    defaultStyle: { color: '#fff', fontSize: 16, opacity: 1 },
    propsSchema: {
      kind: 'object',
      properties: {
        decimals: { kind: 'number', minimum: 0, maximum: 3 },
        shape: { kind: 'enum', values: ['circle', 'rect'] },
        note: { kind: 'string' },
      },
      required: [],
    },
    styleSchema: {
      kind: 'object',
      properties: {
        color: { kind: 'string' },
        fontSize: { kind: 'number', minimum: 10, maximum: 96 },
        opacity: { kind: 'number', minimum: 0, maximum: 1 },
      },
      required: [],
    },
    propertyPanel: [
      { prop: 'decimals', label: '小数位', control: 'number' },
      { prop: 'shape', label: '形状', control: 'select' },
      { prop: 'note', label: '备注', control: 'json' },
    ],
    stylePanel: [
      { style: 'color', label: '文字色', control: 'color' },
      { style: 'fontSize', label: '字号', control: 'number' },
      { style: 'opacity', label: '不透明度', control: 'number' },
    ],
    events: [],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: false },
    ...overrides,
  } as BaseScreenMaterialManifest;
}

describe('designerMaterialAppearance (ADR-0102 D1)', () => {
  it('converts flat panels into descriptor sections with inferred controls', () => {
    const sections = designerMaterialAppearance(manifest());
    expect(sections.map((section) => section.id)).toEqual(['content', 'style']);
    const controls = sections.flatMap((section) =>
      section.fields.map((field) => `${field.path[0]}:${field.control}`),
    );
    // 小数位推导为步进器，字号为滑杆；JSON 与颜色保留作者的声明；不透明度归公共区。
    expect(controls).toEqual([
      'decimals:stepper',
      'shape:select',
      'note:json',
      'color:color',
      'fontSize:number',
    ]);
  });

  it('titles synthesized sections only with labels supplied by the renderer', () => {
    const flat = manifest();
    const labels = { content: 'Content', style: 'Style' };
    expect(designerMaterialAppearance(flat, labels).map((section) => section.label)).toEqual([
      'Content',
      'Style',
    ]);
    expect(designerMaterialAppearance(flat, labels)).toBe(designerMaterialAppearance(flat, labels));
    expect(designerMaterialAppearance(flat).map((section) => section.label)).toEqual([
      'content',
      'style',
    ]);
  });

  it('prefers a declared descriptor appearance and caches per manifest', () => {
    const declared = manifest({
      editorDescriptor: {
        appearance: [
          {
            id: 'text',
            label: '文字',
            fields: [
              { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            ],
          },
        ],
      },
    });
    const sections = designerMaterialAppearance(declared, { content: 'C', style: 'S' });
    expect(sections).toBe(declared.editorDescriptor?.appearance);
    expect(designerMaterialAppearance(declared)).toBe(sections);
    // 描述符没有开放的键不再因为扁平面板里有它就可写。
    expect(isDesignerMaterialEditorKey(declared, 'style', 'color')).toBe(true);
    expect(isDesignerMaterialEditorKey(declared, 'style', 'fontSize')).toBe(false);
    expect(isDesignerMaterialEditorKey(declared, 'props', 'decimals')).toBe(false);
  });

  it('lists top-level editor keys with their schema', () => {
    const keys = designerMaterialEditorKeys(manifest(), 'style');
    expect(keys.map((entry) => [entry.key, entry.schema.kind])).toEqual([
      ['color', 'string'],
      ['fontSize', 'number'],
    ]);
  });
});
