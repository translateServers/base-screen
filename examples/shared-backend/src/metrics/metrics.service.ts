import { BadRequestException, Injectable } from '@nestjs/common';
import { LINE_IDS, type LineId } from '../datasets/dataset-definitions';
import {
  DEFAULT_RANKING_LIMIT,
  DEFAULT_SERIES_POINTS,
  MAX_RANKING_LIMIT,
  MAX_SERIES_POINTS,
  type MetricId,
  type RankingDimension,
} from './dto/metrics-query.dto';

interface MetricDefinition {
  readonly unit: string;
  readonly base: number;
  readonly amplitude: number;
}

const METRIC_DEFINITIONS: Readonly<Record<MetricId, MetricDefinition>> = {
  cpu_usage: { unit: '%', base: 42, amplitude: 18 },
  memory_usage: { unit: '%', base: 63, amplitude: 12 },
  request_rate: { unit: 'req/s', base: 820, amplitude: 240 },
  sales_total: { unit: '万元', base: 386.4, amplitude: 92.6 },
  order_count: { unit: '单', base: 5240, amplitude: 1180 },
  visitor_count: { unit: '人', base: 18_620, amplitude: 4200 },
  conversion_rate: { unit: '%', base: 3.86, amplitude: 1.2 },
  target_completion: { unit: '%', base: 72.4, amplitude: 9.6 },
  service_satisfaction: { unit: '%', base: 96.2, amplitude: 2.4 },
  member_repurchase: { unit: '%', base: 48.6, amplitude: 8.2 },
  // 生产监控（PRD §5.2 C8/C9/C10/C11/C14/C16/C17）：车间级实时快照，口径与告警流水不同。
  oee: { unit: '%', base: 82.6, amplitude: 6.4 },
  device_online_rate: { unit: '%', base: 94.8, amplitude: 3.2 },
  output_count: { unit: '件', base: 1284, amplitude: 186 },
  alarm_open: { unit: '条', base: 7, amplitude: 3 },
  line_load: { unit: '%', base: 72.4, amplitude: 12.6 },
  energy_ratio: { unit: '%', base: 88.2, amplitude: 5.4 },
  // 告警演示屏（PRD §5.2 C10 的等级细分）：口径是「近 1 小时新增」，
  // 与 `alarm_open`（当前未处理快照）不是同一统计窗，因此三档之和不等于它。
  alarm_critical: { unit: '条', base: 2, amplitude: 1 },
  alarm_warning: { unit: '条', base: 4, amplitude: 2 },
  alarm_info: { unit: '条', base: 6, amplitude: 2 },
};

/** 产线排行的固定取值：名次与数值都不随请求漂移（PRD §6.4 的确定性要求）。 */
const LINE_RANKING_VALUES: Readonly<Record<LineId, number>> = {
  'LINE-A': 1284,
  'LINE-B': 962,
  'LINE-C': 431,
};

/** 排行数据是固定表：大屏需要稳定的名次，不适合按指标序列再算一遍。 */
const RANKING_DATASETS: Readonly<
  Record<RankingDimension, { readonly unit: string; readonly items: readonly RankingItem[] }>
> = {
  region: {
    unit: '单',
    items: [
      { name: '华东', value: 1284 },
      { name: '华南', value: 1102 },
      { name: '华北', value: 968 },
      { name: '西南', value: 764 },
      { name: '华中', value: 682 },
      { name: '东北', value: 521 },
    ],
  },
  channel: {
    unit: '%',
    items: [
      { name: '直营', value: 42 },
      { name: '分销', value: 28 },
      { name: '电商', value: 19 },
      { name: '门店', value: 11 },
    ],
  },
  // 产线负载排行（PRD §5.2 C14）：顺序固定为 LINE-A → LINE-B → LINE-C。
  // 名字来自 `LINE_IDS`，避免与数据集参数的 allowedValues 各写一份而漂移。
  line: {
    unit: '件',
    items: LINE_IDS.map((lineId) => ({ name: lineId, value: lineRankingValue(lineId) })),
  },
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

export interface RankingItem {
  readonly name: string;
  readonly value: number;
}

export interface MetricRanking {
  readonly dimension: string;
  readonly unit: string;
  readonly items: readonly RankingItem[];
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

  /** 固定排行表：同参数同结果，名次不随请求漂移。 */
  ranking(dimension: string, limit?: number): MetricRanking {
    const dataset = RANKING_DATASETS[dimension as RankingDimension];
    if (dataset === undefined) {
      throw new BadRequestException({
        error: 'UNKNOWN_DIMENSION',
        message: `Unknown ranking dimension: ${dimension}`,
      });
    }
    const resolvedLimit = limit ?? DEFAULT_RANKING_LIMIT;
    if (
      !Number.isInteger(resolvedLimit) ||
      resolvedLimit < 1 ||
      resolvedLimit > MAX_RANKING_LIMIT
    ) {
      throw new BadRequestException({
        error: 'INVALID_LIMIT',
        message: `limit must be within 1..${MAX_RANKING_LIMIT}`,
      });
    }
    return {
      dimension,
      unit: dataset.unit,
      items: dataset.items.slice(0, resolvedLimit),
    };
  }
}

function lineRankingValue(lineId: LineId): number {
  return LINE_RANKING_VALUES[lineId];
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
