import { describe, expect, it } from 'vitest';
import { parseScreenDocument } from '../../src/document/parse.js';

function component(id: string): Record<string, unknown> {
  return {
    id,
    type: 'acme.kpi-card',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
  };
}

function visibilityDocument(): Record<string, unknown> {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [component('button'), component('panel')],
    variables: [],
    blueprint: {
      rules: [
        {
          id: 'toggle-panel',
          trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
          actions: [
            {
              type: 'component-visibility',
              componentId: 'panel',
              operation: 'toggle',
              transition: { effect: 'fade', durationMs: 240, easing: 'ease-in-out-quad' },
            },
          ],
        },
      ],
      layout: {
        nodes: [
          { id: 'component:button', x: 80, y: 120 },
          { id: 'component:panel', x: 460, y: 120, collapsed: false },
        ],
        viewport: { x: 20, y: 30, zoom: 1 },
      },
    },
  };
}

type MutableVisibilityDocument = {
  blueprint: {
    rules: Array<{
      actions: Array<{
        componentId: string;
        transition: { extra?: boolean };
      }>;
    }>;
  };
};

describe('component visibility blueprint document', () => {
  it('parses visibility actions and persisted layout strictly', () => {
    const input = visibilityDocument();
    expect(parseScreenDocument(input)).toMatchObject({ ok: true });

    const missingTarget = structuredClone(input) as unknown as MutableVisibilityDocument;
    missingTarget.blueprint.rules[0]!.actions[0]!.componentId = 'missing';
    expect(parseScreenDocument(missingTarget)).toMatchObject({
      ok: false,
      diagnostics: [{ path: ['blueprint', 'rules', 0, 'actions', 0, 'componentId'] }],
    });

    const unknownTransitionField = structuredClone(input) as unknown as MutableVisibilityDocument;
    unknownTransitionField.blueprint.rules[0]!.actions[0]!.transition.extra = true;
    expect(parseScreenDocument(unknownTransitionField)).toMatchObject({ ok: false });
  });
});
