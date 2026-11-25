import { describe, expect, it } from 'vitest';
import { component, document, parse } from './__fixtures__/document-test-fixtures.js';

/** 示例数据标记（ADR-0112 §2.3）：`inline` 上可选的 `sample: true`，只有这一种写法。 */
describe('inline sample marker', () => {
  it('accepts and preserves sample: true on component values and data source params', () => {
    const result = parse(
      document({
        components: [component({ dataValue: { kind: 'inline', value: 42, sample: true } })],
        dataSources: [
          {
            id: 'ds-1',
            name: 'orders',
            source: { kind: 'dataset', datasetId: 'orders' },
            params: { limit: { kind: 'inline', value: 5, sample: true } },
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components[0]?.dataValue).toEqual({
      kind: 'inline',
      value: 42,
      sample: true,
    });
    expect(result.value.dataSources?.[0]?.params.limit).toEqual({
      kind: 'inline',
      value: 5,
      sample: true,
    });
  });

  it('keeps a plain constant free of the marker', () => {
    const result = parse(
      document({ components: [component({ dataValue: { kind: 'inline', value: 42 } })] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.components[0]?.dataValue).not.toHaveProperty('sample');
  });

  it.each([false, 'true', 1, null])('rejects sample: %j', (sample) => {
    const result = parse(
      document({ components: [component({ dataValue: { kind: 'inline', value: 42, sample } })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]).toMatchObject({
        code: 'DOCUMENT_VALUE_REF_INVALID',
        path: ['components', 0, 'dataValue', 'sample'],
      });
    }
  });

  it('does not allow the marker on other kinds', () => {
    const result = parse(
      document({
        components: [component({ dataValue: { kind: 'variable', variableId: 'v', sample: true } })],
        variables: [{ type: 'static', id: 'v', name: 'v', initialValue: null }],
      }),
    );
    expect(result.ok).toBe(false);
  });
});
