import { parseScreenTabularDataset, type ScreenJsonValue } from '@base-screen/contracts';
import { PluginDiagnosticCollector } from './diagnostics.js';
import { isRecord, validateExactObject, validateKnownObject } from './material-validation-utils.js';

export function validateStaticData(
  manifest: Record<string, ScreenJsonValue>,
  collector: PluginDiagnosticCollector,
): void {
  const descriptor = manifest.staticData;
  if (descriptor === undefined) return;
  if (!isRecord(descriptor)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['staticData'],
      'Static data descriptor must be an object.',
    );
    return;
  }
  if (!Array.isArray(manifest.dataCapabilities) || !manifest.dataCapabilities.includes('static')) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['staticData'],
      'Static data descriptor requires the static capability.',
    );
  }
  if (!Object.hasOwn(manifest, 'defaultData')) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultData'],
      'A declared static data descriptor requires default data.',
    );
    return;
  }
  if (descriptor.kind === 'scalar') {
    validateKnownObject(
      descriptor,
      new Set(['kind', 'valueType', 'multiline']),
      ['staticData'],
      collector,
    );
    if (!['string', 'number', 'boolean'].includes(descriptor.valueType as string)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['staticData', 'valueType'],
        'Scalar static data type is invalid.',
      );
      return;
    }
    if (descriptor.multiline !== undefined && typeof descriptor.multiline !== 'boolean') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['staticData', 'multiline'],
        'Scalar multiline must be a boolean.',
      );
    }
    if (descriptor.multiline === true && descriptor.valueType !== 'string') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['staticData', 'multiline'],
        'Only string scalar data can be multiline.',
      );
    }
    if (typeof manifest.defaultData !== descriptor.valueType) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['defaultData'],
        'Default data does not match the declared scalar type.',
      );
    }
    return;
  }
  if (descriptor.kind !== 'tabular') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['staticData', 'kind'],
      'Static data descriptor kind is invalid.',
    );
    return;
  }
  validateExactObject(descriptor, new Set(['kind', 'defaultBinding']), ['staticData'], collector);
  const parsedDataset = parseScreenTabularDataset(manifest.defaultData);
  if (!parsedDataset.ok) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultData'],
      'Default data must be a canonical tabular dataset.',
    );
    return;
  }
  const binding = descriptor.defaultBinding;
  if (!isRecord(binding)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['staticData', 'defaultBinding'],
      'Default binding must be an object.',
    );
    return;
  }
  validateExactObject(binding, new Set(['fields']), ['staticData', 'defaultBinding'], collector);
  if (!isRecord(binding.fields)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['staticData', 'defaultBinding', 'fields'],
      'Default binding fields must be an object.',
    );
    return;
  }
  const bindingFields = binding.fields;
  const roles =
    isRecord(manifest.dataBinding) && Array.isArray(manifest.dataBinding.roles)
      ? manifest.dataBinding.roles
      : [];
  const fieldById = new Map(parsedDataset.value.fields.map((field) => [field.id, field]));
  const declaredRoleIds = new Set(
    roles.flatMap((role) => (isRecord(role) && typeof role.id === 'string' ? [role.id] : [])),
  );
  for (const roleId of Object.keys(bindingFields)) {
    if (!declaredRoleIds.has(roleId)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['staticData', 'defaultBinding', 'fields', roleId],
        'Default binding references an undeclared role.',
      );
    }
  }
  roles.forEach((role, index) => {
    if (!isRecord(role) || typeof role.id !== 'string') return;
    const selected = bindingFields[role.id];
    const path = ['staticData', 'defaultBinding', 'fields', role.id] as const;
    if (
      !Array.isArray(selected) ||
      new Set(selected).size !== selected.length ||
      selected.some((fieldId) => typeof fieldId !== 'string') ||
      (typeof role.minFields === 'number' && selected.length < role.minFields) ||
      (typeof role.maxFields === 'number' && selected.length > role.maxFields)
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        path,
        `Default binding for role ${index} has an invalid field count.`,
      );
      return;
    }
    for (const fieldId of selected) {
      const field = fieldById.get(fieldId);
      if (
        field === undefined ||
        !Array.isArray(role.valueTypes) ||
        !role.valueTypes.includes(field.valueType)
      ) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          path,
          'Default binding field is missing or has an unsupported type.',
        );
      }
    }
  });
}
