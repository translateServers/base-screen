import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { canonicalByteLength, codePointLength, hasControlCharacter } from '../json/canonical.js';
import type { ScreenJsonValue } from '../types/json.js';
import {
  MAX_DATA_SOURCE_VALUE_BYTES,
  MAX_NAME_CODE_POINTS,
  MAX_STYLE_RULE_ID_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS,
  MAX_STYLE_RULE_VALUE_BYTES,
} from './limits.js';
import { componentSchema, dataBindingSchema } from './schema.js';
import { checkStrictObjectKeys, isJsonObject } from './strict-object.js';
import {
  addZodIssues,
  componentFieldCode,
  type DocumentDiagnosticPath,
} from './validate-support.js';
import { ALL_VALUE_REF_KINDS, validateValueRef } from './validate-value-ref.js';

const COMPONENT_FIELDS = new Set([
  'id',
  'type',
  'name',
  'parentId',
  'position',
  'size',
  'rotation',
  'zIndex',
  'status',
  'props',
  'style',
  'styleRules',
  'dataSource',
  'dataValue',
  'dataBinding',
]);
/** 组件位上经手工校验的字段：zod 只负责其余字段，避免同一字段两套口径。 */
const MANUALLY_VALIDATED_COMPONENT_FIELDS = new Set(['dataValue', 'dataBinding']);
const POSITION_FIELDS = new Set(['x', 'y']);
const SIZE_FIELDS = new Set(['width', 'height']);
const STATUS_FIELDS = new Set(['locked', 'hidden']);
const STATIC_DATA_SOURCE_FIELDS = new Set(['type', 'value', 'binding']);
const HOST_RESOURCE_DATA_SOURCE_FIELDS = new Set([
  'type',
  'resourceType',
  'resourceId',
  'params',
  'binding',
]);
const DATASET_DATA_SOURCE_FIELDS = new Set(['type', 'datasetId', 'params', 'binding']);
const VARIABLE_DATA_SOURCE_FIELDS = new Set(['type', 'variableId', 'binding', 'processorId']);
const HOST_RESOURCE_PARAMETER_FIELDS = new Set(['kind', 'value', 'variableId']);
const HOST_RESOURCE_BINDING_FIELDS = new Set(['fields']);
const STYLE_RULE_FIELDS = new Set(['id', 'when', 'style']);
const STYLE_RULE_WHEN_FIELDS = new Set(['path', 'operator', 'value']);

export function validateComponent(
  component: unknown,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(component)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(baseSegments),
      phase,
      'Expected a component to be an object.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(
      component,
      COMPONENT_FIELDS,
      at(baseSegments),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  if (
    'dataValue' in component &&
    component.dataSource !== null &&
    component.dataSource !== undefined
  ) {
    collector.add(
      'DOCUMENT_UNKNOWN_FIELD',
      at([...baseSegments, 'dataValue']),
      phase,
      'Component must not declare dataSource together with dataValue.',
    );
    return false;
  }
  if (!validateComponentStrictNestedKeys(component, baseSegments, at, collector, phase)) {
    return false;
  }
  // 手工校验的字段先跑：zod 的对应 issue 被过滤掉，若反过来先跑 zod 就可能出现「拒绝但无诊断」。
  let clean = true;
  if (!validateComponentDataValue(component.dataValue, baseSegments, at, collector, phase)) {
    clean = false;
  }
  if (!validateComponentDataBinding(component.dataBinding, baseSegments, at, collector, phase)) {
    clean = false;
  }
  const result = componentSchema.safeParse(component);
  if (!result.success) {
    addZodIssues(
      result.error.issues.filter(
        (issue) => !MANUALLY_VALIDATED_COMPONENT_FIELDS.has(String(issue.path[0])),
      ),
      baseSegments,
      componentFieldCode,
      at,
      collector,
      phase,
    );
    return false;
  }
  if (!validateComponentName(component.name as string, baseSegments, at, collector, phase)) {
    clean = false;
  }
  if (!validateComponentStyleRules(component.styleRules, baseSegments, at, collector, phase)) {
    clean = false;
  }
  const dataSource = component.dataSource;
  if (
    isJsonObject(dataSource) &&
    dataSource.type === 'static' &&
    canonicalByteLength(dataSource.value as ScreenJsonValue) > MAX_DATA_SOURCE_VALUE_BYTES
  ) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at([...baseSegments, 'dataSource', 'value']),
      phase,
      `Static data source value exceeds ${MAX_DATA_SOURCE_VALUE_BYTES} UTF-8 bytes.`,
    );
    clean = false;
  }
  return clean;
}

