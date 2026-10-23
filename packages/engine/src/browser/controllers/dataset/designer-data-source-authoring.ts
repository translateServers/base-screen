import {
  evaluateScreenDatasetParameters,
  parseScreenJsonValue,
  parseScreenTabularDataset,
  readScreenComponentDataBinding,
  readScreenComponentValueRef,
  readScreenDocumentDataSources,
  readScreenVariableRecord,
  type ScreenComponentDataSource,
  type ScreenDataBinding,
  type ScreenDataSource,
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
  type ScreenDocumentCommand,
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

/** 数据面板读取用的数据集来源：legacy 组件没有实例，新形态组件带文档级实例。 */
export interface AuthoringDatasetSource {
  readonly source: Extract<ScreenComponentDataSource, { readonly type: 'dataset' }>;
  readonly instanceId: string | undefined;
  readonly instance: ScreenDataSource | undefined;
}

/**
 * 把组件当前的 dataset 绑定投影成数据面板可读的 legacy 形状。
 *
 * 新形态（dataValue + document.dataSources）只在这里翻译成旧形状给现有草稿/预览逻辑用；
 * 任何写回都必须走 `createDatasetBindingTransaction` 的新形态事务。
 */
export function readAuthoringDatasetSource(
  document: ScreenDocument | undefined,
  component: ScreenDocument['components'][number] | undefined,
): AuthoringDatasetSource | null {
  if (component === undefined) return null;
  if (component.dataSource?.type === 'dataset') {
    return { source: component.dataSource, instanceId: undefined, instance: undefined };
  }
  const value = readScreenComponentValueRef(component);
  if (value === null || value.kind !== 'data-source-field' || document === undefined) return null;
  const instance = readScreenDocumentDataSources(document).find(
    (candidate) => candidate.id === value.dataSourceId,
  );
  if (instance === undefined || instance.source.kind !== 'dataset') return null;
  const params: Record<string, ScreenHostResourceParameter> = {};
  for (const [name, ref] of Object.entries(instance.params)) {
    const legacy = valueRefToHostResourceParameter(ref);
    if (legacy !== undefined) params[name] = legacy;
  }
  return {
    source: {
      type: 'dataset',
      datasetId: instance.source.datasetId,
      params,
      binding: readScreenComponentDataBinding(component),
    },
    instanceId: instance.id,
    instance,
  };
}

/** 从文档级实例直接生成草稿：参数已经是 ScreenValueRef，不再做旧形态翻译。 */
export function createDesignerDatasetDraftFromInstance(
  descriptor: ScreenDatasetDefinition,
  instance: ScreenDataSource,
  binding: ScreenDataBinding | null | undefined,
  roles: readonly ScreenDataBindingRole[] = [],
): DesignerDatasetDraftView {
  const params: Record<string, ScreenValueRef> = {};
  for (const parameter of descriptor.parameters) {
    const existing = instance.params[parameter.name];
    if (existing !== undefined) {
      params[parameter.name] = existing;
    } else if (parameter.defaultValue !== undefined) {
      params[parameter.name] = { kind: 'inline', value: parameter.defaultValue };
    }
  }
  const fields =
    binding === null || binding === undefined
      ? autoMatchDatasetFields(descriptor, roles)
      : Object.fromEntries(
          Object.entries(binding.fields).map(([role, values]) => [role, [...values]]),
        );
  return { datasetId: descriptor.datasetId, params, fields };
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
  if (!sameResource) Object.assign(fields, autoMatchDatasetFields(descriptor, roles));
  return {
    datasetId: descriptor.datasetId,
    params,
    fields,
  };
}

/**
 * 默认字段匹配：角色顺序决定优先级，**同一字段不重复占用**（`used` 集合）。
 *
 * 单一来源：新建草稿与组头的「自动匹配」都读这一个函数。两处各写一遍的话，
 * 「自动匹配」的结果会跟首次选中数据集时不一样，而用户默认它们应该一样。
 *
 * 单字段角色取第一个未占用且类型兼容的字段（都被占用时退回第一个兼容字段，避免空着）；
 * `columns` 这类「展示型多选」直接铺满上限；其余多选只铺到下限（最小值即"够用"）。
 */
export function autoMatchDatasetFields(
  descriptor: ScreenDatasetDefinition,
  roles: readonly ScreenDataBindingRole[],
): Record<string, readonly string[]> {
  const fields: Record<string, readonly string[]> = {};
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
      for (const id of selected) used.add(id);
    }
  }
  return fields;
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

