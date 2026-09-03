import { describe, expect, it } from 'vitest';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
} from '../../src/blueprint/runtime.js';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';

describe('Blueprint runtime', () => {
  it('ignores a dynamic variable initial value while controlled mode is enabled', () => {
    const compiled = compileScreenBlueprint(
      makeDocument({
        variables: [
          {
            type: 'data-source',
            id: 'region',
            name: 'region',
            initialValue: 'fallback',
            sourceId: 'region-source',
            controlled: true,
          },
        ],
      }),
    );

    expect(compiled).toMatchObject({ ok: true, value: { initialVariables: { region: null } } });
  });

  it('emits ordered component visibility effects and enforces the native capability', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' }), makeComponent({ id: 'panel' })],
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
                transition: {
                  effect: 'fade',
                  durationMs: 240,
                  easing: 'ease-in-out-quad',
                },
              },
              { type: 'component-visibility', componentId: 'panel', operation: 'show' },
            ],
          },
        ],
      },
    });
    expect(compileScreenBlueprint(document, { hasBlueprintCapability: () => false })).toMatchObject(
      { ok: false },
    );
    const compiled = compileScreenBlueprint(document, { hasBlueprintCapability: () => true });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: {},
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        visibilityEffects: [
          {
            componentId: 'panel',
            operation: 'toggle',
            transition: { effect: 'fade', durationMs: 240, easing: 'ease-in-out-quad' },
          },
          { componentId: 'panel', operation: 'show' },
        ],
      },
    });
  });

  it('dispatches only matching rules into detached variable and host-event outputs', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      variables: [makeVariable({ name: 'count', initialValue: 0 })],
      blueprint: {
        rules: [
          {
            id: 'increment',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableId: 'count',
                value: { kind: 'literal', value: 1 },
              },
              {
                type: 'emit-host-event',
                eventName: 'refresh',
                payload: { kind: 'literal', value: { source: 'button' } },
              },
            ],
          },
        ],
      },
    });
    const compiled = compileScreenBlueprint(document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const plan = compiled.value;
    const result = dispatchScreenBlueprintEvent(plan, plan.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.variables).toEqual({ count: 1 });
      expect(result.value.hostEvents).toEqual([{ name: 'refresh', payload: { source: 'button' } }]);
    }
    expect(plan.initialVariables).toEqual({ count: 0 });
  });

  it('compares JSON objects structurally regardless of property insertion order', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      blueprint: {
        rules: [
          {
            id: 'match',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            condition: {
              left: { kind: 'event-payload', path: ['value'] },
              operator: 'eq',
              right: { kind: 'literal', value: { first: 1, second: 2 } },
            },
            actions: [
              {
                type: 'emit-host-event',
                eventName: 'matched',
                payload: { kind: 'literal', value: null },
              },
            ],
          },
        ],
      },
    });
    const compiled = compileScreenBlueprint(document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: { value: { second: 2, first: 1 } },
    });

    expect(result).toMatchObject({ ok: true, value: { hostEvents: [{ name: 'matched' }] } });
  });

  it('evaluates each rule action against the pending atomic variable state', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      variables: [makeVariable({ name: 'count', initialValue: 0 })],
      blueprint: {
        rules: [
          {
            id: 'chain',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'set-variable',
                variableId: 'count',
                value: { kind: 'literal', value: 2 },
              },
              {
                type: 'emit-host-event',
                eventName: 'count-updated',
                payload: { kind: 'variable', variableId: 'count' },
              },
            ],
          },
        ],
      },
    });
    const compiled = compileScreenBlueprint(document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { variables: { count: 2 }, hostEvents: [{ name: 'count-updated', payload: 2 }] },
    });
  });

  it('R6 keeps authorized host actions separate from events and variable state', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      blueprint: {
        rules: [
          {
            id: 'notify',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              {
                type: 'host-action',
                actionId: 'project.notify',
                payload: { kind: 'literal', value: { source: 'button' } },
              },
            ],
          },
        ],
      },
    });
    const compiled = compileScreenBlueprint(document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const result = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      componentId: 'button',
      name: 'click',
      payload: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        variables: {},
        hostEvents: [],
        hostActions: [{ name: 'project.notify', payload: { source: 'button' } }],
      },
    });
  });
});
