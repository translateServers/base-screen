import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from 'base-screen/contracts';
import { createHostProjectAdapter } from 'base-screen/host-kit';
import { api } from '../lib/api';
import { createLogger } from '../lib/logger';

const logger = createLogger('project-adapter');

/** 业务 API 与信封映射归宿主；迁移、校验、取消与冲突归官方辅助层。 */
export function createRestProjectAdapter(screenId: string): ScreenProjectAdapter {
  const adapter = createHostProjectAdapter({
    load: {
      execute: (_request, signal) => api.getScreen(screenId, signal),
      response: ({ screen }) => toEnvelope(screen),
    },
    save: {
      execute: ({ document, revision }, signal) =>
        api.updateScreen(screenId, document, Number(revision), signal),
      response: ({ screen }) => toEnvelope(screen),
    },
    onLoadResult: ({ result, error }) => {
      if (!result.ok) {
        logger.warn('load failed', {
          screenId,
          code: error?.code,
          diagnostics: result.diagnostics,
        });
      }
    },
    onSaveResult: ({ result, error }) => {
      if (!result.ok) {
        logger.warn('save rejected', {
          screenId,
          code: error?.code,
          diagnostics: result.diagnostics,
        });
      }
    },
  });
  const unavailable = (projectId: string): ScreenParseResult<never> => ({
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'PROJECT_UNAVAILABLE',
        path: ['projectId'],
        message: `Unknown project: ${projectId}`,
      },
    ],
  });
  return {
    ...adapter,
    load: (request) =>
      request.projectId === screenId
        ? adapter.load(request)
        : Promise.resolve(
            request.signal.aborted
              ? { ok: false, diagnostics: [] }
              : unavailable(request.projectId),
          ),
    save: (request) =>
      request.projectId === screenId
        ? adapter.save(request)
        : Promise.resolve(
            request.signal.aborted
              ? { ok: false, diagnostics: [] }
              : unavailable(request.projectId),
          ),
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
