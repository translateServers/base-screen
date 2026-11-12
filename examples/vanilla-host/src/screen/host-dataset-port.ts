import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenTabularDataset,
  type ScreenAbortSignal,
  type ScreenDatasetDefinition,
  type ScreenDatasetEntries,
  type ScreenDatasetGroup,
  type ScreenDatasetQueryRequest,
  type ScreenDiagnostic,
  type ScreenHostDatasetPort,
  type ScreenJsonObject,
  type ScreenParseResult,
  type ScreenTabularDataset,
} from '@base-screen/sdk/contracts';
import type { ApiError, ApiResult, DatasetListQuery, DatasetQueryParams } from '../lib/api';
import type { Logger } from '../lib/logger';

/** 数据集端口依赖的最小 API 面：注入后可单测，不需要真的起后端。 */
export interface DatasetPortApi {
  listDatasets(
    query: DatasetListQuery,
    signal?: AbortSignal,
  ): Promise<
    ApiResult<{
      readonly groups: readonly ScreenDatasetGroup[];
      readonly items: readonly unknown[];
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
  /**
   * 故障注入：返回 `'500'` 时把 `fail=500` 追加到每次 query 的 query string。
   * 生产代码不传（只由查看页在 `?fail=500` 时注入）。
   */
  readonly failCode?: () => string | undefined;
}

/** 告警行：`production.notice` 变量用最近一批告警文案，不额外发请求。 */
export interface DatasetAlertRow {
  readonly level: string;
  readonly deviceName: string;
  readonly message: string;
}

/** 最近一次数据集请求的结果，供 `production.status` 与冒烟读取。 */
export interface DatasetOutcome {
  readonly at: number;
  readonly ok: boolean;
  readonly code?: string;
}

export interface DatasetPortSnapshot {
  readonly alarms: readonly DatasetAlertRow[];
  readonly lastOutcome: DatasetOutcome | undefined;
}

/** 端口本体 + 宿主自用的只读快照（不进入 contracts，避免给基座加义务）。 */
export interface HostDatasetPort extends ScreenHostDatasetPort {
  readonly snapshot: () => DatasetPortSnapshot;
}

const GROUPS_TTL_MS = 60_000;
const ALARM_CACHE_LIMIT = 20;

/**
 * 数据集端口：`GET /api/datasets*` → `ScreenHostDatasetPort`。
 *
 * 三条容易踩空的契约细节：
 * 1. `ScreenDatasetEntries` 是 **strictObject**（只允许 `items`/`nextCursor`）：后端
 *    `{ groups, items }` 必须剥掉 `groups` 再返回，否则 contracts 解析直接判失败。
 * 2. `query(request, options)` 的 abort signal 在**第二个参数**上（`ScreenDatasetQueryRequest`
 *    里没有 signal）；被取消时返回**空诊断**——非空诊断会在控制台留下"失败"噪声，
 *    而取消不是失败。
 * 3. `params` 已由基座按 `describe().parameters` 校验并求值成纯值，端口不再校验，
 *    只负责拼 query string；**不下发 `componentId`**（后端 `forbidNonWhitelisted` 会 400）。
 */
export function createHostDatasetPort(deps: DatasetPortDeps): HostDatasetPort {
  const { api, logger } = deps;
  let groupsCache:
    | { readonly at: number; readonly value: readonly ScreenDatasetGroup[] }
    | undefined;
  let alarms: readonly DatasetAlertRow[] = [];
  let lastOutcome: DatasetOutcome | undefined;

  const record = (ok: boolean, code?: string): void => {
    lastOutcome = code === undefined ? { at: Date.now(), ok } : { at: Date.now(), ok, code };
  };

  return {
    // 同参数并发合并的显式声明：没有它，同一数据集的多次相同查询会各发一次。
    queryScope: 'dataset',
    snapshot: () => ({ alarms, lastOutcome }),

    async groups({ signal }) {
      const cached = groupsCache;
      if (cached !== undefined && Date.now() - cached.at < GROUPS_TTL_MS) {
        return { ok: true, value: cached.value, diagnostics: [] };
      }
      // 复用 list 的 `groups` 字段（`limit=1` 让成本与"只取分组"同级），不为分组单开接口。
      const response = await api.listDatasets({ query: '', limit: 1 }, signalOf(signal));
      if (!response.ok) {
        if (response.error.code === 'ABORTED' || signal.aborted) return cancelled();
        return failure(mapApiError(response.error), response.error.message);
      }
      const groups = Array.isArray(response.data.groups) ? response.data.groups : [];
      groupsCache = { at: Date.now(), value: groups };
      return { ok: true, value: groups, diagnostics: [] };
    },

    async list(request): Promise<ScreenParseResult<ScreenDatasetEntries>> {
      const query: DatasetListQuery = {
        query: request.query,
        limit: request.limit,
        ...(request.groupId === undefined ? {} : { groupId: request.groupId }),
      };
      return list(query, request.signal, api, logger);
    },

    async describe({ datasetId, signal }): Promise<ScreenParseResult<ScreenDatasetDefinition>> {
      const response = await api.describeDataset(datasetId, signalOf(signal));
      if (!response.ok) {
        if (response.error.code === 'ABORTED' || signal.aborted) return cancelled();
        record(false, response.error.code);
        return failure(mapApiError(response.error), response.error.message);
      }
      const parsed = parseScreenDatasetDefinition(response.data);
      if (!parsed.ok) {
        record(false, 'HOST_DATASET_INVALID');
        return failure('HOST_DATASET_INVALID', `数据集定义格式无效：${datasetId}`);
      }
      record(true);
      logger.debug('dataset described', { datasetId });
      return parsed;
    },

    async query(
      request: ScreenDatasetQueryRequest,
      options,
    ): Promise<ScreenParseResult<ScreenTabularDataset>> {
      const signal = options.signal;
      const params = toQueryParams(request.params);
      const failCode = deps.failCode?.();
      if (failCode !== undefined) params.fail = failCode;
      const response = await api.queryDataset(request.datasetId, params, signalOf(signal));
      if (!response.ok) {
        // 取消不是失败：空诊断让"用户切页/切变量"不在控制台留下噪声。
        if (response.error.code === 'ABORTED' || signal.aborted) return cancelled();
        record(false, response.error.code);
        return failure(mapApiError(response.error), response.error.message);
      }
      const parsed = parseScreenTabularDataset(response.data);
      if (!parsed.ok) {
        record(false, 'HOST_DATASET_INVALID');
        return failure('HOST_DATASET_INVALID', `数据集返回格式无效：${request.datasetId}`);
      }
      record(true);
      if (request.datasetId === 'monitor.alarms') {
        alarms = toAlertRows(parsed.value.rows);
      }
      logger.debug('dataset queried', {
        datasetId: request.datasetId,
        rowCount: parsed.value.rows.length,
      });
      return parsed;
    },
  };
}

async function list(
  query: DatasetListQuery,
  signal: ScreenAbortSignal,
  api: DatasetPortApi,
  logger: Logger,
): Promise<ScreenParseResult<ScreenDatasetEntries>> {
  const response = await api.listDatasets(query, signalOf(signal));
  if (!response.ok) {
    if (response.error.code === 'ABORTED' || signal.aborted) return cancelled();
    return failure(mapApiError(response.error), response.error.message);
  }
  const items = Array.isArray(response.data.items) ? response.data.items : undefined;
  if (items === undefined) {
    return failure('HOST_DATASET_INVALID', '数据集目录格式无效。');
  }
  // 剥掉 `groups`：ScreenDatasetEntries 是 strictObject，多一个键就解析失败。
  const parsed = parseScreenDatasetEntries({ items });
  if (!parsed.ok) {
    return failure('HOST_DATASET_INVALID', '数据集目录格式无效。');
  }
  logger.debug('datasets listed', { count: parsed.value.items.length });
  return parsed;
}

/** `params` 已是纯值：布尔值映射为 URL 字符串，不再校验取值域（基座已按定义校验）。 */
function toQueryParams(params: ScreenJsonObject): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') result[key] = value;
    if (typeof value === 'boolean') result[key] = String(value);
  }
  return result;
}

