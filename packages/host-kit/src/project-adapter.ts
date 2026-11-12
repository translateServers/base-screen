import {
  migrateScreenDocument,
  parseScreenProjectEnvelope,
  type ScreenDiagnostic,
  type ScreenMigrationResult,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  createHostKitHttp,
  type HostKitHttpMapping,
  type HostKitHttpOptions,
  type HostKitHttpRequest,
  toAbortSignal,
} from './http.js';

export interface HttpProjectAdapterOptions extends HostKitHttpOptions {
  /** 读取时的文档迁移；默认 `migrateScreenDocument`（one-way、幂等、失败关闭）。 */
  readonly migrate?: (input: unknown) => ScreenMigrationResult;
  /** 请求可改路径、方法与 JSON body；响应投影为 canonical envelope，随后统一校验。 */
  readonly mapping?: {
    readonly load?: HostKitHttpMapping<Parameters<ScreenProjectAdapter['load']>[0]>;
    readonly save?: HostKitHttpMapping<Parameters<ScreenProjectAdapter['save']>[0]>;
  };
}

/**
 * 默认对接示例 REST：GET /screens/:id，PUT /screens/:id { document, revision }。
 * 宿主可按操作映射既有后端；opaque revision 仅在默认示例请求中转成数字。
 * 读取先迁移文档，存取响应均校验完整 envelope；publish 明确不支持。
 */
export function createHttpProjectAdapter(options: HttpProjectAdapterOptions): ScreenProjectAdapter {
  const http = createHostKitHttp(options);
  const migrate = options.migrate ?? migrateScreenDocument;
  return {
    capabilities: { publish: false },
    async load(request): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      if (request.signal.aborted) return cancelled();
      const mapping = options.mapping?.load;
      let mapped: HostKitHttpRequest;
      try {
        mapped = mapping?.request?.(request) ?? {
          path: `/screens/${encodeURIComponent(request.projectId)}`,
        };
      } catch {
        return request.signal.aborted
          ? cancelled()
          : failure('PROJECT_UNAVAILABLE', [], '项目请求映射失败。');
      }
      if (request.signal.aborted) return cancelled();
      const result = await http.request<unknown>(mapped.path, {
        ...mapped,
        ...abortOption(request.signal),
      });
      if (request.signal.aborted || (!result.ok && result.error.code === 'ABORTED'))
        return cancelled();
      if (!result.ok) return failure('PROJECT_UNAVAILABLE', [], result.error.message);
      try {
        const envelope = mapping?.response
          ? mapping.response(result.data, request)
          : toDefaultEnvelope(result.data);
        if (request.signal.aborted) return cancelled();
        if (envelope === null || typeof envelope !== 'object' || !('document' in envelope)) {
          return failure('PROJECT_UNAVAILABLE', [], '项目信封格式无效。');
        }
        const migrated = migrate(envelope.document);
        if (request.signal.aborted) return cancelled();
        if (!migrated.ok) return { ok: false, diagnostics: migrated.diagnostics };
        return parseScreenProjectEnvelope({ ...envelope, document: migrated.document });
      } catch {
        return request.signal.aborted
          ? cancelled()
          : failure('PROJECT_UNAVAILABLE', [], '项目信封格式无效。');
      }
    },
    async save(request): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      if (request.signal.aborted) return cancelled();
      const mapping = options.mapping?.save;
      let mapped: HostKitHttpRequest;
      try {
        mapped = mapping?.request?.(request) ?? {
          path: `/screens/${encodeURIComponent(request.projectId)}`,
          method: 'PUT',
          body: { document: request.document, revision: Number(request.revision) },
        };
      } catch {
        return request.signal.aborted
          ? cancelled()
          : failure('PROJECT_UNAVAILABLE', [], '项目请求映射失败。');
      }
      if (request.signal.aborted) return cancelled();
      const result = await http.request<unknown>(mapped.path, {
        ...mapped,
        ...abortOption(request.signal),
      });
      if (request.signal.aborted || (!result.ok && result.error.code === 'ABORTED'))
        return cancelled();
      if (!result.ok) {
        return failure(
          result.error.code === 'REVISION_CONFLICT' || result.error.status === 409
            ? 'PROJECT_CONFLICT'
            : 'PROJECT_UNAVAILABLE',
          ['revision'],
          result.error.message,
        );
      }
      try {
        const envelope = mapping?.response
          ? mapping.response(result.data, request)
          : toDefaultEnvelope(result.data);
        if (request.signal.aborted) return cancelled();
        return parseScreenProjectEnvelope(envelope);
      } catch {
        return request.signal.aborted
          ? cancelled()
          : failure('PROJECT_UNAVAILABLE', [], '项目信封格式无效。');
      }
    },
  };
}

function abortOption(signal: Parameters<ScreenProjectAdapter['load']>[0]['signal']): {
  signal?: AbortSignal;
} {
  const bridged = toAbortSignal(signal);
  return bridged === undefined ? {} : { signal: bridged };
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
