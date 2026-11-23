import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { canonicalByteLength, codePointLength, hasControlCharacter } from '../json/canonical.js';
import type { ScreenJsonValue } from '../types/json.js';
import {
  MAX_COMPONENT_STATE_NAME_CODE_POINTS,
  MAX_COMPONENT_STATE_VALUE_BYTES,
  MAX_DATA_SOURCE_VALUE_BYTES,
  MAX_NAME_CODE_POINTS,
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
  'states',
  'dataSource',
  'dataValue',
  'dataBinding',
  'canvasId',
  'belowSubCanvas',
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
const STATES_FIELDS = new Set(['items', 'judge']);
const STATE_FIELDS = new Set(['id', 'name', 'style']);
const STATE_JUDGE_FIELDS = new Set(['input', 'cases']);
const STATE_CASE_FIELDS = new Set(['operator', 'value', 'stateId']);
const STATE_INPUT_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  'component-data': new Set(['kind', 'path']),
  variable: new Set(['kind', 'variableId', 'path']),
  'data-source-field': new Set(['kind', 'dataSourceId', 'where', 'path']),
};
const STATE_INPUT_ANY_FIELDS = new Set(['kind', 'path', 'variableId', 'dataSourceId', 'where']);
const STATE_WHERE_FIELDS = new Set(['field', 'equals']);
const STATE_EQUALS_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  literal: new Set(['kind', 'value']),
  variable: new Set(['kind', 'variableId']),
};
/** 「默认」是隐式状态，不能被声明（ADR-0110 D1）。 */
const RESERVED_STATE_ID = 'default';

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
  if (!validateComponentStates(component.states, baseSegments, at, collector, phase)) {
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
  if (!validateStatesStrictKeys(component.states, base, at, collector, phase)) return false;
  return validateDataSourceStrictKeys(component.dataSource, base, at, collector, phase);
}

function validateStatesStrictKeys(
  states: unknown,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(states)) return true;
  const statesBase = [...base, 'states'] as DiagnosticSegment[];
  const strict = (value: unknown, fields: ReadonlySet<string>, path: DiagnosticSegment[]) =>
    !isJsonObject(value) ||
    checkStrictObjectKeys(value, fields, at(path), collector, phase, 'DOCUMENT_UNKNOWN_FIELD');
  if (!strict(states, STATES_FIELDS, statesBase)) return false;
  if (Array.isArray(states.items)) {
    for (let index = 0; index < states.items.length; index++) {
      if (!strict(states.items[index], STATE_FIELDS, [...statesBase, 'items', index])) return false;
    }
  }
  const judge = states.judge;
  if (!isJsonObject(judge)) return true;
  const judgeBase = [...statesBase, 'judge'] as DiagnosticSegment[];
  if (!strict(judge, STATE_JUDGE_FIELDS, judgeBase)) return false;
  const input = judge.input;
  if (isJsonObject(input)) {
    const inputBase = [...judgeBase, 'input'] as DiagnosticSegment[];
    const fields =
      typeof input.kind === 'string' ? STATE_INPUT_FIELDS[input.kind] : STATE_INPUT_ANY_FIELDS;
    if (!strict(input, fields ?? STATE_INPUT_ANY_FIELDS, inputBase)) return false;
    const where = input.where;
    if (isJsonObject(where)) {
      if (!strict(where, STATE_WHERE_FIELDS, [...inputBase, 'where'])) return false;
      const equals = where.equals;
      if (isJsonObject(equals) && typeof equals.kind === 'string') {
        const equalsFields = STATE_EQUALS_FIELDS[equals.kind];
        if (
          equalsFields !== undefined &&
          !strict(equals, equalsFields, [...inputBase, 'where', 'equals'])
        ) {
          return false;
        }
      }
    }
  }
  if (Array.isArray(judge.cases)) {
    for (let index = 0; index < judge.cases.length; index++) {
      if (!strict(judge.cases[index], STATE_CASE_FIELDS, [...judgeBase, 'cases', index])) {
        return false;
      }
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

export function validateComponentDataValue(
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

export function validateComponentDataBinding(
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

/**
 * 组件状态的语义校验（ADR-0110 §2.2）：形状已由 zod 保证。状态 id 唯一且不是 `default`，
 * 名称长度与字符，判定条件指向本组件声明的状态，比较值大小。变量 / 数据源引用由 `references.ts` 判定。
 */
function validateComponentStates(
  states: unknown,
  baseSegments: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(states) || !Array.isArray(states.items)) return true;
  const statesBase = [...baseSegments, 'states'] as DiagnosticSegment[];
  let clean = true;
  const fail = (path: DiagnosticSegment[], message: string, code = 'DOCUMENT_FIELD_INVALID') => {
    collector.add(code as 'DOCUMENT_FIELD_INVALID', at(path), phase, message);
    clean = false;
  };
  const ids = new Set<string>();
  states.items.forEach((item, index) => {
    if (!isJsonObject(item)) return;
    const base = [...statesBase, 'items', index] as DiagnosticSegment[];
    const id = item.id as string;
    if (id === RESERVED_STATE_ID) {
      fail([...base, 'id'], 'State id "default" is reserved for the implicit default state.');
    } else if (ids.has(id)) {
      fail([...base, 'id'], 'State ids must be unique within a component.');
    }
    ids.add(id);
    const name = item.name as string;
    if (codePointLength(name) > MAX_COMPONENT_STATE_NAME_CODE_POINTS) {
      fail(
        [...base, 'name'],
        `State name exceeds ${MAX_COMPONENT_STATE_NAME_CODE_POINTS} code points.`,
      );
    } else if (hasControlCharacter(name) || !/\S/.test(name)) {
      fail([...base, 'name'], 'State name must be visible text without control characters.');
    }
  });
  const judge = states.judge;
  if (!isJsonObject(judge) || !Array.isArray(judge.cases)) return clean;
  judge.cases.forEach((entry, index) => {
    if (!isJsonObject(entry)) return;
    const base = [...statesBase, 'judge', 'cases', index] as DiagnosticSegment[];
    if (!ids.has(entry.stateId as string)) {
      fail([...base, 'stateId'], 'State case must point at a state declared by this component.');
    }
    if (
      entry.value !== undefined &&
      canonicalByteLength(entry.value as ScreenJsonValue) > MAX_COMPONENT_STATE_VALUE_BYTES
    ) {
      fail(
        [...base, 'value'],
        `State case value exceeds ${MAX_COMPONENT_STATE_VALUE_BYTES} UTF-8 bytes.`,
        'DOCUMENT_LIMIT_EXCEEDED',
      );
    }
  });
  return clean;
}
