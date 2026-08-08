import { describe, expect, it } from 'vitest';
import { parseBaseScreenChartData, parseBaseScreenTableData } from '../src/index.js';

describe('official chart and table data contracts', () => {
  it('parses a detached table dataset with dynamic row keys', () => {
    const input = {
      columns: [
        { id: 'name', label: 'Name', valueType: 'string', sortable: true, filterable: true },
        { id: 'amount', label: 'Amount', valueType: 'number', sortable: true, filterable: false },
      ],
      rows: [{ name: 'North', amount: 12, extra: 'private row data' }],
      totalRowCount: 10,
    };

    const result = parseBaseScreenTableData(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(input);
      expect(result.value).not.toBe(input);
      expect(result.value.rows[0]).not.toBe(input.rows[0]);
    }
  });

  it('rejects duplicate table columns and unknown contract fields', () => {
    const result = parseBaseScreenTableData({
      columns: [
        { id: 'name', label: 'Name', valueType: 'string', sortable: true, filterable: true },
        { id: 'name', label: 'Duplicate', valueType: 'string', sortable: false, filterable: false },
      ],
      rows: [],
      query: 'owned by the host',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.path.join('.') === 'query')).toBe(true);
      expect(result.diagnostics.some((item) => item.path.join('.') === 'columns.1.id')).toBe(true);
    }
  });

  it('parses chart series and points without defining a chart library option shape', () => {
    const input = {
      series: [
        {
          id: 'revenue',
          label: 'Revenue',
          points: [
            { x: 'Jan', y: 12 },
            { x: 'Feb', y: 18 },
          ],
        },
      ],
    };

    const result = parseBaseScreenChartData(input);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(input);
  });

  it('rejects duplicate series and invalid point values', () => {
    const result = parseBaseScreenChartData({
      series: [
        { id: 'revenue', label: 'Revenue', points: [{ x: 1, y: 2 }] },
        { id: 'revenue', label: 'Revenue copy', points: [{ x: 2, y: 'invalid' }] },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((item) => item.path.join('.') === 'series.1.id')).toBe(true);
    }
  });
});
