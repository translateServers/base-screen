import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenDatasetGroups,
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
  type HostKitHttpMapping,
  type HostKitHttpOptions,
  type HostKitHttpRequest,
  toAbortSignal,
  toHostKitSearch,
} from './http.js';

export interface RestDatasetPortOptions extends HostKitHttpOptions {
  /** 按操作映射既有后端；响应投影后仍由对应 contracts 解析器校验。 */
  readonly mapping?: {
    readonly groups?: HostKitHttpMapping<
      Parameters<NonNullable<ScreenHostDatasetPort['groups']>>[0]
    >;
    readonly list?: HostKitHttpMapping<Parameters<ScreenHostDatasetPort['list']>[0]>;
    readonly describe?: HostKitHttpMapping<Parameters<ScreenHostDatasetPort['describe']>[0]>;
    readonly query?: HostKitHttpMapping<Parameters<ScreenHostDatasetPort['query']>[0]>;
  };
}

const GROUPS_TTL_MS = 60_000;

/**
 * 默认对接 GET /datasets*；宿主可按操作映射请求与响应，无需重写端口。
 * 分组缓存 60s；list 仅剥除示例响应的 groups，保留 nextCursor；query 不下发组件身份。
 * 取消返回空诊断，HTTP 错误归一化，未知响应必须通过相应契约解析器。
 * fetch 与鉴权仍归宿主，不做重试或业务降级。
 */
export function createRestDatasetPort(options: RestDatasetPortOptions): ScreenHostDatasetPort {
  const http = createHostKitHttp(options);
  let groupsCache:
    | { readonly at: number; readonly value: readonly ScreenDatasetGroup[] }
    | undefined;

  async function execute<Request, Value>(
    request: Request,
    signal: Parameters<ScreenHostDatasetPort['list']>[0]['signal'],
    mapping: HostKitHttpMapping<Request> | undefined,
    defaultRequest: HostKitHttpRequest,
    parse: (payload: unknown) => ScreenParseResult<Value>,
    defaultResponse: (payload: unknown) => unknown = (payload) => payload,
  ): Promise<ScreenParseResult<Value>> {
    if (signal.aborted) return cancelled();
    let mapped: HostKitHttpRequest;
    try {
      mapped = mapping?.request?.(request) ?? defaultRequest;
    } catch {
      return signal.aborted ? cancelled() : failure('HOST_DATASET_INVALID', '数据集请求映射失败。');
    }
    if (signal.aborted) return cancelled();
    const response = await http.request<unknown>(mapped.path, {
      ...mapped,
      ...signalOption(signal),
    });
    if (isCancelled(response.ok ? undefined : response.error, signal)) return cancelled();
    if (!response.ok) return failure(mapDatasetError(response.error), response.error.message);
    try {
      const parsed = parse(
        mapping?.response
          ? mapping.response(response.data, request)
          : defaultResponse(response.data),
      );
      if (signal.aborted) return cancelled();
      return parsed.ok ? parsed : failure('HOST_DATASET_INVALID', '数据集响应格式无效。');
    } catch {
      return signal.aborted ? cancelled() : failure('HOST_DATASET_INVALID', '数据集响应格式无效。');
    }
  }

  return {
    queryScope: 'dataset',

    async groups(request) {
      if (request.signal.aborted) return cancelled();
      const cached = groupsCache;
      if (cached !== undefined && Date.now() - cached.at < GROUPS_TTL_MS) {
        return { ok: true, value: cached.value, diagnostics: [] };
      }
      const result = await execute(
        request,
        request.signal,
        options.mapping?.groups,
        { path: `/datasets${toHostKitSearch({ limit: 1 })}` },
        parseScreenDatasetGroups,
        (payload) => {
          if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
            return undefined;
          }
          return 'groups' in payload ? payload.groups : [];
        },
      );
      if (result.ok) groupsCache = { at: Date.now(), value: result.value };
      return result;
    },

    async list(request) {
      return execute(
        request,
        request.signal,
        options.mapping?.list,
        {
          path: `/datasets${toHostKitSearch({
            query: request.query,
            limit: request.limit,
            groupId: request.groupId,
            cursor: request.cursor,
          })}`,
        },
        parseScreenDatasetEntries,
        (payload) => {
          if (payload === null || typeof payload !== 'object' || !('items' in payload)) {
            return undefined;
          }
          return {
            items: payload.items,
            ...('nextCursor' in payload ? { nextCursor: payload.nextCursor } : {}),
          };
        },
      );
    },

    async describe(request) {
      return execute(
        request,
        request.signal,
        options.mapping?.describe,
        { path: `/datasets/${encodeURIComponent(request.datasetId)}` },
        parseScreenDatasetDefinition,
      );
    },

    async query(request, queryOptions) {
      return execute(
        request,
        queryOptions.signal,
        options.mapping?.query,
        {
          path: `/datasets/${encodeURIComponent(request.datasetId)}/query${toHostKitSearch(
            toQueryParams(request.params),
          )}`,
        },
        parseScreenTabularDataset,
      );
    },
  };
}

/** params 已按定义求值；URL 保留所有合法标量，不下发对象或数组。 */
function toQueryParams(params: ScreenJsonObject): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
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
  error: HostKitHttpError | undefined,
  signal: { readonly aborted: boolean } | undefined,
): boolean {
  return error?.code === 'ABORTED' || signal?.aborted === true;
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
