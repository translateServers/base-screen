import type {
  ScreenComponentNode,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import {
  getScreenJsonPath,
  insertScreenJsonArrayItem,
  moveScreenJsonArrayItem,
  removeScreenJsonArrayItem,
  type ScreenDocumentTransaction,
  type ScreenInteractionState,
  setScreenJsonPath,
} from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialPropSchema,
  validateBaseScreenMaterialProps,
} from '@base-screen/plugin-core';
import { createValidatedPropsTransaction } from '../../common/operations/designer-layout-operations.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { readDesignerColorPaletteValue } from './designer-color-palette-dom.js';

interface DescriptorFieldDataset {
  readonly fieldId: string | undefined;
  readonly target: string | undefined;
  readonly path: readonly (string | number)[] | undefined;
  readonly control: string | undefined;
}

export function createDescriptorFieldTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  const control = descriptorControlFrom(target);
  if (control === undefined || control.fieldId === undefined) return undefined;
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  if (component === undefined || manifest === undefined || control.path === undefined) {
    return descriptorFailure(
      'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
      [],
      DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
    );
  }
  if (control.target === 'props') {
    return writeObjectPath(
      component,
      control.path,
      parseControlValue(
        control,
        target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
        manifest.propsSchema,
        control.path,
      ),
      manifest.propsSchema,
      'props',
    );
  }
  if (control.target === 'style') {
    return writeObjectPath(
      component,
      control.path,
      parseControlValue(
        control,
        target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
        manifest.styleSchema,
        control.path,
      ),
      manifest.styleSchema,
      'style',
    );
  }
  if (control.target === 'interaction') {
    const projection = (target as HTMLElement).dataset.descriptorProjection;
    if (projection === 'style') {
      return writeObjectPath(
        component,
        control.path,
        parseControlValue(
          control,
          target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
          manifest.styleSchema,
          control.path,
        ),
        manifest.styleSchema,
        'style',
      );
    }
    return writeObjectPath(
      component,
      control.path,
      parseControlValue(
        control,
        target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
        manifest.propsSchema,
        control.path,
      ),
      manifest.propsSchema,
      'props',
    );
  }
  return target === null ? undefined : writeDataSourcePath(component, control.path, target);
}

export function createDescriptorArrayTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  const button = target as HTMLButtonElement | null;
  const path = parsePath(button?.dataset.descriptorArrayPath);
  const action = button?.dataset.descriptorArrayAction;
  const index = Number(button?.dataset.descriptorArrayIndex ?? '');
  if (action !== 'add' && action !== 'remove' && action !== 'move-up' && action !== 'move-down') {
    return undefined;
  }
  if (path === undefined || !Number.isInteger(index) || index < 0) {
    return undefined;
  }
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  if (component === undefined || manifest === undefined) {
    return descriptorFailure(
      'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
      [],
      DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
    );
  }
  const root = component.props;
  const resolvedArray = resolveArraySchema(path, manifest.propsSchema);
  if (resolvedArray === undefined || resolvedArray.kind !== 'array') {
    return descriptorFailure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['path'],
      DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
    );
  }
  const arraySchema = resolvedArray;
  let next: ScreenJsonObject | undefined;
  if (action === 'add') {
    const item = defaultForSchema(arraySchema.items);
    if (item === undefined) {
      return descriptorFailure(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['items'],
        DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
      );
    }
    next = insertScreenJsonArrayItem(root, path, index, item);
  } else if (action === 'remove') {
    const minItems = arraySchema.minItems;
    const current = getScreenJsonPath(component.props, path);
    if (minItems !== undefined && Array.isArray(current) && current.length <= minItems) {
      return descriptorFailure(
        'CORE_COMMAND_INVALID',
        ['items'],
        DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
      );
    }
    next = removeScreenJsonArrayItem(root, path, index);
  } else if (action === 'move-up' || action === 'move-down') {
    next = moveScreenJsonArrayItem(root, path, index, action === 'move-up' ? index - 1 : index + 1);
  }
  if (next === undefined) {
    return descriptorFailure(
      'CORE_COMMAND_INVALID',
      ['path'],
      DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
    );
  }
  return createValidatedPropsTransaction(component.id, next, manifest.propsSchema);
}

function writeObjectPath(
  component: ScreenComponentNode,
  path: readonly (string | number)[],
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialObjectSchema,
  target: 'props' | 'style',
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (value === undefined) return undefined;
  const root = target === 'props' ? component.props : component.style;
  const next = setScreenJsonPath(root, path, value);
  if (next === undefined) {
    return descriptorFailure(
      'CORE_COMMAND_INVALID',
      ['path'],
      DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
    );
  }
  return createValidatedPropsTransaction(component.id, next, schema);
}

