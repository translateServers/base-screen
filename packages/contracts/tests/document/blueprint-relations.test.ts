import { describe, expect, it } from 'vitest';
import {
  deriveScreenBlueprintRules,
  readScreenBlueprintRelationCategory,
  screenBlueprintEffectTargetKind,
} from '../../src/document/blueprint-relations.js';
import { parseScreenDocument } from '../../src/document/parse.js';
import { migrateScreenDocument } from '../../src/migration/migrate-document.js';
import type {
  ScreenBlueprintBehaviorRelation,
  ScreenBlueprintSemanticRelation,
} from '../../src/types/document.js';
import { component, document } from './__fixtures__/document-test-fixtures.js';

const components = [component({ id: 'a' }), component({ id: 'b' })];
const variables = [{ type: 'static', id: 'v', name: 'v', initialValue: 0 }];

function behavior(
  id: string,
  options: {
    readonly eventName?: string;
    readonly condition?: ScreenBlueprintBehaviorRelation['condition'];
    readonly target: ScreenBlueprintBehaviorRelation['target'];
    readonly effect: ScreenBlueprintBehaviorRelation['effect'];
    readonly requiredCapabilities?: readonly string[];
  },
): ScreenBlueprintBehaviorRelation {
  return {
    type: 'behavior',
    id,
    source: {
      kind: 'component',
      componentId: 'a',
      event: { type: 'material-event', eventName: options.eventName ?? 'click' },
    },
    ...(options.condition === undefined ? {} : { condition: options.condition }),
    target: options.target,
    effect: options.effect,
    ...(options.requiredCapabilities === undefined
      ? {}
      : { requiredCapabilities: options.requiredCapabilities }),
  };
}

function semantic(id: string, source: string, target: string): ScreenBlueprintSemanticRelation {
  return {
    type: 'semantic',
    id,
    source: { kind: 'component', componentId: source },
    target: { kind: 'component', componentId: target },
    role: 'detail',
  };
}

const visibility: ScreenBlueprintBehaviorRelation['effect'] = {
  type: 'component-visibility',
  operation: 'show',
};
const setVariable: ScreenBlueprintBehaviorRelation['effect'] = {
  type: 'set-variable',
  value: { kind: 'literal', value: 1 },
};
const emitHostEvent: ScreenBlueprintBehaviorRelation['effect'] = {
  type: 'emit-host-event',
  eventName: 'notify',
  payload: { kind: 'literal', value: null },
};

describe('deriveScreenBlueprintRules', () => {
  it('groups contiguous relations with the same source, event, and condition', () => {
    const parsed = parseScreenDocument(
      document({
        components,
        variables,
        blueprint: {
          relations: [
            behavior('r1', {
              target: { kind: 'component', componentId: 'b' },
              effect: visibility,
              requiredCapabilities: ['custom.authoring'],
            }),
            behavior('r2', {
              target: { kind: 'variable', variableId: 'v' },
              effect: setVariable,
            }),
            semantic('s1', 'a', 'b'),
            behavior('r3', {
              eventName: 'change',
              target: { kind: 'host' },
              effect: emitHostEvent,
            }),
          ],
        },
      }),
    );
    if (!parsed.ok) throw new Error('fixture must parse');
    const rules = deriveScreenBlueprintRules(parsed.value.blueprint);

    expect(rules).toHaveLength(2);
    expect(rules[0]!.id).toBe('r1');
    expect(rules[0]!.relationIds).toEqual(['r1', 'r2']);
    expect(rules[0]!.actions).toEqual([
      { type: 'component-visibility', componentId: 'b', operation: 'show' },
      { type: 'set-variable', variableId: 'v', value: { kind: 'literal', value: 1 } },
    ]);
    expect(rules[0]!.requiredCapabilities).toContain('custom.authoring');
    expect(rules[0]!.requiredCapabilities).toContain('blueprint.action.component-visibility');
    expect(rules[0]!.requiredCapabilities).toContain('blueprint.action.set-variable');
    expect(rules[1]!.relationIds).toEqual(['r3']);
    expect(rules[1]!.trigger).toEqual({
      type: 'material-event',
      componentId: 'a',
      eventName: 'change',
    });
  });

  it('does not merge non-contiguous groups and skips semantic relations', () => {
    const parsed = parseScreenDocument(
      document({
        components,
        variables,
        blueprint: {
          relations: [
            behavior('r1', { target: { kind: 'host' }, effect: emitHostEvent }),
            behavior('r2', {
              eventName: 'change',
              target: { kind: 'host' },
              effect: emitHostEvent,
            }),
            behavior('r3', { target: { kind: 'host' }, effect: emitHostEvent }),
            semantic('s1', 'a', 'b'),
          ],
        },
      }),
    );
    if (!parsed.ok) throw new Error('fixture must parse');
    const rules = deriveScreenBlueprintRules(parsed.value.blueprint);

    expect(rules.map((rule) => rule.relationIds)).toEqual([['r1'], ['r2'], ['r3']]);
  });

  it('derives nothing from a document with only semantic relations', () => {
    const parsed = parseScreenDocument(
      document({
        components,
        blueprint: { relations: [semantic('s1', 'a', 'b')] },
      }),
    );
    if (!parsed.ok) throw new Error('fixture must parse');
    expect(deriveScreenBlueprintRules(parsed.value.blueprint)).toEqual([]);
  });
});

