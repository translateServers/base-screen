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
  it('deduplicates host ids, synchronizes aliases, and marks runtime purpose', async () => {
    const variables = createVariablePort({ shared: 'north' });
    const resources = createImmediateResourcePort();
    const screen = document(
      [
        component('a', hostSource('orders', { value: { kind: 'variable', name: 'first' } })),
        component('b', hostSource('orders', { value: { kind: 'variable', name: 'second' } })),
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

    expect(variables.requests).toHaveLength(1);
    expect(variables.requests[0]).toMatchObject({ variableId: 'shared', purpose: 'runtime' });
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
        component('a', hostSource('orders', { region: { kind: 'variable', name: 'region' } })),
        component('b', hostSource('orders', { page: { kind: 'variable', name: 'page' } })),
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
    viewer.refreshVariables({ variableIds: ['region-id', 'region-id'], traceId: 'var-trace' });
    await flush();

    expect(variables.requests).toHaveLength(3);
    expect(variables.requests[2]).toMatchObject({ variableId: 'region-id', purpose: 'runtime' });
    expect(resources.requests).toHaveLength(3);
    expect(resources.requests[2]).toMatchObject({
      request: { componentId: 'a', params: { region: 'south' } },
      context: { trigger: 'variable', traceId: 'var-trace' },
    });

    viewer.refreshVariables({ variableIds: ['region-id'] });
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
        component('a', hostSource('orders', { region: { kind: 'variable', name: 'region' } })),
        component('b', hostSource('orders', { page: { kind: 'variable', name: 'page' } })),
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
      .find((request) => request.variableId === 'region-id')!
      .resolveRequest({
        ok: true,
        value: 'north',
        diagnostics: [],
      });
    variables.requests
      .find((request) => request.variableId === 'page-id')!
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

    viewer.refreshVariables({ variableIds: ['region-id'] });
    viewer.refreshVariables({ variableIds: ['page-id'] });
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
    ).toEqual(['page-id', 'region-id']);
    variables.requests[3]!.resolveRequest({ ok: true, value: 'north', diagnostics: [] });
    variables.requests[4]!.resolveRequest({ ok: true, value: 1, diagnostics: [] });
    await flush();
    viewer.unload();
  });
});
