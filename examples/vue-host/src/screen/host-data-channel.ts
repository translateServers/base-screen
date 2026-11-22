import type {
  ScreenDiagnostic,
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenSourcePushEvent,
} from 'base-screen/contracts';
import {
  createSseSubscribe,
  createSubscriptionHub,
  type HostKitSseMessage,
} from 'base-screen/host-kit';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';
import type { MetricPoint } from '../types';

const logger = createLogger('host-data-channel');

/**
 * 宿主授权的 resourceType 白名单：未授权即失败关闭，不静默放行。
 *
 * 三种类型对应三种投影形状：
 * - demo_metric  → 标量表（单行 `value`），供翻牌器/水位/胶囊消费；
 * - demo_series  → 时序表（`t` + `value`），供折线/面积/柱状消费；
 * - demo_ranking → 排行表（`name` + `value`），供环形图与轮播列表消费。
 * resourceId 分别是指标名或排行维度（region / channel）。
 */
const DEMO_METRIC = 'demo_metric';
const DEMO_SERIES = 'demo_series';
const DEMO_RANKING = 'demo_ranking';
const HOST_IMAGE = 'host_image';
const AUTHORIZED_RESOURCE_TYPES = new Set([DEMO_METRIC, DEMO_SERIES, DEMO_RANKING, HOST_IMAGE]);
/** 可订阅推送的类型（ADR-0104），须与 `host-resource-plugin` 的 `delivery.push` 声明一致。 */
const PUSH_RESOURCE_TYPES = new Set([DEMO_METRIC, DEMO_SERIES]);
const DEFAULT_POINTS = 24;
const MAX_POINTS = 120;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;
/** 最后一个读者离开后保留连接的时长：切换预览/文档时不反复断开重连。 */
const STREAM_LINGER_MS = 2_000;

/**
 * 宿主数据通道（resourcePort）：把文档中的 host-resource dataSource 解析成
 * 对共享后端的查询，并投影为表格数据。只返回安全投影，不泄露连接信息。
 *
 * `updatePolicy.mode: 'push'` 的实例经 `subscribe` 订阅 `/api/metrics/stream`（SSE）：
 * 同一指标、同一点数的多个实例共用一条连接（订阅中心按资源键引用计数）。
 */
