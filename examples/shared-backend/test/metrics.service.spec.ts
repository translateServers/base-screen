import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MetricsService } from '../src/metrics/metrics.service';

describe('MetricsService', () => {
  async function createService(): Promise<MetricsService> {
    const moduleRef = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    return moduleRef.get(MetricsService);
  }

  it('returns the same deterministic series for the same parameters', async () => {
    const service = await createService();

    const first = service.series('cpu_usage', 24);
    const second = service.series('cpu_usage', 24);

    expect(second).toEqual(first);
    expect(first.points).toHaveLength(24);
    expect(first.unit).toBe('%');
    expect(first.points.every((point) => Number.isFinite(point.value))).toBe(true);
  });

  it('varies by metric and point count', async () => {
    const service = await createService();

    const short = service.series('cpu_usage', 5);
    const other = service.series('request_rate', 5);

    expect(short.points).toHaveLength(5);
    expect(other.unit).toBe('req/s');
    expect(other.points).not.toEqual(short.points);
  });

  it('rejects an unknown metric closed', async () => {
    const service = await createService();

    expect(() => service.series('nope', 5)).toThrow(BadRequestException);
  });

  it('projects the latest point for scalar bindings', async () => {
    const service = await createService();

    const series = service.series('memory_usage', 12);
    const latest = service.latestValue('memory_usage', 12);

    expect(latest).toBe(series.points[11]?.value);
  });

  it('serves deterministic rankings in descending order', async () => {
    const service = await createService();

    const first = service.ranking('region', 6);
    const second = service.ranking('region', 6);

    expect(second).toEqual(first);
    expect(first.dimension).toBe('region');
    expect(first.unit).toBe('单');
    expect(first.items).toHaveLength(6);
    expect(first.items.map((item) => item.name)).toEqual([
      '华东',
      '华南',
      '华北',
      '西南',
      '华中',
      '东北',
    ]);
    expect(
      first.items.every(
        (item, index) => index === 0 || item.value <= first.items[index - 1]!.value,
      ),
    ).toBe(true);
  });

  it('honours the ranking limit and rejects unknown dimensions', async () => {
    const service = await createService();

    expect(service.ranking('channel', 3).items).toHaveLength(3);
    expect(() => service.ranking('nope', 3)).toThrow(BadRequestException);
    expect(() => service.ranking('region', 0)).toThrow(BadRequestException);
  });

  // 生产监控新增的 6 个指标（PRD §6.5）：只追加，不改动原 10 个 id 的名字与取值。
  it('serves the production metric ids deterministically with their units', async () => {
    const service = await createService();

    const expected: ReadonlyArray<readonly [string, string]> = [
      ['oee', '%'],
      ['device_online_rate', '%'],
      ['output_count', '件'],
      ['alarm_open', '条'],
      ['line_load', '%'],
      ['energy_ratio', '%'],
    ];

    for (const [metric, unit] of expected) {
      const first = service.series(metric, 12);
      const second = service.series(metric, 12);
      expect(first.unit).toBe(unit);
      expect(first.points).toHaveLength(12);
      expect(second).toEqual(first);
      expect(first.points.every((point) => Number.isFinite(point.value))).toBe(true);
      // 每个新指标都有自己的基准值与前缀，不能退化成旧指标的同一曲线。
      expect(first.points).not.toEqual(service.series('cpu_usage', 12).points);
    }
  });

  it('keeps the legacy metric ids and values untouched', async () => {
    const service = await createService();

    expect(service.series('cpu_usage', 24).unit).toBe('%');
    expect(service.series('request_rate', 24).unit).toBe('req/s');
    expect(service.series('sales_total', 24).unit).toBe('万元');
    expect(service.ranking('region', 6).items[0]).toEqual({ name: '华东', value: 1284 });
    expect(service.ranking('channel', 4).unit).toBe('%');
  });

  it('serves the fixed line ranking in LINE-A/B/C order', async () => {
    const service = await createService();

    const ranking = service.ranking('line', 3);

    expect(ranking.dimension).toBe('line');
    expect(ranking.unit).toBe('件');
    expect(ranking.items.map((item) => item.name)).toEqual(['LINE-A', 'LINE-B', 'LINE-C']);
    expect(ranking.items.map((item) => item.value)).toEqual([1284, 962, 431]);
    expect(service.ranking('line', 2).items).toHaveLength(2);
  });
});
