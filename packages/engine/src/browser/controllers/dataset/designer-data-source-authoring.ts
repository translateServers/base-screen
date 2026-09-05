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

export function createDesignerDatasetDraft(
  descriptor: ScreenDatasetDefinition,
  source: ScreenDocument['components'][number]['dataSource'],
  roles: readonly ScreenDataBindingRole[] = [],
): DesignerDatasetDraftView {
  const sameResource = source?.type === 'dataset' && source.datasetId === descriptor.datasetId;
  const params: Record<string, ScreenHostResourceParameter> = {};
  for (const parameter of descriptor.parameters) {
    const existing = sameResource ? source.params[parameter.name] : undefined;
    if (existing !== undefined) params[parameter.name] = existing;
    else if (parameter.defaultValue !== undefined) {
      params[parameter.name] = { kind: 'literal', value: parameter.defaultValue };
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

export function updateDesignerDatasetParameter(
  draft: DesignerDatasetDraftView,
  descriptor: ScreenDatasetDefinition,
  name: string,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): DesignerDatasetDraftView {
  if (target instanceof HTMLSelectElement) {
    return {
      ...draft,
      params: { ...draft.params, [name]: { kind: 'variable', variableId: target.value } },
    };
  }
  const parameter = descriptor.parameters.find((item) => item.name === name);
  if (parameter === undefined) return draft;
  const value = readDesignerDatasetParameter(target, parameter);
  return value === undefined
    ? draft
    : { ...draft, params: { ...draft.params, [name]: { kind: 'literal', value } } };
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
    if (
      (value === undefined && parameter.required) ||
      (value?.kind === 'variable' &&
        !options.document.variables.some((item) => item.id === value.variableId))
    ) {
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    }
  }

  const literalValues: Record<string, ScreenJsonValue> = {};
  for (const [name, parameter] of Object.entries(options.draft.params)) {
    const definition = options.descriptor.parameters.find((item) => item.name === name);
    if (definition === undefined)
      return invalid('HOST_DATASET_PARAMETER_INVALID', DESIGNER_UI_TEXT.dataset.incomplete);
    literalValues[name] =
      parameter.kind === 'literal'
        ? parameter.value
        : (definition.allowedValues?.[0] ??
          definition.defaultValue ??
          (definition.valueType === 'number'
            ? (definition.minimum ?? 0)
            : definition.valueType === 'boolean'
              ? false
              : definition.valueType === 'date'
                ? '2000-01-01'
                : ''));
  }
  const validated = evaluateScreenDatasetParameters(options.descriptor.parameters, literalValues);
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
      params: options.draft.params,
      binding,
    }),
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
