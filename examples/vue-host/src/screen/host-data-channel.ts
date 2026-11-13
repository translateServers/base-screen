import type {
  ScreenDiagnostic,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenParseResult,
} from 'base-screen/contracts';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import { createLogger } from '../lib/logger';

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
const DEFAULT_POINTS = 24;
const MAX_POINTS = 120;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

/**
 * 宿主数据通道（resourcePort）：把文档中的 host-resource dataSource 解析成
 * 对共享后端的查询，并投影为表格数据。只返回安全投影，不泄露连接信息。
 */
export function createHostResourcePort(): ScreenHostResourcePort {
  return {
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
        const points = readBoundedNumber(params.points, DEFAULT_POINTS, 1, MAX_POINTS);
        const result = await api.metricSeries(resourceId, points);
        if (!result.ok) return failure('HOST_RESOURCE_UNAVAILABLE', result.error.message);
        const latest = result.data.points[result.data.points.length - 1];
        if (latest === undefined)
          return failure('HOST_RESOURCE_INVALID', `指标无数据：${resourceId}`);
        logger.debug('resolved scalar metric', { resourceId, value: latest.value });
        return {
          ok: true,
          value: {
            fields: [{ id: 'value', label: `${resourceId} 当前值`, valueType: 'number' }],
            rows: [{ value: latest.value }],
          },
          diagnostics: [],
        };
      }

      if (resourceType === DEMO_SERIES) {
        const points = readBoundedNumber(params.points, DEFAULT_POINTS, 1, MAX_POINTS);
        const result = await api.metricSeries(resourceId, points);
        if (!result.ok) return failure('HOST_RESOURCE_UNAVAILABLE', result.error.message);
        return {
          ok: true,
          value: {
            fields: [
              { id: 't', label: '时间', valueType: 'string' },
              { id: 'value', label: `数值（${result.data.unit}）`, valueType: 'number' },
            ],
            rows: result.data.points.map((point) => ({
              // 图表按小时聚合；只保留 HH:mm，避免横轴被完整 ISO 串挤满。
              t: formatClock(point.t),
              value: point.value,
            })),
          },
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
