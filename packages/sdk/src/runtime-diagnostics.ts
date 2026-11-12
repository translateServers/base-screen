import type {
  ScreenDiagnostic,
  ScreenDiagnosticCode,
  ScreenDiagnosticPath,
  ScreenParseResult,
} from '@base-screen/contracts';

export type BaseScreenMountPhase =
  | 'mount'
  | 'configure'
  | 'load'
  | 'document'
  | 'catalog'
  | 'mounted'
  | 'dispose';

export interface BaseScreenMountDiagnosticContext {
  readonly phase: BaseScreenMountPhase;
  readonly instanceAvailable: boolean;
  readonly recovery: 'remount' | 'retry-catalog' | 'none';
}

export type BaseScreenMountDiagnosticsCallback = (
  diagnostics: readonly ScreenDiagnostic[],
  context: BaseScreenMountDiagnosticContext | undefined,
) => void;

/** 自定义 runtime 可继续返回 ScreenParseResult；官方挂载失败始终提供阶段。 */
export type BaseScreenMountResult<T> = ScreenParseResult<T> & {
  readonly mountPhase?: BaseScreenMountPhase;
};

export function withMountPhase<T>(
  result: ScreenParseResult<T>,
  phase: BaseScreenMountPhase,
): BaseScreenMountResult<T> {
  return result.ok ? result : { ...result, mountPhase: phase };
}

export function runtimeDiagnostic(
  code: ScreenDiagnosticCode,
  message: string,
  path: ScreenDiagnosticPath = [],
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

export function runtimeFailure<T>(
  code: ScreenDiagnosticCode,
  message: string,
  path: ScreenDiagnosticPath = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [runtimeDiagnostic(code, message, path)] };
}

export function runtimeSuccess<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

export function nullResult(diagnostics: readonly ScreenDiagnostic[]): ScreenParseResult<null> {
  return diagnostics.length === 0
    ? { ok: true, value: null, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function collectDiagnostics(
  results: readonly ScreenParseResult<unknown>[],
): readonly ScreenDiagnostic[] {
  return results.flatMap((result) => result.diagnostics);
}

export function collectFailureDiagnostics(
  results: readonly ScreenParseResult<unknown>[],
): readonly ScreenDiagnostic[] {
  return results.flatMap((result) => (result.ok ? [] : result.diagnostics));
}
