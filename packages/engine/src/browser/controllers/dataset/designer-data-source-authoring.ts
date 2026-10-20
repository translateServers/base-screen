import {
  evaluateScreenDatasetParameters,
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenDatasetDefinition,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourceBinding,
  type ScreenHostResourceParameter,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenValueRef,
} from '@base-screen/contracts';
import {
  type ScreenDataBindingRole,
  type ScreenDocumentTransaction,
  validateScreenHostResourceBinding,
} from '@base-screen/core';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialStaticDataDescriptor,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type {
  DesignerDataSourceMode,
  DesignerDatasetDraftView,
} from '../../dom/dataset/designer-dataset-dom.js';

interface DesignerDatasetTransactionOptions {
  readonly document: ScreenDocument;
  readonly componentId: string;
  readonly descriptor: ScreenDatasetDefinition;
  readonly draft: DesignerDatasetDraftView;
  readonly roles: readonly ScreenDataBindingRole[];
}

/**
 * 草稿参数已统一为取值引用（`ScreenValueRef`），但数据源事务本轮仍产出旧形态
 * （`component.dataSource.params`）。这里是两者**唯一**的映射点。
 *
 * 读（旧 → 新）：`literal` → `inline`、`variable` → `variable`；其它形态无法用旧文档表达，
 * 一律 fail-closed 成 `inline: null`，由调用方按必填校验报诊断（不静默丢参数）。
 *
 * 写（新 → 旧）：`inline` → `literal`、`variable` → `variable`；`data-source-field` 等
 * 旧形态表达不了的引用返回 `undefined`，调用方必须报 `HOST_DATASET_PARAMETER_INVALID`。
 * 这条限制在 T03b（事务切到 `replace-data-sources` + `dataValue`）后解除。
 */
export function hostResourceParameterToValueRef(
  parameter: ScreenHostResourceParameter,
): ScreenValueRef {
  if (parameter.kind === 'variable') {
    return { kind: 'variable', variableId: parameter.variableId };
  }
  return { kind: 'inline', value: parameter.value };
}

export function valueRefToHostResourceParameter(
  ref: ScreenValueRef,
): ScreenHostResourceParameter | undefined {
  if (ref.kind === 'variable') return { kind: 'variable', variableId: ref.variableId };
  if (ref.kind === 'inline') return { kind: 'literal', value: ref.value };
  return undefined;
}

export function createDesignerDatasetDraft(
  descriptor: ScreenDatasetDefinition,
  source: ScreenDocument['components'][number]['dataSource'],
  roles: readonly ScreenDataBindingRole[] = [],
): DesignerDatasetDraftView {
  const sameResource = source?.type === 'dataset' && source.datasetId === descriptor.datasetId;
  const params: Record<string, ScreenValueRef> = {};
  for (const parameter of descriptor.parameters) {
    const existing = sameResource ? source.params[parameter.name] : undefined;
    if (existing !== undefined) {
      // 旧文档读入只有一个翻译点。翻译不出可编辑形态的引用会退化成 `inline: null`：
      // 这是 fail-closed——不静默补默认值，应用时由必填/类型校验报
      // `HOST_DATASET_PARAMETER_INVALID`，用户能看到「这个参数需要重新选」。
      params[parameter.name] = hostResourceParameterToValueRef(existing);
    } else if (parameter.defaultValue !== undefined) {
      params[parameter.name] = { kind: 'inline', value: parameter.defaultValue };
    }
  }
  const fields: Record<string, readonly string[]> = sameResource
    ? Object.fromEntries(
        Object.entries(source.binding?.fields ?? {}).map(([key, value]) => [key, [...value]]),
      )
    : {};
  if (!sameResource) {
    const used = new Set<string>();
    for (const role of roles) {
      const compatible = descriptor.fields.filter((field) =>
        role.valueTypes.includes(field.valueType),
      );
      let selected: readonly string[] = [];
      if (role.maxFields === 1) {
        const field = compatible.find((item) => !used.has(item.id)) ?? compatible[0];
        if (field !== undefined) selected = [field.id];
      } else if (role.id === 'columns') {
        selected = compatible.slice(0, role.maxFields).map((field) => field.id);
      } else {
        selected = compatible
          .filter((field) => !used.has(field.id))
          .slice(0, role.minFields)
          .map((field) => field.id);
      }
      if (selected.length >= role.minFields) {
        fields[role.id] = selected;
        selected.forEach((id) => used.add(id));
      }
    }
  }
  return {
    datasetId: descriptor.datasetId,
    params,
    fields,
  };
}

