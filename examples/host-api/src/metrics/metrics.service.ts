import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_SERIES_POINTS, MAX_SERIES_POINTS, type MetricId } from './dto/metrics-query.dto';

interface MetricDefinition {
  readonly unit: string;
  readonly base: number;
  readonly amplitude: number;
}

const METRIC_DEFINITIONS: Readonly<Record<MetricId, MetricDefinition>> = {
  cpu_usage: { unit: '%', base: 42, amplitude: 18 },
  memory_usage: { unit: '%', base: 63, amplitude: 12 },
  request_rate: { unit: 'req/s', base: 820, amplitude: 240 },
};

/** 固定基准时间：保证同参数的序列完全确定，冒烟与前端可以对值做断言。 */
const SERIES_BASE_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

export interface MetricPoint {
  readonly t: string;
  readonly value: number;
}

export interface MetricSeries {
  readonly metric: string;
  readonly unit: string;
  readonly points: readonly MetricPoint[];
}

@Injectable()
export class MetricsService {
  /** 确定性 mock 数据：mulberry32 + 固定 seed（指标名哈希）+ 固定基准时间。 */
  series(metric: string, points?: number): MetricSeries {
    const definition = METRIC_DEFINITIONS[metric as MetricId];
    if (definition === undefined) {
      throw new BadRequestException({
        error: 'UNKNOWN_METRIC',
        message: `Unknown metric: ${metric}`,
      });
    }
    const resolvedPoints = points ?? DEFAULT_SERIES_POINTS;
    if (
      !Number.isInteger(resolvedPoints) ||
      resolvedPoints < 1 ||
      resolvedPoints > MAX_SERIES_POINTS
    ) {
      throw new BadRequestException({
        error: 'INVALID_POINTS',
        message: `points must be within 1..${MAX_SERIES_POINTS}`,
      });
    }
    const random = mulberry32(hashSeed(metric));
    const values: MetricPoint[] = [];
    for (let index = 0; index < resolvedPoints; index += 1) {
      const drift = Math.sin((index / resolvedPoints) * Math.PI * 2);
      const noise = random() - 0.5;
      const raw = definition.base + definition.amplitude * (0.6 * drift + 0.4 * noise);
      values.push({
        t: new Date(SERIES_BASE_EPOCH_MS + index * 60_000).toISOString(),
        value: Math.max(0, Math.round(raw * 100) / 100),
      });
    }
    return { metric, unit: definition.unit, points: values };
  }

  /** resourcePort 使用的标量投影：text 类物料只消费最新一个点。 */
  latestValue(metric: string, points?: number): number {
    const series = this.series(metric, points);
    return series.points[series.points.length - 1]?.value ?? 0;
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