export interface DesignerDatasetBindingOptions extends DesignerDatasetTransactionOptions {
  /** 文档里已有的实例 id：来自 dataValue 或用户的共享实例选择。 */
  readonly preferredInstanceId?: string | undefined;
}

/**
 * 新形态 dataset 绑定事务：先 upsert 文档级实例，再写组件 dataValue/dataBinding。
 *
 * 实例复用规则：显式 preferred 优先；否则复用同 dataset 且参数完全相同的现有实例；
 * 都没有才新建 `data-source-<componentId>`。preferred 指向的实例若换了 dataset，
 * 不原地改它的来源（会波及所有共享读者），而是按新 dataset 重新匹配/新建。
 */
export function createDatasetBindingTransaction(
  options: DesignerDatasetBindingOptions,
): ScreenParseResult<ScreenDocumentTransaction> {
  const draftValidated = validateDatasetBindingDraft(
    options.document,
    options.descriptor,
    options.draft,
  );
  if (!draftValidated.ok) return draftValidated;
  const binding: ScreenDataBinding | null =
    options.roles.length === 0 ? null : { fields: options.draft.fields };
  const checked = validateScreenHostResourceBinding(
    binding,
    options.descriptor.fields,
    options.roles,
  );
  if (!checked.ok) return checked;

  const existing = options.document.dataSources ?? [];
  const preferred =
    options.preferredInstanceId === undefined
      ? undefined
      : existing.find((instance) => instance.id === options.preferredInstanceId);
  const reusable =
    preferred !== undefined &&
    preferred.source.kind === 'dataset' &&
    preferred.source.datasetId === options.descriptor.datasetId
      ? preferred
      : existing.find(
          (instance) =>
            instance.source.kind === 'dataset' &&
            instance.source.datasetId === options.descriptor.datasetId &&
            sameDatasetParams(instance.params, options.draft.params),
        );
  const instanceId = reusable?.id ?? nextInstanceId(existing, options.componentId);
  const instance: ScreenDataSource = {
    ...(reusable ?? { id: instanceId, name: options.descriptor.name }),
    id: instanceId,
    name: reusable?.name ?? options.descriptor.name,
    source: { kind: 'dataset', datasetId: options.descriptor.datasetId },
    params: options.draft.params,
  };
  const dataSources =
    reusable === undefined
      ? [...existing, instance]
      : existing.map((candidate) => (candidate.id === instanceId ? instance : candidate));
  const component = options.document.components.find(
    (candidate) => candidate.id === options.componentId,
  );
  const previousValue = component === undefined ? null : readScreenComponentValueRef(component);
  const previousInstanceId =
    previousValue?.kind === 'data-source-field' ? previousValue.dataSourceId : undefined;
  const commands: ScreenDocumentCommand[] = [
    { type: 'replace-data-sources', dataSources },
    {
      type: 'update-components',
      componentIds: [options.componentId],
      patch: {
        dataSource: null,
        dataValue: { kind: 'data-source-field', dataSourceId: instanceId, path: [] },
        dataBinding: binding,
      },
    },
  ];
  // 改绑后旧实例已经没人引用时清掉它（先写新引用，再删实例，满足 replace-data-sources 的顺序约束）。
  if (
    previousInstanceId !== undefined &&
    previousInstanceId !== instanceId &&
    existing.some((candidate) => candidate.id === previousInstanceId) &&
    !instanceReferencedByOthers(options.document, options.componentId, previousInstanceId)
  ) {
    commands.push({
      type: 'replace-data-sources',
      dataSources: dataSources.filter((candidate) => candidate.id !== previousInstanceId),
    });
  }
  return success({ commands });
}

