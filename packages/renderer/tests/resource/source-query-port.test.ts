import type {
  ScreenDatasetDefinition,
  ScreenDatasetDescribeRequest,
  ScreenHostCatalogPort,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenParseResult,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceRequestCoordinator } from '../../src/resource/request-coordinator.js';
import {
  SOURCE_SHARE_DATASET,
  SourceQueryPort,
  type SourceQueryRequest,
} from '../../src/resource/source-query-port.js';

const fields = [{ id: 'value', label: 'Value', valueType: 'number' as const }];
const definition: ScreenDatasetDefinition = {
  datasetId: 'publication:a',
  name: 'A',
  description: null,
  fields,
  parameters: [{ name: 'region', label: 'Region', valueType: 'string', required: true }],
};
const rows: ScreenTabularDataset = { fields, rows: [{ value: 4 }] };
const success = <T>(value: T): ScreenParseResult<T> => ({ ok: true, value, diagnostics: [] });

function datasetRequest(overrides: Partial<SourceQueryRequest> = {}): SourceQueryRequest {
  return {
    dataSourceId: 'orders',
    source: { kind: 'dataset', datasetId: definition.datasetId },
    params: { region: 'north' },
    ...overrides,
  };
}

const host = (): ScreenHostDatasetPort => ({
  queryScope: 'dataset',
  list: vi.fn(async () => success({ items: [] })),
  describe: vi.fn(async () => success(definition)),
  query: vi.fn(async () => success(rows)),
});

afterEach(() => vi.useRealTimers());

describe('source query port · dataset', () => {
  it('validates parameters before query and reuses only successful immutable metadata', async () => {
    const datasets = host();
    const port = new SourceQueryPort(undefined, datasets, undefined);
    const options = { signal: new AbortController().signal };
    expect((await port.query(datasetRequest({ params: {} }), options)).ok).toBe(false);
    expect(datasets.query).not.toHaveBeenCalled();
    expect((await port.query(datasetRequest(), options)).ok).toBe(true);
    expect(datasets.describe).toHaveBeenCalledTimes(1);
    expect(datasets.query).toHaveBeenCalledTimes(1);
    port.clear();
    await port.query(datasetRequest(), options);
    expect(datasets.describe).toHaveBeenCalledTimes(2);
  });

  it('does not query after metadata cancellation or accept output field drift', async () => {
    const datasets = host();
    const control = new AbortController();
    datasets.describe = vi.fn(async () => {
      control.abort();
      return success(definition);
    });
    const port = new SourceQueryPort(undefined, datasets, undefined);
    expect(await port.query(datasetRequest(), { signal: control.signal })).toEqual({
      ok: false,
      diagnostics: [],
    });
    expect(datasets.query).not.toHaveBeenCalled();
    datasets.describe = vi.fn(async () => success(definition));
    datasets.query = vi.fn(async () =>
      success({
        fields: [{ id: 'other', label: 'Other', valueType: 'number' as const }],
        rows: [],
      }),
    );
    expect((await port.query(datasetRequest(), { signal: new AbortController().signal })).ok).toBe(
      false,
    );
  });

  it('shares one metadata/query budget and cancels only when the last consumer leaves', async () => {
    vi.useFakeTimers();
    const datasets = host();
    let signal: { readonly aborted: boolean } | undefined;
    datasets.describe = vi.fn(({ signal: current }: ScreenDatasetDescribeRequest) => {
      signal = current;
      return new Promise<ScreenParseResult<ScreenDatasetDefinition>>((resolve) =>
        setTimeout(() => resolve(success(definition)), 60),
      );
    });
    datasets.query = vi.fn(
      () =>
        new Promise<ScreenParseResult<ScreenTabularDataset>>((resolve) =>
          setTimeout(() => resolve(success(rows)), 100),
        ),
    );
    const sourcePort = new SourceQueryPort(undefined, datasets, undefined);
    const coordinator = new ResourceRequestCoordinator<SourceQueryRequest>(
      { resolve: (request, options) => sourcePort.query(request, options) },
      () => true,
      100,
    );
    const first = coordinator.request('same', SOURCE_SHARE_DATASET, 'a', datasetRequest());
    const second = coordinator.request(
      'same',
      SOURCE_SHARE_DATASET,
      'b',
      datasetRequest({ dataSourceId: 'orders-2' }),
    );
    expect(second.shared).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    coordinator.release(first.slotId, 'a');
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(datasets.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40);
    expect(await second.resolution).toEqual({ kind: 'timeout' });
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(coordinator.pending).toBe(0);
  });

  it('rejects metadata for a different publication without issuing a query', async () => {
    const datasets = host();
    datasets.describe = vi.fn(async () =>
      success({ ...definition, datasetId: 'publication:other' }),
    );
    expect(
      (
        await new SourceQueryPort(undefined, datasets, undefined).query(datasetRequest(), {
          signal: new AbortController().signal,
        })
      ).ok,
    ).toBe(false);
    expect(datasets.query).not.toHaveBeenCalled();
  });
});

describe('source query port · 三种来源分派', () => {
  it('routes host-resource sources to the resource port with the instance id', async () => {
    const resolve = vi.fn<ScreenHostResourcePort['resolve']>(async () => success('ok'));
    const port = new SourceQueryPort({ resolve }, undefined, undefined);
    await port.query(
      {
        dataSourceId: 'ds-1',
        source: { kind: 'host-resource', resourceType: 'dataset', resourceId: 'orders' },
        params: { limit: 2 },
      },
      { signal: new AbortController().signal },
    );
    expect(resolve).toHaveBeenCalledWith(
      { dataSourceId: 'ds-1', resourceType: 'dataset', resourceId: 'orders', params: { limit: 2 } },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('routes host-catalog and url-query sources to the catalog port', async () => {
    const resolve = vi.fn<ScreenHostCatalogPort['resolve']>(async () => success('north'));
    const port = new SourceQueryPort(undefined, undefined, {
      list: async () => success({ items: [] }),
      describe: async () => ({ ok: false as const, diagnostics: [] }),
      resolve,
    });
    const signal = new AbortController().signal;
    await port.query(
      { dataSourceId: 'ds-1', source: { kind: 'host-catalog', sourceId: 'tenant' }, params: {} },
      { signal },
    );
    await port.query(
      { dataSourceId: 'ds-2', source: { kind: 'url-query', sourceId: 'campaign' }, params: {} },
      { signal },
    );
    expect(resolve).toHaveBeenCalledWith({
      sourceId: 'tenant',
      params: {},
      purpose: 'runtime',
      signal,
    });
    expect(resolve).toHaveBeenCalledWith({
      sourceId: 'campaign',
      params: {},
      purpose: 'runtime',
      signal,
    });
  });

  it('reports which sources it can serve', () => {
    expect(
      new SourceQueryPort(undefined, host(), undefined).accepts({
        kind: 'dataset',
        datasetId: 'a',
      }),
    ).toBe(true);
    expect(
      new SourceQueryPort(undefined, undefined, undefined).accepts({
        kind: 'dataset',
        datasetId: 'a',
      }),
    ).toBe(false);
    expect(
      new SourceQueryPort(undefined, undefined, undefined).accepts({
        kind: 'url-query',
        sourceId: 'x',
      }),
    ).toBe(false);
  });
});
