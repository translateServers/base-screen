import {
  MAX_DATA_SOURCE_VALUE_BYTES,
  parseScreenJsonValue,
  type ScreenDataBinding,
  type ScreenDatasetField,
  type ScreenDatasetValueType,
  type ScreenDiagnostic,
  type ScreenHostResourceParameter,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenValueRef,
} from '@base-screen/contracts';
import { getScreenJsonPath } from '../json/path-update.js';

/** 字段映射角色：物料声明的「这个角色能接哪些字段」。 */
export interface ScreenDataBindingRole {
  readonly id: string;
  readonly minFields: number;
  readonly maxFields: number;
  readonly valueTypes: readonly ScreenDatasetValueType[];
}

/** 字段映射校验结果：按角色投影出的字段（与来源数据集脱离）。 */
export interface ScreenDataBindingValidation {
  readonly fields: Readonly<Record<string, readonly ScreenDatasetField[]>>;
}

/** 旧参数位求值结果（T02c 删除）。 */
export interface ScreenHostResourceParameterEvaluation {
  readonly params: ScreenJsonObject;
  readonly dependencies: readonly string[];
}

/**
 * 求值环境：变量的当前值 + 每个数据源实例的结果/错误。
 *
 * 两个 map 都是「已就绪」的快照：`dataSourceValues` 里没有、且 `dataSourceErrors` 里
 * 也没有，表示该实例的请求还在途（`pending`）；有 error 表示失败（`failed`）。
 */
export interface ScreenValueRefEnvironment {
  readonly variableValues: Readonly<Record<string, ScreenJsonValue>>;
  readonly dataSourceValues: ReadonlyMap<string, ScreenJsonValue>;
  readonly dataSourceErrors: ReadonlyMap<string, ScreenDiagnostic>;
}

/** 求值失败的三类原因；`dataSourceId` 为 `null` 表示失败与某个实例无关。 */
export type ScreenValueRefFailureReason =
  | 'variable-missing'
  | 'data-source-error'
  | 'value-invalid';

/**
 * 一次求值的结果。
 *
 * - `value`：已求值。`undefined` 只出现在「实例有结果、但 `path` 指向的字段不存在」——
 *   字段缺失是可接受的空值，不是错误（PRD：字段映射允许该字段本轮没有数据）。
 * - `pending`：所引用的实例还没有结果，调用方应保持上一帧或等待。
 * - `failed`：失败已确定（变量缺值 / 实例报错 / 取值非法），调用方应进入错误态。
 */
export type ScreenValueRefEvaluation =
  | { readonly kind: 'value'; readonly value: ScreenJsonValue | undefined }
  | { readonly kind: 'pending'; readonly dataSourceId: string }
  | {
      readonly kind: 'failed';
      readonly dataSourceId: string | null;
      readonly reason: ScreenValueRefFailureReason;
    };

/** 取值引用集合的依赖：变量 id 与数据源实例 id（去重、升序）。 */
export interface ScreenValueRefDependencies {
  readonly variableIds: readonly string[];
  readonly dataSourceIds: readonly string[];
}

/**
 * 求值一个取值引用。
 *
 * `maxBytes` 只作用于**实例结果**（宿主回包，体积不受文档约束）；`inline` 与 `variable`
 * 的值已经由文档解析器按 `MAX_DATA_SOURCE_VALUE_BYTES` 限制过，这里只做脱离副本。
 *
 * @param ref 取值引用（文档已校验过形状）。
 * @param environment 当前求值环境。
 * @param maxBytes 实例结果的字节上限。
 */
export function evaluateScreenValueRef(
  ref: ScreenValueRef,
  environment: ScreenValueRefEnvironment,
  maxBytes: number = MAX_DATA_SOURCE_VALUE_BYTES,
): ScreenValueRefEvaluation {
  if (ref.kind === 'inline') return readDocumentValue(ref.value);
  if (ref.kind === 'variable') {
    const value = environment.variableValues[ref.variableId];
    if (!Object.hasOwn(environment.variableValues, ref.variableId) || value === undefined) {
      return { kind: 'failed', dataSourceId: null, reason: 'variable-missing' };
    }
    return readDocumentValue(value);
  }
  return readDataSourceField(ref.dataSourceId, ref.path, environment, maxBytes);
}

