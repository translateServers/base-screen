import { describe, expect, it } from 'vitest';
import {
  MAX_DATASET_FIELD_FORMAT_LENGTH,
  MAX_DATASET_FIELD_UNIT_LENGTH,
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
          editor: 'text',
          defaultValue: '华东',
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

describe('DRH-R6 public dataset field metadata', () => {
  it('R6 preserves nullable/unit/format as detached parsed field metadata', () => {
    const input = {
      fields: [
        {
          id: 'amount',
          label: '金额',
          valueType: 'number',
          nullable: true,
          unit: '元',
          format: '#,##0.00',
        },
      ],
      rows: [{ amount: null }],
    };
    const result = parseScreenTabularDataset(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fields).toEqual(input.fields);
      expect(result.value.fields[0]).not.toBe(input.fields[0]);
      expect(result.value.fields[0]).toEqual({
        id: 'amount',
        label: '金额',
        valueType: 'number',
        nullable: true,
        unit: '元',
        format: '#,##0.00',
      });
      input.fields[0]!.unit = '已修改';
      expect(result.value.fields[0]!.unit).toBe('元');
    }
    const descriptor = parseScreenDatasetDescriptor({
      resourceType: 'dataset',
      resourceId: 'orders',
      name: '订单数据',
      description: null,
      fields: [
        {
          id: 'amount',
          label: '金额',
          valueType: 'number',
          nullable: false,
          unit: '元',
          format: '#,##0.00"元"',
        },
      ],
      parameters: [],
    });
    expect(descriptor.ok).toBe(true);
    if (descriptor.ok) {
      expect(descriptor.value.fields[0]).toEqual({
        id: 'amount',
        label: '金额',
        valueType: 'number',
        nullable: false,
        unit: '元',
        format: '#,##0.00"元"',
      });
    }
  });

  it('R6 rejects semanticType and any other unknown field metadata keys', () => {
    const rejectField = (field: Record<string, unknown>) =>
      expect(
        parseScreenTabularDataset({
          fields: [{ id: 'amount', label: '金额', ...field }],
          rows: [],
        }),
      ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_INVALID' }] });
    rejectField({ valueType: 'number', semanticType: 'currency' });
    rejectField({ valueType: 'number', color: '#fff' });
    expect(
      parseScreenDatasetDescriptor({
        resourceType: 'dataset',
        resourceId: 'orders',
        name: '订单数据',
        description: null,
        fields: [{ id: 'amount', label: '金额', valueType: 'number', semanticType: 'currency' }],
        parameters: [],
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_DESCRIPTOR_INVALID' }] });
  });

  it('R6 accepts omitted and explicit true nullable with null and missing cells', () => {
    const omitted = parseScreenTabularDataset({
      fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
      rows: [{ amount: null }, {}],
    });
    expect(omitted).toMatchObject({ ok: true });
    const explicitTrue = parseScreenTabularDataset({
      fields: [{ id: 'amount', label: '金额', valueType: 'number', nullable: true }],
      rows: [{ amount: null }, {}],
    });
    expect(explicitTrue).toMatchObject({ ok: true });
  });

  it('R6 rejects null and missing cells for nullable:false fields', () => {
    const nullCell = parseScreenTabularDataset({
      fields: [{ id: 'amount', label: '金额', valueType: 'number', nullable: false }],
      rows: [{ amount: null }],
    });
    expect(nullCell).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_INVALID' }] });
    const missingCell = parseScreenTabularDataset({
      fields: [{ id: 'amount', label: '金额', valueType: 'number', nullable: false }],
      rows: [{}],
    });
    expect(missingCell).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_INVALID' }],
    });
    const present = parseScreenTabularDataset({
      fields: [{ id: 'amount', label: '金额', valueType: 'number', nullable: false }],
      rows: [{ amount: 1 }],
    });
    expect(present).toMatchObject({ ok: true });
  });

  it('R6 enforces unit and format bounds, emptiness, C0/C1 controls, and types', () => {
    const rejectField = (field: Record<string, unknown>) =>
      expect(
        parseScreenTabularDataset({
          fields: [{ id: 'amount', label: '金额', ...field }],
          rows: [],
        }),
      ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_INVALID' }] });
    rejectField({ valueType: 'number', unit: '' });
    rejectField({ valueType: 'number', unit: 'x'.repeat(MAX_DATASET_FIELD_UNIT_LENGTH + 1) });
    rejectField({ valueType: 'number', unit: '\u0000' });
    rejectField({ valueType: 'number', unit: '\u001f' });
    rejectField({ valueType: 'number', unit: '\u007f' });
    rejectField({ valueType: 'number', unit: '\u0080' });
    rejectField({ valueType: 'number', unit: '\u009f' });
    rejectField({ valueType: 'number', unit: 42 });
    rejectField({ valueType: 'number', format: '' });
    rejectField({ valueType: 'number', format: 'x'.repeat(MAX_DATASET_FIELD_FORMAT_LENGTH + 1) });
    rejectField({ valueType: 'number', format: '\u0001' });
    rejectField({ valueType: 'number', format: '\u009f' });
    rejectField({ valueType: 'number', format: false });
    rejectField({ valueType: 'number', nullable: 'yes' });
    const atLimit = parseScreenTabularDataset({
      fields: [
        {
          id: 'amount',
          label: '金额',
          valueType: 'number',
          unit: 'x'.repeat(MAX_DATASET_FIELD_UNIT_LENGTH),
          format: 'x'.repeat(MAX_DATASET_FIELD_FORMAT_LENGTH),
        },
      ],
      rows: [],
    });
    expect(atLimit).toMatchObject({ ok: true });
    expect(
      parseScreenDatasetDescriptor({
        resourceType: 'dataset',
        resourceId: 'orders',
        name: '订单数据',
        description: null,
        fields: [{ id: 'amount', label: '金额', valueType: 'number', unit: '\u0007' }],
        parameters: [],
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_DESCRIPTOR_INVALID' }] });
  });

  it('R6 counts unit and format length in UTF-16 code units, not code points', () => {
    // '🚀' is one code point but two UTF-16 code units.
    const atLimit = parseScreenTabularDataset({
      fields: [
        {
          id: 'amount',
          label: '金额',
          valueType: 'number',
          unit: '🚀'.repeat(MAX_DATASET_FIELD_UNIT_LENGTH / 2),
        },
      ],
      rows: [],
    });
    expect(atLimit).toMatchObject({ ok: true });
    const overLimit = parseScreenTabularDataset({
      fields: [
        {
          id: 'amount',
          label: '金额',
          valueType: 'number',
          unit: '🚀'.repeat(MAX_DATASET_FIELD_UNIT_LENGTH / 2 + 1),
        },
      ],
      rows: [],
    });
    expect(overLimit).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_INVALID' }],
    });
  });

  it('R6 preserves format verbatim as opaque non-executable display text', () => {
    const input = {
      fields: [
        {
          id: 'amount',
          label: '金额',
          valueType: 'number',
          format: '#,##0.00;"负";"零"',
        },
      ],
      rows: [{ amount: -12.5 }],
    };
    const result = parseScreenTabularDataset(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fields[0]!.format).toBe('#,##0.00;"负";"零"');
    }
    const payload = '${globalThis}["process"]';
    const opaque = parseScreenTabularDataset({
      fields: [{ id: 'amount', label: '金额', valueType: 'number', format: payload }],
      rows: [],
    });
    expect(opaque).toMatchObject({ ok: true });
    if (opaque.ok) {
      expect(opaque.value.fields[0]!.format).toBe(payload);
    }
  });
});
