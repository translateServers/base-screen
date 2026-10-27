import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { migrateScreenDocument } from '@base-screen/contracts';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';

const logger = createLogger('project-adapter');

/**
 * 宿主项目适配器：Base Screen 只发出有界请求，存取与 revision 归宿主。
 * `publish` 明确不支持（capabilities.publish = false）。
 */
export function createRestProjectAdapter(screenId: string): ScreenProjectAdapter {
  return {
    capabilities: { publish: false },
    async load({ projectId }): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      if (projectId !== screenId) {
        return failure('PROJECT_UNAVAILABLE', ['projectId'], `Unknown project: ${projectId}`);
      }
      const result = await api.getScreen(screenId);
      if (!result.ok) {
        logger.warn('load failed', { screenId, code: result.error.code });
        return failure('PROJECT_UNAVAILABLE', [], result.error.message);
      }
      // 宿主负责把已存储的旧形态文档迁到当前形态；迁移失败时整份拒绝，不做部分载入。
      const migrated = migrateScreenDocument(result.data.screen.document);
      if (!migrated.ok) {
        logger.warn('load migration failed', { screenId, diagnostics: migrated.diagnostics });
        return { ok: false, diagnostics: migrated.diagnostics };
      }
      return {
        ok: true,
        value: toEnvelope({ ...result.data.screen, document: migrated.document }),
        diagnostics: [],
      };
    },
    async save({ document, revision }): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
      const result = await api.updateScreen(screenId, document, Number(revision));
      if (!result.ok) {
        logger.warn('save rejected', { screenId, code: result.error.code });
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

function toEnvelope(screen: {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly document: ScreenDocument;
}): ScreenProjectEnvelope {
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
