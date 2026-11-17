import type { DiagnosticCollector, DiagnosticPhase } from '../diagnostics/collector.js';
import { themeSchema } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import { addZodIssues, type DocumentDiagnosticPath } from './validate-support.js';

const THEME_FIELDS = new Set(['palette']);

export function validateTheme(
  theme: unknown,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(theme)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['theme']),
      phase,
      'Expected theme to be an object.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(
      theme,
      THEME_FIELDS,
      at(['theme']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const result = themeSchema.safeParse(theme);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['theme'],
      () => 'DOCUMENT_FIELD_INVALID',
      at,
      collector,
      phase,
    );
    return false;
  }
  return true;
}
