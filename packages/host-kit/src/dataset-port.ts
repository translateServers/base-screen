import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenDatasetGroups,
  parseScreenTabularDataset,
  type ScreenAbortSignal,
  type ScreenDatasetDefinition,
  type ScreenDatasetEntries,
  type ScreenDatasetGroup,
  type ScreenDiagnostic,
  type ScreenHostDatasetPort,
  type ScreenJsonObject,
  type ScreenParseResult,
  type ScreenResourceExecutionContext,
  type ScreenTabularDataset,
} from '@base-screen/contracts';
import {
  createHostKitHttp,
  type HostKitHttpMapping,
  type HostKitHttpOptions,
  toHostKitSearch,
} from './http.js';
import {
  createHttpOperation,
  executeHostKitOperation,
  type HostKitOperation,
  type HostKitOperationError,
  type HostKitOperationObserver,
  observeHostKitOperation,
} from './operation.js';

type GroupsRequest = Parameters<NonNullable<ScreenHostDatasetPort['groups']>>[0];
type ListRequest = Parameters<ScreenHostDatasetPort['list']>[0];
type DescribeRequest = Parameters<ScreenHostDatasetPort['describe']>[0];
type QueryRequest = Parameters<ScreenHostDatasetPort['query']>[0];

export interface HostDatasetPortOptions<
  GroupsPayload = unknown,
  ListPayload = unknown,
  DescribePayload = unknown,
  QueryPayload = unknown,
> {
  readonly groups?: HostKitOperation<GroupsRequest, GroupsPayload>;
  readonly list: HostKitOperation<ListRequest, ListPayload>;
  readonly describe: HostKitOperation<DescribeRequest, DescribePayload>;
  readonly query: HostKitOperation<QueryRequest, QueryPayload>;
  readonly onListResult?: HostKitOperationObserver<ListRequest, ScreenDatasetEntries>;
  readonly onDescribeResult?: HostKitOperationObserver<DescribeRequest, ScreenDatasetDefinition>;
  readonly onQueryResult?: HostKitOperationObserver<QueryRequest, ScreenTabularDataset>;
}

export interface RestDatasetPortOptions extends HostKitHttpOptions {
  /** 按操作映射既有后端；响应投影后仍由对应 contracts 解析器校验。 */
  readonly mapping?: {
    readonly groups?: HostKitHttpMapping<GroupsRequest>;
    readonly list?: HostKitHttpMapping<ListRequest>;
    readonly describe?: HostKitHttpMapping<DescribeRequest>;
    readonly query?: HostKitHttpMapping<QueryRequest>;
  };
}

const GROUPS_TTL_MS = 60_000;

/** 业务回调核心：所有响应严格校验，取消返回空诊断，分组缓存 60s。 */
export function createHostDatasetPort<GroupsPayload, ListPayload, DescribePayload, QueryPayload>(
  options: HostDatasetPortOptions<GroupsPayload, ListPayload, DescribePayload, QueryPayload>,
): ScreenHostDatasetPort {
  let groupsCache:
    | { readonly at: number; readonly value: readonly ScreenDatasetGroup[] }
    | undefined;

  async function execute<Request extends object, Payload, Value>(
    operation: HostKitOperation<Request, Payload>,
    request: Request,
    signal: ScreenAbortSignal,
    parse: (payload: unknown) => ScreenParseResult<Value>,
    observer?: HostKitOperationObserver<Request, Value>,
    context?: ScreenResourceExecutionContext,
  ): Promise<ScreenParseResult<Value>> {
    if (signal.aborted) return cancelled();
    const response = await executeHostKitOperation(operation, request, signal, context);
    if (signal.aborted || (!response.ok && response.error.code === 'ABORTED')) return cancelled();
    let result: ScreenParseResult<Value>;
    if (!response.ok) {
      result = failure(mapDatasetError(response.error), response.error.message);
    } else {
      try {
        const parsed = parse(
          operation.response ? operation.response(response.data, request) : response.data,
        );
        result = parsed.ok ? parsed : failure('HOST_DATASET_INVALID', '数据集响应格式无效。');
      } catch {
        result = failure('HOST_DATASET_INVALID', '数据集响应格式无效。');
      }
    }
    if (signal.aborted) return cancelled();
    observeHostKitOperation(observer, request, result, response.ok ? undefined : response.error);
    return result;
  }

  const groups = options.groups;
  return {
    queryScope: 'dataset',
    ...(groups === undefined
      ? {}
      : {
          async groups(
            request: GroupsRequest,
          ): Promise<ScreenParseResult<readonly ScreenDatasetGroup[]>> {
            if (request.signal.aborted) return cancelled();
            const cached = groupsCache;
            if (cached !== undefined && Date.now() - cached.at < GROUPS_TTL_MS) {
              return { ok: true, value: cached.value, diagnostics: [] };
            }
            const result = await execute(groups, request, request.signal, parseScreenDatasetGroups);
            if (result.ok) groupsCache = { at: Date.now(), value: result.value };
            return result;
          },
        }),
    list: (request) =>
      execute(
        options.list,
        request,
        request.signal,
        parseScreenDatasetEntries,
        options.onListResult,
      ),
    describe: (request) =>
      execute(
        options.describe,
        request,
        request.signal,
        parseScreenDatasetDefinition,
        options.onDescribeResult,
      ),
    query: (request, queryOptions) =>
      execute(
        options.query,
        request,
        queryOptions.signal,
        parseScreenTabularDataset,
        options.onQueryResult,
        queryOptions.context,
      ),
  };
}

/** 默认示例 REST；映射与 HTTP 仅负责传输，统一复用业务回调核心。 */
export function createRestDatasetPort(options: RestDatasetPortOptions): ScreenHostDatasetPort {
  const http = createHostKitHttp(options);
  return createHostDatasetPort({
    groups: createHttpOperation<GroupsRequest>(
      http,
      options.mapping?.groups,
      () => ({ path: `/datasets${toHostKitSearch({ limit: 1 })}` }),
      (payload) => {
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
          return undefined;
        return 'groups' in payload ? payload.groups : [];
      },
    ),
    list: createHttpOperation(
      http,
      options.mapping?.list,
      (request) => ({
        path: `/datasets${toHostKitSearch({ query: request.query, limit: request.limit, groupId: request.groupId, cursor: request.cursor })}`,
      }),
      (payload) => {
        if (payload === null || typeof payload !== 'object' || !('items' in payload))
          return undefined;
        return {
          items: payload.items,
          ...('nextCursor' in payload ? { nextCursor: payload.nextCursor } : {}),
        };
      },
    ),
    describe: createHttpOperation(http, options.mapping?.describe, (request) => ({
      path: `/datasets/${encodeURIComponent(request.datasetId)}`,
    })),
    query: createHttpOperation(http, options.mapping?.query, (request) => ({
      path: `/datasets/${encodeURIComponent(request.datasetId)}/query${toHostKitSearch(toQueryParams(request.params))}`,
    })),
  });
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

function mapDatasetError(error: HostKitOperationError): ScreenDiagnostic['code'] {
  if (error.code === 'HOST_KIT_MAPPING') return 'HOST_DATASET_INVALID';
  if (error.code === 'UNKNOWN_DATASET' || error.status === 404) return 'HOST_DATASET_UNAVAILABLE';
  if (error.status === 400 || error.status === 422) return 'HOST_DATASET_PARAMETER_INVALID';
  return 'HOST_DATASET_UNAVAILABLE';
}

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

function cancelled(): ScreenParseResult<never> {
  return { ok: false, diagnostics: [] };
}
