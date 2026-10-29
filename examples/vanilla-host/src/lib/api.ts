import type {
  AgentGenerateShape,
  DatasetCatalog,
  DatasetDefinition,
  HostAssetShape,
  MetricRanking,
  MetricSeries,
  OnlineMaterialPackageShape,
  ScreenShape,
  ScreenSummaryShape,
  TabularDataset,
} from '../types';
import { resolveApiBase } from './api-base';
import type {
  DatabaseFileShape,
  DatabaseSchemaShape,
  DatasourceDetail,
  DatasourceListResponse,
  DatasourcePreviewResponse,
  DatasourceTestResponse,
  DatasourceType,
  StoredDatasourceType,
} from './datasource-model';

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  /**
   * 错误体的原始附加字段（`suggestedId` / `refScreens` / `fields` …）。
   *
   * `AllExceptionsFilter` 会把业务异常里的额外顶层字段平铺进响应，UI 需要它们：
   * 409 冲突要显示建议名、删除保护要列出引用它的大屏。丢掉就只能猜。
   */
  readonly payload?: Readonly<Record<string, unknown>>;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError };

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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

/** multipart 上传单独走一条路径：不能设置 Content-Type，交给浏览器生成 boundary。 */
async function requestForm<T>(path: string, body: FormData): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${resolveApiBase()}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: toApiError(payload, response.status) };
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

