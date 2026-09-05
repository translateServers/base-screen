import { describe, expect, it } from 'vitest';
import {
  evaluateScreenDatasetParameters,
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenDatasetGroups,
} from '../../src/dataset/definition.js';
import type { ScreenDatasetParameterDefinition } from '../../src/types/dataset-port.js';

const amount: ScreenDatasetParameterDefinition = {
  name: 'amount',
  label: 'Amount',
  valueType: 'number',
  required: true,
  minimum: 1,
  maximum: 10,
  defaultValue: 2,
  allowedValues: [2, 4],
};

describe('independent dataset definitions', () => {
  it('keeps parameters local to the dataset and checks defaults without coercion', () => {
    expect(evaluateScreenDatasetParameters([amount], {}).ok).toBe(true);
    expect(evaluateScreenDatasetParameters([amount], { amount: 4 })).toMatchObject({
      ok: true,
      value: { amount: 4 },
    });
    for (const value of ['2', 0, 3, 11, null, {}, Infinity]) {
      expect(evaluateScreenDatasetParameters([amount], { amount: value }).ok).toBe(false);
    }
    expect(evaluateScreenDatasetParameters([], { amount: 2 }).ok).toBe(false);
    expect(evaluateScreenDatasetParameters([{ ...amount, defaultValue: 3 }], {}).ok).toBe(false);
  });

  it('rejects inconsistent metadata and impossible calendar dates', () => {
    expect(evaluateScreenDatasetParameters([amount, amount], {}).ok).toBe(false);
    expect(evaluateScreenDatasetParameters([{ ...amount, maxLength: 12 }], {}).ok).toBe(false);
    const date: ScreenDatasetParameterDefinition = {
      name: 'start',
      label: 'Start',
      valueType: 'date',
      required: true,
    };
    for (const start of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-09-05T25:00:00Z']) {
      expect(evaluateScreenDatasetParameters([date], { start }).ok).toBe(false);
    }
    expect(evaluateScreenDatasetParameters([date], { start: '2024-02-29' }).ok).toBe(true);
  });

  it('uses opaque publication identity and forbids leaking transport or business resource types', () => {
    const definition = {
      datasetId: 'publication:abc',
      name: 'Orders',
      description: null,
      fields: [{ id: 'amount', label: 'Amount', valueType: 'number' }],
      parameters: [amount],
    };
    expect(parseScreenDatasetDefinition(definition).ok).toBe(true);
    expect(parseScreenDatasetDefinition({ ...definition, resourceType: 'xj_metric' }).ok).toBe(
      false,
    );
    expect(parseScreenDatasetDefinition({ ...definition, connection: { url: 'private' } }).ok).toBe(
      false,
    );
    expect(
      parseScreenDatasetDefinition({
        ...definition,
        fields: [...definition.fields, ...definition.fields],
      }).ok,
    ).toBe(false);
  });

  it('keeps catalog and group identities unique within bounded pages', () => {
    const item = { datasetId: 'publication:a', name: 'A', description: null, groupId: 'system' };
    expect(parseScreenDatasetEntries({ items: [item] }).ok).toBe(true);
    expect(parseScreenDatasetEntries({ items: [item, item] }).ok).toBe(false);
    expect(parseScreenDatasetGroups([{ id: 'system', name: 'System' }]).ok).toBe(true);
    expect(
      parseScreenDatasetGroups([
        { id: 'system', name: 'A' },
        { id: 'system', name: 'B' },
      ]).ok,
    ).toBe(false);
  });
});
