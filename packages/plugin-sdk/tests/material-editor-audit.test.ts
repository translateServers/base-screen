import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { parseBaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { auditBaseScreenMaterialEditorForm } from '../src/index.js';

function manifest(
  appearance: readonly unknown[],
  extra: Partial<Record<keyof BaseScreenMaterialManifest, unknown>> = {},
): BaseScreenMaterialManifest {
  const parsed = parseBaseScreenMaterialManifest({
    type: 'test.audit',
    tagName: 'test-audit',
    name: '审计',
    category: '测试',
    keywords: [],
    defaultSize: { width: 100, height: 100 },
    defaultProps: { decimals: 0, visible: true },
    defaultStyle: { color: '#fff', strokeWidth: 1 },
    propsSchema: {
      kind: 'object',
      properties: {
        decimals: { kind: 'number', minimum: 0, maximum: 4 },
        visible: { kind: 'boolean' },
      },
      required: [],
    },
    styleSchema: {
      kind: 'object',
      properties: {
        color: { kind: 'string' },
        strokeWidth: { kind: 'number', minimum: 1, maximum: 8 },
      },
      required: [],
    },
    propertyPanel: [],
    stylePanel: [],
    events: [],
    dataCapabilities: [],
    designCapabilities: { resize: true, rotate: true, children: false },
    editorDescriptor: { appearance },
    ...extra,
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.value;
}

describe('auditBaseScreenMaterialEditorForm (ADR-0102 §13)', () => {
  it('accepts a descriptor that leaves controls to inference', () => {
    const conforming = manifest([
      {
        id: 'format',
        label: '读数格式',
        fields: [{ id: 'decimals', target: 'props', path: ['decimals'], label: '小数位' }],
      },
      {
        id: 'surface',
        label: '填充与描边',
        fields: [
          { id: 'color', target: 'style', path: ['color'], label: '描边色' },
          { id: 'strokeWidth', target: 'style', path: ['strokeWidth'], label: '线宽', unit: 'px' },
        ],
      },
    ]);
    expect(auditBaseScreenMaterialEditorForm(conforming)).toEqual([]);
  });

  it('reports flat panels, off-paradigm controls, labels and config-group drift', () => {
    const drifted = manifest(
      [
        {
          id: 'mixed',
          label: '混合',
          fields: [
            {
              id: 'decimals',
              target: 'props',
              path: ['decimals'],
              label: '保留小数',
              control: 'number',
            },
            { id: 'visible', target: 'props', path: ['visible'], label: '是否不显示' },
            { id: 'color', target: 'style', path: ['color'], label: '描边' },
            {
              id: 'strokeWidth',
              target: 'style',
              path: ['strokeWidth'],
              label: '线宽(px)',
              control: 'unit-number',
            },
          ],
        },
      ],
      { propertyPanel: [{ prop: 'visible', label: '显示', control: 'boolean' }] },
    );
    const rules = auditBaseScreenMaterialEditorForm(drifted).map(
      (violation) => `${violation.rule}:${violation.field ?? ''}`,
    );
    expect(rules).toEqual(
      expect.arrayContaining([
        'R12:',
        'R11:decimals',
        'R11:strokeWidth',
        'R13:visible',
        'R13:color',
        'R13:strokeWidth',
        'R14:decimals',
      ]),
    );
  });
});