export function readDesignerDatasetParameter(
  input: HTMLInputElement | HTMLTextAreaElement,
  parameter: ScreenDatasetDefinition['parameters'][number],
): ScreenJsonValue | undefined {
  if (parameter.valueType === 'boolean' && input instanceof HTMLInputElement) return input.checked;
  if (parameter.valueType === 'number') {
    if (input.value.trim() === '') return undefined;
    const value = Number(input.value);
    return Number.isFinite(value) ? value : undefined;
  }
  return input.value;
}

export function designerDataSourceModes(
  entry: BaseScreenMaterialCatalogEntry | undefined,
): readonly DesignerDataSourceMode[] {
  const capabilities = entry?.manifest.dataCapabilities ?? [];
  return [
    'none',
    ...(capabilities.includes('static') ? (['static'] as const) : []),
    ...(capabilities.includes('variable') ? (['variable'] as const) : []),
    ...(capabilities.includes('dataset') ? (['dataset'] as const) : []),
    ...(capabilities.includes('host-resource') ? (['host-resource'] as const) : []),
  ];
}

/**
 * 参数位唯一的状态变更入口：把一个参数整体换成「选中的取值」。
 *
 * 不再根据控件类型猜形态——旧实现（`updateDesignerDatasetParameter`）见到 `select` 就当变量、
 * 见到输入框就当场量，同一个参数有两套写入路径，且变量下拉一改值就把变量引用覆盖成字面量。
 * 现在形态由调用点显式给出（选择器的 `onSelect`、内联编辑器的 change），这里只做赋值。
 */
export function setDesignerDatasetParameter(
  draft: DesignerDatasetDraftView,
  name: string,
  ref: ScreenValueRef,
): DesignerDatasetDraftView {
  if (name === '') return draft;
  return { ...draft, params: { ...draft.params, [name]: ref } };
}

export function toggleDesignerDatasetBindingField(
  draft: DesignerDatasetDraftView,
  role: ScreenDataBindingRole,
  fieldId: string,
): DesignerDatasetDraftView {
  const selected = draft.fields[role.id] ?? [];
  const next = selected.includes(fieldId)
    ? selected.filter((item) => item !== fieldId)
    : role.maxFields === 1
      ? [fieldId]
      : selected.length < role.maxFields
        ? [...selected, fieldId]
        : selected;
  return { ...draft, fields: { ...draft.fields, [role.id]: next } };
}

export function createStaticDataSourceTransaction(
  componentId: string,
  draft: string,
  descriptor?: BaseScreenMaterialStaticDataDescriptor,
  binding?: ScreenHostResourceBinding,
  roles: readonly ScreenDataBindingRole[] = [],
): ScreenParseResult<ScreenDocumentTransaction> {
  let value: unknown;
  try {
    value = JSON.parse(draft);
  } catch {
    return invalid('CORE_COMMAND_INVALID', DESIGNER_UI_TEXT.dataSource.staticInvalid);
  }
  const parsed = parseScreenJsonValue(value);
  if (!parsed.ok) return invalid('CORE_COMMAND_INVALID', DESIGNER_UI_TEXT.dataSource.staticInvalid);
  if (descriptor?.kind === 'scalar' && typeof parsed.value !== descriptor.valueType) {
    return invalid('CORE_COMMAND_INVALID', DESIGNER_UI_TEXT.dataSource.staticInvalid);
  }
  if (descriptor?.kind === 'tabular') {
    const dataset = parseScreenTabularDataset(parsed.value);
    if (!dataset.ok) return dataset;
    const checked = validateScreenHostResourceBinding(binding ?? null, dataset.value.fields, roles);
    if (!checked.ok) return checked;
    return success(
      updateDataSource(componentId, {
        type: 'static',
        value: dataset.value as unknown as ScreenJsonValue,
        ...(binding === undefined ? {} : { binding }),
      }),
    );
  }
  return success(updateDataSource(componentId, { type: 'static', value: parsed.value }));
}

