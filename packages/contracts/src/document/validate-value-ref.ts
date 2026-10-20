import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import type { ScreenDiagnosticCode } from '../types/diagnostics.js';
import type { ScreenValueRefKind } from '../types/document.js';
import { MAX_VALUE_REF_PATH_SEGMENTS } from './limits.js';
import { COMPONENT_ID_PATTERN, VALUE_REF_PATH_SEGMENT_PATTERN } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import type { DocumentDiagnosticPath } from './validate-support.js';

const COMPONENT_ID_REGEXP = new RegExp(COMPONENT_ID_PATTERN);
const VALUE_REF_PATH_SEGMENT_REGEXP = new RegExp(VALUE_REF_PATH_SEGMENT_PATTERN);

const INLINE_FIELDS = new Set(['kind', 'value']);
const VARIABLE_FIELDS = new Set(['kind', 'variableId']);
const DATA_SOURCE_FIELD_FIELDS = new Set(['kind', 'dataSourceId', 'path']);

const VALUE_REF_KINDS: ReadonlySet<string> = new Set<ScreenValueRefKind>([
  'inline',
  'variable',
  'data-source-field',
]);

const FIRST_DIAGNOSTIC: ScreenDiagnosticCode = 'DOCUMENT_VALUE_REF_INVALID';

/** 组件位与数据源参数位允许全部三种 kind。 */
export const ALL_VALUE_REF_KINDS: readonly ScreenValueRefKind[] = [
  'inline',
  'variable',
  'data-source-field',
];

/** 变量位只允许常量与数据源输出——变量之间不得互为别名。 */
export const VARIABLE_VALUE_REF_KINDS: readonly ScreenValueRefKind[] = [
  'inline',
  'data-source-field',
];

/**
 * 校验一个取值引用，返回是否合法。
 *
 * 这是 `ScreenValueRef` 形状校验的唯一入口：组件 `dataValue`、数据源实例 `params`、
 * 变量 `value` 都经它判定，因此三者对「什么算合法引用」没有第二份口径。
 * 它只判定形状与 kind 是否在该位置允许，目标存在性与环判定属 `references.ts`。
 *
 * @param ref 待校验的原始值（来自未校验的 JSON）。
 * @param baseSegments 该引用在文档中的位置。
 * @param at 诊断路径前缀（区分 root 与 document 阶段）。
 * @param collector 诊断收集器。
 * @param phase 诊断阶段。
 * @param allowedKinds 该位置允许出现的 kind（顺序无关）。
 * @param kindRejectionCode kind 越界时使用的诊断码，缺省 `DOCUMENT_VALUE_REF_INVALID`。
 */
export function validateValueRef(
  ref: unknown,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
  allowedKinds: readonly ScreenValueRefKind[],
  kindRejectionCode: ScreenDiagnosticCode = FIRST_DIAGNOSTIC,
): boolean {
  if (!isJsonObject(ref)) {
    collector.add(
      FIRST_DIAGNOSTIC,
      at(baseSegments),
      phase,
      'A value reference must be a JSON object with a kind field.',
    );
    return false;
  }
  const kind = ref.kind;
  if (typeof kind !== 'string' || !VALUE_REF_KINDS.has(kind)) {
    collector.add(
      FIRST_DIAGNOSTIC,
      at('kind' in ref ? [...baseSegments, 'kind'] : baseSegments),
      phase,
      'Value reference kind must be inline, variable, or data-source-field.',
    );
    return false;
  }
  if (!new Set<string>(allowedKinds).has(kind)) {
    collector.add(
      kindRejectionCode,
      at(baseSegments),
      phase,
      kindRejectionCode === 'VARIABLE_VALUE_REF_INVALID'
        ? 'Variable value must be a fixed value or a data source output.'
        : 'Value reference kind is not allowed at this position.',
    );
    return false;
  }
  switch (kind) {
    case 'inline':
      return validateInlineRef(ref, baseSegments, at, collector, phase);
    case 'variable':
      return validateVariableRef(ref, baseSegments, at, collector, phase);
    default:
      return validateDataSourceFieldRef(ref, baseSegments, at, collector, phase);
  }
}

function validateInlineRef(
  ref: Record<string, unknown>,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!checkStrictObjectKeys(ref, INLINE_FIELDS, at(baseSegments), collector, phase)) {
    return false;
  }
  if (!('value' in ref)) {
    collector.add(
      FIRST_DIAGNOSTIC,
      at([...baseSegments, 'value']),
      phase,
      'Inline value reference requires a value field.',
    );
    return false;
  }
  return true;
}

function validateVariableRef(
  ref: Record<string, unknown>,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!checkStrictObjectKeys(ref, VARIABLE_FIELDS, at(baseSegments), collector, phase)) {
    return false;
  }
  if (typeof ref.variableId !== 'string' || !COMPONENT_ID_REGEXP.test(ref.variableId)) {
    collector.add(
      FIRST_DIAGNOSTIC,
      at([...baseSegments, 'variableId']),
      phase,
      'Value reference variableId must be a component-style identifier.',
    );
    return false;
  }
  return true;
}

function validateDataSourceFieldRef(
  ref: Record<string, unknown>,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!checkStrictObjectKeys(ref, DATA_SOURCE_FIELD_FIELDS, at(baseSegments), collector, phase)) {
    return false;
  }
  let clean = true;
  if (typeof ref.dataSourceId !== 'string' || !COMPONENT_ID_REGEXP.test(ref.dataSourceId)) {
    collector.add(
      FIRST_DIAGNOSTIC,
      at([...baseSegments, 'dataSourceId']),
      phase,
      'Value reference dataSourceId must be a component-style identifier.',
    );
    clean = false;
  }
  const path = ref.path;
  if (!Array.isArray(path)) {
    collector.add(
      FIRST_DIAGNOSTIC,
      at([...baseSegments, 'path']),
      phase,
      'Value reference path must be an array of field path segments.',
    );
    return false;
  }
  if (path.length > MAX_VALUE_REF_PATH_SEGMENTS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at([...baseSegments, 'path']),
      phase,
      `Value reference path has more than ${MAX_VALUE_REF_PATH_SEGMENTS} segments.`,
    );
    clean = false;
  }
  for (let index = 0; index < path.length; index++) {
    const segment = path[index];
    if (typeof segment !== 'string' || !VALUE_REF_PATH_SEGMENT_REGEXP.test(segment)) {
      collector.add(
        FIRST_DIAGNOSTIC,
        at([...baseSegments, 'path', index]),
        phase,
        'Value reference path segment must be a plain field name.',
      );
      clean = false;
    }
  }
  return clean;
}
