import type {
  ScreenDiagnostic,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';

const logger = createLogger('host-data-channel');

/** 宿主授权的 resourceType 白名单：未授权即失败关闭，不静默放行。 */
const AUTHORIZED_RESOURCE_TYPE = 'demo_metric';
const DEFAULT_POINTS = 24;
const MAX_POINTS = 120;

/**
 * 宿主数据通道（resourcePort）：把文档中的 host-resource dataSource 解析成
 * 对共享后端 `/api/metrics/series` 的查询，并投影为表格数据。
 * 实现依据 docs/usage/host-data.md；只返回安全投影，不泄露连接信息。
 */
export function createHostResourcePort(): ScreenHostResourcePort {
  return {
    async resolve({
      resourceType,
      resourceId,
      params,
    }): Promise<ScreenParseResult<ScreenJsonValue>> {
      if (resourceType !== AUTHORIZED_RESOURCE_TYPE) {
        return failure('HOST_RESOURCE_ACCESS_DENIED', `未授权的资源类型：${resourceType}`);
      }
      const points = readPoints(params);
      const result = await api.metricSeries(resourceId, points);
      if (!result.ok) {
        return failure('HOST_RESOURCE_UNAVAILABLE', result.error.message);
      }
      // 指标读数类标量绑定只消费最新一个点；序列全量仍可由图表类物料使用。
      const latest = result.data.points[result.data.points.length - 1];
      if (latest === undefined) {
        return failure('HOST_RESOURCE_INVALID', `指标无数据：${resourceId}`);
      }
      // 表格数据（ScreenTabularDataset 形状）以普通对象字面量返回。
      logger.debug('resolved host resource', { resourceId, points, value: latest.value });
      return {
        ok: true,
        value: {
          fields: [{ id: 'value', label: `${resourceId} 当前值`, valueType: 'number' }],
          rows: [{ value: latest.value }],
        },
        diagnostics: [],
      };
    },
  };
}

/**
 * 端口收到的 `params` 已经把 literal / variable 参数求值成普通 JSON（见
 * docs/usage/host-data.md），因此这里直接读数值并做有界校验。
 */
function readPoints(params: Readonly<Record<string, ScreenJsonValue>>): number {
  const value = Number(params.points);
  if (!Number.isInteger(value) || value < 1 || value > MAX_POINTS) return DEFAULT_POINTS;
  return value;
}

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
