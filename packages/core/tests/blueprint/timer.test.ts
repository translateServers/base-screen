import { describe, expect, it } from 'vitest';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
} from '../../src/blueprint/runtime.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

function timerDocument() {
  const panel = makeComponent({ id: 'panel' });
  return makeDocument({
    components: [panel],
    blueprint: {
      rules: [
        {
          id: 'five-hide',
          trigger: { type: 'timer', eventName: 'tick', intervalSeconds: 5 },
          actions: [{ type: 'component-visibility', componentId: 'panel', operation: 'hide' }],
        },
        {
          id: 'ten-show',
          trigger: { type: 'timer', eventName: 'tick', intervalSeconds: 10 },
          actions: [{ type: 'component-visibility', componentId: 'panel', operation: 'show' }],
        },
      ],
    },
  });
}

describe('blueprint timer trigger', () => {
  it('routes a tick only to rules of the same interval', () => {
    const compiled = compileScreenBlueprint(timerDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const tick = (intervalSeconds: number) =>
      dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
        type: 'timer',
        name: 'tick',
        intervalSeconds,
        payload: null,
      });

    const five = tick(5);
    expect(five.ok).toBe(true);
    if (five.ok) {
      expect(five.value.visibilityEffects).toMatchObject([
        { componentId: 'panel', operation: 'hide' },
      ]);
    }

    const ten = tick(10);
    expect(ten.ok).toBe(true);
    if (ten.ok) {
      expect(ten.value.visibilityEffects).toMatchObject([
        { componentId: 'panel', operation: 'show' },
      ]);
    }

    const orphan = tick(7);
    expect(orphan.ok).toBe(true);
    if (orphan.ok) expect(orphan.value.visibilityEffects).toEqual([]);
  });

  it('fails closed without the timer capability', () => {
    const compiled = compileScreenBlueprint(timerDocument(), {
      hasBlueprintCapability: (id) => id !== 'blueprint.trigger.timer',
    });
    expect(compiled.ok).toBe(false);
  });
});
