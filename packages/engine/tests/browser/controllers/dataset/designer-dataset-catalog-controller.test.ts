import type {
  ScreenDatasetEntries,
  ScreenHostDatasetPort,
  ScreenParseResult,
} from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DATASET_SEARCH_DEBOUNCE_MS,
  DesignerDatasetCatalogController,
} from '../../../../src/browser/controllers/dataset/designer-dataset-catalog-controller.js';
import { resolveDatasetCatalogEmpty } from '../../../../src/browser/dom/dataset/designer-dataset-catalog-dom.js';

const success = <T>(value: T): ScreenParseResult<T> => ({
  ok: true,
  value,
  diagnostics: [],
});

const entries: ScreenDatasetEntries = {
  items: [
    { datasetId: 'orders', name: '订单', description: null },
    { datasetId: 'orders-daily', name: '订单明细', description: null },
  ],
};

function createPort() {
  const list = vi.fn<ScreenHostDatasetPort['list']>(async (request) =>
    success({
      items: entries.items.filter((item) => item.name.includes(request.query)),
      ...(request.query === 'order' ? { nextCursor: 'page-2' } : {}),
    }),
  );
  // 目录用例只关心 list：describe/query 由预览用例覆盖，这里不重复搭桩。
  const port = { list } as unknown as ScreenHostDatasetPort;
  return { port, list };
}

function createController(port: ScreenHostDatasetPort) {
  const render = vi.fn();
  const renderResults = vi.fn();
  const controller = new DesignerDatasetCatalogController({
    getPort: () => port,
    report: vi.fn(),
    setFeedback: vi.fn(),
    render,
    renderResults,
  });
  return { controller, render, renderResults };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DesignerDatasetCatalogController', () => {
  it('coalesces keystrokes into one host request instead of one query per key', async () => {
    vi.useFakeTimers();
    const { port, list } = createPort();
    const { controller } = createController(port);

    for (const query of ['订', '订单', '订单明']) controller.updateQuery(query);
    expect(list).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DATASET_SEARCH_DEBOUNCE_MS);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[0]).toMatchObject({ query: '订单明' });
    expect(controller.items).toHaveLength(1);
  });

  it('patches only the result region when a listing arrives', async () => {
    vi.useFakeTimers();
    const { controller, render, renderResults } = createController(createPort().port);

    controller.updateQuery('订单');
    await vi.advanceTimersByTimeAsync(DATASET_SEARCH_DEBOUNCE_MS);

    // 一次是「请求中」的状态灯更新，一次是结果落盘：两次都只动段，不动整块面板。
    expect(renderResults).toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('does not append a page while a debounced query is still pending', async () => {
    vi.useFakeTimers();
    const { port, list } = createPort();
    const { controller } = createController(port);

    controller.updateQuery('order');
    await vi.advanceTimersByTimeAsync(DATASET_SEARCH_DEBOUNCE_MS);
    expect(controller.cursor).toBe('page-2');

    controller.updateQuery('orders');
    controller.loadMore();
    await vi.advanceTimersByTimeAsync(DATASET_SEARCH_DEBOUNCE_MS);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls.every(([request]) => request.cursor === undefined)).toBe(true);
  });

  it('drops the pending query on clear so a stale listing cannot land in a new panel', async () => {
    vi.useFakeTimers();
    const { port, list } = createPort();
    const { controller } = createController(port);

    controller.updateQuery('订单');
    controller.clear();
    await vi.advanceTimersByTimeAsync(DATASET_SEARCH_DEBOUNCE_MS);

    expect(list).not.toHaveBeenCalled();
    expect(controller.items).toHaveLength(0);
  });
});

describe('host link status', () => {
  it('reports a failed listing with the host diagnostic code and clears it after retry', async () => {
    let fail = true;
    const list = vi.fn<ScreenHostDatasetPort['list']>(async () =>
      fail
        ? {
            ok: false,
            diagnostics: [
              {
                severity: 'error' as const,
                code: 'HOST_RESOURCE_ACCESS_DENIED' as const,
                path: [],
                message: 'Denied.',
              },
            ],
          }
        : success({ items: entries.items }),
    );
    const renderResults = vi.fn();
    const controller = new DesignerDatasetCatalogController({
      getPort: () => ({ list }) as unknown as ScreenHostDatasetPort,
      report: vi.fn(),
      setFeedback: vi.fn(),
      render: vi.fn(),
      renderResults,
    });

    controller.ensureList();
    await vi.waitFor(() => expect(controller.status).toBe('error'));
    expect(controller.error).toBe('HOST_RESOURCE_ACCESS_DENIED');
    // 失败态本身要能被看到：状态灯所在段必须重画。
    expect(renderResults).toHaveBeenCalled();

    fail = false;
    controller.retry();
    await vi.waitFor(() => expect(controller.status).toBe('ready'));
    expect(controller.error).toBeUndefined();
  });

  it('reports a missing catalog port as unavailable instead of a green light', async () => {
    const controller = new DesignerDatasetCatalogController({
      getPort: () => undefined,
      report: vi.fn(),
      setFeedback: vi.fn(),
      render: vi.fn(),
    });

    controller.ensureList();
    await vi.waitFor(() => expect(controller.status).toBe('unavailable'));

    expect(controller.status).toBe('unavailable');
    expect(controller.items).toHaveLength(0);
  });
});

describe('resolveDatasetCatalogEmpty', () => {
  it('separates a missing host catalog from an empty one and from a miss', () => {
    expect(
      resolveDatasetCatalogEmpty({ catalogAvailable: true, items: entries.items, query: '' }),
    ).toBeUndefined();
    expect(resolveDatasetCatalogEmpty({ catalogAvailable: false, items: [], query: '' })).toBe(
      'unavailable',
    );
    expect(resolveDatasetCatalogEmpty({ catalogAvailable: true, items: [], query: 'abc' })).toBe(
      'no-match',
    );
    expect(resolveDatasetCatalogEmpty({ catalogAvailable: true, items: [], query: '  ' })).toBe(
      'empty',
    );
  });
});
