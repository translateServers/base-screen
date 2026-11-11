import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenTabularDataset,
  type ScreenDatasetGroup,
  type ScreenDiagnostic,
  type ScreenHostDatasetPort,
  type ScreenJsonObject,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  createHostKitHttp,
  type HostKitHttpError,
  type HostKitHttpOptions,
  toAbortSignal,
  toHostKitSearch,
} from './http.js';

export type RestDatasetPortOptions = HostKitHttpOptions;

const GROUPS_TTL_MS = 60_000;

/**
 * 数据集端口的 REST 实现，对接示例后端契约 `GET /datasets*`。内置四条容易踩空的硬规矩：
 *
 * 1. `list` 剥掉 `groups`：`ScreenDatasetEntries` 是 strictObject，多一个键就解析失败；
 *    分组由 `groups()` 复用 `list({limit:1})` 的 `groups` 字段并缓存 60s。
 * 2. `query` 的 abort signal 在**第二个参数**上；被取消时返回**空诊断**（取消不是失败）。
 * 3. `params` 已由基座按 `describe().parameters` 校验求值，端口只拼 query string，
 *    **不下发 `componentId`**（后端 `forbidNonWhitelisted` 会 400）。
 * 4. 错误码映射：404/`UNKNOWN_DATASET` → `HOST_DATASET_UNAVAILABLE`；400/422 →
 *    `HOST_DATASET_PARAMETER_INVALID`；网络失败/5xx → `HOST_DATASET_UNAVAILABLE`；
 *    响应形状不对 → `HOST_DATASET_INVALID`。
 *
 * `queryScope: 'dataset'` 开启同参数并发合并。告警快照、故障注入等业务 extras 归宿主，
 * 需要时在本端口外再包一层。
 */
export function createRestDatasetPort(options: RestDatasetPortOptions): ScreenHostDatasetPort {
  const http = createHostKitHttp(options);
  let groupsCache:
    | { readonly at: number; readonly value: readonly ScreenDatasetGroup[] }
    | undefined;

  const port: ScreenHostDatasetPort = {
    queryScope: 'dataset',

    async groups({ signal }) {
      const cached = groupsCache;
      if (cached !== undefined && Date.now() - cached.at < GROUPS_TTL_MS) {
        return { ok: true, value: cached.value, diagnostics: [] };
      }
      const response = await http.request<{ groups?: readonly ScreenDatasetGroup[] }>(
        `/datasets${toHostKitSearch({ limit: 1 })}`,
        { ...signalOption(signal) },
      );
      if (!response.ok) {
        if (isCancelled(response.error, signal)) return cancelled();
        return failure(mapDatasetError(response.error), response.error.message);
      }
      const groups = Array.isArray(response.data.groups) ? response.data.groups : [];
      groupsCache = { at: Date.now(), value: groups };
      return { ok: true, value: groups, diagnostics: [] };
    },

    async list(request) {
      const response = await http.request<{ items?: readonly unknown[] }>(
        `/datasets${toHostKitSearch({
          query: request.query,
          limit: request.limit,
          groupId: request.groupId,
        })}`,
        { ...signalOption(request.signal) },
      );
      if (!response.ok) {
        if (isCancelled(response.error, request.signal)) return cancelled();
        return failure(mapDatasetError(response.error), response.error.message);
      }
      const items = Array.isArray(response.data.items) ? response.data.items : undefined;
      if (items === undefined) return failure('HOST_DATASET_INVALID', '数据集目录格式无效。');
      // 剥掉 groups：ScreenDatasetEntries 是 strictObject，多一个键就解析失败。
      const parsed = parseScreenDatasetEntries({ items });
      if (!parsed.ok) return failure('HOST_DATASET_INVALID', '数据集目录格式无效。');
      return parsed;
    },

    async describe({ datasetId, signal }) {
      const response = await http.request<unknown>(`/datasets/${encodeURIComponent(datasetId)}`, {
        ...signalOption(signal),
      });
      if (!response.ok) {
        if (isCancelled(response.error, signal)) return cancelled();
        return failure(mapDatasetError(response.error), response.error.message);
      }
      const parsed = parseScreenDatasetDefinition(response.data);
      if (!parsed.ok) {
        return failure('HOST_DATASET_INVALID', `数据集定义格式无效：${datasetId}`);
      }
      return parsed;
    },

    async query(request, options) {
      const signal = options.signal;
      const response = await http.request<unknown>(
        `/datasets/${encodeURIComponent(request.datasetId)}/query${toHostKitSearch(
          toQueryParams(request.params),
        )}`,
        { ...signalOption(signal) },
      );
      if (!response.ok) {
        // 取消不是失败：空诊断让切页/切变量不在控制台留下噪声。
        if (isCancelled(response.error, signal)) return cancelled();
        return failure(mapDatasetError(response.error), response.error.message);
      }
      const parsed = parseScreenTabularDataset(response.data);
      if (!parsed.ok) {
        return failure('HOST_DATASET_INVALID', `数据集返回格式无效：${request.datasetId}`);
      }
      return parsed;
    },
  };
  return port;
}

/** params 已是纯值：只保留 string/number，不再校验取值域（基座已按定义校验）。 */
function toQueryParams(params: ScreenJsonObject): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') result[key] = value;
  }
  return result;
}

function signalOption(signal: Parameters<ScreenHostDatasetPort['list']>[0]['signal']): {
  signal?: AbortSignal;
} {
  const bridged = toAbortSignal(signal);
  return bridged === undefined ? {} : { signal: bridged };
}

function isCancelled(
  error: HostKitHttpError,
  signal: { readonly aborted: boolean } | undefined,
): boolean {
  return error.code === 'ABORTED' || signal?.aborted === true;
}

function mapDatasetError(error: HostKitHttpError): ScreenDiagnostic['code'] {
  if (error.code === 'UNKNOWN_DATASET' || error.status === 404) return 'HOST_DATASET_UNAVAILABLE';
  if (error.status === 400 || error.status === 422) return 'HOST_DATASET_PARAMETER_INVALID';
  return 'HOST_DATASET_UNAVAILABLE';
}

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

/** 取消：空诊断表示这次请求不算失败也不算成功。 */
function cancelled(): ScreenParseResult<never> {
  return { ok: false, diagnostics: [] };
}