function validateComponentStrictNestedKeys(
  component: Record<string, unknown>,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const nestedObjects = [
    ['position', POSITION_FIELDS],
    ['size', SIZE_FIELDS],
    ['status', STATUS_FIELDS],
  ] as const;
  for (const [field, fields] of nestedObjects) {
    const value = component[field];
    if (
      isJsonObject(value) &&
      !checkStrictObjectKeys(
        value,
        fields,
        at([...base, field]),
        collector,
        phase,
        'DOCUMENT_UNKNOWN_FIELD',
      )
    ) {
      return false;
    }
  }
  if (!validateStyleRuleStrictKeys(component.styleRules, base, at, collector, phase)) return false;
  return validateDataSourceStrictKeys(component.dataSource, base, at, collector, phase);
}

function validateStyleRuleStrictKeys(
  styleRules: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!Array.isArray(styleRules)) return true;
  for (let index = 0; index < styleRules.length; index++) {
    const rule = styleRules[index];
    const ruleBase = [...base, 'styleRules', index] as DiagnosticSegment[];
    if (
      !isJsonObject(rule) ||
      !checkStrictObjectKeys(rule, STYLE_RULE_FIELDS, at(ruleBase), collector, phase)
    ) {
      return false;
    }
    if (
      isJsonObject(rule.when) &&
      !checkStrictObjectKeys(
        rule.when,
        STYLE_RULE_WHEN_FIELDS,
        at([...ruleBase, 'when']),
        collector,
        phase,
      )
    ) {
      return false;
    }
  }
  return true;
}

function validateDataSourceStrictKeys(
  dataSource: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(dataSource)) return true;
  const fields =
    dataSource.type === 'dataset'
      ? DATASET_DATA_SOURCE_FIELDS
      : dataSource.type === 'host-resource'
        ? HOST_RESOURCE_DATA_SOURCE_FIELDS
        : dataSource.type === 'variable'
          ? VARIABLE_DATA_SOURCE_FIELDS
          : STATIC_DATA_SOURCE_FIELDS;
  if (
    !checkStrictObjectKeys(
      dataSource,
      fields,
      at([...base, 'dataSource']),
      collector,
      phase,
      'DOCUMENT_UNKNOWN_FIELD',
    )
  ) {
    return false;
  }
  if (
    (dataSource.type === 'dataset' ||
      dataSource.type === 'host-resource' ||
      dataSource.type === 'dataset') &&
    isJsonObject(dataSource.params)
  ) {
    for (const [key, parameter] of Object.entries(dataSource.params)) {
      if (
        isJsonObject(parameter) &&
        !checkStrictObjectKeys(
          parameter,
          parameter.kind === 'variable'
            ? new Set(['kind', 'variableId'])
            : parameter.kind === 'literal'
              ? new Set(['kind', 'value'])
              : HOST_RESOURCE_PARAMETER_FIELDS,
          at([...base, 'dataSource', 'params', key]),
          collector,
          phase,
        )
      ) {
        return false;
      }
    }
  }
  if (
    (dataSource.type === 'dataset' ||
      dataSource.type === 'host-resource' ||
      dataSource.type === 'static' ||
      dataSource.type === 'variable') &&
    isJsonObject(dataSource.binding) &&
    !checkStrictObjectKeys(
      dataSource.binding,
      HOST_RESOURCE_BINDING_FIELDS,
      at([...base, 'dataSource', 'binding']),
      collector,
      phase,
    )
  ) {
    return false;
  }
  return true;
}