export function createHostResourcePort(): ScreenHostResourcePort {
  const streams = createSubscriptionHub<ScreenHostResourceRequest>({
    // 复用键只由资源身份与参数派生，不混入会话或凭证（ADR-0104 §2.1）。
    keyOf: (request) =>
      `${request.resourceType}:${request.resourceId}:${readPoints(request.params.points)}`,
    open: createSseSubscribe<ScreenHostResourceRequest>({
      url: (request) =>
        PUSH_RESOURCE_TYPES.has(request.resourceType)
          ? `${resolveApiBase()}/metrics/stream?metric=${encodeURIComponent(
              request.resourceId,
            )}&points=${readPoints(request.params.points)}`
          : undefined,
      events: ['snapshot', 'point', 'heartbeat'],
      mapEvent: (message, request) => mapMetricStreamMessage(message, request),
    }),
    lingerMs: STREAM_LINGER_MS,
  });

  return {
    subscribe: streams.subscribe,
    async resolve({
      resourceType,
      resourceId,
      params,
    }): Promise<ScreenParseResult<ScreenJsonValue>> {
      if (!AUTHORIZED_RESOURCE_TYPES.has(resourceType)) {
        return failure('HOST_RESOURCE_ACCESS_DENIED', `未授权的资源类型：${resourceType}`);
      }

      if (resourceType === HOST_IMAGE) {
        // 文档只存素材 id；稳定内容 URL 由宿主按当前 API Base 解析，不写进文档。
        return {
          ok: true,
          value: `${resolveApiBase()}/assets/${encodeURIComponent(resourceId)}/content`,
          diagnostics: [],
        };
      }

      if (resourceType === DEMO_METRIC) {
        const result = await api.metricSeries(resourceId, readPoints(params.points));
        if (!result.ok) return failure('HOST_RESOURCE_UNAVAILABLE', result.error.message);
        const latest = result.data.points[result.data.points.length - 1];
        if (latest === undefined)
          return failure('HOST_RESOURCE_INVALID', `指标无数据：${resourceId}`);
        logger.debug('resolved scalar metric', { resourceId, value: latest.value });
        return { ok: true, value: scalarTable(resourceId, latest.value), diagnostics: [] };
      }

      if (resourceType === DEMO_SERIES) {
        const result = await api.metricSeries(resourceId, readPoints(params.points));
        if (!result.ok) return failure('HOST_RESOURCE_UNAVAILABLE', result.error.message);
        return {
          ok: true,
          value: seriesTable(result.data.unit, result.data.points),
          diagnostics: [],
        };
      }

      const limit = readBoundedNumber(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
      const ranking = await api.metricRanking(resourceId, limit);
      if (!ranking.ok) return failure('HOST_RESOURCE_UNAVAILABLE', ranking.error.message);
      return {
        ok: true,
        value: {
          fields: [
            { id: 'name', label: '名称', valueType: 'string' },
            { id: 'value', label: `数值（${ranking.data.unit}）`, valueType: 'number' },
          ],
          rows: ranking.data.items.map((item) => ({ name: item.name, value: item.value })),
        },
        diagnostics: [],
      };
    },
  };
}

/**
 * 后端推送流 → 推送事件。后端只发领域形状（`snapshot` 是整段序列、`point` 是一个新采样点），
 * 表格投影在这里做，与 `resolve` 同一口径；游标由 helper 从 `id: <epoch>:<revision>` 补齐。
 * - 时序：快照 → 整表 `snapshot`，新点 → `append` 一行；
 * - 标量：快照与新点都 → 单行 `snapshot`（标量没有增量的意义）。
 */
function mapMetricStreamMessage(
  message: HostKitSseMessage,
  request: ScreenHostResourceRequest,
): ScreenSourcePushEvent | undefined {
  if (message.event === 'heartbeat') return { type: 'heartbeat' };
  if (message.event === 'snapshot') {
    const series = readSeries(message.data);
    if (series === undefined) return undefined;
    if (request.resourceType === DEMO_SERIES) {
      return { type: 'snapshot', value: seriesTable(series.unit, series.points) };
    }
    const latest = series.points[series.points.length - 1];
    if (latest === undefined) return undefined;
    return { type: 'snapshot', value: scalarTable(request.resourceId, latest.value) };
  }
  if (message.event === 'point') {
    const point = readPoint((message.data as { readonly point?: unknown } | null)?.point);
    if (point === undefined) return undefined;
    if (request.resourceType === DEMO_SERIES) {
      return { type: 'append', rows: [{ t: formatClock(point.t), value: point.value }] };
    }
    return { type: 'snapshot', value: scalarTable(request.resourceId, point.value) };
  }
  return undefined;
}

function scalarTable(resourceId: string, value: number): ScreenJsonObject {
  return {
    fields: [{ id: 'value', label: `${resourceId} 当前值`, valueType: 'number' }],
    rows: [{ value }],
  };
}

function seriesTable(unit: string, points: readonly MetricPoint[]): ScreenJsonObject {
  return {
    fields: [
      { id: 't', label: '时间', valueType: 'string' },
      { id: 'value', label: `数值（${unit}）`, valueType: 'number' },
    ],
    rows: points.map((point) => ({
      // 图表按小时聚合；只保留 HH:mm，避免横轴被完整 ISO 串挤满。
      t: formatClock(point.t),
      value: point.value,
    })),
  };
}

function readSeries(
  value: unknown,
): { readonly unit: string; readonly points: readonly MetricPoint[] } | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { unit, points } = value as { readonly unit?: unknown; readonly points?: unknown };
  if (typeof unit !== 'string' || !Array.isArray(points)) return undefined;
  const parsed = points.map(readPoint);
  if (parsed.some((point) => point === undefined)) return undefined;
  return { unit, points: parsed as MetricPoint[] };
}

function readPoint(value: unknown): MetricPoint | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { t, value: reading } = value as { readonly t?: unknown; readonly value?: unknown };
  if (typeof t !== 'string' || typeof reading !== 'number' || !Number.isFinite(reading)) {
    return undefined;
  }
  return { t, value: reading };
}

function readPoints(value: ScreenJsonValue | undefined): number {
  return readBoundedNumber(value, DEFAULT_POINTS, 1, MAX_POINTS);
}

/** 端口收到的 `params` 已把 literal / variable 参数求值成普通 JSON，这里做有界读取。 */
function readBoundedNumber(
  value: ScreenJsonValue | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) return fallback;
  return numeric;
}

function formatClock(timestamp: string): string {
  const matched = /T(\d{2}):(\d{2})/.exec(timestamp);
  return matched === null ? timestamp : `${matched[1]}:${matched[2]}`;
}

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
