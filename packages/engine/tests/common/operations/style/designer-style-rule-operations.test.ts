import type {
  ScreenComponentNode,
  ScreenComponentStyleRule,
  ScreenDocument,
} from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createStyleRuleDraft,
  createStyleRulesTransaction,
} from '../../../../src/common/operations/style/designer-style-rule-operations.js';

function component(styleRules?: readonly ScreenComponentStyleRule[]): ScreenComponentNode {
  return {
    id: 'metric',
    type: 'base.text',
    name: 'Metric',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { color: '#ffffff' },
    ...(styleRules === undefined ? {} : { styleRules }),
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

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => ({
      manifest: {
        styleSchema: {
          kind: 'object',
          properties: { color: { kind: 'string' }, fontSize: { kind: 'number' } },
          required: ['color'],
        },
      },
    }),
  } as unknown as BaseScreenMaterialCatalog;
}

const warn: ScreenComponentStyleRule = {
  id: 'warn',
  when: { path: [], operator: 'gt', value: 100 },
  style: { color: '#ff0000' },
};

describe('designer style rule operations', () => {
  it('R4 builds an update-components transaction replacing the full rules array', () => {
    const result = createStyleRulesTransaction(
      document([component()]),
      'metric',
      [warn],
      catalog(),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        commands: [
          { type: 'update-components', componentIds: ['metric'], patch: { styleRules: [warn] } },
        ],
      },
      diagnostics: [],
    });
  });

  it('R4 rejects structurally invalid drafts without a transaction', () => {
    const doc = document([component()]);
    const tooMany = Array.from({ length: 9 }, (_, index) => ({ ...warn, id: `r${index}` }));
    expect(createStyleRulesTransaction(doc, 'metric', tooMany, catalog())).toBeUndefined();
    expect(createStyleRulesTransaction(doc, 'metric', [warn, warn], catalog())).toBeUndefined();
    expect(
      createStyleRulesTransaction(doc, 'metric', [{ ...warn, id: '' }], catalog()),
    ).toBeUndefined();
    expect(
      createStyleRulesTransaction(
        doc,
        'metric',
        [{ ...warn, when: { path: ['a'.repeat(65)], operator: 'gt', value: 1 } }],
        catalog(),
      ),
    ).toBeUndefined();
    expect(
      createStyleRulesTransaction(
        doc,
        'metric',
        [{ ...warn, when: { path: [], operator: 'exists', value: 1 } }],
        catalog(),
      ),
    ).toBeUndefined();
    expect(
      createStyleRulesTransaction(
        doc,
        'metric',
        [{ ...warn, when: { path: [], operator: 'gt' } }],
        catalog(),
      ),
    ).toBeUndefined();
  });

  it('R4 returns schema diagnostics for a rule style outside the material schema', () => {
    const result = createStyleRulesTransaction(
      document([component()]),
      'metric',
      [{ ...warn, style: { unknownKey: 'x' } }],
      catalog(),
    );
    expect(result?.ok).toBe(false);
    if (result !== undefined && !result.ok) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });

  it('R4 generates unique default draft ids within the cap', () => {
    expect(createStyleRuleDraft([]).id).toBe('rule-1');
    expect(createStyleRuleDraft([warn]).id).toBe('rule-1');
    const used = [
      { ...warn, id: 'rule-1' },
      { ...warn, id: 'rule-2' },
    ];
    const draft = createStyleRuleDraft(used);
    expect(draft.id).toBe('rule-3');
    expect(draft.when).toEqual({ path: [], operator: 'gt', value: 0 });
    expect(draft.style).toEqual({});
  });
});
