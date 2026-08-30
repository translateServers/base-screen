import type { DiagnosticCollector, DiagnosticPhase } from '../diagnostics/collector.js';
import { hostVariableSchema, staticVariableSchema } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import {
  addZodIssues,
  type DocumentDiagnosticPath,
  variableFieldCode,
} from './validate-support.js';

const VARIABLE_FIELDS = new Set(['type', 'name', 'value']);
const HOST_VARIABLE_FIELDS = new Set(['type', 'name', 'variableId']);

export function validateVariable(
  variable: unknown,
  index: number,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const base = at(['variables', index]);
  if (!isJsonObject(variable)) {
    collector.add('DOCUMENT_FIELD_INVALID', base, phase, 'Expected a variable to be an object.');
    return false;
  }
  if (
    !checkStrictObjectKeys(
      variable,
      variable.type === 'host' ? HOST_VARIABLE_FIELDS : VARIABLE_FIELDS,
      base,
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const result =
    variable.type === 'host'
      ? hostVariableSchema.safeParse(variable)
      : staticVariableSchema.safeParse(variable);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['variables', index],
      variableFieldCode,
      at,
      collector,
      phase,
    );
    return false;
  }
  return true;
}
