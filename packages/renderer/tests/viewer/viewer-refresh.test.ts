import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  component,
  createDeferredResourcePort,
  createHostResourceCatalog,
  createImmediateResourcePort,
  createVariablePort,
  createViewerHarness,
  diagnosticCodes,
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

describe('BaseScreenViewerElement refresh and variable behavior', () => {
  it('starts every current resource exactly once after host variables resolve', async () => {
    const variables = createVariablePort({ region: 'north' }, true);
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('products')),
      ],
      [hostVariable('region', 'region')],
    );
    await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });

    // Variables are still pending: no resource query may fire yet.
    expect(variables.requests).toHaveLength(1);
    expect(resources.requests).toHaveLength(0);

    variables.requests[0]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();

    // Both resources start, exactly one resolve per component, with the
    // evaluated variable value baked into the request params.
    expect(resources.requests).toHaveLength(2);
    expect(resources.requests.map((request) => request.request.dataSourceId).sort()).toEqual([
      'data-source-a',
      'data-source-b',
    ]);
    expect(
      resources.requests.find((request) => request.request.dataSourceId === 'data-source-a')
        ?.request.params,
    ).toEqual({ region: 'north' });
  });

  it('refreshData() refreshes all current resources without remounting materials', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document([
      component('a', hostSource('orders')),
      component('b', hostSource('products')),
    ]);
    const { viewer, mount } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(resources.requests).toHaveLength(2);
    const elementA = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'a',
    )!;
    const elementB = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'b',
    )!;
    resolveAll(resources.requests);
    await flush();
    expect(elementA.model?.dataState.status).toBe('ready');
    expect(elementB.model?.dataState.status).toBe('ready');

    viewer.refreshData();
    await flush();

    // The full refresh re-issues every current host resource (2 more resolves)
    // while the same material elements stay mounted and keep their ready state
    // (no global suspend-induced loading reset).
    expect(resources.requests).toHaveLength(4);
    expect(mount.children).toHaveLength(2);
    expect(mount.children[0]).toBe(elementA);
    expect(mount.children[1]).toBe(elementB);
    expect(elementA.model?.dataState.status).toBe('ready');
    expect(elementB.model?.dataState.status).toBe('ready');
    expect(resources.requests.some((request) => request.aborted)).toBe(false);
  });

  it('refreshData(componentId) only refreshes the target and leaves others ready', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('products')),
      ],
      [hostVariable('region', 'region')],
    );
    const { viewer, mount } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(resources.requests).toHaveLength(2);
    resolveAll(resources.requests);
    await flush();
    const elementB = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'b',
    )!;
    const bRequestCount = resources.requests.filter(
      (request) => request.request.dataSourceId === 'data-source-b',
    ).length;

    viewer.refreshData('a');
    await flush();

    // Only the target component gets a new resolve; the sibling keeps its
    // ready state, is never aborted, and never calls resourcePort again.
    const afterRefresh = resources.requests.slice(2);
    expect(afterRefresh.map((request) => request.request.dataSourceId)).toEqual(['data-source-a']);
    expect(
      resources.requests.filter((request) => request.request.dataSourceId === 'data-source-b'),
    ).toHaveLength(bRequestCount);
    expect(
      resources.requests
        .filter((request) => request.request.dataSourceId === 'data-source-b')
        .every((request) => !request.aborted),
    ).toBe(true);
    expect(elementB.model?.dataState.status).toBe('ready');
  });

  it('a targeted refresh with an unknown component id produces zero calls', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    const variableCalls = variables.requests.length;
    const resourceCalls = resources.requests.length;
    expect(variableCalls).toBe(1);
    expect(resourceCalls).toBe(1);

    viewer.refreshData('ghost');

    expect(variables.requests).toHaveLength(variableCalls);
    expect(resources.requests).toHaveLength(resourceCalls);
  });

  it('repeated refreshes of the same target while pending coalesce without cancelling', async () => {
    const variables = createVariablePort({ region: 'north' }, true);
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });

    expect(variables.requests).toHaveLength(1);
    variables.requests[0]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();
    expect(resources.requests).toHaveLength(1);
    const firstRequest = resources.requests[0]!;

    // The first refresh starts a fresh variable resolution; the second
    // refresh of the same target coalesces into the pending work instead of
    // cancelling and restarting the current target request.
    viewer.refreshData('a');
    viewer.refreshData('a');
    expect(variables.requests).toHaveLength(2);
    expect(resources.requests).toHaveLength(1);

    variables.requests[1]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();

    expect(resources.requests).toHaveLength(1);
    expect(firstRequest.aborted).toBe(false);
    expect(firstRequest.signal.aborted).toBe(false);

    // Once the pending request settles, a fresh refresh re-issues exactly once
    // after its own variable resolution completes.
    firstRequest.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();
    viewer.refreshData('a');
    expect(variables.requests).toHaveLength(3);
    variables.requests[2]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();
    expect(resources.requests).toHaveLength(2);
    expect(resources.requests[1]!.aborted).toBe(false);
  });

  it('a changed evaluated param cancels the old request and re-fetches the new identity', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(resources.requests).toHaveLength(1);
    expect(resources.requests[0]!.request.params).toEqual({ region: 'north' });

    // The host variable changes; a targeted refresh re-evaluates the params,
    // which changes the raw query identity: the old generation is cancelled
    // and a new request starts with the new params.
    variables.values.region = 'south';
    viewer.refreshData('a');
    await flush();

    expect(resources.requests).toHaveLength(2);
    expect(resources.requests[0]!.aborted).toBe(true);
    expect(resources.requests[1]!.request.params).toEqual({ region: 'south' });
    expect(resources.requests[1]!.aborted).toBe(false);
  });

  it('refreshData object form: targeted refresh with trigger and traceId', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('products')),
      ],
      [hostVariable('region', 'region')],
    );
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();
    expect(resources.requests).toHaveLength(2);
    resolveAll(resources.requests);
    await flush();

    viewer.refreshData({ componentId: 'a', trigger: 'polling', traceId: 'trace-1' });
    await flush();
    const afterRefresh = resources.requests.slice(2);
    expect(afterRefresh.map((request) => request.request.dataSourceId)).toEqual(['data-source-a']);
    resolveAll(resources.requests.slice(2));
    await flush();

    viewer.refreshData({});
    await flush();
    const fullRefresh = resources.requests.slice(3);
    expect(fullRefresh.map((request) => request.request.dataSourceId).sort()).toEqual([
      'data-source-a',
      'data-source-b',
    ]);

    viewer.refreshData({ componentId: 'ghost', trigger: 'polling', traceId: 'trace-2' });
    await flush();
    expect(resources.requests.length).toBe(5);
    viewer.unload();
  });

  it('refreshData object form: unknown component id produces zero calls', async () => {
    const variables = createVariablePort({ region: 'north' });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [component('a', hostSource('orders'))],
      [hostVariable('region', 'region')],
    );
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();
    resolveAll(resources.requests);
    await flush();

    viewer.refreshData({ componentId: 'missing', trigger: 'manual' });
    await flush();
    expect(resources.requests).toHaveLength(1);
    viewer.unload();
  });

  it('a failing or missing host variable blocks every resource query', async () => {
    const variables = createVariablePort({});
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    const { dispatched } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(resources.requests).toHaveLength(0);
    expect(diagnosticCodes(dispatched)).toContain('HOST_DATASET_VARIABLE_INVALID');
    expect(variables.requests).toHaveLength(1);
  });

  it('a variable change only re-queries the components whose params depend on it', async () => {
    const variables = createVariablePort({ region: 'north', page: 1 });
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog(['change']);
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('products', { page: { kind: 'variable', variableId: 'page' } })),
        component('trigger'),
      ],
      [hostVariable('region', 'region'), hostVariable('page', 'page')],
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
    const { mount } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    expect(resources.requests).toHaveLength(2);
    const aRequest = resources.requests.find(
      (request) => request.request.dataSourceId === 'data-source-a',
    )!;
    const bRequest = resources.requests.find(
      (request) => request.request.dataSourceId === 'data-source-b',
    )!;
    // Keep 'a' in flight so the identity change aborts its generation; settle
    // 'b' so it reaches ready.
    bRequest.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();
    const elementB = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'b',
    )!;
    expect(elementB.model?.dataState.status).toBe('ready');

    // A blueprint material event sets the 'region' variable. Only 'a', whose
    // params depend on 'region', re-queries; 'b' keeps its key, its request,
    // and its ready data state untouched.
    const trigger = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'trigger',
    )!;
    trigger.fire({ name: 'change', payload: {} });
    await flush();

    const newRequests = resources.requests.slice(2);
    expect(newRequests).toHaveLength(1);
    expect(newRequests[0]!.request.dataSourceId).toBe('data-source-a');
    expect(newRequests[0]!.request.params).toEqual({ region: 'south' });
    expect(aRequest.aborted).toBe(true);
    expect(bRequest.aborted).toBe(false);
    expect(
      resources.requests.filter((request) => request.request.dataSourceId === 'data-source-b'),
    ).toHaveLength(1);
    expect(elementB.model?.dataState.status).toBe('ready');
  });

  it('a pending document change suspends the old resources and rejects late results', async () => {
    const variables = createVariablePort({ region: 'north' }, true);
    const resources = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const oldDocument = document(
      [
        component(
          'old',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    const { viewer, mount } = await createViewerHarness({
      catalog,
      document: oldDocument,
      resourcePort: resources.port,
      variablePort: variables.port,
    });

    // The old document's variable resolves and its resource starts.
    expect(variables.requests).toHaveLength(1);
    variables.requests[0]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();
    expect(resources.requests).toHaveLength(1);
    const oldRequest = resources.requests[0]!;

    // Replace the document while the new document's host variable is still
    // pending: the initial/document-change path must suspend the old resource
    // work (abort it) so it cannot resolve stale data under the new document.
    const newDocument = document(
      [
        component(
          'new',
          hostSource('products', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    viewer.document = newDocument;
    await flush();
    expect(variables.requests).toHaveLength(2);
    expect(oldRequest.aborted).toBe(true);
    expect(oldRequest.signal.aborted).toBe(true);

    // The old material is suspended into loading; a late result for the old
    // request is rejected and can never reach the material.
    const oldElement = mount.children.find(
      (element) => element.dataset.baseScreenComponentId === 'old',
    )!;
    expect(oldElement.model?.dataState.status).toBe('loading');
    oldRequest.resolveRequest({ ok: true, value: { stale: true }, diagnostics: [] });
    await flush();
    expect(oldElement.model?.dataState.status).toBe('loading');

    // Once the new document's variable resolves, the old mount is torn down
    // and only the new document's resource starts, with the freshly evaluated
    // params.
    variables.requests[1]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();
    expect(resources.requests).toHaveLength(2);
    expect(resources.requests[1]!.request.dataSourceId).toBe('data-source-new');
    expect(resources.requests[1]!.request.params).toEqual({ region: 'north' });
    expect(resources.requests[1]!.aborted).toBe(false);
    expect(mount.children).toHaveLength(1);
    const elementNew = mount.children[0]!;
    expect(elementNew.dataset.baseScreenComponentId).toBe('new');
    // The stale value never applied; the new resource is still pending.
    expect(elementNew.model?.dataState.status).toBe('loading');
  });

  it('two viewer instances keep their resource and variable ports isolated', async () => {
    const variablesA = createVariablePort({ region: 'north' });
    const resourcesA = createDeferredResourcePort();
    const variablesB = createVariablePort({ region: 'south' });
    const resourcesB = createDeferredResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [hostVariable('region', 'region')],
    );
    const harnessA = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resourcesA.port,
      variablePort: variablesA.port,
    });
    await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resourcesB.port,
      variablePort: variablesB.port,
    });
    await flush();

    expect(resourcesA.requests).toHaveLength(1);
    expect(resourcesB.requests).toHaveLength(1);
    expect(resourcesA.requests[0]!.request.params).toEqual({ region: 'north' });
    expect(resourcesB.requests[0]!.request.params).toEqual({ region: 'south' });

    // Settle the initial in-flight requests, then refresh viewer A only: A
    // re-issues its target while B's ports stay untouched.
    resolveAll(resourcesA.requests);
    resolveAll(resourcesB.requests);
    await flush();
    harnessA.viewer.refreshData('a');
    await flush();
    expect(resourcesA.requests).toHaveLength(2);
    expect(resourcesB.requests).toHaveLength(1);
    expect(variablesA.requests).toHaveLength(2);
    expect(variablesB.requests).toHaveLength(1);
  });

  it('a full polling refresh keeps polling and the same traceId for every component (RB2)', async () => {
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
    });
    await flush();
    expect(resources.requests).toHaveLength(2);
    resolveAll(resources.requests);
    await flush();

    viewer.refreshData({ trigger: 'polling', traceId: 'poll-trace-1' });
    await flush();

    // 全量轮询刷新：每个组件的 resolve 上下文都是 polling 且共享同一 traceId，
    // 任一组件都不消费/重置其他组件的 trigger/trace。
    const after = resources.requests.slice(2);
    expect(after.map((request) => request.request.dataSourceId).sort()).toEqual([
      'data-source-a',
      'data-source-b',
    ]);
    for (const request of after) {
      expect(request.context?.trigger).toBe('polling');
      expect(request.context?.traceId).toBe('poll-trace-1');
    }
    viewer.unload();
  });

  it('a manual refresh with a traceId keeps manual trigger and the traceId (RB2)', async () => {
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
    });
    await flush();
    expect(resources.requests).toHaveLength(2);
    resolveAll(resources.requests);
    await flush();

    viewer.refreshData({ trigger: 'manual', traceId: 'manual-trace-1' });
    await flush();

    // 手动刷新同样携带 traceId（RB2）：manual trigger 下的 trace 不得被吞掉。
    const after = resources.requests.slice(2);
    expect(after.map((request) => request.request.dataSourceId).sort()).toEqual([
      'data-source-a',
      'data-source-b',
    ]);
    for (const request of after) {
      expect(request.context?.trigger).toBe('manual');
      expect(request.context?.traceId).toBe('manual-trace-1');
    }
    viewer.unload();
  });

  it('a refresh queued during an in-flight refresh keeps its own trigger and traceId (RB2)', async () => {
    const variables = createVariablePort({ region: 'north' }, true);
    const resources = createImmediateResourcePort();
    const catalog = createHostResourceCatalog();
    const screen = document(
      [component('a', hostSource('orders')), component('b', hostSource('products'))],
      [hostVariable('region', 'region')],
    );
    const { viewer } = await createViewerHarness({
      catalog,
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });

    // Initial load: the deferred variable resolves and both resources start.
    expect(variables.requests).toHaveLength(1);
    variables.requests[0]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();
    expect(resources.requests).toHaveLength(2);
    expect(resources.requests.every((request) => request.context?.trigger === 'initial')).toBe(
      true,
    );

    // A manual refresh starts a fresh variable resolution; while that variable
    // is pending a polling refresh is queued with its own traceId. The queued
    // intent must survive the completing manual refresh instead of being reset
    // before the completion callback consumes it.
    viewer.refreshData({ trigger: 'manual', traceId: 'manual-trace-1' });
    expect(variables.requests).toHaveLength(2);
    viewer.refreshData({ trigger: 'polling', traceId: 'poll-trace-2' });
    expect(variables.requests).toHaveLength(2);
    expect(resources.requests).toHaveLength(2);

    variables.requests[1]!.resolveRequest({
      ok: true,
      value: 'north',
      diagnostics: [],
    });
    await flush();

    // The manual refresh re-issues every component with its own context; the
    // queued polling refresh is then replayed with the queued trigger/trace.
    const after = resources.requests.slice(2);
    expect(after.map((request) => request.request.dataSourceId)).toEqual([
      'data-source-a',
      'data-source-b',
      'data-source-a',
      'data-source-b',
    ]);
    const manual = after.slice(0, 2);
    const queued = after.slice(2);
    for (const request of manual) {
      expect(request.context?.trigger).toBe('manual');
      expect(request.context?.traceId).toBe('manual-trace-1');
    }
    for (const request of queued) {
      expect(request.context?.trigger).toBe('polling');
      expect(request.context?.traceId).toBe('poll-trace-2');
    }
    expect(resources.requests.filter((request) => request.aborted)).toHaveLength(0);
    viewer.unload();
  });
});