function toApiError(payload: unknown, status: number): ApiError {
  if (payload !== null && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && typeof record.message === 'string') {
      return { code: record.error, message: record.message, status, payload: record };
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

export interface AssetListQuery {
  /** 后台：public（默认）或 temporary；省略时由后端返回公共素材。 */
  readonly scope?: 'public' | 'temporary';
  /** 设计器：返回公共 + 当前大屏临时素材。 */
  readonly screenId?: string;
}

export interface AssetUploadQuery {
  /** 设计器临时上传必须同时提供 scope=temporary 与 screenId。 */
  readonly scope?: 'temporary';
  readonly screenId?: string;
}

export interface DatasetListQuery {
  readonly query?: string;
  readonly groupId?: string;
  readonly limit?: number;
}

/** 数据集 query 参数：键是基座求值后的纯值（字符串/数字），由调用方拼。 */
export type DatasetQueryParams = Readonly<Record<string, string | number | undefined>>;

/** 列表筛选（`type` 缺省=all）。 */
export interface DatasourceListQuery {
  readonly type?: DatasourceType | 'all';
  readonly query?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** 新建/编辑的请求体（`description` 空必须传 null：契约 `text.min(1)` 不接受空串）。 */
export interface DatasourceSaveBody {
  readonly name: string;
  readonly description: string | null;
  readonly type: StoredDatasourceType;
  readonly config: Record<string, unknown>;
}

/** 测试/预览的草稿请求体（不落库）。 */
export interface DatasourceDraftBody {
  readonly type: StoredDatasourceType;
  readonly config: Record<string, unknown>;
  readonly values?: Readonly<Record<string, string | number>>;
}

export interface OnlineMaterialPackageSaveBody {
  readonly type: string;
  readonly name: string;
  readonly manifest: Record<string, unknown>;
  readonly code: string;
}

export interface OnlineMaterialPackageUpdateBody extends OnlineMaterialPackageSaveBody {
  readonly revision: number;
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
  /**
   * 示例智能体生成一屏（示例接线：设计器右栏的书写面经这里落到后端）。
   *
   * 后端会**新建一张屏**并返回它的 document；没配模型或模型输出不可用时退回确定性
   * 结构，响应里的 `mode` 如实标注实际通道。`signal` 用于用户取消，取消后不产生提案。
   */
  generateScreen: (topic: string, signal?: AbortSignal): Promise<ApiResult<AgentGenerateShape>> =>
    request('/agent/generate', {
      method: 'POST',
      body: { topic },
      ...(signal === undefined ? {} : { signal }),
    }),
  getScreenAlarmBindings: (
    id: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<{ bindings: Record<string, unknown> }>> =>
    request(
      `/screens/${encodeURIComponent(id)}/alarm-bindings`,
      signal === undefined ? {} : { signal },
    ),
  updateScreenAlarmBindings: (
    id: string,
    bindings: unknown,
  ): Promise<ApiResult<{ bindings: Record<string, unknown> }>> =>
    request(`/screens/${encodeURIComponent(id)}/alarm-bindings`, {
      method: 'PUT',
      body: { bindings },
    }),
  metricSeries: (metric: string, points: number): Promise<ApiResult<MetricSeries>> =>
    request(`/metrics/series?metric=${encodeURIComponent(metric)}&points=${points}`),
  metricRanking: (dimension: string, limit: number): Promise<ApiResult<MetricRanking>> =>
    request(`/metrics/ranking?dimension=${encodeURIComponent(dimension)}&limit=${limit}`),

  // ---- 宿主素材库（ADR-0089） ----
  listAssets: (
    query: AssetListQuery = {},
    signal?: AbortSignal,
  ): Promise<ApiResult<{ assets: HostAssetShape[] }>> =>
    request(
      `/assets${toSearch({ scope: query.scope, screenId: query.screenId })}`,
      signal === undefined ? {} : { signal },
    ),
  uploadAsset: (
    file: File,
    query: AssetUploadQuery = {},
  ): Promise<ApiResult<{ asset: HostAssetShape }>> => {
    const form = new FormData();
    form.append('file', file);
    return requestForm(
      `/assets${toSearch({ scope: query.scope, screenId: query.screenId })}`,
      form,
    );
  },
  deleteAsset: (id: string): Promise<ApiResult<{ deleted: true; id: string }>> =>
    request(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ---- 在线物料包（ADR-0090） ----
  listMaterialPackages: (
    signal?: AbortSignal,
  ): Promise<ApiResult<{ packages: OnlineMaterialPackageShape[] }>> =>
    request('/material-packages', signal === undefined ? {} : { signal }),
  createMaterialPackage: (
    body: OnlineMaterialPackageSaveBody,
  ): Promise<ApiResult<{ package: OnlineMaterialPackageShape }>> =>
    request('/material-packages', { method: 'POST', body }),
  updateMaterialPackage: (
    id: string,
    body: OnlineMaterialPackageUpdateBody,
  ): Promise<ApiResult<{ package: OnlineMaterialPackageShape }>> =>
    request(`/material-packages/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  setMaterialPackageVisibility: (
    id: string,
    visible: boolean,
  ): Promise<ApiResult<{ package: OnlineMaterialPackageShape }>> =>
    request(`/material-packages/${encodeURIComponent(id)}/visibility`, {
      method: 'PATCH',
      body: { visible },
    }),
  deleteMaterialPackage: (id: string): Promise<ApiResult<{ deleted: true; id: string }>> =>
    request(`/material-packages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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

  // ---- 数据源管理（PRD §9.1 #1–#10） ----
  //
  // 注意：`testDatasourceDraft` / `testDatasourceStored` / `previewDatasource` 的成功响应是
  // **200 + body.ok**，`ok:false` 表示"测试没通过"而不是"接口挂了"——调用方必须看 body.ok，
  // 不能用 `ApiResult.ok` 判业务成败（后者只表示 HTTP/网络层成功）。
  listDatasources: (
    query: DatasourceListQuery,
    signal?: AbortSignal,
  ): Promise<ApiResult<DatasourceListResponse>> =>
    request(
      `/datasources${toSearch({
        type: query.type,
        query: query.query,
        limit: query.limit,
        offset: query.offset,
      })}`,
      signal === undefined ? {} : { signal },
    ),
  getDatasource: (datasetId: string, signal?: AbortSignal): Promise<ApiResult<DatasourceDetail>> =>
    request(
      `/datasources/${encodeURIComponent(datasetId)}`,
      signal === undefined ? {} : { signal },
    ),
  createDatasource: (body: DatasourceSaveBody): Promise<ApiResult<DatasourceDetail>> =>
    request('/datasources', { method: 'POST', body }),
  updateDatasource: (
    datasetId: string,
    body: DatasourceSaveBody,
  ): Promise<ApiResult<DatasourceDetail>> =>
    request(`/datasources/${encodeURIComponent(datasetId)}`, { method: 'PUT', body }),
  deleteDatasource: (datasetId: string): Promise<ApiResult<{ deleted: true; datasetId: string }>> =>
    request(`/datasources/${encodeURIComponent(datasetId)}`, { method: 'DELETE' }),
  testDatasourceDraft: (body: DatasourceDraftBody): Promise<ApiResult<DatasourceTestResponse>> =>
    request('/datasources/test', { method: 'POST', body }),
  /** 用**库里已存的配置**（含真实 header 原值）测试：掩码不影响连通性验证。 */
  testDatasourceStored: (datasetId: string): Promise<ApiResult<DatasourceTestResponse>> =>
    request(`/datasources/${encodeURIComponent(datasetId)}/test`, { method: 'POST' }),
  previewDatasource: (body: DatasourceDraftBody): Promise<ApiResult<DatasourcePreviewResponse>> =>
    request('/datasources/preview', { method: 'POST', body }),
  listDatabaseFiles: (signal?: AbortSignal): Promise<ApiResult<{ files: DatabaseFileShape[] }>> =>
    request('/datasources/database-files', signal === undefined ? {} : { signal }),
  describeDatabaseFile: (
    name: string,
    signal?: AbortSignal,
  ): Promise<ApiResult<DatabaseSchemaShape>> =>
    request(
      `/datasources/database-files/${encodeURIComponent(name)}/tables`,
      signal === undefined ? {} : { signal },
    ),
};
