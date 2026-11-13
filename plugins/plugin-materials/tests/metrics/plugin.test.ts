import { parseBaseScreenPluginManifest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_METRICS_RESOURCE_TYPE_ID,
} from '../../src/metrics/metrics.js';
import { normalizeMetricsSummaryRequest } from '../../src/metrics/requests.js';
import { createPluginMaterialsRuntime, PLUGIN_MATERIALS_ID } from '../../src/plugin.js';

const runtime = () => createPluginMaterialsRuntime();

describe('metrics contributions in plugin-materials', () => {
  it('stays a canonical plugin manifest after folding metrics in', () => {
    const manifest = runtime().manifest;
    expect(parseBaseScreenPluginManifest(manifest).ok).toBe(true);
    expect(manifest.id).toBe(PLUGIN_MATERIALS_ID);
  });

  it('declares the metrics data resource type without any custom element', () => {
    const contributions = runtime().manifest.contributions.filter(
      (item) => item.kind === 'dataResourceType',
    );
    expect(contributions.map((item) => item.id)).toContain(PLUGIN_METRICS_RESOURCE_TYPE_ID);
    // 资源类型不带 tagName：它不注册任何 custom element。
    expect(contributions.some((item) => 'tagName' in item)).toBe(false);
  });

  it('declares the blueprint capability it contributes', () => {
    const manifest = runtime().manifest;
    expect(manifest.capabilities).toContain(PLUGIN_METRICS_BLUEPRINT_CAPABILITY);
    const contribution = manifest.contributions.find(
      (item) =>
        item.kind === 'blueprintCapability' && item.id === PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
    );
    expect(contribution).toBeDefined();
  });

  it('uses a resource type id that satisfies the document name pattern', () => {
    expect(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(PLUGIN_METRICS_RESOURCE_TYPE_ID)).toBe(true);
  });
});

describe('normalizeMetricsSummaryRequest', () => {
  it('accepts a complete request and clamps the limit', () => {
    expect(normalizeMetricsSummaryRequest({ metric: 'cpu', window: 'week', limit: 999 })).toEqual({
      metric: 'cpu',
      window: 'week',
      limit: 100,
    });
  });

  it('defaults the limit when absent or unusable', () => {
    expect(normalizeMetricsSummaryRequest({ metric: 'cpu', window: 'day' })).toEqual({
      metric: 'cpu',
      window: 'day',
      limit: 10,
    });
    expect(normalizeMetricsSummaryRequest({ metric: 'cpu', window: 'day', limit: 0 })).toEqual({
      metric: 'cpu',
      window: 'day',
      limit: 10,
    });
  });

  it('rejects requests missing required fields or with an unknown window', () => {
    expect(normalizeMetricsSummaryRequest({ window: 'day' })).toBeUndefined();
    expect(normalizeMetricsSummaryRequest({ metric: 'cpu', window: 'year' })).toBeUndefined();
    expect(normalizeMetricsSummaryRequest(null)).toBeUndefined();
    expect(normalizeMetricsSummaryRequest('cpu')).toBeUndefined();
    expect(normalizeMetricsSummaryRequest([])).toBeUndefined();
  });
});
