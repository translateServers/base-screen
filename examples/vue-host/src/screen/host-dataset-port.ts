import { createHostDatasetPort as createDatasetPort } from '@base-screen/host-kit';
import type {
  ScreenDatasetGroup,
  ScreenHostDatasetPort,
  ScreenJsonObject,
  ScreenTabularDataset,
} from '@base-screen/sdk/contracts';
import type { ApiResult, DatasetListQuery, DatasetQueryParams } from '../lib/api';
import type { Logger } from '../lib/logger';

/** 数据集端口依赖的最小业务 API 面，便于注入与单测。 */
export interface DatasetPortApi {
  listDatasets(
    query: DatasetListQuery,
    signal?: AbortSignal,
  ): Promise<
    ApiResult<{
      readonly groups: readonly ScreenDatasetGroup[];
      readonly items: readonly unknown[];
      readonly nextCursor?: string;
    }>
  >;
  describeDataset(datasetId: string, signal?: AbortSignal): Promise<ApiResult<unknown>>;
  queryDataset(
    datasetId: string,
    params: DatasetQueryParams,
    signal?: AbortSignal,
  ): Promise<ApiResult<unknown>>;
}

export interface DatasetPortDeps {
  readonly api: DatasetPortApi;
  readonly logger: Logger;
  /** 查看页的故障注入；生产接入不传。 */
  readonly failCode?: () => string | undefined;
}

export interface DatasetAlertRow {
  readonly level: string;
  readonly deviceName: string;
  readonly message: string;
}

export interface DatasetOutcome {
  readonly at: number;
  readonly ok: boolean;
  readonly code?: string;
}

export interface DatasetPortSnapshot {
  readonly alarms: readonly DatasetAlertRow[];
  readonly lastOutcome: DatasetOutcome | undefined;
}

/** 宿主快照只供自身业务读取，不进入基座契约。 */
export interface HostDatasetPort extends ScreenHostDatasetPort {
  readonly snapshot: () => DatasetPortSnapshot;
}

const ALARM_CACHE_LIMIT = 20;

/** 复用现有业务 API；官方辅助层拥有协议校验、取消、分组缓存和错误归一化。 */
export function createHostDatasetPort(deps: DatasetPortDeps): HostDatasetPort {
  const { api, logger } = deps;
  let alarms: readonly DatasetAlertRow[] = [];
  let lastOutcome: DatasetOutcome | undefined;
  const record = (ok: boolean, code?: string): void => {
    lastOutcome = code === undefined ? { at: Date.now(), ok } : { at: Date.now(), ok, code };
  };
  const port = createDatasetPort({
    groups: {
      execute: (_request, signal) => api.listDatasets({ query: '', limit: 1 }, signal),
      response: (payload) => payload.groups,
    },
    list: {
      execute: (request, signal) =>
        api.listDatasets(
          {
            query: request.query,
            limit: request.limit,
            ...(request.groupId === undefined ? {} : { groupId: request.groupId }),
            ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
          },
          signal,
        ),
      response: (payload) => ({
        items: payload.items,
        ...(payload.nextCursor === undefined ? {} : { nextCursor: payload.nextCursor }),
      }),
    },
    describe: {
      execute: ({ datasetId }, signal) => api.describeDataset(datasetId, signal),
    },
    query: {
      execute: (request, signal) => {
        const params = toQueryParams(request.params);
        const failCode = deps.failCode?.();
        if (failCode !== undefined) params.fail = failCode;
        return api.queryDataset(request.datasetId, params, signal);
      },
    },
    onListResult: ({ result }) => {
      if (result.ok) logger.debug('datasets listed', { count: result.value.items.length });
    },
    onDescribeResult: ({ request, result, error }) => {
      record(result.ok, result.ok ? undefined : (error?.code ?? 'HOST_DATASET_INVALID'));
      if (result.ok) logger.debug('dataset described', { datasetId: request.datasetId });
    },
    onQueryResult: ({ request, result, error }) => {
      record(result.ok, result.ok ? undefined : (error?.code ?? 'HOST_DATASET_INVALID'));
      if (!result.ok) return;
      if (request.datasetId === 'monitor.alarms') alarms = toAlertRows(result.value.rows);
      logger.debug('dataset queried', {
        datasetId: request.datasetId,
        rowCount: result.value.rows.length,
      });
    },
  });
  return { ...port, snapshot: () => ({ alarms, lastOutcome }) };
}

/** 布尔值转成现有业务 API 接受的 URL 字符串，忽略对象和数组。 */
function toQueryParams(params: ScreenJsonObject): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') result[key] = value;
    if (typeof value === 'boolean') result[key] = String(value);
  }
  return result;
}

function toAlertRows(rows: ScreenTabularDataset['rows']): readonly DatasetAlertRow[] {
  const alerts: DatasetAlertRow[] = [];
  for (const row of rows.slice(0, ALARM_CACHE_LIMIT)) {
    const level = row.level;
    const deviceName = row.deviceName;
    const message = row.message;
    if (typeof level !== 'string' || typeof deviceName !== 'string') continue;
    alerts.push({ level, deviceName, message: typeof message === 'string' ? message : '' });
  }
  return alerts;
}
