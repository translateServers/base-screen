import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';

/** 订阅 helper 的同步结果：成功与「这个订阅永远不会成功」的失败（ADR-0104 §2.2）。 */
export function subscribeOk(): ScreenParseResult<null> {
  return { ok: true, value: null, diagnostics: [] };
}

export function subscribeFailure(
  code: ScreenDiagnostic['code'],
  message: string,
): ScreenParseResult<never> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}
