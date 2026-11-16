import { describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ loads: 0 }));

vi.mock('../../src/echarts/echarts-runtime.js', () => {
  harness.loads += 1;
  return {
    createEchartsChartHandle: () => ({
      render: () => {},
      resize: () => {},
      dispose: () => {},
      onSeriesClick: () => {},
    }),
  };
});

describe('echarts adapter lazy loading', () => {
  it('loads the echarts runtime once for concurrent charts', async () => {
    const { loadEchartsChartAdapter } = await import('../../src/echarts/chart-adapter.js');

    const [first, second] = await Promise.all([
      loadEchartsChartAdapter(),
      loadEchartsChartAdapter(),
    ]);

    expect(harness.loads).toBe(1);
    expect(first).toBe(second);
    expect(await loadEchartsChartAdapter()).toBe(first);
    expect(typeof first.createChartHandle).toBe('function');
  });
});
