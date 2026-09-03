import type { DiagnosticCollector, DiagnosticPhase } from '../diagnostics/collector.js';
import {
  dataSourceVariableSchema,
  staticVariableSchema,
  urlQueryVariableSchema,
} from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import {
  addZodIssues,
  type DocumentDiagnosticPath,
  variableFieldCode,
} from './validate-support.js';

const STATIC_VARIABLE_FIELDS = new Set(['type', 'id', 'name', 'description', 'initialValue']);
const DATA_SOURCE_VARIABLE_FIELDS = new Set([
  'type',
  'id',
  'name',
  'description',
  'initialValue',
  'sourceId',
  'processorId',
  'controlled',
  'autoUpdate',
]);
const URL_QUERY_VARIABLE_FIELDS = new Set([
  'type',
  'id',
  'name',
  'description',
  'initialValue',
  'sourceId',
  'processorId',
  'controlled',
]);

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
      variable.type === 'data-source'
        ? DATA_SOURCE_VARIABLE_FIELDS
        : variable.type === 'url-query'
          ? URL_QUERY_VARIABLE_FIELDS
          : STATIC_VARIABLE_FIELDS,
      base,
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  const result =
    variable.type === 'data-source'
      ? dataSourceVariableSchema.safeParse(variable)
      : variable.type === 'url-query'
        ? urlQueryVariableSchema.safeParse(variable)
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
