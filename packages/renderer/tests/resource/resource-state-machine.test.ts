import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  createDatasetCatalog,
  createDeferredPort,
  document,
  FakeRoot,
  hostSource,
  PROJECT_ADAPTER,
  TABULAR_VALUE,
} from './__fixtures__/resource-state-machine-harness.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('Renderer resource state machine', () => {
  it('a deferred resolve is not aborted and not restarted by an unrelated edit', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    expect(requests).toHaveLength(1);

    const edited = document([{ ...initial.components[0]!, name: 'Renamed' }]);
    expect(renderer.render(edited).ok).toBe(true);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.aborted).toBe(false);

    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { ready: true },
    });
  });

  it('a ready component stays ready across unrelated edits with one resolve', async () => {
    const root = new FakeRoot();
    let calls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          calls++;
          return { ok: true as const, value: { ready: true }, diagnostics: [] };
        },
      },
    });
    const source = hostSource('orders');
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState.status).toBe('ready');
    const mounted = root.children[0];

    expect(renderer.render(document([{ ...initial.components[0]!, style: {} }])).ok).toBe(true);
    expect(calls).toBe(1);
    expect(root.children[0]).toBe(mounted);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { ready: true },
    });
  });

  it('consecutive renders with the same raw key issue exactly one resolve', async () => {
    const root = new FakeRoot();
    let calls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          calls++;
          return { ok: true as const, value: { ready: true }, diagnostics: [] };
        },
      },
    });
    const source = hostSource('orders');
    const screen = document([component('resource', 0, null, source)]);

    expect(renderer.render(screen).ok).toBe(true);
    expect(renderer.render(screen).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(renderer.render(screen).ok).toBe(true);
    expect(calls).toBe(1);
    expect(root.children[0]?.model?.dataState.status).toBe('ready');
  });

  it('a binding-only change re-adapts locally with zero extra host resolves', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog(PROJECT_ADAPTER),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const sourceA = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['name'] },
      },
    );
    const sourceB = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['amount'] },
      },
    );
    const screenA = document([component('dataset', 0, null, sourceA)]);

    expect(renderer.render(screenA).ok).toBe(true);
    requests[0]!.resolveRequest({ ok: true, value: TABULAR_VALUE, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['name'], rows: TABULAR_VALUE.rows },
    });

    const screenB = document([component('dataset', 0, null, sourceB)]);
    expect(renderer.render(screenB).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['amount'], rows: TABULAR_VALUE.rows },
    });
  });

  it('empty data is a zero-row ready state, not an error', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog(PROJECT_ADAPTER),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['name'] },
      },
    );
    const emptyValue: ScreenJsonValue = {
      fields: [
        { id: 'name', label: '名称', valueType: 'string' },
        { id: 'amount', label: '金额', valueType: 'number' },
      ],
      rows: [],
    };

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    requests[0]!.resolveRequest({ ok: true, value: emptyValue, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['name'], rows: [] },
    });
  });

  it('a pending completion adapts with the latest binding, not stale captured input', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog(PROJECT_ADAPTER),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const sourceA = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['name'] },
      },
    );
    const sourceB = hostSource(
      'orders',
      'dataset',
      { limit: { kind: 'literal', value: 5 } },
      {
        fields: { columns: ['amount'] },
      },
    );

    expect(renderer.render(document([component('dataset', 0, null, sourceA)])).ok).toBe(true);
    expect(renderer.render(document([component('dataset', 0, null, sourceB)])).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.aborted).toBe(false);

    requests[0]!.resolveRequest({ ok: true, value: TABULAR_VALUE, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['amount'], rows: TABULAR_VALUE.rows },
    });
  });

  it('a changed resource id cancels the old generation and re-fetches the new identity', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const first = document([component('resource', 0, null, hostSource('orders-1'))]);

    expect(renderer.render(first).ok).toBe(true);
    expect(requests).toHaveLength(1);

    const second = document([{ ...first.components[0]!, dataSource: hostSource('orders-2') }]);
    expect(renderer.render(second).ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.aborted).toBe(true);
    expect(requests[1]!.aborted).toBe(false);
    // Active abort is lifecycle-only: the material stays in loading, never error.
    expect(root.children[0]?.model?.dataState.status).toBe('loading');

    requests[0]!.resolveRequest({ ok: true, value: { stale: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState.status).toBe('loading');

    requests[1]!.resolveRequest({ ok: true, value: { current: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { current: true },
    });
  });

  it('a changed resource type or evaluated params cancels and re-fetches', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    expect(
      renderer.render(document([component('resource', 0, null, hostSource('orders', 'dataset'))]))
        .ok,
    ).toBe(true);
    expect(
      renderer.render(document([component('resource', 0, null, hostSource('orders', 'metric'))]))
        .ok,
    ).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.aborted).toBe(true);
    expect(requests[1]!.request.resourceType).toBe('metric');

    expect(
      renderer.render(
        document([
          component(
            'resource',
            0,
            null,
            hostSource('orders', 'dataset', {
              limit: { kind: 'literal', value: 10 },
            }),
          ),
        ]),
      ).ok,
    ).toBe(true);
    expect(requests).toHaveLength(3);
    expect(requests[1]!.aborted).toBe(true);
    expect(requests[2]!.aborted).toBe(false);
    expect(requests[2]!.request.params).toEqual({ limit: 10 });
  });

  it('component deletion cancels once, removes the element, and rejects late results', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('delete-me', 0, null, source)])).ok).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(requests).toHaveLength(1);

    expect(renderer.render(document([])).ok).toBe(true);
    expect(requests[0]!.aborted).toBe(true);
    expect(root.children).toHaveLength(0);

    requests[0]!.resolveRequest({ ok: true, value: { late: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children).toHaveLength(0);
  });

  it('a same-id material type replacement cleans up the old mount and rejects late results', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: (() => {
        const a = createCatalog('base.a');
        const b = createCatalog('base.b');
        return {
          get: (type: string) => (type === 'base.a' ? a.get('base.a') : b.get('base.b')),
          has: (type: string) => type === 'base.a' || type === 'base.b',
          list: () => [...a.list(), ...b.list()],
        } as BaseScreenMaterialCatalog;
      })(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');
    const first = { ...component('swap', 0, null, source), type: 'base.a' };
    const second = { ...component('swap', 0, null, source), type: 'base.b' };

    expect(renderer.render(document([first])).ok).toBe(true);
    expect(root.children).toHaveLength(1);
    const oldElement = root.children[0];
    expect(requests).toHaveLength(1);

    expect(renderer.render(document([second])).ok).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).not.toBe(oldElement);
    expect(oldElement?.removed).toBe(true);
    // 只换了物料类型：数据源实例没变，请求与缓存都留在实例上，因此不取消、不重发。
    expect(requests[0]!.aborted).toBe(false);
    expect(requests).toHaveLength(1);
    expect(root.children[0]?.model?.dataState.status).toBe('loading');

    requests[0]!.resolveRequest({ ok: true, value: { fresh: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { fresh: true },
    });
  });

  it('R7 renders manifest defaultData as ready data when no source is bound', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog('base.test', { sample: true }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });

    expect(renderer.render(document([component('sample', 0)])).ok).toBe(true);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { sample: true },
    });

    expect(renderer.render(document([component('sample', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);
    expect(root.children[0]?.model?.dataState.status).toBe('loading');
  });

  it('data-source removal clears the resource and a restored source resolves again', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('res', 0, null, source)])).ok).toBe(true);
    expect(requests).toHaveLength(1);
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const mounted = root.children[0];

    expect(renderer.render(document([component('res', 0)])).ok).toBe(true);
    expect(root.children[0]?.model?.dataState.status).toBe('idle');
    expect(root.children[0]).toBe(mounted);

    expect(renderer.render(document([component('res', 0, null, source)])).ok).toBe(true);
    expect(requests).toHaveLength(2);
    requests[1]!.resolveRequest({ ok: true, value: { again: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { again: true },
    });
  });

  it('clear() and dispose() abort in-flight requests and reject late results', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    expect(renderer.render(document([component('clear-me', 0, null, hostSource('a'))])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);

    renderer.clear();
    expect(requests[0]!.aborted).toBe(true);
    expect(root.children).toHaveLength(0);
    requests[0]!.resolveRequest({ ok: true, value: { late: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children).toHaveLength(0);

    const disposed = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    expect(disposed.render(document([component('dispose-me', 0, null, hostSource('b'))])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(2);
    disposed.dispose();
    expect(requests[1]!.aborted).toBe(true);
    requests[1]!.resolveRequest({ ok: true, value: { late: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(disposed.render(document([component('dispose-me', 0, null, hostSource('b'))])).ok).toBe(
      false,
    );
  });

  it('a timeout is terminal for its generation and a late resolve cannot overwrite it', async () => {
    vi.useFakeTimers();
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
      resourceTimeoutMs: 100,
    });
    expect(renderer.render(document([component('timeout', 0, null, hostSource('t'))])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(requests[0]!.aborted).toBe(true);
    expect(root.children[0]?.model?.dataState).toMatchObject({ code: 'HOST_RESOURCE_TIMEOUT' });

    requests[0]!.resolveRequest({ ok: true, value: { late: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toMatchObject({ code: 'HOST_RESOURCE_TIMEOUT' });
  });

  it('a pending same-key refresh coalesces instead of cancelling and restarting', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    expect(
      renderer.render(document([component('refreshable', 0, null, hostSource('orders'))])).ok,
    ).toBe(true);
    expect(requests).toHaveLength(1);

    renderer.refreshData('refreshable');
    renderer.refreshData('refreshable');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.aborted).toBe(false);

    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    renderer.refreshData('refreshable');
    expect(requests).toHaveLength(2);
  });

  it('a newly mounted resource with an unavailable port reaches HOST_RESOURCE_UNAVAILABLE immediately', async () => {
    vi.useFakeTimers();
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      resourceTimeoutMs: 100,
    });

    expect(
      renderer.render(document([component('no-port', 0, null, hostSource('orders'))])).ok,
    ).toBe(true);
    // Fully synchronous terminal path: no deferred host promise exists, so the
    // first resolve must apply to the just-committed mount.
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_UNAVAILABLE',
      message: 'Host resource port is unavailable.',
    });

    // The timeout timer must have been cleared; advancing past the deadline
    // must not flip the terminal state to a timeout error.
    await vi.advanceTimersByTimeAsync(500);
    expect(root.children[0]?.model?.dataState).toMatchObject({
      code: 'HOST_RESOURCE_UNAVAILABLE',
    });
  });

  it('a synchronously throwing resolve immediately reaches HOST_RESOURCE_FAILED, not permanent loading', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: () => {
          throw new Error('sync boom');
        },
      },
    });

    expect(
      renderer.render(document([component('throwing', 0, null, hostSource('orders'))])).ok,
    ).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    });
  });

  it('a same-id material type replacement applies the immediate terminal state to its new mount', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: (() => {
        const a = createCatalog('base.a');
        const b = createCatalog('base.b');
        return {
          get: (type: string) => (type === 'base.a' ? a.get('base.a') : b.get('base.b')),
          has: (type: string) => type === 'base.a' || type === 'base.b',
          list: () => [...a.list(), ...b.list()],
        } as BaseScreenMaterialCatalog;
      })(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const source = hostSource('orders');
    const first = { ...component('swap', 0, null, source), type: 'base.a' };
    const second = { ...component('swap', 0, null, source), type: 'base.b' };

    expect(renderer.render(document([first])).ok).toBe(true);
    expect(root.children[0]?.model?.dataState).toMatchObject({
      code: 'HOST_RESOURCE_UNAVAILABLE',
    });
    const oldElement = root.children[0];

    expect(renderer.render(document([second])).ok).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).not.toBe(oldElement);
    expect(oldElement?.removed).toBe(true);
    expect(root.children[0]?.model?.dataState).toMatchObject({
      code: 'HOST_RESOURCE_UNAVAILABLE',
    });

    await Promise.resolve();
    await Promise.resolve();

    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toMatchObject({
      code: 'HOST_RESOURCE_UNAVAILABLE',
    });
  });
});
