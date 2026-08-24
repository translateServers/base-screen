import { describe, expect, it } from 'vitest';
import { createStaticDataSourceTransaction } from '../../../src/browser/controllers/designer-data-source-authoring.js';

const dataset = {
  fields: [
    { id: 'region', label: 'Region', valueType: 'string', nullable: false },
    { id: 'amount', label: 'Amount', valueType: 'number', nullable: false },
  ],
  rows: [{ region: 'North', amount: 42 }],
};

describe('static data source transaction', () => {
  it('commits a scalar value in one update transaction', () => {
    expect(
      createStaticDataSourceTransaction('text-1', JSON.stringify('hello'), {
        kind: 'scalar',
        valueType: 'string',
        multiline: true,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [{ patch: { dataSource: { type: 'static', value: 'hello' } } }],
      },
    });
  });

  it('commits canonical tabular data and its role binding together', () => {
    expect(
      createStaticDataSourceTransaction(
        'chart-1',
        JSON.stringify(dataset),
        {
          kind: 'tabular',
          defaultBinding: { fields: { dimension: ['region'], measures: ['amount'] } },
        },
        { fields: { dimension: ['region'], measures: ['amount'] } },
        [
          { id: 'dimension', minFields: 1, maxFields: 1, valueTypes: ['string'] },
          { id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] },
        ],
      ),
    ).toMatchObject({
      ok: true,
      value: {
        commands: [
          {
            patch: {
              dataSource: {
                type: 'static',
                value: dataset,
                binding: { fields: { dimension: ['region'], measures: ['amount'] } },
              },
            },
          },
        ],
      },
    });
  });

  it('rejects malformed JSON, invalid cells, and incomplete bindings', () => {
    expect(createStaticDataSourceTransaction('x', '{')).toMatchObject({ ok: false });
    expect(
      createStaticDataSourceTransaction(
        'x',
        JSON.stringify({ ...dataset, rows: [{ region: 'North', amount: 'bad' }] }),
        {
          kind: 'tabular',
          defaultBinding: { fields: { dimension: ['region'], measures: ['amount'] } },
        },
        { fields: { dimension: ['region'], measures: ['amount'] } },
        [
          { id: 'dimension', minFields: 1, maxFields: 1, valueTypes: ['string'] },
          { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['number'] },
        ],
      ),
    ).toMatchObject({ ok: false });
    expect(
      createStaticDataSourceTransaction(
        'x',
        JSON.stringify(dataset),
        {
          kind: 'tabular',
          defaultBinding: { fields: { dimension: ['region'], measures: ['amount'] } },
        },
        { fields: { dimension: ['region'], measures: [] } },
        [
          { id: 'dimension', minFields: 1, maxFields: 1, valueTypes: ['string'] },
          { id: 'measures', minFields: 1, maxFields: 1, valueTypes: ['number'] },
        ],
      ),
    ).toMatchObject({ ok: false });
  });
});