export function createDatasetDataSourceTransaction(
  options: DesignerDatasetTransactionOptions,
): ScreenParseResult<ScreenDocumentTransaction> {
  for (const parameter of options.descriptor.parameters) {
    const value = options.draft.params[parameter.name];
    if (value === undefined && parameter.required) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
    if (value?.kind === 'variable') {
      const exists = options.document.variables.some((item) => item.id === value.variableId);
      if (!exists) {
        return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
      }
    }
  }

  const params: Record<string, ScreenHostResourceParameter> = {};
  // 旧形态表达不了的参数（例如常量与变量之外的取值引用）没有内联值可评估，
  // 只能用定义里的兜底值参与「参数能否通过类型校验」这一步，落库形态仍然 fail-closed。
  const evaluated: Record<string, ScreenJsonValue> = {};
  for (const [name, ref] of Object.entries(options.draft.params)) {
    const definition = options.descriptor.parameters.find((item) => item.name === name);
    if (definition === undefined) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
    const legacy = valueRefToHostResourceParameter(ref);
    if (legacy === undefined) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
    params[name] = legacy;
    evaluated[name] = ref.kind === 'inline' ? ref.value : fallbackParameterValue(definition);
  }
  const validated = evaluateScreenDatasetParameters(options.descriptor.parameters, evaluated);
  if (!validated.ok) return validated;

  const binding: ScreenHostResourceBinding | null =
    options.roles.length === 0 ? null : { fields: options.draft.fields };
  const checked = validateScreenHostResourceBinding(
    binding,
    options.descriptor.fields,
    options.roles,
  );
  if (!checked.ok) return checked;

  return success(
    updateDataSource(options.componentId, {
      type: 'dataset',
      datasetId: options.descriptor.datasetId,
      params,
      binding,
    }),
  );
}

/** 变量引用在评估阶段没有具体值：用定义里的合法兜底值占位，只为让类型校验不误报。 */
function fallbackParameterValue(
  definition: ScreenDatasetDefinition['parameters'][number],
): ScreenJsonValue {
  return (
    definition.allowedValues?.[0] ??
    definition.defaultValue ??
    (definition.valueType === 'number'
      ? (definition.minimum ?? 0)
      : definition.valueType === 'boolean'
        ? false
        : definition.valueType === 'date'
          ? '2000-01-01'
          : '')
  );
}

export function createEmptyDataSourceTransaction(
  componentId: string,
): ScreenParseResult<ScreenDocumentTransaction> {
  return success(updateDataSource(componentId, null));
}

export function createVariableDataSourceTransaction(
  document: ScreenDocument,
  componentId: string,
  variableId: string,
): ScreenParseResult<ScreenDocumentTransaction> {
  if (!document.variables.some((variable) => variable.id === variableId)) {
    return invalid('CORE_COMMAND_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
  }
  return success(updateDataSource(componentId, { type: 'variable', variableId }));
}

export function defaultDatasetParameterValue(
  descriptor: ScreenDatasetDefinition | undefined,
  name: string,
): ScreenJsonValue {
  return descriptor?.parameters.find((parameter) => parameter.name === name)?.defaultValue ?? null;
}

function updateDataSource(
  componentId: string,
  dataSource: ScreenDocument['components'][number]['dataSource'],
): ScreenDocumentTransaction {
  return {
    commands: [
      {
        type: 'update-components',
        componentIds: [componentId],
        patch: { dataSource },
      },
    ],
  };
}

function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function invalid(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code, path: [], message }],
  };
}
