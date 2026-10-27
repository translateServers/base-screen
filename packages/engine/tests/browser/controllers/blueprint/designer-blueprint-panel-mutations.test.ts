import type { ScreenBlueprintBehaviorRelation, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { updateDesignerBlueprintEffectFromTarget } from '../../../../src/browser/controllers/blueprint/designer-blueprint-panel-mutations.js';

const effect = {
  type: 'set-variable' as const,
  value: { kind: 'literal' as const, value: null },
};

const relation: ScreenBlueprintBehaviorRelation = {
  type: 'behavior',
  id: 'relation-1',
  source: {
    kind: 'component',
    componentId: 'source',
    event: { type: 'material-event', eventName: 'click' },
  },
  target: { kind: 'variable', variableId: 'selected' },
  effect,
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
  blueprint: { relations: [relation] },
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
      value: { ...effect, value: { kind: 'event-payload', path: [] } },
    });
    expect(change('[data-blueprint-action-value-source]', 'event-field')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...effect, value: { kind: 'event-payload', path: ['row'] } },
    });
    expect(change('[data-blueprint-action-event-path]', 'row.id')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...effect, value: { kind: 'event-payload', path: ['row', 'id'] } },
    });
    expect(change('[data-blueprint-action-value-source]', 'variable')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...effect, value: { kind: 'variable', variableId: 'fallback' } },
    });
  });

  it('accepts custom event-field paths beyond the declared payload schema', () => {
    expect(change('[data-blueprint-action-event-path]', 'meta.city')).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...effect, value: { kind: 'event-payload', path: ['meta', 'city'] } },
    });
    expect(change('[data-blueprint-action-event-path]', 'row.deep.city')).toMatchObject({
      ok: true,
    });
  });

  it('allows event fields when the material declares no payload schema', () => {
    expect(change('[data-blueprint-action-value-source]', 'event-field', undefined)).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...effect, value: { kind: 'event-payload', path: ['row'] } },
    });
    expect(change('[data-blueprint-action-event-path]', 'row.city', undefined)).toEqual({
      ok: true,
      diagnostics: [],
      value: { ...effect, value: { kind: 'event-payload', path: ['row', 'city'] } },
    });
  });

  it('rejects unsafe or over-long event-field paths and self-variable sources', () => {
    expect(change('[data-blueprint-action-event-path]', 'secret.__proto__')).toMatchObject({
      ok: false,
    });
    expect(change('[data-blueprint-action-event-path]', 'row..id')).toMatchObject({ ok: false });
    expect(change('[data-blueprint-action-event-path]', 'a.b.c.d.e.f.g.h.i')).toMatchObject({
      ok: false,
    });
    expect(change('[data-blueprint-action-source-variable]', 'selected')).toMatchObject({
      ok: false,
    });
  });
});

function change(
  selector: string,
  value: string,
  catalogOverride: BaseScreenMaterialCatalog | undefined = catalog,
) {
  const target = {
    value,
    dataset: { relationId: 'relation-1' },
    matches(candidate: string) {
      return candidate === selector;
    },
  } as unknown as Element;
  return updateDesignerBlueprintEffectFromTarget(target, document, relation, catalogOverride);
}
