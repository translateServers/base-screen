import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialEditorCondition,
  BaseScreenMaterialEditorField,
} from '@base-screen/plugin-core';

export interface DesignerDescriptorDatasetFields {
  readonly id: string;
  readonly label: string;
}

export interface DesignerDescriptorPanelInput {
  readonly document: ScreenDocument | undefined;
  readonly interaction: ScreenInteractionState;
  readonly catalog: BaseScreenMaterialCatalog | undefined;
  readonly getDatasetFields?: (() => readonly DesignerDescriptorDatasetFields[]) | undefined;
}

export interface DesignerDescriptorContext {
  readonly component: ScreenComponentNode;
  readonly manifest: NonNullable<ReturnType<BaseScreenMaterialCatalog['get']>>['manifest'];
  readonly datasetFields: readonly DesignerDescriptorDatasetFields[];
}

export function getDesignerDescriptorContext(
  input: DesignerDescriptorPanelInput,
): DesignerDescriptorContext | undefined {
  const component = input.document?.components.find(
    (item) => item.id === input.interaction.focusedComponentId,
  );
  const manifest =
    component === undefined ? undefined : input.catalog?.get(component.type)?.manifest;
  return component === undefined || manifest === undefined
    ? undefined
    : { component, manifest, datasetFields: input.getDatasetFields?.() ?? [] };
}

export function isDescriptorFieldVisible(
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): boolean {
  if (field.when === undefined || field.when.length === 0) return true;
  return field.when.every((condition) => evaluateDescriptorCondition(condition, field, context));
}

export function evaluateDescriptorCondition(
  condition: BaseScreenMaterialEditorCondition,
  field: BaseScreenMaterialEditorField,
  context: DesignerDescriptorContext,
): boolean {
  const value = readFieldTargetValue(field, condition.path, context);
  const exists = value !== undefined;
  switch (condition.operator) {
    case 'exists':
      return exists;
    case 'not-exists':
      return !exists;
    case 'eq':
      return exists && Object.is(condition.value, value);
    case 'neq':
      return !exists || !Object.is(condition.value, value);
    case 'in':
      return (
        Array.isArray(condition.value) &&
        exists &&
        condition.value.some((item) => Object.is(item, value))
      );
    case 'not-in':
      return (
        !exists ||
        !Array.isArray(condition.value) ||
        !condition.value.some((item) => Object.is(item, value))
      );
  }
}

export function readFieldTargetValue(
  field: BaseScreenMaterialEditorField,
  path: readonly (string | number)[],
  context: DesignerDescriptorContext,
): ScreenJsonValue | undefined {
  const target = field.target === 'interaction' ? (field.projection ?? 'props') : field.target;
  if (target === 'props') return readPath(context.component.props, path);
  if (target === 'style') return readPath(context.component.style, path);
  return readDataSourcePath(context.component.dataSource, path);
}

function readDataSourcePath(
  source: ScreenComponentNode['dataSource'],
  path: readonly (string | number)[],
): ScreenJsonValue | undefined {
  const root = path[0];
  if (root === 'params') {
    const parameter =
      source?.type === 'host-resource' || source?.type === 'dataset'
        ? source.params[String(path[1])]
        : undefined;
    return parameter?.kind === 'literal' ? parameter.value : undefined;
  }
  if (root === 'binding') {
    const fields =
      source?.type === 'host-resource' || source?.type === 'dataset'
        ? source.binding?.fields
        : undefined;
    if (path[1] !== 'fields') return undefined;
    const role = String(path[2]);
    const values = fields?.[role];
    if (values === undefined) return undefined;
    const index = path[3];
    return typeof index === 'number' ? values[index] : values;
  }
  return undefined;
}

export function readPath(
  record: ScreenJsonObject | undefined,
  path: readonly (string | number)[],
): ScreenJsonValue | undefined {
  if (record === undefined) return undefined;
  let current: unknown = record;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (typeof segment !== 'number' || segment >= current.length) return undefined;
      current = current[segment];
    } else {
      if (typeof segment !== 'string' || !Object.hasOwn(current, segment)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current as ScreenJsonValue | undefined;
}