function validateDatasetBindingDraft(
  document: ScreenDocument,
  descriptor: ScreenDatasetDefinition,
  draft: DesignerDatasetDraftView,
): ScreenParseResult<null> {
  for (const parameter of descriptor.parameters) {
    const value = draft.params[parameter.name];
    if (value === undefined && parameter.required) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
    if (
      value?.kind === 'variable' &&
      !document.variables.some((variable) => variable.id === value.variableId)
    ) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
  }
  const evaluated: Record<string, ScreenJsonValue> = {};
  for (const [name, ref] of Object.entries(draft.params)) {
    const definition = descriptor.parameters.find((parameter) => parameter.name === name);
    if (definition === undefined) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
    evaluated[name] = ref.kind === 'inline' ? ref.value : fallbackParameterValue(definition);
  }
  const result = evaluateScreenDatasetParameters(descriptor.parameters, evaluated);
  return result.ok ? success(null) : result;
}

function instanceReferencedByOthers(
  document: ScreenDocument,
  componentId: string,
  instanceId: string,
): boolean {
  for (const candidate of document.components) {
    if (candidate.id === componentId) continue;
    const ref = readScreenComponentValueRef(candidate);
    if (ref?.kind === 'data-source-field' && ref.dataSourceId === instanceId) return true;
  }
  for (const variable of document.variables) {
    const ref = readScreenVariableRecord(variable).value;
    if (ref.kind === 'data-source-field' && ref.dataSourceId === instanceId) return true;
  }
  return false;
}

function sameDatasetParams(
  left: Readonly<Record<string, ScreenValueRef>>,
  right: Readonly<Record<string, ScreenValueRef>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (valueRefKey(left[key]) !== valueRefKey(right[key])) return false;
  }
  return true;
}

function valueRefKey(ref: ScreenValueRef | undefined): string {
  if (ref === undefined) return 'missing';
  if (ref.kind === 'inline') return `inline:${JSON.stringify(ref.value)}`;
  if (ref.kind === 'variable') return `variable:${ref.variableId}`;
  return `field:${ref.dataSourceId}:${ref.path.join('.')}`;
}

function nextInstanceId(existing: readonly ScreenDataSource[], componentId: string): string {
  const base = `data-source-${componentId}`;
  const ids = new Set(existing.map((instance) => instance.id));
  if (!ids.has(base)) return base;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
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
  document: ScreenDocument,
  componentId: string,
): ScreenParseResult<ScreenDocumentTransaction> {
  const component = document.components.find((candidate) => candidate.id === componentId);
  const commands: ScreenDocumentCommand[] = [
    {
      type: 'update-components',
      componentIds: [componentId],
      patch: { dataSource: null, dataValue: null, dataBinding: null },
    },
  ];
  const value = component === undefined ? null : readScreenComponentValueRef(component);
  if (value?.kind === 'data-source-field') {
    const instanceId = value.dataSourceId;
    const usedByComponent = document.components.some((candidate) => {
      if (candidate.id === componentId) return false;
      const ref = readScreenComponentValueRef(candidate);
      return ref?.kind === 'data-source-field' && ref.dataSourceId === instanceId;
    });
    const usedByVariable = document.variables.some((variable) => {
      const record = readScreenVariableRecord(variable);
      return record.value.kind === 'data-source-field' && record.value.dataSourceId === instanceId;
    });
    const instances = document.dataSources ?? [];
    if (!usedByComponent && !usedByVariable && instances.some((item) => item.id === instanceId)) {
      commands.push({
        type: 'replace-data-sources',
        dataSources: instances.filter((item) => item.id !== instanceId),
      });
    }
  }
  return success({ commands });
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
