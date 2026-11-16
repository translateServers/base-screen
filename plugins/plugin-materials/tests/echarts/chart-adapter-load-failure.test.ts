import { describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ loads: 0 }));

vi.mock('../../src/echarts/echarts-runtime.js', () => {
  harness.loads += 1;
  throw new Error('chunk failed');
});

describe('echarts adapter load failure', () => {
  it('caches a failed load instead of retrying on every call', async () => {
    const { loadEchartsChartAdapter } = await import('../../src/echarts/chart-adapter.js');

    await expect(loadEchartsChartAdapter()).rejects.toThrow();
    await expect(loadEchartsChartAdapter()).rejects.toThrow();

    expect(harness.loads).toBe(1);
  });
});
