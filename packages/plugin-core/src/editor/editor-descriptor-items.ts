import type { BaseScreenMaterialObjectSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import {
  EDITOR_CONTROLS,
  FIELD_KNOWN,
  MAX_EDITOR_ITEM_FIELDS,
  MAX_EDITOR_ITEM_PATH_DEPTH,
} from './editor-descriptor-model.js';
import { validateControlForSchema, validateFieldPath } from './editor-descriptor-schema.js';
import {
  isDisplayString,
  isIdentifier,
  isPath,
  isRecord,
  validateKnown,
} from './editor-descriptor-validation-utils.js';

export function validateItemFields(
  itemFields: unknown,
  path: readonly (string | number)[],
  fieldIds: Set<string>,
  itemsSchema: BaseScreenMaterialObjectSchema,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (itemFields === undefined) return;
  if (!Array.isArray(itemFields) || itemFields.length > MAX_EDITOR_ITEM_FIELDS) {
    collector.add('PLUGIN_CORE_LIMIT_EXCEEDED', path, 'Item fields exceed the item field limit.');
    return;
  }
  for (let index = 0; index < itemFields.length; index++) {
    validateItemField(
      itemFields[index],
      [...path, index],
      fieldIds,
      itemsSchema,
      propsSchema,
      styleSchema,
      collector,
    );
  }
}

function validateItemField(
  value: unknown,
  path: readonly (string | number)[],
  fieldIds: Set<string>,
  itemsSchema: BaseScreenMaterialObjectSchema,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Item field must be an object.');
    return;
  }
  validateKnown(value, FIELD_KNOWN, path, collector);
  const id = value.id;
  if (!isIdentifier(id)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'id'],
      'Item field id is invalid.',
    );
  } else if (fieldIds.has(id)) {
    collector.add(
      'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
      [...path, 'id'],
      'Item field id is duplicated.',
    );
  } else {
    fieldIds.add(id);
  }
  const target = value.target;
  if (target !== 'props' && target !== 'style' && target !== 'data' && target !== 'interaction') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'target'],
      'Item field target is unsupported.',
    );
    return;
  }
  if (value.projection !== undefined && target !== 'interaction') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'projection'],
      'Projection is only allowed on interaction fields.',
    );
    return;
  }
  const rawPath = value.path;
  if (!isPath(rawPath, MAX_EDITOR_ITEM_PATH_DEPTH, path, collector)) return;
  const control = value.control;
  if (typeof control !== 'string' || !EDITOR_CONTROLS.has(control)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'control'],
      'Item control is unsupported.',
    );
    return;
  }
  validateColorGradientCapability(value.allowGradient, control, path, collector);
  if (!isDisplayString(value.label, 256)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'label'],
      'Item field label must be a display string.',
    );
  }
  if (value.itemFields !== undefined || value.itemLabel !== undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Item fields cannot nest further item fields.',
    );
  }
  const schema =
    target === 'interaction'
      ? value.projection === 'style'
        ? styleSchema
        : propsSchema
      : target === 'props' || target === 'style'
        ? itemsSchema
        : undefined;
  validateFieldPath(target, rawPath, schema, undefined, collector, path);
  validateControlForSchema(target, control, rawPath, schema, collector, path);
}

export function validateColorGradientCapability(
  value: unknown,
  control: string,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (typeof value !== 'boolean' || control !== 'color') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'allowGradient'],
      'Editor gradient support is only allowed as a boolean on color controls.',
    );
  }
}
