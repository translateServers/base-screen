import { describe, expect, it } from 'vitest';
import {
  component,
  createHostResourceCatalog,
  createImmediateResourcePort,
  createVariablePort,
  createViewerHarness,
  document,
  flush,
  hostSource,
  hostVariable,
} from './__fixtures__/viewer-test-harness.js';

describe('BaseScreenViewerElement host variable refresh', () => {
  it('exposes stable variable handles and dispatches data-updated rules', async () => {
    const screen = document(
      [],
      [
        { type: 'static', id: 'status-id', name: 'status', initialValue: 'idle' },
        { type: 'static', id: 'mirror-id', name: 'mirror', initialValue: 'idle' },
      ],
      {
        rules: [
          {
            id: 'mirror-status',
            trigger: {
              type: 'variable-event',
              variableId: 'status-id',
              eventName: 'data-updated',
            },
            actions: [
              {
                type: 'set-variable',
                variableId: 'mirror-id',
                value: { kind: 'variable', variableId: 'status-id' },
              },
            ],
          },
        ],
      },
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: createVariablePort({}).port,
    });
    await flush();
    const changes: unknown[] = [];
    const handle = viewer.getVariable('status-id');
    const stop = handle?.onChange((value) => changes.push(value));

    expect(handle?.value).toBe('idle');
    expect(handle?.set('ready').ok).toBe(true);
    expect(handle?.value).toBe('ready');
    expect(viewer.getVariable('mirror-id')?.value).toBe('ready');
    expect(changes).toEqual(['ready']);
    expect(viewer.getVariable('missing')).toBeUndefined();
    stop?.();
    viewer.unload();
  });

  it('resolves each stable variable id while preserving shared host sources', async () => {
    const variables = createVariablePort({ shared: 'north' });
    const resources = createImmediateResourcePort();
    const screen = document(
      [
        component('a', hostSource('orders', { value: { kind: 'variable', variableId: 'first' } })),
        component('b', hostSource('orders', { value: { kind: 'variable', variableId: 'second' } })),
      ],
      [hostVariable('first', 'shared'), hostVariable('second', 'shared')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(variables.requests).toHaveLength(2);
    expect(variables.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variableId: 'first', sourceId: 'shared', purpose: 'runtime' }),
        expect.objectContaining({ variableId: 'second', sourceId: 'shared', purpose: 'runtime' }),
      ]),
    );
    expect(resources.requests.map((request) => request.request.params)).toEqual([
      { value: 'north' },
      { value: 'north' },
    ]);
    viewer.unload();
  });

  it('updates only changed dependencies and forwards variable trace context', async () => {
    const variables = createVariablePort({ 'region-id': 'north', 'page-id': 1 });
    const resources = createImmediateResourcePort();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('orders', { page: { kind: 'variable', variableId: 'page' } })),
      ],
      [hostVariable('region', 'region-id'), hostVariable('page', 'page-id')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    variables.values['region-id'] = 'south';
    viewer.refreshVariables({ variableIds: ['region', 'region'], traceId: 'var-trace' });
    await flush();

    expect(variables.requests).toHaveLength(3);
    expect(variables.requests[2]).toMatchObject({
      variableId: 'region',
      sourceId: 'region-id',
      purpose: 'runtime',
    });
    expect(resources.requests).toHaveLength(3);
    expect(resources.requests[2]).toMatchObject({
      request: { componentId: 'a', params: { region: 'south' } },
      context: { trigger: 'variable', traceId: 'var-trace' },
    });

    viewer.refreshVariables({ variableIds: ['region'] });
    await flush();
    expect(variables.requests).toHaveLength(4);
    expect(resources.requests).toHaveLength(3);
    viewer.unload();
  });

  it('rolls back an entire multi-id batch when one resolution fails', async () => {
    const variables = createVariablePort({}, true);
    const resources = createImmediateResourcePort();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('orders', { page: { kind: 'variable', variableId: 'page' } })),
      ],
      [hostVariable('region', 'region-id'), hostVariable('page', 'page-id')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    variables.requests
      .find((request) => request.variableId === 'region')!
      .resolveRequest({
        ok: true,
        value: 'north',
        diagnostics: [],
      });
    variables.requests
      .find((request) => request.variableId === 'page')!
      .resolveRequest({
        ok: true,
        value: 1,
        diagnostics: [],
      });
    await flush();
    expect(resources.requests).toHaveLength(2);

    viewer.refreshVariables();
    variables.requests[2]!.resolveRequest({ ok: true, value: 'south', diagnostics: [] });
    variables.requests[3]!.resolveRequest({
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'HOST_DATASET_VARIABLE_INVALID',
          path: [],
          message: 'Unavailable.',
        },
      ],
    });
    await flush();

    expect(resources.requests).toHaveLength(2);
    viewer.unload();
  });

  it('coalesces queued variable ids and lets a queued full refresh dominate', async () => {
    const variables = createVariablePort({}, true);
    const resources = createImmediateResourcePort();
    const screen = document(
      [],
      [hostVariable('region', 'region-id'), hostVariable('page', 'page-id')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    variables.requests[0]!.resolveRequest({ ok: true, value: 'north', diagnostics: [] });
    variables.requests[1]!.resolveRequest({ ok: true, value: 1, diagnostics: [] });
    await flush();

    viewer.refreshVariables({ variableIds: ['region'] });
    viewer.refreshVariables({ variableIds: ['page'] });
    viewer.refreshVariables();
    expect(variables.requests).toHaveLength(3);
    variables.requests[2]!.resolveRequest({ ok: true, value: 'north', diagnostics: [] });
    await flush();

    expect(variables.requests).toHaveLength(5);
    expect(
      variables.requests
        .slice(3)
        .map(({ variableId }) => variableId)
        .sort(),
    ).toEqual(['page', 'region']);
    variables.requests[3]!.resolveRequest({ ok: true, value: 'north', diagnostics: [] });
    variables.requests[4]!.resolveRequest({ ok: true, value: 1, diagnostics: [] });
    await flush();
    viewer.unload();
  });
});
