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
      relations: [
        {
          type: 'behavior',
          id: 'toggle-panel',
          source: {
            kind: 'component',
            componentId: 'button',
            event: { type: 'material-event', eventName: 'click' },
          },
          target: { kind: 'component', componentId: 'panel' },
          effect: {
            type: 'component-visibility',
            operation: 'toggle',
            transition: { effect: 'fade', durationMs: 240, easing: 'ease-in-out-quad' },
          },
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
    relations: Array<{
      target: { componentId: string };
      effect: {
        transition: { extra?: boolean };
      };
    }>;
  };
};

describe('component visibility blueprint document', () => {
  it('parses visibility relations and persisted layout strictly', () => {
    const input = visibilityDocument();
    expect(parseScreenDocument(input)).toMatchObject({ ok: true });

    const missingTarget = structuredClone(input) as unknown as MutableVisibilityDocument;
    missingTarget.blueprint.relations[0]!.target.componentId = 'missing';
    expect(parseScreenDocument(missingTarget)).toMatchObject({
      ok: false,
      diagnostics: [{ path: ['blueprint', 'relations', 0, 'target', 'componentId'] }],
    });

    const unknownTransitionField = structuredClone(input) as unknown as MutableVisibilityDocument;
    unknownTransitionField.blueprint.relations[0]!.effect.transition.extra = true;
    const unknownResult = parseScreenDocument(unknownTransitionField);
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) {
      expect(
        unknownResult.diagnostics.some(
          (diagnostic) =>
            diagnostic.path.join('.') === 'blueprint.relations.0.effect.transition.extra',
        ),
      ).toBe(true);
    }
  });
});
