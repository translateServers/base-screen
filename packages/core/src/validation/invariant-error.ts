import type { ScreenDiagnostic } from '@base-screen/contracts';

export class ScreenCoreInvariantError extends Error {
  override readonly name: 'ScreenCoreInvariantError' = 'ScreenCoreInvariantError';
  readonly diagnostics: readonly ScreenDiagnostic[];

  constructor(diagnostics: readonly ScreenDiagnostic[]) {
    super('Screen document failed Core semantic validation.');
    this.diagnostics = diagnostics;
  }
}
