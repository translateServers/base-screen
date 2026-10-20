import type { DiagnosticCollector, DiagnosticPhase } from '../diagnostics/collector.js';
import {
  dataSourceVariableSchema,
  staticVariableSchema,
  urlQueryVariableSchema,
  variableRecordSchema,
} from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import {
  addZodIssues,
  type DocumentDiagnosticPath,
  variableFieldCode,
} from './validate-support.js';
import { VARIABLE_VALUE_REF_KINDS, validateValueRef } from './validate-value-ref.js';

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
const VARIABLE_RECORD_FIELDS = new Set([
  'id',
  'name',
  'description',
  'initialValue',
  'value',
  'controlled',
]);
/** 单形态变量中经手工校验的字段：zod 只负责其余字段，避免同一字段两套口径。 */
const MANUALLY_VALIDATED_VARIABLE_FIELDS = new Set(['value']);

/**
 * 校验一个变量条目。条目形态由是否出现 `type` 判别：
 * 出现 `type` 走旧三形态（`static` / `data-source` / `url-query`），未出现走单形态记录。
 */
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
  if (!('type' in variable)) {
    return validateVariableRecord(variable, index, at, collector, phase);
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

/**
 * 单形态变量：值是取值引用，只允许 `inline` 与 `data-source-field`。
 * 变量之间不得互为别名，因此 `kind: 'variable'` 在此位置被拒。
 */
function validateVariableRecord(
  variable: Record<string, unknown>,
  index: number,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const base: Array<string | number> = ['variables', index];
  if (!checkStrictObjectKeys(variable, VARIABLE_RECORD_FIELDS, at(base), collector, phase)) {
    return false;
  }
  if (!('value' in variable)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'value']),
      phase,
      'Variable value is required.',
    );
    return false;
  }
  const result = variableRecordSchema.safeParse(variable);
  // 手工校验的 `value` 先跑：zod 的对应 issue 被过滤掉，若反过来先跑 zod 就可能「拒绝但无诊断」。
  const clean = validateValueRef(
    variable.value,
    [...base, 'value'],
    at,
    collector,
    phase,
    VARIABLE_VALUE_REF_KINDS,
    'VARIABLE_VALUE_REF_INVALID',
  );
  if (!result.success) {
    addZodIssues(
      result.error.issues.filter(
        (issue) => !MANUALLY_VALIDATED_VARIABLE_FIELDS.has(String(issue.path[0])),
      ),
      base,
      variableFieldCode,
      at,
      collector,
      phase,
    );
    return false;
  }
  return clean;
}
