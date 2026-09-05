import type {
  ScreenDatasetDefinition,
  ScreenDatasetDescribeRequest,
  ScreenHostDatasetPort,
  ScreenHostResourceRequest,
  ScreenParseResult,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATASET_QUERY_KIND, DatasetQueryPort } from '../../src/resource/dataset-query-port.js';
import { ResourceRequestCoordinator } from '../../src/resource/request-coordinator.js';

const fields = [{ id: 'value', label: 'Value', valueType: 'number' as const }];
const definition: ScreenDatasetDefinition = {
  datasetId: 'publication:a',
  name: 'A',
  description: null,
  fields,
  parameters: [{ name: 'region', label: 'Region', valueType: 'string', required: true }],
};
const rows: ScreenTabularDataset = { fields, rows: [{ value: 4 }] };
const request: ScreenHostResourceRequest = {
  resourceType: DATASET_QUERY_KIND,
  resourceId: definition.datasetId,
  componentId: 'a',
  params: { region: 'north' },
};
const success = <T>(value: T): ScreenParseResult<T> => ({ ok: true, value, diagnostics: [] });
const host = (): ScreenHostDatasetPort => ({
  queryScope: 'dataset',
  list: vi.fn(async () => success({ items: [] })),
  describe: vi.fn(async () => success(definition)),
  query: vi.fn(async () => success(rows)),
});

afterEach(() => vi.useRealTimers());

describe('dataset metadata and query lifecycle', () => {
  it('validates parameters before query and reuses only successful immutable metadata', async () => {
    const datasets = host();
    const port = new DatasetQueryPort(undefined, datasets);
    const options = { signal: new AbortController().signal };
    expect((await port.resolve({ ...request, params: {} }, options)).ok).toBe(false);
    expect(datasets.query).not.toHaveBeenCalled();
    expect((await port.resolve(request, options)).ok).toBe(true);
    expect(datasets.describe).toHaveBeenCalledTimes(1);
    expect(datasets.query).toHaveBeenCalledTimes(1);
    port.clear();
    await port.resolve(request, options);
    expect(datasets.describe).toHaveBeenCalledTimes(2);
  });

  it('does not query after metadata cancellation or accept output field drift', async () => {
    const datasets = host();
    const control = new AbortController();
    datasets.describe = vi.fn(async () => {
      control.abort();
      return success(definition);
    });
    const port = new DatasetQueryPort(undefined, datasets);
    expect(await port.resolve(request, { signal: control.signal })).toEqual({
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
    expect((await port.resolve(request, { signal: new AbortController().signal })).ok).toBe(false);
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
    const coordinator = new ResourceRequestCoordinator(
      new DatasetQueryPort(undefined, datasets),
      () => true,
      100,
    );
    const first = coordinator.request('same', DATASET_QUERY_KIND, 'a', request);
    const second = coordinator.request('same', DATASET_QUERY_KIND, 'b', {
      ...request,
      componentId: 'b',
    });
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
        await new DatasetQueryPort(undefined, datasets).resolve(request, {
          signal: new AbortController().signal,
        })
      ).ok,
    ).toBe(false);
    expect(datasets.query).not.toHaveBeenCalled();
  });
});
