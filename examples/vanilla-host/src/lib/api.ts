import type {
  DatasetCatalog,
  DatasetDefinition,
  MetricRanking,
  MetricSeries,
  ScreenShape,
  ScreenSummaryShape,
  TabularDataset,
} from '../types';
import { resolveApiBase } from './api-base';

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError };

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  /** 幂等 GET 的网络层重试次数（默认 1 次）。 */
  readonly retries?: number;
  readonly signal?: AbortSignal;
}

const NETWORK_ERROR: ApiError = {
  code: 'NETWORK',
  message: '网络请求失败，请确认后端服务已启动。',
  status: 0,
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, retries = 1, signal } = options;
  const attempts = method === 'GET' ? Math.max(1, retries) : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`${resolveApiBase()}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        // exactOptionalPropertyTypes 下不能显式传 undefined：按需展开。
        ...(signal === undefined ? {} : { signal }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: toApiError(payload, response.status) };
      return { ok: true, data: payload as T };
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, error: { code: 'ABORTED', message: '请求已取消。', status: 0 } };
      }
      if (attempt >= attempts) return { ok: false, error: NETWORK_ERROR };
    }
  }
}

function toApiError(payload: unknown, status: number): ApiError {
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && typeof record.message === 'string') {
      return { code: record.error, message: record.message, status };
    }
  }
  return { code: `HTTP_${status}`, message: `请求失败（${status}）。`, status };
}

/** query string 构造：`undefined` 与空串不落进 URL（后端 `forbidNonWhitelisted` 对空值也会校验）。 */
function toSearch(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

export interface DatasetListQuery {
  readonly query?: string;
  readonly groupId?: string;
  readonly limit?: number;
}

/** 数据集 query 参数：键是基座求值后的纯值（字符串/数字），由调用方拼。 */
export type DatasetQueryParams = Readonly<Record<string, string | number | undefined>>;

export const api = {
  health: (): Promise<ApiResult<{ status: string }>> => request('/health'),
  listScreens: (): Promise<ApiResult<{ screens: ScreenSummaryShape[] }>> => request('/screens'),
  createScreen: (name: string): Promise<ApiResult<{ screen: ScreenShape }>> =>
    request('/screens', { method: 'POST', body: { name } }),
  getScreen: (id: string, signal?: AbortSignal): Promise<ApiResult<{ screen: ScreenShape }>> =>
    request(`/screens/${encodeURIComponent(id)}`, signal === undefined ? {} : { signal }),
  updateScreen: (
    id: string,
    document: unknown,
    revision: number,
  ): Promise<ApiResult<{ screen: ScreenShape }>> =>
    request(`/screens/${encodeURIComponent(id)}`, { method: 'PUT', body: { document, revision } }),
  deleteScreen: (id: string): Promise<ApiResult<{ ok: true }>> =>
    request(`/screens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  metricSeries: (metric: string, points: number): Promise<ApiResult<MetricSeries>> =>
    request(`/metrics/series?metric=${encodeURIComponent(metric)}&points=${points}`),
  metricRanking: (dimension: string, limit: number): Promise<ApiResult<MetricRanking>> =>
    request(`/metrics/ranking?dimension=${encodeURIComponent(dimension)}&limit=${limit}`),
  /** 数据集目录：分组与条目一次返回（宿主不复用这份分组做第二次请求）。 */
  listDatasets: (
    query: DatasetListQuery,
    signal?: AbortSignal,
  ): Promise<ApiResult<DatasetCatalog>> =>
    request(
      `/datasets${toSearch({ query: query.query, groupId: query.groupId, limit: query.limit })}`,
      signal === undefined ? {} : { signal },
    ),
  describeDataset: (
    datasetId: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<DatasetDefinition>> =>
    request(`/datasets/${encodeURIComponent(datasetId)}`, signal === undefined ? {} : { signal }),
  queryDataset: (
    datasetId: string,
    params: DatasetQueryParams,
    signal?: AbortSignal,
  ): Promise<ApiResult<TabularDataset>> =>
    request(
      `/datasets/${encodeURIComponent(datasetId)}/query${toSearch(params)}`,
      signal === undefined ? {} : { signal },
    ),
};
