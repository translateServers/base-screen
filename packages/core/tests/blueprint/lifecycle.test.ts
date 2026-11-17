import { describe, expect, it } from 'vitest';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
} from '../../src/blueprint/runtime.js';
import { makeComponent, makeDocument } from '../__fixtures__/document.js';

function lifecycleDocument() {
  return makeDocument({
    components: [makeComponent({ id: 'panel' })],
    blueprint: {
      relations: [
        {
          id: 'ready-hide',
          type: 'behavior',
          source: { kind: 'lifecycle', event: { type: 'lifecycle', eventName: 'ready' } },
          target: { kind: 'component', componentId: 'panel' },
          effect: { type: 'component-visibility', operation: 'hide' },
        },
      ],
    },
  });
}

describe('blueprint lifecycle trigger', () => {
  it('fires ready rules once dispatched and ignores material events', () => {
    const compiled = compileScreenBlueprint(lifecycleDocument());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const ready = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      type: 'lifecycle',
      name: 'ready',
      payload: null,
    });
    expect(ready.ok).toBe(true);
    if (ready.ok) {
      expect(ready.value.visibilityEffects).toMatchObject([
        { componentId: 'panel', operation: 'hide' },
      ]);
    }

    const click = dispatchScreenBlueprintEvent(compiled.value, compiled.value.initialVariables, {
      type: 'material-event',
      componentId: 'panel',
      name: 'click',
      payload: null,
    });
    expect(click.ok).toBe(true);
    if (click.ok) expect(click.value.visibilityEffects).toEqual([]);
  });

  it('fails closed when the host does not grant the lifecycle capability', () => {
    const compiled = compileScreenBlueprint(lifecycleDocument(), {
      hasBlueprintCapability: (id) => id !== 'blueprint.trigger.lifecycle',
    });
    expect(compiled.ok).toBe(false);
    if (!compiled.ok) {
      expect(compiled.diagnostics[0]?.code).toBe('BLUEPRINT_CAPABILITY_UNAVAILABLE');
    }
  });
});
