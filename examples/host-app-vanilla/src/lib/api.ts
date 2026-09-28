import type { MetricSeries, ScreenShape, ScreenSummaryShape } from '../types';
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
};
