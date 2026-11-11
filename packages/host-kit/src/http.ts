import type { ScreenAbortSignal } from '@base-screen/contracts';

/** 归一化的 HTTP 错误：`status` 为 0 表示网络层失败或取消。 */
export interface HostKitHttpError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

export type HostKitHttpResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: HostKitHttpError };

export interface HostKitHttpRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface HostKitHttpOptions {
  /** API 基址（含前缀），例如 `http://127.0.0.1:3000/api`；末尾斜杠会被去掉。 */
  readonly baseUrl: string;
  /** 可注入的 fetch（默认全局 fetch），便于单测与非浏览器环境。 */
  readonly fetch?: typeof fetch;
}

export interface HostKitHttp {
  request<T>(path: string, options?: HostKitHttpRequestOptions): Promise<HostKitHttpResult<T>>;
}

const NETWORK_ERROR: HostKitHttpError = {
  code: 'NETWORK',
  message: '网络请求失败，请确认后端服务已启动。',
  status: 0,
};

/**
 * 最小 JSON HTTP 客户端：解析后端统一错误体 `{ error, message }`，把取消与网络失败
 * 归一成 `status: 0`。不做重试、不做缓存——这些归宿主。
 */
export function createHostKitHttp(options: HostKitHttpOptions): HostKitHttp {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');
  return {
    async request<T>(
      path: string,
      requestOptions: HostKitHttpRequestOptions = {},
    ): Promise<HostKitHttpResult<T>> {
      const { method = 'GET', body, signal } = requestOptions;
      try {
        const response = await doFetch(`${base}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          ...(signal === undefined ? {} : { signal }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) return { ok: false, error: toHttpError(payload, response.status) };
        return { ok: true, data: payload as T };
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { ok: false, error: { code: 'ABORTED', message: '请求已取消。', status: 0 } };
        }
        return { ok: false, error: NETWORK_ERROR };
      }
    },
  };
}

function toHttpError(payload: unknown, status: number): HostKitHttpError {
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && typeof record.message === 'string') {
      return { code: record.error, message: record.message, status };
    }
  }
  return { code: `HTTP_${status}`, message: `请求失败（${status}）。`, status };
}

/** query string：`undefined` 与空串不落进 URL（后端 `forbidNonWhitelisted` 对空值也校验）。 */
export function toHostKitSearch(
  params: Readonly<Record<string, string | number | undefined>>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * `ScreenAbortSignal` 只是 `AbortSignal` 的结构子集，而 fetch 需要真实例：
 * 用本地 controller 桥接，aborted 时同步传导。
 */
export function toAbortSignal(source: ScreenAbortSignal | undefined): AbortSignal | undefined {
  if (source === undefined) return undefined;
  const controller = new AbortController();
  if (source.aborted) {
    controller.abort();
    return controller.signal;
  }
  source.addEventListener('abort', () => controller.abort(), { once: true });
  return controller.signal;
}
