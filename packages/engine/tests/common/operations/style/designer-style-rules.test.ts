import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import { applyScreenDocumentTransaction } from '@base-screen/core';
import {
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createDesignerStyleRulesTransaction,
  designerStyleRuleColorKeys,
  formatDesignerStyleRuleValue,
  moveDesignerStyleRule,
  nextDesignerStyleRuleId,
  parseDesignerStyleRulePath,
  parseDesignerStyleRuleValue,
} from '../../../../src/common/operations/style/designer-style-rules.js';

const MANIFEST: BaseScreenMaterialManifest = {
  type: 'test.text',
  tagName: 'test-text',
  name: '文本',
  category: '基础',
  keywords: [],
  defaultSize: { width: 100, height: 30 },
  defaultProps: {},
  defaultStyle: { color: '#e8f3f5' },
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  styleSchema: {
    kind: 'object',
    properties: {
      color: { kind: 'string' },
      backgroundColor: { kind: 'string' },
      fontSize: { kind: 'number' },
    },
    required: [],
  },
  stylePanel: [
    { style: 'color', label: '颜色', control: 'color' },
    { style: 'backgroundColor', label: '背景', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
  ],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};

const catalog = createBaseScreenMaterialCatalog([
  { manifest: MANIFEST, constructor: class {} as never },
]);

function component(): ScreenComponentNode {
  return {
    id: 'hero',
    type: MANIFEST.type,
    name: '主读数',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 30 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { color: '#e8f3f5' },
    dataSource: { type: 'static', value: '优' },
  };
}

function document(): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: [component()],
    variables: [],
    blueprint: { rules: [] },
  };
}

describe('designer style rules', () => {
  it('replaces the whole rule list with a canonical patch', () => {
    const transaction = createDesignerStyleRulesTransaction(
      document(),
      'hero',
      [
        {
          id: 'good',
          when: { path: [], operator: 'eq', value: '优' },
          style: { color: '#52c41a' },
        },
        {
          id: 'high',
          when: { path: ['ratio'], operator: 'gt', value: 50 },
          style: { color: '#ff4d4f' },
        },
      ],
      catalog,
    );
    expect(transaction.ok).toBe(true);
    if (!transaction.ok) return;
    expect(transaction.value.commands).toEqual([
      {
        type: 'update-components',
        componentIds: ['hero'],
        patch: {
          styleRules: [
            {
              id: 'good',
              when: { path: [], operator: 'eq', value: '优' },
              style: { color: '#52c41a' },
            },
            {
              id: 'high',
              when: { path: ['ratio'], operator: 'gt', value: 50 },
              style: { color: '#ff4d4f' },
            },
          ],
        },
      },
    ]);
    const applied = applyScreenDocumentTransaction(document(), transaction.value);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.document.components[0]?.styleRules).toHaveLength(2);
    }
  });

  it('allows clearing rules with an empty array', () => {
    const withRules: ScreenDocument = {
      ...document(),
      components: [
        {
          ...component(),
          styleRules: [
            { id: 'a', when: { path: [], operator: 'exists' }, style: { color: '#fff' } },
          ],
        },
      ],
    };
    const transaction = createDesignerStyleRulesTransaction(withRules, 'hero', [], catalog);
    expect(transaction.ok).toBe(true);
    if (!transaction.ok) return;
    expect(transaction.value.commands[0]).toMatchObject({ patch: { styleRules: [] } });
  });

  it('rejects unknown style keys, missing values and over-long paths', () => {
    const unknownKey = createDesignerStyleRulesTransaction(
      document(),
      'hero',
      [{ id: 'a', when: { path: [], operator: 'exists' }, style: { fontSize: 12 } }],
      catalog,
    );
    expect(unknownKey.ok).toBe(false);
    const missingValue = createDesignerStyleRulesTransaction(
      document(),
      'hero',
      [{ id: 'a', when: { path: [], operator: 'eq' }, style: { color: '#fff' } }],
      catalog,
    );
    expect(missingValue.ok).toBe(false);
    const longPath = createDesignerStyleRulesTransaction(
      document(),
      'hero',
      [
        {
          id: 'a',
          when: { path: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], operator: 'exists' },
          style: { color: '#fff' },
        },
      ],
      catalog,
    );
    expect(longPath.ok).toBe(false);
    const tooMany = createDesignerStyleRulesTransaction(
      document(),
      'hero',
      Array.from({ length: 9 }, (_, index) => ({
        id: `rule-${index}`,
        when: { path: [], operator: 'exists' as const },
        style: { color: '#fff' },
      })),
      catalog,
    );
    expect(tooMany.ok).toBe(false);
  });

  it('parses dot paths and JSON-ish values', () => {
    expect(parseDesignerStyleRulePath('')).toEqual([]);
    expect(parseDesignerStyleRulePath(' ratio.current ')).toEqual(['ratio', 'current']);
    expect(parseDesignerStyleRulePath('a..b')).toBeNull();
    expect(parseDesignerStyleRulePath('a.b.c.d.e.f.g.h.i')).toBeNull();
    expect(parseDesignerStyleRuleValue('50')).toBe(50);
    expect(parseDesignerStyleRuleValue('true')).toBe(true);
    expect(parseDesignerStyleRuleValue('优')).toBe('优');
    expect(parseDesignerStyleRuleValue('{"level":"优"}')).toEqual({ level: '优' });
    expect(formatDesignerStyleRuleValue('优')).toBe('优');
    expect(formatDesignerStyleRuleValue(50)).toBe('50');
  });

  it('generates stable ids and moves rules without crossing the ends', () => {
    const rules = [
      {
        id: 'style-rule-1',
        when: { path: [], operator: 'exists' as const },
        style: { color: '#fff' },
      },
      {
        id: 'style-rule-3',
        when: { path: [], operator: 'exists' as const },
        style: { color: '#fff' },
      },
    ];
    expect(nextDesignerStyleRuleId(rules)).toBe('style-rule-2');
    expect(moveDesignerStyleRule(rules, 'style-rule-3', -1)?.map((rule) => rule.id)).toEqual([
      'style-rule-3',
      'style-rule-1',
    ]);
    expect(moveDesignerStyleRule(rules, 'style-rule-1', -1)).toBeNull();
    expect(moveDesignerStyleRule(rules, 'style-rule-3', 1)).toBeNull();
  });

  it('lists only color style keys', () => {
    expect(designerStyleRuleColorKeys(catalog, MANIFEST.type)).toEqual([
      'color',
      'backgroundColor',
    ]);
  });
});
