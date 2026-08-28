import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import type { ScreenDiagnosticCode } from '../types/diagnostics.js';

export function checkStrictObjectKeys(
  value: Record<string, unknown>,
  known: ReadonlySet<string>,
  base: DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
  code: ScreenDiagnosticCode = 'DOCUMENT_UNKNOWN_FIELD',
): boolean {
  let clean = true;
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      collector.add(code, [...base, key], phase, `Unknown field "${truncateKey(key)}".`);
      clean = false;
    }
  }
  return clean;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncateKey(key: string): string {
  return key.length > 128 ? `${key.slice(0, 128)}…` : key;
}
