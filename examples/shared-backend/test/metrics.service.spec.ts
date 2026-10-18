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
});
