import {
  migrateScreenDocument,
  parseScreenProjectEnvelope,
  type ScreenDiagnostic,
  type ScreenMigrationResult,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { createHostKitHttp, type HostKitHttpMapping, type HostKitHttpOptions } from './http.js';
import {
  createHttpOperation,
  executeHostKitOperation,
  type HostKitOperation,
  type HostKitOperationObserver,
  observeHostKitOperation,
} from './operation.js';

type LoadRequest = Parameters<ScreenProjectAdapter['load']>[0];
type SaveRequest = Parameters<ScreenProjectAdapter['save']>[0];

export interface HostProjectAdapterOptions<LoadPayload = unknown, SavePayload = unknown> {
  readonly load: HostKitOperation<LoadRequest, LoadPayload>;
  readonly save: HostKitOperation<SaveRequest, SavePayload>;
  /** 读取时的文档迁移；默认 one-way、幂等、失败关闭。 */
  readonly migrate?: (input: unknown) => ScreenMigrationResult;
  readonly onLoadResult?: HostKitOperationObserver<LoadRequest, ScreenProjectEnvelope>;
  readonly onSaveResult?: HostKitOperationObserver<SaveRequest, ScreenProjectEnvelope>;
}

export interface HttpProjectAdapterOptions extends HostKitHttpOptions {
  readonly migrate?: (input: unknown) => ScreenMigrationResult;
  /** 请求可改路径、方法与 JSON body；响应投影为 canonical envelope，随后统一校验。 */
  readonly mapping?: {
    readonly load?: HostKitHttpMapping<LoadRequest>;
    readonly save?: HostKitHttpMapping<SaveRequest>;
  };
}

/** 宿主提供业务回调与映射，官方负责迁移、契约校验、取消与冲突映射。 */
export function createHostProjectAdapter<LoadPayload, SavePayload>(
  options: HostProjectAdapterOptions<LoadPayload, SavePayload>,
): ScreenProjectAdapter {
  const migrate = options.migrate ?? migrateScreenDocument;

  async function execute<Request extends LoadRequest, Payload>(
    operation: HostKitOperation<Request, Payload>,
    request: Request,
    save: boolean,
    observer: HostKitOperationObserver<Request, ScreenProjectEnvelope> | undefined,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (request.signal.aborted) return cancelled();
    const response = await executeHostKitOperation(operation, request, request.signal);
    if (request.signal.aborted || (!response.ok && response.error.code === 'ABORTED')) {
      return cancelled();
    }
    let result: ScreenParseResult<ScreenProjectEnvelope>;
    if (!response.ok) {
      result = failure(
        save && (response.error.code === 'REVISION_CONFLICT' || response.error.status === 409)
          ? 'PROJECT_CONFLICT'
          : 'PROJECT_UNAVAILABLE',
        save ? ['revision'] : [],
        response.error.message,
      );
    } else {
      try {
        const envelope = operation.response
          ? operation.response(response.data, request)
          : response.data;
        if (request.signal.aborted) return cancelled();
        if (save) {
          result = parseScreenProjectEnvelope(envelope);
        } else if (envelope === null || typeof envelope !== 'object' || !('document' in envelope)) {
          result = failure('PROJECT_UNAVAILABLE', [], '项目信封格式无效。');
        } else {
          const migrated = migrate(envelope.document);
          if (request.signal.aborted) return cancelled();
          result = migrated.ok
            ? parseScreenProjectEnvelope({ ...envelope, document: migrated.document })
            : { ok: false, diagnostics: migrated.diagnostics };
        }
      } catch {
        result = failure('PROJECT_UNAVAILABLE', [], '项目信封格式无效。');
      }
    }
    if (request.signal.aborted) return cancelled();
    observeHostKitOperation(observer, request, result, response.ok ? undefined : response.error);
    return result;
  }

  return {
    capabilities: { publish: false },
    load: (request) => execute(options.load, request, false, options.onLoadResult),
    save: (request) => execute(options.save, request, true, options.onSaveResult),
  };
}

/** 默认示例 REST；自定义映射保留 opaque revision，所有操作复用业务回调核心。 */
export function createHttpProjectAdapter(options: HttpProjectAdapterOptions): ScreenProjectAdapter {
  const http = createHostKitHttp(options);
  return createHostProjectAdapter({
    ...(options.migrate === undefined ? {} : { migrate: options.migrate }),
    load: createHttpOperation(
      http,
      options.mapping?.load,
      (request) => ({ path: `/screens/${encodeURIComponent(request.projectId)}` }),
      toDefaultEnvelope,
    ),
    save: createHttpOperation(
      http,
      options.mapping?.save,
      (request) => ({
        path: `/screens/${encodeURIComponent(request.projectId)}`,
        method: 'PUT',
        body: { document: request.document, revision: Number(request.revision) },
      }),
      toDefaultEnvelope,
    ),
  });
}

function toDefaultEnvelope(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object' || !('screen' in payload)) return undefined;
  const screen = payload.screen;
  if (
    screen === null ||
    typeof screen !== 'object' ||
    !('id' in screen) ||
    !('name' in screen) ||
    !('revision' in screen) ||
    !('document' in screen) ||
    typeof screen.revision !== 'number' ||
    !Number.isSafeInteger(screen.revision) ||
    screen.revision < 0
  ) {
    return undefined;
  }
  return {
    projectId: screen.id,
    revision: String(screen.revision),
    name: screen.name,
    description: null,
    document: screen.document,
    metadata: {},
  };
}

function cancelled(): ScreenParseResult<never> {
  return { ok: false, diagnostics: [] };
}

function failure(
  code: ScreenDiagnostic['code'],
  path: ScreenDiagnostic['path'],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
