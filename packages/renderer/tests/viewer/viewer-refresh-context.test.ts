import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  component,
  createDeferredResourcePort,
  createHostResourceCatalog,
  createVariablePort,
  createViewerHarness,
  document,
  flush,
  hostSource,
  hostVariable,
  resolveAll,
} from './__fixtures__/viewer-test-harness.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('BaseScreenViewerElement refresh execution context', () => {
  it('derives initial / document-change / variable triggers for the matching operations (RB2)', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog(['change']);
    const initial = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('trigger'),
      ],
      [hostVariable('region', 'region')],
      {
        rules: [
          {
            id: 'set-region',
            trigger: { type: 'material-event', componentId: 'trigger', eventName: 'change' },
            actions: [
              {
                type: 'set-variable',
                variableId: 'region',
                value: { kind: 'literal', value: 'south' },
              },
            ],
          },
        ],
      },
    );
    const { viewer, mount } = await createViewerHarness({
      catalog,
      document: initial,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(resources.requests[0]?.context?.trigger).toBe('initial');
    expect(resources.requests[0]?.context?.traceId).toBe('');
    resolveAll(resources.requests);
    await flush();

    const replacement = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('trigger'),
      ],
      [hostVariable('region', 'region')],
      {
        rules: [
          {
            id: 'set-region',
            trigger: { type: 'material-event', componentId: 'trigger', eventName: 'change' },
            actions: [
              {
                type: 'set-variable',
                variableId: 'region',
                value: { kind: 'literal', value: 'south' },
              },
            ],
          },
        ],
      },
    );
    viewer.document = replacement;
    await flush();
    expect(
      resources.requests.filter((request) => request.context?.trigger === 'document-change'),
    ).toHaveLength(1);
    resolveAll(resources.requests);
    await flush();

    const trigger = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'trigger',
    )!;
    trigger.fire({ name: 'change', payload: {} });
    await flush();
    const variableResolves = resources.requests.filter(
      (request) => request.context?.trigger === 'variable',
    );
    expect(variableResolves.length).toBeGreaterThanOrEqual(1);
    expect(variableResolves[variableResolves.length - 1]!.request.params).toEqual({
      region: 'south',
    });
    viewer.unload();
  });

  it('forwards projectId and documentRevision into every resolve context when configured (RB2)', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document([
      component('a', hostSource('orders')),
      component('b', hostSource('products')),
    ]);
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
      projectId: 'proj-1',
      documentRevision: 'rev-7',
    });
    await flush();

    expect(resources.requests).toHaveLength(2);
    for (const request of resources.requests) {
      expect(request.context?.projectId).toBe('proj-1');
      expect(request.context?.documentRevision).toBe('rev-7');
    }
    resolveAll(resources.requests);
    await flush();

    viewer.refreshData('a');
    await flush();
    const refreshed = resources.requests[2]!;
    expect(refreshed.context?.projectId).toBe('proj-1');
    expect(refreshed.context?.documentRevision).toBe('rev-7');
    expect(refreshed.context?.trigger).toBe('manual');
    viewer.unload();
  });
});