function validateComponentDataValue(
  dataValue: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (dataValue === undefined || dataValue === null) return true;
  const valueBase = [...base, 'dataValue'];
  if (!validateValueRef(dataValue, valueBase, at, collector, phase, ALL_VALUE_REF_KINDS)) {
    return false;
  }
  if (
    isJsonObject(dataValue) &&
    dataValue.kind === 'inline' &&
    canonicalByteLength(dataValue.value as ScreenJsonValue) > MAX_DATA_SOURCE_VALUE_BYTES
  ) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at([...valueBase, 'value']),
      phase,
      `Static component value exceeds ${MAX_DATA_SOURCE_VALUE_BYTES} UTF-8 bytes.`,
    );
    return false;
  }
  return true;
}

function validateComponentDataBinding(
  dataBinding: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (dataBinding === undefined || dataBinding === null) return true;
  const bindingBase = [...base, 'dataBinding'];
  if (!isJsonObject(dataBinding)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(bindingBase),
      phase,
      'Component dataBinding must be an object or null.',
    );
    return false;
  }
  if (
    !checkStrictObjectKeys(
      dataBinding,
      HOST_RESOURCE_BINDING_FIELDS,
      at(bindingBase),
      collector,
      phase,
    )
  ) {
    return false;
  }
  if (!dataBindingSchema.safeParse(dataBinding).success) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...bindingBase, 'fields']),
      phase,
      'Component dataBinding must map role names to non-empty field path arrays.',
    );
    return false;
  }
  return true;
}

function validateComponentName(
  name: string,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  if (codePointLength(name) > MAX_NAME_CODE_POINTS) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'name']),
      phase,
      `Component name exceeds ${MAX_NAME_CODE_POINTS} code points.`,
    );
    clean = false;
  }
  if (hasControlCharacter(name)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'name']),
      phase,
      'Component name must not contain control characters.',
    );
    clean = false;
  }
  if (!/\S/.test(name)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at([...base, 'name']),
      phase,
      'Component name must contain at least one non-whitespace character.',
    );
    clean = false;
  }
  return clean;
}

function validateComponentStyleRules(
  styleRules: unknown,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!Array.isArray(styleRules)) return true;
  let clean = true;
  const seenIds = new Set<string>();
  for (let index = 0; index < styleRules.length; index++) {
    const rule = styleRules[index];
    if (!isJsonObject(rule)) continue;
    const base = [...baseSegments, 'styleRules', index] as DiagnosticSegment[];
    const id = rule.id;
    if (typeof id === 'string') {
      if (codePointLength(id) > MAX_STYLE_RULE_ID_CODE_POINTS) {
        collector.add(
          'DOCUMENT_FIELD_INVALID',
          at([...base, 'id']),
          phase,
          `Style rule id exceeds ${MAX_STYLE_RULE_ID_CODE_POINTS} code points.`,
        );
        clean = false;
      }
      if (seenIds.has(id)) {
        collector.add(
          'DOCUMENT_FIELD_INVALID',
          at([...base, 'id']),
          phase,
          'Style rule ids must be unique within a component.',
        );
        clean = false;
      }
      seenIds.add(id);
    }
    const when = rule.when;
    if (!isJsonObject(when)) continue;
    if (Array.isArray(when.path)) {
      for (let segmentIndex = 0; segmentIndex < when.path.length; segmentIndex++) {
        const segment = when.path[segmentIndex];
        if (
          typeof segment === 'string' &&
          codePointLength(segment) > MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS
        ) {
          collector.add(
            'DOCUMENT_FIELD_INVALID',
            at([...base, 'when', 'path', segmentIndex]),
            phase,
            `Style rule path segment exceeds ${MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS} code points.`,
          );
          clean = false;
        }
      }
    }
    if (
      when.value !== undefined &&
      canonicalByteLength(when.value as ScreenJsonValue) > MAX_STYLE_RULE_VALUE_BYTES
    ) {
      collector.add(
        'DOCUMENT_LIMIT_EXCEEDED',
        at([...base, 'when', 'value']),
        phase,
        `Style rule value exceeds ${MAX_STYLE_RULE_VALUE_BYTES} UTF-8 bytes.`,
      );
      clean = false;
    }
  }
  return clean;
}
