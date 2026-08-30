import { PluginDiagnosticCollector } from './diagnostics.js';
import {
  EVENT_KNOWN,
  MAX_EDITOR_EVENTS,
  MAX_EDITOR_HELP_LENGTH,
} from './editor-descriptor-model.js';
import {
  isDisplayString,
  isIdentifier,
  isRecord,
  isScalar,
  validateKnown,
} from './editor-descriptor-validation-utils.js';

export function validateEventDeclarations(
  events: readonly unknown[],
  manifestEvents: readonly string[] | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (events.length > MAX_EDITOR_EVENTS) {
    collector.add(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
      ['editorDescriptor', 'events'],
      'Event declarations exceed the event limit.',
    );
    return;
  }
  const names = new Set<string>();
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const path = ['editorDescriptor', 'events', index] as const;
    if (!isRecord(event)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        path,
        'Event declaration must be an object.',
      );
      continue;
    }
    validateKnown(event, EVENT_KNOWN, path, collector);
    const name = event.name;
    if (!isIdentifier(name)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'name'],
        'Event name must be an ASCII identifier.',
      );
    } else {
      if (names.has(name)) {
        collector.add(
          'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
          [...path, 'name'],
          'Event declaration is duplicated.',
        );
      } else {
        names.add(name);
      }
      if (manifestEvents === undefined || !manifestEvents.includes(name)) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'name'],
          'Event declaration must reference a declared manifest event.',
        );
      }
    }
    if (event.label !== undefined && !isDisplayString(event.label, 256)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'label'],
        'Event label must be a display string.',
      );
    }
    if (event.hint !== undefined && !isDisplayString(event.hint, MAX_EDITOR_HELP_LENGTH)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'hint'],
        'Event hint must be a display string.',
      );
    }
    if (event.maxPayloadBytes !== undefined) {
      const bytes = event.maxPayloadBytes;
      if (
        typeof bytes !== 'number' ||
        !Number.isInteger(bytes) ||
        bytes < 1024 ||
        bytes > 1024 * 1024
      ) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'maxPayloadBytes'],
          'Event payload budget is invalid.',
        );
      }
    }
    if (event.triggerContexts !== undefined) {
      if (
        !Array.isArray(event.triggerContexts) ||
        new Set(event.triggerContexts).size !== event.triggerContexts.length ||
        event.triggerContexts.some((context) => context !== 'blueprint')
      ) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'triggerContexts'],
          'Event trigger contexts are invalid.',
        );
      }
    }
    if (event.requiredCapability !== undefined && !isIdentifier(event.requiredCapability)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'requiredCapability'],
        'Event required capability must be an identifier.',
      );
    }
    if (event.payloadSchema !== undefined) {
      validateEventPayloadSchema(event.payloadSchema, [...path, 'payloadSchema'], collector);
    }
  }
}

function validateEventPayloadSchema(
  value: unknown,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value) || value.kind !== 'object') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Event payload schema must be an object schema.',
    );
    return;
  }
  validateSchemaNode(value, path, collector, 1);
}

function validateSchemaNode(
  value: unknown,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  depth: number,
): void {
  if (depth > 16) {
    collector.add('PLUGIN_CORE_LIMIT_EXCEEDED', path, 'Payload schema nesting exceeds 16 levels.');
    return;
  }
  if (!isRecord(value) || typeof value.kind !== 'string') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Payload schema node must have a kind.',
    );
    return;
  }
  const kind = value.kind;
  if (kind === 'object') {
    if (!isRecord(value.properties)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'properties'],
        'Payload schema properties must be an object.',
      );
      return;
    }
    if (!Array.isArray(value.required) || value.required.some((key) => typeof key !== 'string')) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'required'],
        'Payload schema required keys must be an array.',
      );
      return;
    }
    for (const key of Object.keys(value.properties)) {
      validateSchemaNode(value.properties[key], [...path, 'properties', key], collector, depth + 1);
    }
    return;
  }
  if (kind === 'array') {
    validateSchemaNode(value.items, [...path, 'items'], collector, depth + 1);
    return;
  }
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return;
  }
  if (kind === 'enum') {
    if (
      !Array.isArray(value.values) ||
      value.values.length === 0 ||
      value.values.some((item) => !isScalar(item))
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'values'],
        'Payload schema enum values must be non-empty scalars.',
      );
    }
    return;
  }
  collector.add(
    'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
    [...path, 'kind'],
    'Payload schema kind is unsupported.',
  );
}
