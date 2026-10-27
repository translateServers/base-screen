import { describe, expect, it } from 'vitest';
import { parseScreenDocument } from '../../src/document/parse.js';

/**
 * RB4 cross-repository semantic-consistency evidence: the canonical cases
 * mirror the document semantics XJ enforces at save/read boundaries
 * (`ScreenDocumentSemanticValidatorTest`). These tests establish that the Base
 * `parseScreenDocument` parser rejects the same invalid cases and accepts the
 * same valid cases against the current strict document shape.
 */

function component(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    type: 'acme.kpi-card',
    name: 'KPI Card',
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 160 },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource: null,
    ...overrides,
  };
}

function document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
    ...overrides,
  };
}

describe('parseScreenDocument RB4 semantic consistency', () => {
  it('rejects duplicate component ids', () => {
    const result = parseScreenDocument(
      document({
        components: [
          component({ id: 'card-a' }),
          component({ id: 'card-b' }),
          component({ id: 'card-a' }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_ID_DUPLICATE');
      expect(result.diagnostics[0]?.path).toEqual(['components', 2, 'id']);
    }
  });

  it('rejects a self parent reference', () => {
    const result = parseScreenDocument(
      document({ components: [component({ id: 'card-a', parentId: 'card-a' })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_PARENT_SELF');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'parentId']);
    }
  });

  it('rejects a missing parent reference', () => {
    const result = parseScreenDocument(
      document({ components: [component({ id: 'card-a', parentId: 'ghost' })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_PARENT_MISSING');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'parentId']);
    }
  });

  it('rejects a direct parent cycle', () => {
    const result = parseScreenDocument(
      document({
        components: [
          component({ id: 'card-a', parentId: 'card-b' }),
          component({ id: 'card-b', parentId: 'card-a' }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_PARENT_CYCLE');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'parentId']);
    }
  });

  it('rejects an indirect parent cycle', () => {
    const result = parseScreenDocument(
      document({
        components: [
          component({ id: 'card-a', parentId: 'card-c' }),
          component({ id: 'card-b', parentId: 'card-a' }),
          component({ id: 'card-c', parentId: 'card-b' }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_PARENT_CYCLE');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'parentId']);
    }
  });

  it('rejects duplicate variable names', () => {
    const result = parseScreenDocument(
      document({
        variables: [
          { type: 'static', id: 'count', name: 'count', initialValue: 1 },
          { type: 'static', id: 'count-copy', name: 'count', initialValue: 2 },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('VARIABLE_NAME_DUPLICATE');
      expect(result.diagnostics[0]?.path).toEqual(['variables', 1, 'name']);
    }
  });

  it('rejects duplicate blueprint relation ids', () => {
    const relation = {
      type: 'behavior',
      id: 'on-click',
      source: {
        kind: 'component',
        componentId: 'card-a',
        event: { type: 'material-event', eventName: 'click' },
      },
      target: { kind: 'component', componentId: 'card-a' },
      effect: { type: 'request-component-data' },
    };
    const result = parseScreenDocument(
      document({
        components: [component({ id: 'card-a' })],
        blueprint: { relations: [relation, { ...relation }] },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['blueprint', 'relations', 1, 'id']);
    }
  });

  it('rejects a material-event source referencing an unknown component', () => {
    const result = parseScreenDocument(
      document({
        components: [component({ id: 'card-a' })],
        blueprint: {
          relations: [
            {
              type: 'behavior',
              id: 'on-click',
              source: {
                kind: 'component',
                componentId: 'ghost',
                event: { type: 'material-event', eventName: 'click' },
              },
              target: { kind: 'component', componentId: 'card-a' },
              effect: { type: 'request-component-data' },
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('COMPONENT_PARENT_MISSING');
      expect(result.diagnostics[0]?.path).toEqual([
        'blueprint',
        'relations',
        0,
        'source',
        'componentId',
      ]);
    }
  });

  it('rejects a set-variable effect referencing an unknown variable', () => {
    const result = parseScreenDocument(
      document({
        components: [component({ id: 'card-a' })],
        blueprint: {
          relations: [
            {
              type: 'behavior',
              id: 'on-click',
              source: {
                kind: 'component',
                componentId: 'card-a',
                event: { type: 'material-event', eventName: 'click' },
              },
              target: { kind: 'variable', variableId: 'ghost' },
              effect: { type: 'set-variable', value: { kind: 'literal', value: 1 } },
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('VARIABLE_NAME_INVALID');
      expect(result.diagnostics[0]?.path).toEqual([
        'blueprint',
        'relations',
        0,
        'target',
        'variableId',
      ]);
    }
  });

  it('accepts a forward parent declared after its child with a known blueprint', () => {
    const result = parseScreenDocument(
      document({
        components: [component({ id: 'child', parentId: 'parent' }), component({ id: 'parent' })],
        variables: [{ type: 'static', id: 'count', name: 'count', initialValue: 0 }],
        blueprint: {
          relations: [
            {
              type: 'behavior',
              id: 'on-click',
              source: {
                kind: 'component',
                componentId: 'child',
                event: { type: 'material-event', eventName: 'click' },
              },
              target: { kind: 'variable', variableId: 'count' },
              effect: { type: 'set-variable', value: { kind: 'literal', value: 1 } },
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
    }
  });

  it('accepts an opaque host-action without transport details', () => {
    const result = parseScreenDocument(
      document({
        components: [component({ id: 'card-a' })],
        variables: [
          {
            type: 'data-source',
            id: 'tenant',
            name: 'tenant',
            initialValue: null,
            sourceId: 'tenant-context',
            controlled: true,
          },
        ],
        blueprint: {
          relations: [
            {
              type: 'behavior',
              id: 'notify',
              source: {
                kind: 'component',
                componentId: 'card-a',
                event: { type: 'material-event', eventName: 'click' },
              },
              target: { kind: 'host' },
              effect: {
                type: 'host-action',
                actionId: 'project.notify',
                payload: { kind: 'variable', variableId: 'tenant' },
              },
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
    }
  });
});
