import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import { MAX_PROPERTY_PANEL_FIELDS } from './material-validation-constants.js';
import { isDisplayString, isRecord, validateKnownObject } from './material-validation-utils.js';

export function validatePropertyPanel(
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  validatePanel(value, schema, 'propertyPanel', 'prop', collector);
}

export function validateStylePanel(
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialObjectSchema | undefined,
  collector: PluginDiagnosticCollector,
): void {
  validatePanel(value, schema, 'stylePanel', 'style', collector);
}

function validatePanel(
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialObjectSchema | undefined,
  panelName: 'propertyPanel' | 'stylePanel',
  fieldName: 'prop' | 'style',
  collector: PluginDiagnosticCollector,
): void {
  if (!Array.isArray(value)) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', [panelName], 'Panel must be an array.');
    return;
  }
  if (value.length > MAX_PROPERTY_PANEL_FIELDS) {
    collector.add('PLUGIN_CORE_LIMIT_EXCEEDED', [panelName], 'Panel has too many fields.');
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const field: ScreenJsonValue | undefined = value[index];
    if (!isRecord(field)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [panelName, index],
        'Panel field must be an object.',
      );
      continue;
    }
    validateKnownObject(
      field,
      new Set([fieldName, 'label', 'control', 'allowGradient']),
      [panelName, index],
      collector,
    );
    for (const required of [fieldName, 'label', 'control']) {
      if (!Object.hasOwn(field, required)) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [panelName, index, required],
          'Manifest field is required.',
        );
      }
    }
    const key = field[fieldName];
    if (typeof key !== 'string' || schema?.properties[key] === undefined) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [panelName, index, fieldName],
        'Panel field must reference a top-level schema key.',
      );
    } else if (seen.has(key)) {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
        [panelName, index, fieldName],
        'Property panel field is duplicated.',
      );
    } else {
      seen.add(key);
    }
    if (!isDisplayString(field.label, 256)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [panelName, index, 'label'],
        'Panel label must be a display string.',
      );
    }
    if (
      !['text', 'number', 'boolean', 'select', 'color', 'json'].includes(field.control as string)
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [panelName, index, 'control'],
        'Panel control is unsupported.',
      );
    }
    if (
      field.allowGradient !== undefined &&
      (typeof field.allowGradient !== 'boolean' || field.control !== 'color')
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [panelName, index, 'allowGradient'],
        'Panel gradient support is only allowed as a boolean on color controls.',
      );
    }
  }
}
