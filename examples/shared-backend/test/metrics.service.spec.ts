import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MetricsService, STREAM_TICK_MS } from '../src/metrics/metrics.service';

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

  // 实时告警演示屏新增的 3 个等级指标：口径是「近 1 小时新增」，与 alarm_open 独立。
  it('serves the alarm level metric ids deterministically', async () => {
    const service = await createService();

    for (const metric of ['alarm_critical', 'alarm_warning', 'alarm_info']) {
      const first = service.series(metric, 12);
      const second = service.series(metric, 12);
      expect(first.unit).toBe('条');
      expect(second).toEqual(first);
      // 三条曲线互不相同，否则三个等级色块会显示同一个数。
      expect(first.points).not.toEqual(service.series('alarm_open', 12).points);
    }

    expect(service.series('alarm_critical', 12).points).not.toEqual(
      service.series('alarm_warning', 12).points,
    );
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

  describe('push stream (ADR-0104)', () => {
    it('windows end at the shared clock index and advance one point per tick', async () => {
      const service = await createService();
      const start = Date.now();

      const first = service.streamWindow('oee', 24, start);
      const later = service.streamWindow('oee', 24, start + STREAM_TICK_MS * 3);

      expect(first.series.points).toHaveLength(24);
      expect(later.revision - first.revision).toBe(3);
      // 同一序号在任何窗口里都是同一个值：后一个窗口的前 21 个点就是前一个窗口的后 21 个点。
      expect(later.series.points.slice(0, 21)).toEqual(first.series.points.slice(3));
      expect(service.streamPoint('oee', later.revision)).toEqual(later.series.points.at(-1));
    });

    it('keeps a process-level epoch and rejects invalid parameters closed', async () => {
      const service = await createService();

      expect(service.streamEpoch).toMatch(/^boot-/);
      expect(() => service.streamWindow('nope', 24)).toThrow(BadRequestException);
      expect(() => service.streamWindow('oee', 0)).toThrow(BadRequestException);
    });
  });
});
