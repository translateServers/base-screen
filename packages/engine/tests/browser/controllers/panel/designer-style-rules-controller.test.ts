import type { ScreenComponentStyleRule, ScreenDocument } from '@base-screen/contracts';
import {
  type BaseScreenMaterialManifest,
  createBaseScreenMaterialCatalog,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  type DesignerStyleRulesCallbacks,
  handleDesignerStyleRuleChange,
  handleDesignerStyleRuleClick,
} from '../../../../src/browser/controllers/panel/designer-style-rules-controller.js';

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
    properties: { color: { kind: 'string' }, backgroundColor: { kind: 'string' } },
    required: [],
  },
  stylePanel: [
    { style: 'color', label: '颜色', control: 'color' },
    { style: 'backgroundColor', label: '背景', control: 'color' },
  ],
  events: [],
  dataCapabilities: [],
  designCapabilities: { resize: true, rotate: true, children: false },
};
const catalog = createBaseScreenMaterialCatalog([
  { manifest: MANIFEST, constructor: class {} as never },
]);

function documentWith(rules: readonly ScreenComponentStyleRule[] = []): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: [
      {
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
        styleRules: rules,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function callbacks(document: ScreenDocument) {
  const commits: (readonly ScreenComponentStyleRule[] | undefined)[] = [];
  const diagnostics: unknown[] = [];
  const handlers: DesignerStyleRulesCallbacks = {
    getDocument: () => document,
    getCatalog: () => catalog,
    executeTransaction: (transaction) => {
      const command = transaction.commands[0];
      if (command?.type === 'update-components') commits.push(command.patch.styleRules);
      return { ok: true, value: document, diagnostics: [] };
    },
    emitDiagnostics: (items) => diagnostics.push(items),
  };
  return { handlers, commits, diagnostics };
}

function scope(componentId = 'hero') {
  return {
    dataset: { styleRuleComponent: componentId },
    closest(selector: string) {
      return selector === '[data-style-rule-component]' ? (this as never) : null;
    },
  };
}

function actionTarget(action: string, ruleId?: string) {
  const section = scope();
  const row = {
    dataset: { styleRuleId: ruleId, styleRuleComponent: 'hero' },
    closest(selector: string) {
      return selector === '[data-style-rule-id]' ? (this as never) : null;
    },
    querySelector() {
      return null;
    },
  };
  return {
    closest(selector: string) {
      if (selector === '[data-style-rule-action]') return { dataset: { styleRuleAction: action } };
      if (selector === '[data-style-rule-component]') return section;
      if (selector === '[data-style-rule-id]') return row;
      return null;
    },
  } as unknown as Element;
}

function controlTarget(
  data: Record<string, string>,
  value: string,
  rule: ScreenComponentStyleRule | undefined,
  valueInput = '',
) {
  const row = {
    dataset: { styleRuleId: rule?.id, styleRuleComponent: 'hero' },
    querySelector(selector: string) {
      return selector === '[data-style-rule-value]' ? { value: valueInput } : null;
    },
    closest(selector: string) {
      return selector === '[data-style-rule-id]' ? (this as never) : null;
    },
  };
  const section = scope();
  const self = {
    dataset: data,
    value,
    closest(selector: string) {
      if (selector === '[data-style-rule-component]') return section;
      if (selector === '[data-style-rule-id]') return row;
      if (
        selector ===
        '[data-style-rule-path], [data-style-rule-operator], [data-style-rule-value], [data-style-rule-style-key], [data-style-rule-color]'
      ) {
        return self as never;
      }
      return null;
    },
  };
  return self as unknown as Element;
}

describe('designer style rules controller', () => {
  it('adds a new rule with the first color key', () => {
    const document = documentWith();
    const { handlers, commits } = callbacks(document);
    expect(handleDesignerStyleRuleClick(actionTarget('add'), handlers)).toBe(true);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual([
      {
        id: 'style-rule-1',
        when: { path: [], operator: 'exists' },
        style: { color: '#e8f3f5' },
      },
    ]);
  });

  it('removes and moves existing rules', () => {
    const rules: ScreenComponentStyleRule[] = [
      { id: 'a', when: { path: [], operator: 'exists' }, style: { color: '#111111' } },
      { id: 'b', when: { path: [], operator: 'exists' }, style: { color: '#222222' } },
    ];
    const document = documentWith(rules);
    const first = callbacks(document);
    handleDesignerStyleRuleClick(actionTarget('remove', 'a'), first.handlers);
    expect(first.commits[0]?.map((rule) => rule.id)).toEqual(['b']);
    const second = callbacks(document);
    handleDesignerStyleRuleClick(actionTarget('down', 'a'), second.handlers);
    expect(second.commits[0]?.map((rule) => rule.id)).toEqual(['b', 'a']);
  });

  it('updates path, value, operator and color through the whole rules array', () => {
    const rule: ScreenComponentStyleRule = {
      id: 'a',
      when: { path: [], operator: 'eq', value: '优' },
      style: { color: '#111111' },
    };
    const document = documentWith([rule]);

    const path = callbacks(document);
    handleDesignerStyleRuleChange(
      controlTarget({ styleRulePath: '' }, 'ratio.current', rule),
      path.handlers,
    );
    expect(path.commits[0]?.[0]?.when.path).toEqual(['ratio', 'current']);

    const value = callbacks(document);
    handleDesignerStyleRuleChange(
      controlTarget({ styleRuleValue: '' }, '50', rule),
      value.handlers,
    );
    expect(value.commits[0]?.[0]?.when.value).toBe(50);

    const operator = callbacks(document);
    handleDesignerStyleRuleChange(
      controlTarget({ styleRuleOperator: '' }, 'exists', rule, '优'),
      operator.handlers,
    );
    expect(operator.commits[0]?.[0]?.when).toEqual({ path: [], operator: 'exists' });

    const color = callbacks(document);
    handleDesignerStyleRuleChange(
      controlTarget({ styleRuleColor: '' }, '#ff4d4f', rule),
      color.handlers,
    );
    expect(color.commits[0]?.[0]?.style.color).toBe('#ff4d4f');
  });
});
