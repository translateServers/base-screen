import { describe, expect, it } from 'vitest';
import { listScreenSourceDeliveryIssues } from '../../src/push/delivery.js';
import { parseScreenHostCatalogDescriptor } from '../../src/variable/parse.js';
import { document, parse } from './__fixtures__/document-test-fixtures.js';

/**
 * ADR-0104：`updatePolicy.mode: 'push'` 的文档契约与宿主推送能力声明。
 * 运行时语义（订阅、游标、窗口裁剪）不在 contracts，由 renderer 的测试覆盖。
 */

function instance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ds-1',
    name: 'metric',
    source: { kind: 'host-resource', resourceType: 'demo_series', resourceId: 'oee' },
    params: {},
    ...overrides,
  };
}

function firstDiagnostic(policyOrInstance: Record<string, unknown>) {
  const result = parse(document({ dataSources: [instance(policyOrInstance)] }));
  expect(result.ok).toBe(false);
  return result.ok ? undefined : result.diagnostics[0];
}

describe('push update policy', () => {
  it('accepts push alone and with fallback and retain window', () => {
    expect(
      parse(document({ dataSources: [instance({ updatePolicy: { mode: 'push' } })] })),
    ).toMatchObject({ ok: true });
    const full = parse(
      document({
        dataSources: [
          instance({
            updatePolicy: {
              mode: 'push',
              fallbackIntervalSeconds: 30,
              retain: { rows: 600, seconds: 300, timeField: 't' },
            },
          }),
        ],
      }),
    );
    expect(full).toMatchObject({ ok: true });
    if (full.ok) {
      expect(full.value.dataSources?.[0]?.updatePolicy).toEqual({
        mode: 'push',
        fallbackIntervalSeconds: 30,
        retain: { rows: 600, seconds: 300, timeField: 't' },
      });
    }
  });

  it('accepts push on host-catalog and dataset sources', () => {
    const result = parse(
      document({
        dataSources: [
          instance({
            source: { kind: 'host-catalog', sourceId: 'line' },
            updatePolicy: { mode: 'push' },
          }),
          instance({
            id: 'ds-2',
            name: 'orders',
            source: { kind: 'dataset', datasetId: 'orders' },
            updatePolicy: { mode: 'push' },
          }),
        ],
      }),
    );
    expect(result).toMatchObject({ ok: true });
  });

  it('rejects push on a url-query source', () => {
    const diagnostic = firstDiagnostic({
      source: { kind: 'url-query', sourceId: 'region' },
      updatePolicy: { mode: 'push' },
    });
    expect(diagnostic?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
    expect(diagnostic?.path).toEqual(['dataSources', 0, 'updatePolicy', 'mode']);
  });

  it('rejects intervalSeconds on push', () => {
    const diagnostic = firstDiagnostic({ updatePolicy: { mode: 'push', intervalSeconds: 5 } });
    expect(diagnostic?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
    expect(diagnostic?.path).toEqual(['dataSources', 0, 'updatePolicy', 'intervalSeconds']);
  });

  it('rejects push-only fields on other modes', () => {
    for (const [field, value] of [
      ['fallbackIntervalSeconds', 30],
      ['retain', { rows: 10 }],
    ] as const) {
      for (const policy of [
        { mode: 'manual', [field]: value },
        { mode: 'once', [field]: value },
        { mode: 'auto', intervalSeconds: 5, [field]: value },
      ]) {
        const diagnostic = firstDiagnostic({ updatePolicy: policy });
        expect(diagnostic?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
        expect(diagnostic?.path).toEqual(['dataSources', 0, 'updatePolicy', field]);
      }
    }
  });

  it('rejects an out-of-range fallback interval', () => {
    for (const fallbackIntervalSeconds of [0, 86_401, 1.5, '30']) {
      const diagnostic = firstDiagnostic({
        updatePolicy: { mode: 'push', fallbackIntervalSeconds },
      });
      expect(diagnostic?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
      expect(diagnostic?.path).toEqual([
        'dataSources',
        0,
        'updatePolicy',
        'fallbackIntervalSeconds',
      ]);
    }
  });
});

describe('push retain window', () => {
  it('rejects out-of-range rows and seconds', () => {
    for (const [retain, field] of [
      [{ rows: 0 }, 'rows'],
      [{ rows: 10_001 }, 'rows'],
      [{ rows: 2.5 }, 'rows'],
      [{ seconds: 0, timeField: 't' }, 'seconds'],
      [{ seconds: 604_801, timeField: 't' }, 'seconds'],
    ] as const) {
      const diagnostic = firstDiagnostic({ updatePolicy: { mode: 'push', retain } });
      expect(diagnostic?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
      expect(diagnostic?.path).toEqual(['dataSources', 0, 'updatePolicy', 'retain', field]);
    }
  });

  it('requires seconds and timeField together', () => {
    const missingField = firstDiagnostic({
      updatePolicy: { mode: 'push', retain: { seconds: 60 } },
    });
    expect(missingField?.path).toEqual(['dataSources', 0, 'updatePolicy', 'retain', 'timeField']);
    const missingSeconds = firstDiagnostic({
      updatePolicy: { mode: 'push', retain: { timeField: 't' } },
    });
    expect(missingSeconds?.path).toEqual(['dataSources', 0, 'updatePolicy', 'retain', 'seconds']);
  });

  it('rejects an empty timeField and unknown retain fields', () => {
    const empty = firstDiagnostic({
      updatePolicy: { mode: 'push', retain: { seconds: 60, timeField: '' } },
    });
    expect(empty?.path).toEqual(['dataSources', 0, 'updatePolicy', 'retain', 'timeField']);
    const unknown = firstDiagnostic({
      updatePolicy: { mode: 'push', retain: { rows: 10, maxAge: 5 } },
    });
    expect(unknown?.code).toBe('DOCUMENT_UNKNOWN_FIELD');
    expect(unknown?.path).toEqual(['dataSources', 0, 'updatePolicy', 'retain', 'maxAge']);
  });
});

describe('source delivery declaration', () => {
  it('accepts an empty, pull-only and push declaration', () => {
    expect(listScreenSourceDeliveryIssues({})).toEqual([]);
    expect(listScreenSourceDeliveryIssues({ push: {} })).toEqual([]);
    expect(
      listScreenSourceDeliveryIssues({ push: { append: true, inactivityTimeoutSeconds: 15 } }),
    ).toEqual([]);
  });

  it('reports shape errors relative to the declaration', () => {
    expect(listScreenSourceDeliveryIssues(null).map((issue) => issue.path)).toEqual([[]]);
    expect(listScreenSourceDeliveryIssues({ pull: true }).map((issue) => issue.path)).toEqual([
      ['pull'],
    ]);
    expect(
      listScreenSourceDeliveryIssues({
        push: { append: 'yes', inactivityTimeoutSeconds: 0, url: 'ws://x' },
      }).map((issue) => issue.path),
    ).toEqual([['push', 'url'], ['push', 'append'], ['push', 'inactivityTimeoutSeconds']]);
  });

  it('parses delivery on a host catalog descriptor', () => {
    const base = {
      sourceId: 'line',
      name: 'Line',
      description: null,
      parameters: [],
      previewable: true,
    };
    const parsed = parseScreenHostCatalogDescriptor({
      ...base,
      delivery: { push: { append: false, inactivityTimeoutSeconds: 30 } },
    });
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(parsed.value.delivery).toEqual({
        push: { append: false, inactivityTimeoutSeconds: 30 },
      });
    }
    const pullOnly = parseScreenHostCatalogDescriptor(base);
    expect(pullOnly.ok).toBe(true);
    if (pullOnly.ok) expect('delivery' in pullOnly.value).toBe(false);
    const invalid = parseScreenHostCatalogDescriptor({ ...base, delivery: { push: 'yes' } });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.diagnostics[0]?.path).toEqual(['delivery', 'push']);
  });
});
