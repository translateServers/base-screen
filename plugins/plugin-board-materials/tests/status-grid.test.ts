import { describe, expect, it } from 'vitest';
import {
  buildStatusLegend,
  computeStatusGridLayout,
  STATUS_GRID_LEGEND_ORDER,
  STATUS_GRID_MAX_COLUMNS,
  STATUS_GRID_MIN_TILE_SIZE,
} from '../src/status-grid.js';
import { createBoardStateAdapter, readBoardStateRows } from '../src/tabular-columns-adapter.js';

/**
 * 灯阵的几何与计数都在纯函数层断言：物料不测量 DOM，`model.size` 决定容量，因此
 * "48 台设备必需 6 行"这类结论可以离线跑，不必等浏览器。
 */
describe('computeStatusGridLayout', () => {
  const base = {
    width: 588,
    height: 404,
    columns: 8,
    tileGap: 6,
    minTileSize: STATUS_GRID_MIN_TILE_SIZE,
  };

  it('lays 48 tiles out in 6 rows of 8 with no overflow', () => {
    const layout = computeStatusGridLayout({ ...base, total: 48 });

    expect(layout.columns).toBe(8);
    expect(layout.rows).toBe(6);
    expect(layout.capacity).toBeGreaterThanOrEqual(48);
    expect(layout.visible).toBe(48);
    expect(layout.hidden).toBe(0);
  });

  it('reports the overflow count when capacity is 48 and there are 70 rows', () => {
    // 高度只够 6 行（18 px 格子 + 6 px 间距）。
    const layout = computeStatusGridLayout({ ...base, height: 6 * 18 + 5 * 6, total: 70 });

    expect(layout.rows).toBe(6);
    expect(layout.capacity).toBe(48);
    expect(layout.visible).toBe(48);
    expect(layout.hidden).toBe(22);
  });

  it('keeps one row of capacity for an empty dataset so the skeleton matches', () => {
    const layout = computeStatusGridLayout({ ...base, total: 0 });

    expect(layout.rows).toBe(1);
    expect(layout.capacity).toBe(layout.columns);
    expect(layout.visible).toBe(0);
    expect(layout.hidden).toBe(0);
  });

  it('shrinks the column count instead of squashing tiles below the minimum size', () => {
    // 宽度只容得下 4 列（18 px 格子 + 6 px 间距），即使 props 要求 8 列。
    const layout = computeStatusGridLayout({
      ...base,
      width: 4 * 18 + 3 * 6,
      columns: 8,
      total: 8,
    });

    expect(layout.columns).toBe(4);
    expect(layout.capacity).toBeGreaterThanOrEqual(8);
  });

  it('clamps columns to the schema range and never returns a zero column', () => {
    expect(computeStatusGridLayout({ ...base, columns: 99, total: 1 }).columns).toBe(
      STATUS_GRID_MAX_COLUMNS,
    );
    expect(computeStatusGridLayout({ ...base, columns: 0, total: 1 }).columns).toBe(1);
    expect(computeStatusGridLayout({ ...base, width: 0, total: 3 }).columns).toBe(1);
  });

  it('never reports more visible tiles than it has capacity for', () => {
    const layout = computeStatusGridLayout({ ...base, total: 1000 });

    expect(layout.visible).toBe(layout.capacity);
    expect(layout.visible + layout.hidden).toBe(1000);
  });

  /**
   * 容量可能被**高度**限住，而不只是宽度：`columns=1` 时 48 台设备排不出 48 行，
   * 于是出现 `+N`。这条断言守住「一台设备都不能凭空消失」——可见数 + 收口数必须
   * 恒等于收到条数，否则灯阵会静默漏报设备（比报错更危险）。
   */
  it('accounts for every row when the height, not the width, caps the capacity', () => {
    const narrow = computeStatusGridLayout({ ...base, columns: 1, total: 48 });

    expect(narrow.columns).toBe(1);
    expect(narrow.capacity).toBeLessThan(48);
    expect(narrow.visible).toBe(narrow.capacity);
    expect(narrow.hidden).toBe(48 - narrow.capacity);
    expect(narrow.visible + narrow.hidden).toBe(48);
  });

  it('never loses or duplicates rows across the total × columns matrix', () => {
    for (const total of [0, 1, 47, 48, 49, 70, 500]) {
      for (const columns of [1, 2, 8, 24]) {
        const layout = computeStatusGridLayout({ ...base, total, columns });

        expect(layout.visible + layout.hidden, `total=${total} columns=${columns}`).toBe(total);
        expect(layout.visible).toBe(Math.min(total, layout.capacity));
        expect(layout.hidden).toBe(Math.max(0, total - layout.capacity));
        expect(layout.capacity).toBe(layout.columns * layout.rows);
        // 空表也要有骨架容量（否则空态与有数据态的几何不一致）。
        expect(layout.capacity).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('buildStatusLegend', () => {
  it('counts the five states in a fixed order and sums to the row count', () => {
    const items = [
      { name: 'a', status: 'running' },
      { name: 'b', status: 'fault' },
      { name: 'c', status: 'fault' },
      // 不在五态内：归 unknown，不能被丢掉（否则图例合计对不上格数）。
      { name: 'd', status: 'unknown-ish' },
      { name: 'e', status: '' },
    ];

    const counts = buildStatusLegend(items);

    expect(STATUS_GRID_LEGEND_ORDER).toEqual(['running', 'standby', 'fault', 'offline', 'unknown']);
    expect(counts).toEqual({ running: 1, standby: 0, fault: 2, offline: 0, unknown: 2 });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(items.length);
  });

  it('returns five zero counts for an empty list', () => {
    expect(buildStatusLegend([])).toEqual({
      running: 0,
      standby: 0,
      fault: 0,
      offline: 0,
      unknown: 0,
    });
  });
});

describe('status-grid adapter', () => {
  const nameField = { id: 'name', label: '设备', valueType: 'string' as const };
  const statusField = { id: 'status', label: '状态', valueType: 'string' as const };
  const loadField = { id: 'load', label: '负载', valueType: 'number' as const };

  it('projects name/status/value by binding order and keeps row order', () => {
    const adapter = createBoardStateAdapter('items');
    const result = adapter.adapt({
      dataset: {
        // dataset 字段顺序与绑定顺序不同：位置语义只看绑定顺序。
        fields: [statusField, loadField, nameField],
        rows: [
          { name: '1#冲压机', status: 'fault', load: 86 },
          { name: '2#冲床', status: 'running', load: 64 },
        ],
      },
      fields: { items: [nameField, statusField, loadField] },
    });

    if (!result.ok) throw new Error('the adapter must accept a valid binding');
    expect(result.value).toEqual({
      items: [
        { name: '1#冲压机', status: 'fault', value: 86 },
        { name: '2#冲床', status: 'running', value: 64 },
      ],
      total: 2,
    });
  });

  it('normalizes an unknown status to unknown and omits a missing value', () => {
    const result = createBoardStateAdapter('items').adapt({
      dataset: {
        fields: [nameField, statusField],
        rows: [{ name: '未知设备', status: 'MELTING' }],
      },
      fields: { items: [nameField, statusField] },
    });

    if (!result.ok) throw new Error('the adapter must accept a two-column binding');
    expect(result.value).toEqual({ items: [{ name: '未知设备', status: 'unknown' }], total: 1 });
  });

  it('fails closed when the role is missing or has fewer than two columns', () => {
    const adapter = createBoardStateAdapter('items');
    const missing = adapter.adapt({ dataset: { fields: [], rows: [] }, fields: {} });
    expect(missing.ok).toBe(false);
    expect(missing.ok === false ? missing.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );

    const oneColumn = adapter.adapt({
      dataset: { fields: [nameField], rows: [{ name: 'a' }] },
      fields: { items: [nameField] },
    });
    expect(oneColumn.ok).toBe(false);
  });
});

describe('readBoardStateRows', () => {
  it('reads the projected payload back', () => {
    const rows = readBoardStateRows(
      { items: [{ name: 'a', status: 'fault', value: 3 }], total: 1 },
      'items',
    );
    expect(rows).toEqual([{ name: 'a', status: 'fault', value: 3 }]);
  });

  it('returns undefined for a payload it cannot read (so the element degrades)', () => {
    expect(readBoardStateRows(undefined, 'items')).toBeUndefined();
    expect(readBoardStateRows({ items: 'nope' }, 'items')).toBeUndefined();
    expect(readBoardStateRows({ items: [{ name: 'a' }] }, 'items')).toBeUndefined();
    expect(
      readBoardStateRows({ items: [{ name: 'a', status: 'fault', value: 'x' }] }, 'items'),
    ).toBeUndefined();
  });
});
