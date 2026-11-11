import {
  migrateScreenDocument,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenMigrationResult,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { createHostKitHttp, type HostKitHttpOptions, toAbortSignal } from './http.js';

export interface HttpProjectAdapterOptions extends HostKitHttpOptions {
  /** 读取时的文档迁移；默认 `migrateScreenDocument`（one-way、幂等、失败关闭）。 */
  readonly migrate?: (input: unknown) => ScreenMigrationResult;
}

interface ProjectScreenShape {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly document: ScreenDocument;
}

/**
 * 项目会话适配器的 REST 实现，对接示例后端契约：
 * `GET /screens/:id` → `{ screen }`，`PUT /screens/:id` `{ document, revision }` → `{ screen }`。
 *
 * 内置宿主常踩的两点：读取时先迁移旧形态文档（失败整份拒绝）；保存把后端
 * `REVISION_CONFLICT` 映射成 `PROJECT_CONFLICT`（引擎据此渲染冲突面板），其余失败归
 * `PROJECT_UNAVAILABLE`。`publish` 明确不支持。存取与 revision 仍归宿主后端。
 */
export function createHttpProjectAdapter(options: HttpProjectAdapterOptions): ScreenProjectAdapter {
  const http = createHostKitHttp(options);
  const migrate = options.migrate ?? migrateScreenDocument;
  return {
    capabilities: { publish: false },
    async load({ projectId, signal }): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      const result = await http.request<{ screen: ProjectScreenShape }>(
        `/screens/${encodeURIComponent(projectId)}`,
        { ...abortOption(signal) },
      );
      if (!result.ok) return failure('PROJECT_UNAVAILABLE', [], result.error.message);
      const migrated = migrate(result.data.screen.document);
      if (!migrated.ok) return { ok: false, diagnostics: migrated.diagnostics };
      return {
        ok: true,
        value: toEnvelope({ ...result.data.screen, document: migrated.document }),
        diagnostics: [],
      };
    },
    async save({
      projectId,
      document,
      revision,
      signal,
    }): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      const result = await http.request<{ screen: ProjectScreenShape }>(
        `/screens/${encodeURIComponent(projectId)}`,
        {
          method: 'PUT',
          body: { document, revision: Number(revision) },
          ...abortOption(signal),
        },
      );
      if (!result.ok) {
        return failure(
          result.error.code === 'REVISION_CONFLICT' ? 'PROJECT_CONFLICT' : 'PROJECT_UNAVAILABLE',
          ['revision'],
          result.error.message,
        );
      }
      return { ok: true, value: toEnvelope(result.data.screen), diagnostics: [] };
    },
  };
}

function abortOption(signal: Parameters<ScreenProjectAdapter['load']>[0]['signal']): {
  signal?: AbortSignal;
} {
  const bridged = toAbortSignal(signal);
  return bridged === undefined ? {} : { signal: bridged };
}

function toEnvelope(screen: ProjectScreenShape): ScreenProjectEnvelope {
  return {
    projectId: screen.id,
    revision: String(screen.revision),
    name: screen.name,
    description: null,
    document: screen.document,
    metadata: {},
  };
}

function failure(
  code: ScreenDiagnostic['code'],
  path: ScreenDiagnostic['path'],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
