import { PluginDiagnosticCollector } from './diagnostics.js';
import {
  CONDITION_KNOWN,
  CONDITION_OPERATORS,
  MAX_EDITOR_CONDITION_VALUES,
  MAX_EDITOR_CONDITIONS,
  MAX_EDITOR_PATH_DEPTH,
} from './editor-descriptor-model.js';
import { isPath, isRecord, isScalar, validateKnown } from './editor-descriptor-validation-utils.js';

export function validateConditions(
  conditions: unknown,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (conditions === undefined) return;
  if (!Array.isArray(conditions) || conditions.length === 0) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Field conditions must be a non-empty array.',
    );
    return;
  }
  if (conditions.length > MAX_EDITOR_CONDITIONS) {
    collector.add('PLUGIN_CORE_LIMIT_EXCEEDED', path, 'Field has too many conditions.');
    return;
  }
  for (let index = 0; index < conditions.length; index++) {
    const condition = conditions[index];
    const conditionPath = [...path, index] as const;
    if (!isRecord(condition)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        conditionPath,
        'Field condition must be an object.',
      );
      continue;
    }
    validateKnown(condition, CONDITION_KNOWN, conditionPath, collector);
    isPath(condition.path, MAX_EDITOR_PATH_DEPTH, conditionPath, collector);
    const operator = condition.operator;
    if (typeof operator !== 'string' || !CONDITION_OPERATORS.has(operator)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...conditionPath, 'operator'],
        'Field condition operator is unsupported.',
      );
    }
    if (
      (operator === 'eq' || operator === 'neq' || operator === 'in' || operator === 'not-in') &&
      !Object.hasOwn(condition, 'value')
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...conditionPath, 'value'],
        'Field condition value is required.',
      );
    } else if (operator === 'exists' || operator === 'not-exists') {
      if (Object.hasOwn(condition, 'value')) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...conditionPath, 'value'],
          'Existence conditions cannot carry a value.',
        );
      }
    } else if (
      (operator === 'in' || operator === 'not-in') &&
      (!Array.isArray(condition.value) ||
        condition.value.length === 0 ||
        condition.value.length > MAX_EDITOR_CONDITION_VALUES ||
        condition.value.some((item) => !isScalar(item)))
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...conditionPath, 'value'],
        'Inclusion condition values must be non-empty scalars.',
      );
    }
  }
}
