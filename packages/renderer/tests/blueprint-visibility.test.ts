import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../src/renderer/renderer.js';
import {
  component,
  createHostResourceCatalog,
  createImmediateResourcePort,
  createVariablePort,
  createViewerHarness,
  document,
  FakeMount,
  flush,
} from './viewer/__fixtures__/viewer-test-harness.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('blueprint component visibility', () => {
  it('applies ordered effects while parent visibility remains authoritative', () => {
    const mount = new FakeMount();
    const renderer = createBaseScreenRenderer({
      root: mount as unknown as HTMLElement,
      catalog: createHostResourceCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const screen = document([
      { ...component('group'), zIndex: 0 },
      { ...component('child'), parentId: 'group', zIndex: 1 },
      { ...component('sibling'), zIndex: 2 },
    ]);
    expect(renderer.render(screen).ok).toBe(true);

    expect(
      renderer.applyBlueprintVisibilityEffects([
        { componentId: 'child', operation: 'hide' },
        { componentId: 'group', operation: 'hide' },
      ]).ok,
    ).toBe(true);
    expect(mount.children.map((item) => item.style.display)).toEqual(['none', 'none', 'block']);

    expect(
      renderer.applyBlueprintVisibilityEffects([
        { componentId: 'child', operation: 'show' },
        { componentId: 'group', operation: 'show' },
      ]).ok,
    ).toBe(true);
    expect(mount.children.map((item) => item.style.display)).toEqual(['block', 'block', 'block']);

    expect(
      renderer.applyBlueprintVisibilityEffects([{ componentId: 'child', operation: 'toggle' }]).ok,
    ).toBe(true);
    expect(mount.children[1]?.style.display).toBe('none');
    renderer.resetBlueprintVisibility();
    expect(renderer.render(screen).ok).toBe(true);
    expect(mount.children.map((item) => item.style.display)).toEqual(['block', 'block', 'block']);
  });

  it('does not reconcile unrelated material models for visibility-only events', async () => {
    const screen = document(
      [component('trigger'), component('target'), component('unrelated')],
      [],
      {
        rules: [
          {
            id: 'toggle-target',
            trigger: { type: 'material-event', componentId: 'trigger', eventName: 'click' },
            requiredCapabilities: [
              'blueprint.trigger.material-event',
              'blueprint.action.component-visibility',
            ],
            actions: [{ type: 'component-visibility', componentId: 'target', operation: 'toggle' }],
          },
        ],
      },
    );
    const { mount } = await createViewerHarness({
      catalog: createHostResourceCatalog(['click']),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: createVariablePort({}).port,
      runtimeContributions: {
        getResourceType: () => undefined,
        hasBlueprintCapability: () => true,
      },
    });
    await flush();

    const trigger = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'trigger',
    )!;
    const target = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'target',
    )!;
    const unrelated = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'unrelated',
    )!;
    const targetModel = target.model;
    const unrelatedModel = unrelated.model;
    trigger.fire({ name: 'click', payload: {} });
    await flush();

    expect(target.style.display).toBe('none');
    expect(target.model).toBe(targetModel);
    expect(unrelated.model).toBe(unrelatedModel);
  });
});