function readDocumentValue(value: ScreenJsonValue): ScreenValueRefEvaluation {
  const parsed = parseScreenJsonValue(value);
  // 文档里的值已经过解析器限制；走到这里失败只可能是调用方塞进了非 JSON 值。
  if (!parsed.ok) return { kind: 'failed', dataSourceId: null, reason: 'value-invalid' };
  return { kind: 'value', value: parsed.value };
}

function readDataSourceField(
  dataSourceId: string,
  path: readonly string[],
  environment: ScreenValueRefEnvironment,
  maxBytes: number,
): ScreenValueRefEvaluation {
  // 有错误就是失败，即便还留着上一轮的结果：不展示陈旧数据（fail-closed）。
  if (environment.dataSourceErrors.has(dataSourceId)) {
    return { kind: 'failed', dataSourceId, reason: 'data-source-error' };
  }
  if (!environment.dataSourceValues.has(dataSourceId)) {
    return { kind: 'pending', dataSourceId };
  }
  const result = environment.dataSourceValues.get(dataSourceId);
  // 字段缺失给空值：路径下钻取不到不是错误，只是这一轮没有数据。
  // `path` 段只能寻址对象字段（段词法禁数字开头），数组元素由物料的字段映射去投影。
  const projected = path.length === 0 ? result : getScreenJsonPath(result, path);
  if (projected === undefined) return { kind: 'value', value: undefined };
  const parsed = parseScreenJsonValue(projected, { maxBytes });
  if (!parsed.ok) return { kind: 'failed', dataSourceId, reason: 'value-invalid' };
  return { kind: 'value', value: parsed.value };
}

/**
 * 收集取值引用的依赖。
 *
 * 入参可以是单个引用（含 `null`，对应「组件不取值」）、或一组具名引用
 * （实例 `params`）。实例级缓存键只看 `dataSourceIds`，`path` 不参与——同一实例的不同
 * 字段共享同一次请求。
 */
export function collectScreenValueRefDependencies(
  refs: ScreenValueRef | null | undefined | Readonly<Record<string, ScreenValueRef>>,
): ScreenValueRefDependencies {
  const refs_ = isSingleValueRef(refs) ? [refs] : Object.values(refs ?? {});
  const variableIds = new Set<string>();
  const dataSourceIds = new Set<string>();
  for (const ref of refs_) {
    if (ref.kind === 'variable') variableIds.add(ref.variableId);
    else if (ref.kind === 'data-source-field') dataSourceIds.add(ref.dataSourceId);
  }
  return {
    variableIds: [...variableIds].sort(),
    dataSourceIds: [...dataSourceIds].sort(),
  };
}

function isSingleValueRef(
  value: ScreenValueRef | null | undefined | Readonly<Record<string, ScreenValueRef>>,
): value is ScreenValueRef {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { readonly kind?: unknown }).kind === 'string'
  );
}

/**
 * 按物料声明的角色校验字段映射，并投影出与来源数据集脱离的字段快照。
 *
 * `binding === null` 只在没有任何角色要求时合法（物料不需要字段）。
 */
