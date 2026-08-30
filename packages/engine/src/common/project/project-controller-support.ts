import {
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
  serializeScreenDocument,
} from '@base-screen/contracts';

export type ScreenProjectPhase =
  | 'unloaded'
  | 'loading'
  | 'ready'
  | 'saving'
  | 'publishing'
  | 'conflict'
  | 'error'
  | 'disposed';

export interface ScreenProjectScheduler {
  wait(delayMs: number, signal: AbortSignal): Promise<void>;
}

export interface ScreenProjectControllerChange {
  readonly phase: ScreenProjectPhase;
  readonly project: ScreenProjectEnvelope | undefined;
  readonly dirty: boolean;
}

export interface ScreenProjectControllerOptions {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly replaceDocument: (document: ScreenDocument) => ScreenParseResult<ScreenDocument>;
  readonly onChange?: (change: ScreenProjectControllerChange) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onConflict?: () => void;
  readonly scheduler?: ScreenProjectScheduler;
}

export type ScreenProjectOperation = 'load' | 'save' | 'publish';

export interface ScreenProjectPendingOperation {
  readonly generation: number;
  readonly controller: AbortController;
  readonly adapter: ScreenProjectAdapter | undefined;
  readonly projectId: string | undefined;
  readonly revision: string | undefined;
}

export const defaultScreenProjectScheduler: ScreenProjectScheduler = {
  wait(delayMs, signal) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, delayMs);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new Error('aborted'));
        },
        { once: true },
      );
    });
  },
};

export function isConsistentScreenProjectAdapter(
  adapter: ScreenProjectAdapter | undefined,
): boolean {
  return adapter === undefined || adapter.capabilities.publish === (adapter.publish !== undefined);
}

export function hasScreenProjectDiagnosticCode(
  diagnostics: readonly ScreenDiagnostic[],
  code: ScreenDiagnostic['code'],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}

export function serializeScreenProjectDocument(
  document: ScreenDocument,
): ScreenParseResult<string> {
  try {
    return { ok: true, value: serializeScreenDocument(document), diagnostics: [] };
  } catch {
    return failScreenProject('PROJECT_ADAPTER_INVALID', 'Project document is invalid.');
  }
}

export function failScreenProject<T>(
  code: ScreenDiagnostic['code'],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
