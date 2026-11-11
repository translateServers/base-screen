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
}

function routingFetch(handler: (call: Call) => { ok: boolean; status: number; body?: unknown }): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const call: Call = { url: String(input), signalAborted: init?.signal?.aborted ?? false };
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
