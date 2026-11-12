import { describe, expect, it } from 'vitest';
import { createRestDatasetPort } from '../src/index.js';

const ENTRY = { datasetId: 'orders', name: '订单数据', description: null };
const DEFINITION = {
  datasetId: 'orders',
  name: '订单数据',
  description: null,
  fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
  parameters: [],
};
const TABULAR = {
  fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
  rows: [{ amount: 1 }],
  totalRowCount: 1,
};

interface Call {
  readonly url: string;
  readonly signalAborted: boolean;
  readonly method: string;
  readonly body: unknown;
}

function routingFetch(handler: (call: Call) => { ok: boolean; status: number; body?: unknown }): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const call: Call = {
      url: String(input),
      signalAborted: init?.signal?.aborted ?? false,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const reply = handler(call);
    return { ok: reply.ok, status: reply.status, json: async () => reply.body } as Response;
  };
  return { fetch: fetchImpl, calls };
}

const signal = () => new AbortController().signal;

describe('createRestDatasetPort', () => {
  it('opts into dataset query scope', () => {
    const port = createRestDatasetPort({ baseUrl: 'http://x/api' });
    expect(port.queryScope).toBe('dataset');
  });

  it('list strips groups before parsing strict entries', async () => {
    const { fetch } = routingFetch(() => ({
      ok: true,
      status: 200,
      body: { groups: [{ id: 'custom', name: '自定义' }], items: [ENTRY] },
    }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.list({ query: '', limit: 10, signal: signal() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.items).toEqual([ENTRY]);
  });

  it('list maps 404 to HOST_DATASET_UNAVAILABLE', async () => {
    const { fetch } = routingFetch(() => ({
      ok: false,
      status: 404,
      body: { error: 'UNKNOWN_DATASET', message: 'nope' },
    }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.list({ query: '', limit: 10, signal: signal() });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_UNAVAILABLE' }],
    });
  });

  it('list rejects a shape without items as HOST_DATASET_INVALID', async () => {
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: { groups: [] } }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.list({ query: '', limit: 10, signal: signal() });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_INVALID' }] });
  });

  it('describe parses a valid definition', async () => {
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: DEFINITION }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.describe({ datasetId: 'orders', signal: signal() });
    expect(result.ok).toBe(true);
  });

  it('describe maps 400 to HOST_DATASET_PARAMETER_INVALID', async () => {
    const { fetch } = routingFetch(() => ({
      ok: false,
      status: 400,
      body: { error: 'INVALID_REQUEST', message: 'bad' },
    }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.describe({ datasetId: 'orders', signal: signal() });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_PARAMETER_INVALID' }],
    });
  });

  it('query sends declared params, never componentId, and parses tabular', async () => {
    const { fetch, calls } = routingFetch(() => ({ ok: true, status: 200, body: TABULAR }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.query(
      { datasetId: 'orders', dataSourceId: 'ds-1', params: { region: '华东', nested: { x: 1 } } },
      { signal: signal() },
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toContain('/datasets/orders/query?region=');
    expect(calls[0]?.url).not.toContain('componentId');
    expect(calls[0]?.url).not.toContain('nested');
  });

  it('query preserves true and false boolean parameters', async () => {
    const { fetch, calls } = routingFetch(() => ({ ok: true, status: 200, body: TABULAR }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    await port.query(
      { datasetId: 'orders', dataSourceId: 'ds-1', params: { enabled: true, archived: false } },
      { signal: signal() },
    );
    expect(calls[0]?.url).toBe('http://x/api/datasets/orders/query?enabled=true&archived=false');
  });

  it('list passes an opaque cursor and preserves nextCursor', async () => {
    const { fetch, calls } = routingFetch(() => ({
      ok: true,
      status: 200,
      body: { items: [ENTRY], groups: [], nextCursor: 'page:2/+' },
    }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.list({ query: '', limit: 10, cursor: 'page:1/+', signal: signal() });
    expect(calls[0]?.url).toContain('cursor=page%3A1%2F%2B');
    expect(result).toMatchObject({ ok: true, value: { nextCursor: 'page:2/+' } });
  });

  it('maps custom URLs, methods, bodies and envelopes for all operations', async () => {
    const { fetch, calls } = routingFetch(({ url }) => ({
      ok: true,
      status: 200,
      body: {
        result: url.endsWith('/folders')
          ? [{ id: 'sales', name: '销售' }]
          : url.endsWith('/search')
            ? { items: [ENTRY], nextCursor: 'opaque:next' }
            : url.endsWith('/schema/orders')
              ? DEFINITION
              : TABULAR,
      },
    }));
    const unwrap = (payload: unknown) => {
      if (payload === null || typeof payload !== 'object' || !('result' in payload)) {
        throw new Error('响应格式无效');
      }
      return payload.result;
    };
    const port = createRestDatasetPort({
      baseUrl: 'http://x/existing',
      fetch,
      mapping: {
        groups: { request: () => ({ path: '/folders' }), response: unwrap },
        list: {
          request: ({ query, cursor }) => ({
            path: '/search',
            method: 'POST',
            body: { query, cursor },
          }),
          response: unwrap,
        },
        describe: {
          request: ({ datasetId }) => ({ path: `/schema/${datasetId}` }),
          response: unwrap,
        },
        query: {
          request: ({ datasetId, params }) => ({
            path: '/run',
            method: 'POST',
            body: { datasetId, params },
          }),
          response: unwrap,
        },
      },
    });
    expect((await port.groups?.({ signal: signal() }))?.ok).toBe(true);
    expect(
      await port.list({ query: '销售', cursor: 'cursor:1', limit: 10, signal: signal() }),
    ).toMatchObject({
      ok: true,
      value: { items: [ENTRY], nextCursor: 'opaque:next' },
    });
    expect((await port.describe({ datasetId: 'orders', signal: signal() })).ok).toBe(true);
    expect(
      (
        await port.query(
          { datasetId: 'orders', dataSourceId: 'ds', params: { enabled: false } },
          { signal: signal() },
        )
      ).ok,
    ).toBe(true);
    expect(calls.map(({ url, method, body }) => ({ url, method, body }))).toEqual([
      { url: 'http://x/existing/folders', method: 'GET', body: undefined },
      {
        url: 'http://x/existing/search',
        method: 'POST',
        body: { query: '销售', cursor: 'cursor:1' },
      },
      { url: 'http://x/existing/schema/orders', method: 'GET', body: undefined },
      {
        url: 'http://x/existing/run',
        method: 'POST',
        body: { datasetId: 'orders', params: { enabled: false } },
      },
    ]);
  });

  it('rejects malformed default and mapped responses without throwing', async () => {
    for (const body of [null, [], { groups: [{ id: 'x', name: 42 }] }]) {
      const { fetch } = routingFetch(() => ({ ok: true, status: 200, body }));
      const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
      expect(await port.groups?.({ signal: signal() })).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'HOST_DATASET_INVALID' }],
      });
    }
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: null }));
    const port = createRestDatasetPort({
      baseUrl: 'http://x/api',
      fetch,
      mapping: {
        list: { response: () => ({ items: [ENTRY], nextCursor: 42 }) },
        describe: {
          response: () => {
            throw new Error('无法读取 envelope');
          },
        },
        query: { response: () => ({ fields: [], rows: 'invalid' }) },
      },
    });
    for (const result of [
      await port.list({ query: '', limit: 10, signal: signal() }),
      await port.describe({ datasetId: 'orders', signal: signal() }),
      await port.query(
        { datasetId: 'orders', dataSourceId: 'ds', params: {} },
        { signal: signal() },
      ),
    ])
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_INVALID' }] });
  });

  it('returns diagnostics for throwing request mappers across all operations', async () => {
    const { fetch, calls } = routingFetch(() => ({ ok: true, status: 200, body: null }));
    const throwing = {
      request: () => {
        throw new Error('请求映射失败');
      },
    };
    const port = createRestDatasetPort({
      baseUrl: 'http://x/api',
      fetch,
      mapping: {
        groups: throwing,
        list: throwing,
        describe: throwing,
        query: throwing,
      },
    });
    for (const result of [
      await port.groups?.({ signal: signal() }),
      await port.list({ query: '', limit: 10, signal: signal() }),
      await port.describe({ datasetId: 'orders', signal: signal() }),
      await port.query(
        { datasetId: 'orders', dataSourceId: 'ds', params: {} },
        { signal: signal() },
      ),
    ])
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_INVALID' }] });
    expect(calls).toHaveLength(0);
  });

  it('returns empty diagnostics when cancelled during request or response projection', async () => {
    for (const stage of ['request', 'response'] as const) {
      for (const throws of [false, true]) {
        const controller = new AbortController();
        const { fetch, calls } = routingFetch(() => ({ ok: true, status: 200, body: null }));
        const port = createRestDatasetPort({
          baseUrl: 'http://x/api',
          fetch,
          mapping: {
            query: {
              [stage]: () => {
                controller.abort();
                if (throws) throw new Error('取消中的投影');
                return stage === 'request' ? { path: '/custom' } : TABULAR;
              },
            },
          },
        });
        expect(
          await port.query(
            { datasetId: 'orders', dataSourceId: 'ds', params: {} },
            { signal: controller.signal },
          ),
        ).toEqual({ ok: false, diagnostics: [] });
        expect(calls).toHaveLength(stage === 'request' ? 0 : 1);
      }
    }
  });

  it('query returns empty diagnostics when cancelled', async () => {
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: TABULAR }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const controller = new AbortController();
    controller.abort();
    const result = await port.query(
      { datasetId: 'orders', dataSourceId: 'ds-1', params: {} },
      { signal: controller.signal },
    );
    expect(result).toEqual({ ok: false, diagnostics: [] });
  });

  it('keeps custom request cancellation and HTTP errors on the port path', async () => {
    const controller = new AbortController();
    const port = createRestDatasetPort({
      baseUrl: 'http://x/api',
      fetch: async (_input, init) => {
        controller.abort();
        expect(init?.signal?.aborted).toBe(true);
        throw new DOMException('aborted', 'AbortError');
      },
      mapping: { query: { request: () => ({ path: '/run', method: 'POST' }) } },
    });
    expect(
      await port.query(
        { datasetId: 'orders', dataSourceId: 'ds', params: {} },
        { signal: controller.signal },
      ),
    ).toEqual({ ok: false, diagnostics: [] });
    const { fetch } = routingFetch(() => ({
      ok: false,
      status: 422,
      body: { problem: 'invalid' },
    }));
    const failed = createRestDatasetPort({
      baseUrl: 'http://x/api',
      fetch,
      mapping: {
        list: {
          request: () => ({ path: '/search', method: 'POST' }),
          response: () => {
            throw new Error('HTTP 错误不应映射成功响应');
          },
        },
      },
    });
    expect(await failed.list({ query: '', limit: 10, signal: signal() })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_PARAMETER_INVALID' }],
    });
  });

  it('query maps 5xx to HOST_DATASET_UNAVAILABLE', async () => {
    const { fetch } = routingFetch(() => ({ ok: false, status: 500 }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const result = await port.query(
      { datasetId: 'orders', dataSourceId: 'ds-1', params: {} },
      { signal: signal() },
    );
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_UNAVAILABLE' }],
    });
  });

  it('groups reuses list and caches within TTL', async () => {
    const { fetch, calls } = routingFetch(() => ({
      ok: true,
      status: 200,
      body: { groups: [{ id: 'custom', name: '自定义' }], items: [] },
    }));
    const port = createRestDatasetPort({ baseUrl: 'http://x/api', fetch });
    const first = await port.groups?.({ signal: signal() });
    const second = await port.groups?.({ signal: signal() });
    expect(first?.ok).toBe(true);
    expect(second?.ok).toBe(true);
    expect(calls.length).toBe(1);
  });
});
