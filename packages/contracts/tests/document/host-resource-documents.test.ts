import { describe, expect, it } from 'vitest';
import { parseScreenDocument } from '../../src/document/parse.js';
import { serializeScreenDocument } from '../../src/document/serialize.js';
import {
  fullBindingDocument,
  legacyArbitraryParamsDocument,
  missingBindingDocument,
  nullBindingDocument,
} from './__fixtures__/host-resource-documents.js';

const FORBIDDEN_FIELD_PATTERN = /"(?:url|sql|header|headers|token|password|connection)"/;

function withDataSource(dataSource: Record<string, unknown>): Record<string, unknown> {
  const fixture = structuredClone(nullBindingDocument);
  const components = fixture.components as Array<Record<string, unknown>>;
  components[0] = { ...components[0], dataSource };
  return fixture;
}

function dataSourceOf(fixture: Record<string, unknown>): unknown {
  const components = fixture.components as Array<Record<string, unknown>>;
  return components[0]?.dataSource;
}

function parseFailures(input: Record<string, unknown>) {
  const result = parseScreenDocument(input);
  expect(result.ok).toBe(false);
  return result;
}

describe('host-resource document contract', () => {
  it('accepts a host resource with binding: null', () => {
    const result = parseScreenDocument(nullBindingDocument);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
      expect(result.value.components[0]?.dataSource).toEqual(dataSourceOf(nullBindingDocument));
    }
  });

  it('accepts a host resource with a full role-field binding', () => {
    const result = parseScreenDocument(fullBindingDocument);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.components[0]?.dataSource).toEqual(dataSourceOf(fullBindingDocument));
      expect(result.value.components[0]?.dataSource).toMatchObject({
        binding: {
          fields: {
            dimension: ['host_name'],
            measures: ['avg_cpu_usage_percent', 'avg_memory_usage_percent'],
            columns: ['sample_time', 'host_name', 'avg_cpu_usage_percent'],
          },
        },
      });
    }
  });

  it('fails closed when binding is missing', () => {
    const result = parseFailures(missingBindingDocument);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      expect(result.diagnostics[0]?.path).toEqual(['components', 0, 'dataSource']);
    }
  });

  it('rejects unknown binding shapes', () => {
    const nonObjectBinding = withDataSource({
      type: 'host-resource',
      resourceType: 'xj_metric',
      resourceId: 'demo',
      params: {},
      binding: 'measures',
    });
    expect(parseScreenDocument(nonObjectBinding).ok).toBe(false);

    const unknownBindingField = withDataSource({
      type: 'host-resource',
      resourceType: 'xj_metric',
      resourceId: 'demo',
      params: {},
      binding: { fields: { measures: ['avg_cpu_usage_percent'] }, extra: true },
    });
    const result = parseFailures(unknownBindingField);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'dataSource',
        'binding',
        'extra',
      ]);
    }
  });

  it('fails closed on the legacy arbitrary-JSON parameter shape', () => {
    const scalarResult = parseFailures(
      withDataSource({
        type: 'host-resource',
        resourceType: 'xj_metric',
        resourceId: 'demo',
        params: { limit: 5 },
        binding: null,
      }),
    );
    if (!scalarResult.ok) {
      expect(scalarResult.diagnostics[0]?.code).toBe('DOCUMENT_FIELD_INVALID');
      expect(scalarResult.diagnostics[0]?.path).toEqual(['components', 0, 'dataSource']);
    }

    const result = parseFailures(legacyArbitraryParamsDocument);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
      expect(result.diagnostics[0]?.path).toEqual([
        'components',
        0,
        'dataSource',
        'params',
        'filter',
        'status',
      ]);
    }

    const mixed = withDataSource({
      type: 'host-resource',
      resourceType: 'xj_metric',
      resourceId: 'demo',
      params: { limit: { kind: 'literal', value: 5 }, filter: { status: 'active' } },
      binding: null,
    });
    expect(parseScreenDocument(mixed).ok).toBe(false);
  });

  it('round-trips both valid fixtures through serialize and parse', () => {
    for (const fixture of [nullBindingDocument, fullBindingDocument]) {
      const parsed = parseScreenDocument(fixture);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const serialized = serializeScreenDocument(parsed.value);
      const reparsed = parseScreenDocument(JSON.parse(serialized) as Record<string, unknown>);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) {
        expect(reparsed.value).toEqual(parsed.value);
      }
    }
  });

  it('does not introduce transport or credential fields on round trip', () => {
    for (const fixture of [nullBindingDocument, fullBindingDocument]) {
      const parsed = parseScreenDocument(fixture);
      if (!parsed.ok) throw new Error('fixture must parse');
      const serialized = serializeScreenDocument(parsed.value);
      expect(serialized).not.toMatch(FORBIDDEN_FIELD_PATTERN);
      const reparsed = parseScreenDocument(JSON.parse(serialized) as Record<string, unknown>);
      expect(reparsed.ok).toBe(true);
      if (reparsed.ok) {
        expect(reparsed.value).toEqual(parsed.value);
      }
    }
  });
});