/**
 * `ScreenAbortSignal` 只是 `AbortSignal` 的结构子集（没有 `reason`/`throwIfAborted` 等），
 * 而 `fetch` 需要真实例：用本地 controller 做桥接，aborted 时同步传导。
 */
function signalOf(source: ScreenAbortSignal | undefined): AbortSignal | undefined {
  if (source === undefined) return undefined;
  const controller = new AbortController();
  if (source.aborted) {
    controller.abort();
    return controller.signal;
  }
  source.addEventListener('abort', () => controller.abort(), { once: true });
  return controller.signal;
}

/**
 * 错误码映射：后端语义 → 物料能看到的冻结码。
 *
 * 物料侧只会收到冻结集（8 个码），但这里仍按"最接近的原因"映射——因为宿主自己也读
 * 这份诊断写状态文案，且未来冻结集扩展时无需改动。
 */
function mapApiError(error: ApiError): ScreenDiagnostic['code'] {
  if (error.code === 'UNKNOWN_DATASET' || error.status === 404) return 'HOST_DATASET_UNAVAILABLE';
  if (error.status === 400 || error.status === 422) return 'HOST_DATASET_PARAMETER_INVALID';
  if (error.status === 0 || error.status >= 500) return 'HOST_DATASET_UNAVAILABLE';
  return 'HOST_DATASET_UNAVAILABLE';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

/** 取消：空诊断表示"这次请求不算失败也不算成功"。 */
function cancelled(): ScreenParseResult<never> {
  return { ok: false, diagnostics: [] };
}
