import { describe, expect, it } from 'vitest';
import { makeComponent, makeDocument, makeVariable } from '../__fixtures__/document.js';
import { compileScreenBlueprint, dispatchScreenBlueprintEvent } from './runtime.js';

describe('Blueprint runtime', () => {
  it('dispatches only matching rules into detached variable and host-event outputs', () => {
    const document = makeDocument({
      components: [makeComponent({ id: 'button' })],
      variables: [makeVariable({ name: 'count', value: 0 })],
      blueprint: {
        apiVersion: 1,
        rules: [
          {
            id: 'increment',
            trigger: { type: 'material-event', componentId: 'button', eventName: 'click' },
            actions: [
              { type: 'set-variable', variableName: 'count', value: 1 },
              { type: 'emit-host-event', eventName: 'refresh', payload: { source: 'button' } },
            ],
          },
        ],
      },
    });
    const plan = compileScreenBlueprint(document);
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
});