describe('blueprint relation categories and targets', () => {
  it('classifies the four authoring categories', () => {
    expect(
      readScreenBlueprintRelationCategory(
        behavior('r', { target: { kind: 'component', componentId: 'b' }, effect: visibility }),
      ),
    ).toBe('interaction');
    expect(
      readScreenBlueprintRelationCategory(
        behavior('r', {
          target: { kind: 'variable', variableId: 'v' },
          effect: setVariable,
        }),
      ),
    ).toBe('data');
    expect(
      readScreenBlueprintRelationCategory(
        behavior('r', { target: { kind: 'host' }, effect: emitHostEvent }),
      ),
    ).toBe('exit');
    expect(readScreenBlueprintRelationCategory(semantic('s', 'a', 'b'))).toBe('semantic');
  });

  it('maps effects to their required target kind', () => {
    expect(screenBlueprintEffectTargetKind(visibility)).toBe('component');
    expect(screenBlueprintEffectTargetKind({ type: 'request-component-data' })).toBe('component');
    expect(screenBlueprintEffectTargetKind(setVariable)).toBe('variable');
    expect(screenBlueprintEffectTargetKind({ type: 'request-variable' })).toBe('variable');
    expect(screenBlueprintEffectTargetKind(emitHostEvent)).toBe('host');
    expect(
      screenBlueprintEffectTargetKind({
        type: 'host-action',
        actionId: 'project.notify',
        payload: { kind: 'literal', value: null },
      }),
    ).toBe('host');
  });
});

describe('blueprint relation validation', () => {
  it('rejects an effect whose target kind does not match', () => {
    const result = parseScreenDocument(
      document({
        components,
        variables,
        blueprint: {
          relations: [
            behavior('r', {
              target: { kind: 'variable', variableId: 'v' },
              effect: visibility,
            }),
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a semantic self relation', () => {
    expect(
      parseScreenDocument(
        document({ components, blueprint: { relations: [semantic('s', 'a', 'a')] } }),
      ).ok,
    ).toBe(false);
  });

  it('rejects duplicate relation ids', () => {
    const result = parseScreenDocument(
      document({
        components,
        blueprint: {
          relations: [
            behavior('same', { target: { kind: 'host' }, effect: emitHostEvent }),
            behavior('same', { target: { kind: 'host' }, effect: emitHostEvent }),
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.path.join('.') === 'blueprint.relations.1.id',
        ),
      ).toBe(true);
    }
  });
});

describe('legacy blueprint migration', () => {
  it('splits rules into relations, drops structural layout ids, and preserves order', () => {
    const legacy = document({
      components,
      variables,
      blueprint: {
        rules: [
          {
            id: 'rule-1',
            trigger: { type: 'material-event', componentId: 'a', eventName: 'click' },
            condition: {
              left: { kind: 'literal', value: true },
              operator: 'eq',
              right: { kind: 'literal', value: true },
            },
            actions: [
              { type: 'component-visibility', componentId: 'b', operation: 'show' },
              { type: 'set-variable', variableId: 'v', value: { kind: 'literal', value: 1 } },
            ],
          },
          {
            id: 'rule-2',
            trigger: { type: 'material-event', componentId: 'a', eventName: 'change' },
            actions: [
              {
                type: 'emit-host-event',
                eventName: 'notify',
                payload: { kind: 'literal', value: null },
              },
            ],
          },
          {
            id: 'rule-empty',
            trigger: { type: 'material-event', componentId: 'a', eventName: 'click' },
            actions: [],
          },
        ],
        layout: {
          nodes: [
            { id: 'component:a', x: 1, y: 2 },
            { id: 'condition:rule-1', x: 3, y: 4 },
            { id: 'action:rule-1:0', x: 5, y: 6 },
            { id: 'unconnected:condition:n:1', x: 7, y: 8 },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    });
    const migrated = migrateScreenDocument(legacy);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;

    expect(migrated.document.blueprint.relations).toHaveLength(3);
    expect(migrated.document.blueprint.layout?.nodes).toEqual([{ id: 'component:a', x: 1, y: 2 }]);
    expect(
      migrated.decisions.some(
        (decision) =>
          decision.kind === 'blueprint-relation' &&
          decision.action === 'mapped' &&
          decision.createdRelationIds?.length === 2,
      ),
    ).toBe(true);
    expect(
      migrated.decisions.some(
        (decision) => decision.kind === 'blueprint-relation' && decision.action === 'rejected',
      ),
    ).toBe(true);
    expect(
      migrated.decisions.some(
        (decision) => decision.kind === 'blueprint-layout' && decision.action === 'rejected',
      ),
    ).toBe(true);

    const rules = deriveScreenBlueprintRules(migrated.document.blueprint);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.relationIds).toHaveLength(2);
    expect(rules[0]!.actions).toHaveLength(2);
    expect(rules[1]!.trigger).toEqual({
      type: 'material-event',
      componentId: 'a',
      eventName: 'change',
    });

    const again = migrateScreenDocument(migrated.document);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.document).toEqual(migrated.document);
      expect(again.decisions).toEqual([]);
    }
  });
});
