import { describe, expect, it } from 'vitest';
import {
  MAX_DATASET_FIELDS,
  MAX_DATASET_ROWS,
  parseScreenDatasetDescriptor,
  parseScreenDatasetPage,
  parseScreenTabularDataset,
} from '../../src/index.js';

describe('host tabular dataset contracts', () => {
  it('R1 parses a detached tabular dataset with matching scalar and null cells', () => {
    const input = {
      fields: [
        { id: 'order-id', label: '订单', valueType: 'string' },
        { id: 'amount', label: '金额', valueType: 'number' },
        { id: 'paid', label: '已支付', valueType: 'boolean' },
        { id: 'created-at', label: '日期', valueType: 'date' },
      ],
      rows: [
        {
          'order-id': 'A-1',
          amount: 12.5,
          paid: true,
          'created-at': '2026-08-07T08:00:00Z',
        },
        { 'order-id': 'A-2', amount: null, paid: false, 'created-at': null },
      ],
      totalRowCount: 2,
    };
    const result = parseScreenTabularDataset(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(input);
      expect(result.value).not.toBe(input);
      expect(result.value.rows[0]).not.toBe(input.rows[0]);
    }
  });

  it('R1 rejects unknown/duplicate/over-limit fields and invalid row cells', () => {
    const cases = [
      {
        fields: [
          { id: 'value', label: '值', valueType: 'number' },
          { id: 'value', label: '重复', valueType: 'number' },
        ],
        rows: [],
      },
      {
        fields: [{ id: 'value', label: '值', valueType: 'number' }],
        rows: [{ unknown: 1 }],
      },
      {
        fields: [{ id: 'value', label: '值', valueType: 'number' }],
        rows: [{ value: '1' }],
      },
      {
        fields: [{ id: 'when', label: '日期', valueType: 'date' }],
        rows: [{ when: 'not-a-date' }],
      },
      {
        fields: Array.from({ length: MAX_DATASET_FIELDS + 1 }, (_, index) => ({
          id: `field-${index}`,
          label: '字段',
          valueType: 'string',
        })),
        rows: [],
      },
      {
        fields: [{ id: 'value', label: '值', valueType: 'number' }],
        rows: Array.from({ length: MAX_DATASET_ROWS + 1 }, () => ({ value: 1 })),
      },
    ];
    for (const input of cases) {
      expect(parseScreenTabularDataset(input)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'HOST_DATASET_INVALID' }],
      });
    }
  });

  it('R2 strictly parses safe descriptors and opaque catalog pages', () => {
    const descriptor = parseScreenDatasetDescriptor({
      resourceType: 'dataset',
      resourceId: 'orders',
      name: '订单数据',
      description: null,
      fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
      parameters: [
        {
          name: 'region',
          label: '区域',
          valueType: 'string',
          editor: 'text',
          required: true,
        },
      ],
    });
    const page = parseScreenDatasetPage({
      items: [
        { resourceType: 'dataset', resourceId: 'orders', name: '订单数据', description: null },
      ],
      nextCursor: 'opaque-next-page',
    });
    expect(descriptor).toMatchObject({ ok: true });
    expect(page).toMatchObject({ ok: true });
    expect(
      parseScreenDatasetDescriptor({
        resourceType: 'dataset',
        resourceId: 'orders',
        name: '订单数据',
        description: null,
        fields: [],
        parameters: [],
        token: 'secret',
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_DESCRIPTOR_INVALID' }] });
  });
});
