import {
  parseScreenJsonValue,
  type ScreenDatasetField,
  type ScreenDatasetValueType,
  type ScreenHostResourceBinding,
  type ScreenHostResourceParameter,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';

export interface ScreenDataBindingRole {
  readonly id: string;
  readonly minFields: number;
  readonly maxFields: number;
  readonly valueTypes: readonly ScreenDatasetValueType[];
}

export interface ScreenHostResourceParameterEvaluation {
  readonly params: ScreenJsonObject;
  readonly dependencies: readonly string[];
}

export interface ScreenHostResourceBindingValidation {
  readonly fields: Readonly<Record<string, readonly ScreenDatasetField[]>>;
}

export function extractScreenHostResourceVariableDependencies(
  params: Readonly<Record<string, ScreenHostResourceParameter>>,
): readonly string[] {
  return [
    ...new Set(
      Object.values(params).flatMap((parameter) =>
        parameter.kind === 'variable' ? [parameter.name] : [],
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
    const value = parameter.kind === 'literal' ? parameter.value : variables[parameter.name];
    if (value === undefined) {
      return failure('HOST_DATASET_PARAMETER_INVALID', ['params', name]);
    }
    const parsed = parseScreenJsonValue(value, { maxBytes: 1024 * 1024 });
    if (!parsed.ok) return failure('HOST_DATASET_PARAMETER_INVALID', ['params', name]);
    values[name] = parsed.value;
  }
  const parsed = parseScreenJsonValue(values, { maxBytes: 1024 * 1024 });
  if (!parsed.ok || !isObject(parsed.value)) {
    return failure('HOST_DATASET_PARAMETER_INVALID', ['params']);
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

export function validateScreenHostResourceBinding(
  binding: ScreenHostResourceBinding | null,
  fields: readonly ScreenDatasetField[],
  roles: readonly ScreenDataBindingRole[],
): ScreenParseResult<ScreenHostResourceBindingValidation> {
  if (binding === null) {
    return roles.length === 0
      ? { ok: true, value: { fields: {} }, diagnostics: [] }
      : failure('HOST_DATASET_BINDING_INVALID', ['binding']);
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const selected: Record<string, readonly ScreenDatasetField[]> = {};
  for (const [roleId, fieldIds] of Object.entries(binding.fields)) {
    const role = roleById.get(roleId);
    if (role === undefined || !validRole(role)) {
      return failure('HOST_DATASET_BINDING_INVALID', ['binding', 'fields', roleId]);
    }
    if (
      fieldIds.length < role.minFields ||
      fieldIds.length > role.maxFields ||
      new Set(fieldIds).size !== fieldIds.length
    ) {
      return failure('HOST_DATASET_BINDING_INVALID', ['binding', 'fields', roleId]);
    }
    const selectedFields: ScreenDatasetField[] = [];
    for (const fieldId of fieldIds) {
      const field = fieldById.get(fieldId);
      if (field === undefined || !role.valueTypes.includes(field.valueType)) {
        return failure('HOST_DATASET_BINDING_INVALID', ['binding', 'fields', roleId]);
      }
      selectedFields.push(cloneField(field));
    }
    selected[roleId] = selectedFields;
  }
  for (const role of roles) {
    if (!validRole(role) || (selected[role.id]?.length ?? 0) < role.minFields) {
      return failure('HOST_DATASET_BINDING_INVALID', ['binding', 'fields', role.id]);
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
  return { id: field.id, label: field.label, valueType: field.valueType };
}

function isObject(value: ScreenJsonValue): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure<T>(
  code: 'HOST_DATASET_PARAMETER_INVALID' | 'HOST_DATASET_BINDING_INVALID',
  path: readonly (string | number)[],
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      { severity: 'error', code, path, message: 'Host dataset configuration is invalid.' },
    ],
  };
}