export function validateScreenDataBinding(
  binding: ScreenDataBinding | null,
  fields: readonly ScreenDatasetField[],
  roles: readonly ScreenDataBindingRole[],
): ScreenParseResult<ScreenDataBindingValidation> {
  if (binding === null) {
    return roles.length === 0
      ? { ok: true, value: { fields: {} }, diagnostics: [] }
      : bindingFailure(['binding']);
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const selected: Record<string, readonly ScreenDatasetField[]> = {};
  for (const [roleId, fieldIds] of Object.entries(binding.fields)) {
    const role = roleById.get(roleId);
    if (role === undefined || !validRole(role)) {
      return bindingFailure(['binding', 'fields', roleId]);
    }
    if (
      fieldIds.length < role.minFields ||
      fieldIds.length > role.maxFields ||
      new Set(fieldIds).size !== fieldIds.length
    ) {
      return bindingFailure(['binding', 'fields', roleId]);
    }
    const selectedFields: ScreenDatasetField[] = [];
    for (const fieldId of fieldIds) {
      const field = fieldById.get(fieldId);
      if (field === undefined || !role.valueTypes.includes(field.valueType)) {
        return bindingFailure(['binding', 'fields', roleId]);
      }
      selectedFields.push(cloneField(field));
    }
    selected[roleId] = selectedFields;
  }
  for (const role of roles) {
    if (!validRole(role) || (selected[role.id]?.length ?? 0) < role.minFields) {
      return bindingFailure(['binding', 'fields', role.id]);
    }
  }
  return { ok: true, value: { fields: selected }, diagnostics: [] };
}

function validRole(role: ScreenDataBindingRole): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(role.id) &&
    Number.isInteger(role.minFields) &&
    Number.isInteger(role.maxFields) &&
    role.minFields >= 0 &&
    role.maxFields >= role.minFields &&
    role.maxFields <= 256 &&
    role.valueTypes.length > 0 &&
    new Set(role.valueTypes).size === role.valueTypes.length &&
    role.valueTypes.every(isValueType)
  );
}

function isValueType(value: string): value is ScreenDatasetValueType {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'date';
}

function cloneField(field: ScreenDatasetField): ScreenDatasetField {
  return {
    id: field.id,
    label: field.label,
    valueType: field.valueType,
    ...(field.nullable === undefined ? {} : { nullable: field.nullable }),
    ...(field.unit === undefined ? {} : { unit: field.unit }),
    ...(field.format === undefined ? {} : { format: field.format }),
  };
}

function bindingFailure<T>(path: readonly (string | number)[]): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path,
        message: 'Host dataset configuration is invalid.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 旧参数位求值（`ScreenHostResourceParameter`）：随旧数据源形态一起在 T02c 删除。
// 放在这里是为了让 `host-dataset.ts` 只剩 re-export，避免两份求值实现并存。
// ---------------------------------------------------------------------------

export function extractScreenHostResourceVariableDependencies(
  params: Readonly<Record<string, ScreenHostResourceParameter>>,
): readonly string[] {
  return [
    ...new Set(
      Object.values(params).flatMap((parameter) =>
        parameter.kind === 'variable' ? [parameter.variableId] : [],
      ),
    ),
  ].sort();
}

export function evaluateScreenHostResourceParameters(
  params: Readonly<Record<string, ScreenHostResourceParameter>>,
  variables: ScreenJsonObject,
): ScreenParseResult<ScreenHostResourceParameterEvaluation> {
  const values: Record<string, ScreenJsonValue> = {};
  for (const [name, parameter] of Object.entries(params)) {
    const value = parameter.kind === 'literal' ? parameter.value : variables[parameter.variableId];
    if (value === undefined) {
      return parameterFailure(['params', name]);
    }
    const parsed = parseScreenJsonValue(value, { maxBytes: MAX_DATA_SOURCE_VALUE_BYTES });
    if (!parsed.ok) return parameterFailure(['params', name]);
    values[name] = parsed.value;
  }
  const parsed = parseScreenJsonValue(values, { maxBytes: MAX_DATA_SOURCE_VALUE_BYTES });
  if (!parsed.ok || !isObject(parsed.value)) {
    return parameterFailure(['params']);
  }
  return {
    ok: true,
    value: {
      params: parsed.value,
      dependencies: extractScreenHostResourceVariableDependencies(params),
    },
    diagnostics: [],
  };
}

function isObject(value: ScreenJsonValue): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parameterFailure<T>(path: readonly (string | number)[]): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_PARAMETER_INVALID',
        path,
        message: 'Host dataset configuration is invalid.',
      },
    ],
  };
}