function writeDataSourcePath(
  component: ScreenComponentNode,
  path: readonly (string | number)[],
  target: EventTarget,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  const source = component.dataSource;
  if (source?.type !== 'host-resource') {
    return descriptorFailure(
      'HOST_DATASET_BINDING_INVALID',
      ['dataSource'],
      DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid,
    );
  }
  const root = path[0];
  const control = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (root === 'params') {
    const name = String(path[1]);
    const value = parseScalarControlValue(control);
    if (value === undefined) return undefined;
    const nextSource = {
      ...source,
      params: { ...source.params, [name]: { kind: 'literal' as const, value } },
    };
    return dataSourceTransaction(component.id, nextSource);
  }
  if (root === 'binding') {
    const role = String(path[1]);
    const index = path[2];
    const fields = source.binding?.fields ?? {};
    const current = fields[role] ?? [];
    const nextFields =
      typeof index === 'number'
        ? { ...fields, [role]: current.map((field, i) => (i === index ? control.value : field)) }
        : { ...fields, [role]: [control.value] };
    const nextSource = { ...source, binding: { fields: nextFields } };
    return dataSourceTransaction(component.id, nextSource);
  }
  return undefined;
}

function dataSourceTransaction(
  componentId: string,
  dataSource: ScreenComponentNode['dataSource'],
): ScreenParseResult<ScreenDocumentTransaction> {
  return {
    ok: true,
    value: {
      commands: [
        {
          type: 'update-components',
          componentIds: [componentId],
          patch: { dataSource: dataSource as NonNullable<ScreenComponentNode['dataSource']> },
        },
      ],
    },
    diagnostics: [],
  };
}

function parseControlValue(
  control: DescriptorFieldDataset,
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  schema: BaseScreenMaterialObjectSchema | undefined,
  path: readonly (string | number)[],
): ScreenJsonValue | undefined {
  const resolved = schema === undefined ? undefined : resolveSchemaAt(path, schema);
  if (control.control === 'color') {
    return readDesignerColorPaletteValue(target) ?? target.value;
  }
  if (control.control === 'boolean') {
    return (target as HTMLInputElement).checked === true;
  }
  if (control.control === 'number' || control.control === 'unit-number') {
    const value = Number(target.value);
    return Number.isFinite(value) ? value : undefined;
  }
  if (control.control === 'select' && resolved?.kind === 'enum') {
    return resolved.values.find((candidate) => String(candidate) === target.value);
  }
  if (control.control === 'json') {
    try {
      const parsed = parseScreenJsonValue(JSON.parse(target.value));
      return parsed.ok ? parsed.value : undefined;
    } catch {
      return undefined;
    }
  }
  return target.value;
}

function parseScalarControlValue(
  target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): ScreenJsonValue | undefined {
  const inputType = (target as { type?: string }).type;
  if (inputType === 'checkbox') {
    return (target as { checked?: boolean }).checked === true;
  }
  if (inputType === 'number') {
    const value = Number(target.value);
    return Number.isFinite(value) ? value : target.value;
  }
  return target.value;
}

function descriptorControlFrom(target: EventTarget | null): DescriptorFieldDataset | undefined {
  const element = target as
    | (Partial<HTMLInputElement> & { readonly dataset?: DOMStringMap })
    | null;
  if (element?.dataset?.descriptorFieldId === undefined) return undefined;
  return {
    fieldId: element.dataset.descriptorFieldId,
    target: element.dataset.descriptorTarget,
    path: parsePath(element.dataset.descriptorPath),
    control: element.dataset.descriptorControl,
  };
}

function parsePath(value: string | undefined): readonly (string | number)[] | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed as readonly (string | number)[];
  } catch {
    return undefined;
  }
}

function resolveArraySchema(
  path: readonly (string | number)[],
  schema: BaseScreenMaterialObjectSchema,
): BaseScreenMaterialPropSchema | undefined {
  const resolved = resolveSchemaAt(path, schema);
  return resolved?.kind === 'array' ? resolved : undefined;
}

function resolveSchemaAt(
  path: readonly (string | number)[],
  schema: BaseScreenMaterialObjectSchema,
): BaseScreenMaterialPropSchema | undefined {
  let current: BaseScreenMaterialPropSchema | undefined = schema;
  for (const segment of path) {
    if (current?.kind !== 'object' || typeof segment !== 'string') return undefined;
    current = current.properties[segment];
  }
  return current;
}

function defaultForSchema(schema: BaseScreenMaterialPropSchema): ScreenJsonValue | undefined {
  switch (schema.kind) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'enum':
      return schema.values[0] ?? '';
    case 'array':
      return [];
    case 'object': {
      const value: Record<string, ScreenJsonValue> = {};
      for (const key of Object.keys(schema.properties)) {
        const item = defaultForSchema(schema.properties[key]!);
        if (item !== undefined && schema.required.includes(key)) value[key] = item;
      }
      return value;
    }
  }
}

function descriptorFailure(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<ScreenDocumentTransaction> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

export function descriptorDiagnosticMessage(code: ScreenDiagnostic['code']): string {
  switch (code) {
    case 'CORE_COMMAND_INVALID':
    case 'PLUGIN_CORE_MANIFEST_FIELD_INVALID':
    case 'HOST_DATASET_BINDING_INVALID':
    case 'PLUGIN_CORE_CONTRIBUTION_UNKNOWN':
      return DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid;
    default:
      return DESIGNER_UI_TEXT.feedback.blueprintConfigInvalid;
  }
}
