import type { BaseScreenMaterialObjectSchema, BaseScreenMaterialPropSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import {
  ARRAY_CONTROLS,
  type BaseScreenMaterialEditorTarget,
  SCALAR_CONTROLS,
} from './editor-descriptor-model.js';
import { isIdentifier } from './editor-descriptor-validation-utils.js';

export function validateFieldPath(
  target: BaseScreenMaterialEditorTarget,
  path: readonly (string | number)[],
  schema: BaseScreenMaterialObjectSchema | undefined,
  dataBindingRoles: readonly { readonly id: string }[] | undefined,
  collector: PluginDiagnosticCollector,
  fieldPath: readonly (string | number)[],
): void {
  const diagnosticPath = [...fieldPath, 'path'];
  if (target === 'data') {
    const root = path[0];
    if (root !== 'params' && root !== 'binding') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Data target path must start with params or binding.',
      );
      return;
    }
    if (root === 'params') {
      if (path.length !== 2 || typeof path[1] !== 'string' || !isIdentifier(path[1])) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          diagnosticPath,
          'Data params path must be a single parameter name.',
        );
      }
      return;
    }
    if (path[1] !== 'fields') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Data binding path must start with binding.fields.',
      );
      return;
    }
    const role = path[2];
    if (
      dataBindingRoles === undefined ||
      typeof role !== 'string' ||
      !dataBindingRoles.some((candidate) => candidate.id === role)
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Data binding path must reference a declared binding role.',
      );
      return;
    }
    if (
      path.length < 3 ||
      path.length > 4 ||
      (path.length === 4 &&
        (typeof path[3] !== 'number' || !Number.isInteger(path[3]) || path[3] < 0))
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Data binding path must reference a role or one non-negative field index.',
      );
    }
    return;
  }
  if (schema === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      diagnosticPath,
      'Editor field schema is unavailable.',
    );
    return;
  }
  const resolved = resolveSchema(path, schema);
  if (resolved === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      diagnosticPath,
      'Editor field path does not resolve in the target schema.',
    );
  }
}

export function validateControlForSchema(
  target: BaseScreenMaterialEditorTarget,
  control: string,
  path: readonly (string | number)[],
  schema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
  fieldPath: readonly (string | number)[],
): void {
  const diagnosticPath = [...fieldPath, 'control'];
  if (target === 'data') {
    const root = path[0];
    if (root === 'binding') {
      if (control !== 'field-selector') {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          diagnosticPath,
          'Binding fields must use the field-selector control.',
        );
      }
      return;
    }
    if (!SCALAR_CONTROLS.has(control)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Data params must use a scalar control.',
      );
    }
    return;
  }
  const resolved = schema === undefined ? undefined : resolveSchema(path, schema);
  if (resolved === undefined) return;
  if (control === 'group') {
    if (resolved.kind !== 'object') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Group control requires an object field.',
      );
    }
    return;
  }
  if (ARRAY_CONTROLS.has(control)) {
    if (resolved.kind !== 'array') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Array controls require an array field.',
      );
    }
    return;
  }
  if (control === 'field-selector') {
    if (resolved.kind !== 'string') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        diagnosticPath,
        'Field selector requires a string field.',
      );
    }
    return;
  }
  const expected =
    control === 'number' || control === 'unit-number'
      ? 'number'
      : control === 'boolean'
        ? 'boolean'
        : control === 'select'
          ? 'enum'
          : control === 'color' || control === 'text'
            ? 'string'
            : undefined;
  if (expected !== undefined && resolved.kind !== expected) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      diagnosticPath,
      `Editor control requires a ${expected} field.`,
    );
  }
}

export function resolveSchema(
  path: readonly (string | number)[],
  schema: BaseScreenMaterialObjectSchema,
): BaseScreenMaterialPropSchema | undefined {
  let current: BaseScreenMaterialPropSchema | undefined = schema;
  for (const segment of path) {
    if (current?.kind !== 'object') return undefined;
    current = current.properties[segment];
  }
  return current;
}

export function schemaForTarget(
  target: BaseScreenMaterialEditorTarget,
  projection: unknown,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
): BaseScreenMaterialObjectSchema | undefined {
  if (target === 'props') return propsSchema;
  if (target === 'style') return styleSchema;
  if (target === 'interaction') {
    return projection === 'style' ? styleSchema : propsSchema;
  }
  return undefined;
}
