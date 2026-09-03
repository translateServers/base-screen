import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { updateDesignerBlueprintActionFromTarget } from '../../../../src/browser/controllers/blueprint/designer-blueprint-panel-mutations.js';

const action = {
  type: 'set-variable' as const,
  variableId: 'selected',
  value: { kind: 'literal' as const, value: null },
};

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'source',
      type: 'base.button',
      name: 'Source',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: null,
    },
  ],
  variables: [
    { type: 'static', id: 'selected', name: 'selected', initialValue: null },
    { type: 'static', id: 'fallback', name: 'fallback', initialValue: 1 },
  ],
  blueprint: {
    rules: [
      {
        id: 'rule-1',
        trigger: { type: 'material-event', componentId: 'source', eventName: 'click' },
        actions: [action],
      },
    ],
  },
};

const catalog = {
  get: () => ({
    manifest: {
      editorDescriptor: {
        events: [
          {
            name: 'click',
            payloadSchema: {
              kind: 'object',
              properties: {
                row: {
                  kind: 'object',
                  properties: { id: { kind: 'string' } },
                  required: [],
                },
                index: { kind: 'number' },
              },
              required: [],
            },
          },
        ],
      },
    },
  }),
} as unknown as BaseScreenMaterialCatalog;

describe('Designer Blueprint set-variable value sources', () => {
  it('switches between literal, whole-event, declared event-field and variable sources', () => {
    expect(change('[data-blueprint-action-value-source]', 'event')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...action, value: { kind: 'event-payload', path: [] } },
    });
    expect(change('[data-blueprint-action-value-source]', 'event-field')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...action, value: { kind: 'event-payload', path: ['row'] } },
    });
    expect(change('[data-blueprint-action-event-path]', '["row","id"]')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...action, value: { kind: 'event-payload', path: ['row', 'id'] } },
    });
    expect(change('[data-blueprint-action-value-source]', 'variable')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...action, value: { kind: 'variable', variableId: 'fallback' } },
    });
  });

  it('rejects undeclared field paths and self-variable sources', () => {
    expect(change('[data-blueprint-action-event-path]', '["secret"]')).toMatchObject({ ok: false });
    expect(change('[data-blueprint-action-source-variable]', 'selected')).toMatchObject({
      ok: false,
    });
  });
});

function change(selector: string, value: string) {
  const target = {
    value,
    dataset: { ruleId: 'rule-1', actionIndex: '0' },
    matches(candidate: string) {
      return candidate === selector;
    },
  } as unknown as Element;
  return updateDesignerBlueprintActionFromTarget(target, document, action, catalog);
}
