import { parseBaseScreenPluginManifest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_METRICS_ID,
  PLUGIN_METRICS_RESOURCE_TYPE_ID,
} from '../src/metrics.js';
import { createPluginMetricsRuntime } from '../src/plugin.js';
import { normalizeMetricsSummaryRequest } from '../src/requests.js';

describe('plugin-metrics manifest', () => {
  it('parses as a canonical plugin manifest', () => {
    const runtime = createPluginMetricsRuntime();
    expect(parseBaseScreenPluginManifest(runtime.manifest).ok).toBe(true);
    expect(runtime.manifest.id).toBe(PLUGIN_METRICS_ID);
  });

  it('declares the declarative surfaces without any custom element', () => {
    const runtime = createPluginMetricsRuntime();
    expect(runtime.manifest.contributions.map((item) => item.kind)).toEqual([
      'dataResourceType',
      'blueprintCapability',
    ]);
    // 零 DOM/零元素：这一档插件不注册任何 custom element，也不声明 material/panel/控件。
    expect(runtime.manifest.contributions.some((item) => 'tagName' in item)).toBe(false);
    expect(runtime.commands).toBeUndefined();
  });

  it('declares the blueprint capability it contributes', () => {
    const runtime = createPluginMetricsRuntime();
    expect(runtime.manifest.capabilities).toEqual([PLUGIN_METRICS_BLUEPRINT_CAPABILITY]);
    const contribution = runtime.manifest.contributions.find(
      (item) => item.kind === 'blueprintCapability',
    );
    expect(contribution?.id).toBe(PLUGIN_METRICS_BLUEPRINT_CAPABILITY);
  });

  it('uses a resource type id that satisfies the document name pattern', () => {
    const runtime = createPluginMetricsRuntime();
    const contribution = runtime.manifest.contributions.find(
      (item) => item.kind === 'dataResourceType',
    );
    expect(contribution?.id).toBe(PLUGIN_METRICS_RESOURCE_TYPE_ID);
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
