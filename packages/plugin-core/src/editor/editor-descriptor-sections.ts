import type { BaseScreenMaterialObjectSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import { validateConditions } from './editor-descriptor-conditions.js';
import { validateColorGradientCapability, validateItemFields } from './editor-descriptor-items.js';
import {
  ARRAY_CONTROLS,
  EDITOR_CONTROLS,
  FIELD_KNOWN,
  MAX_EDITOR_FIELD_KEYWORDS,
  MAX_EDITOR_FIELDS_PER_SECTION,
  MAX_EDITOR_HELP_LENGTH,
  MAX_EDITOR_PATH_DEPTH,
  SECTION_KNOWN,
} from './editor-descriptor-model.js';
import {
  resolveSchema,
  schemaForTarget,
  validateControlForSchema,
  validateFieldPath,
} from './editor-descriptor-schema.js';
import {
  isDisplayString,
  isIdentifier,
  isPath,
  isRecord,
  validateKnown,
} from './editor-descriptor-validation-utils.js';

export function validateSections(
  zone: string,
  sections: readonly unknown[],
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  dataBindingRoles: readonly { readonly id: string }[] | undefined,
  collector: PluginDiagnosticCollector,
): void {
  const ids = new Set<string>();
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const path = ['editorDescriptor', zone, sectionIndex] as const;
    if (!isRecord(section)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        path,
        'Editor descriptor section must be an object.',
      );
      continue;
    }
    validateKnown(section, SECTION_KNOWN, path, collector);
    const id = section.id;
    if (!isIdentifier(id)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'id'],
        'Editor section id is invalid.',
      );
    } else if (ids.has(id)) {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
        [...path, 'id'],
        'Editor section id is duplicated.',
      );
    } else {
      ids.add(id);
    }
    if (!isDisplayString(section.label, 256)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'label'],
        'Editor section label must be a display string.',
      );
    }
    if (section.help !== undefined && !isDisplayString(section.help, MAX_EDITOR_HELP_LENGTH)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'help'],
        'Editor section help must be a display string.',
      );
    }
    if (section.collapsed !== undefined && typeof section.collapsed !== 'boolean') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'collapsed'],
        'Editor section collapsed must be a boolean.',
      );
    }
    if (section.advanced !== undefined && typeof section.advanced !== 'boolean') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'advanced'],
        'Editor section advanced must be a boolean.',
      );
    }
    if (!Array.isArray(section.fields)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'fields'],
        'Editor section fields must be an array.',
      );
      continue;
    }
    if (section.fields.length > MAX_EDITOR_FIELDS_PER_SECTION) {
      collector.add(
        'PLUGIN_CORE_LIMIT_EXCEEDED',
        [...path, 'fields'],
        'Editor section has too many fields.',
      );
      continue;
    }
    const fieldIds = new Set<string>();
    for (let fieldIndex = 0; fieldIndex < section.fields.length; fieldIndex++) {
      validateField(
        section.fields[fieldIndex],
        [...path, 'fields', fieldIndex],
        fieldIds,
        propsSchema,
        styleSchema,
        dataBindingRoles,
        collector,
      );
    }
  }
}

function validateField(
  value: unknown,
  path: readonly (string | number)[],
  fieldIds: Set<string>,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  dataBindingRoles: readonly { readonly id: string }[] | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Editor descriptor field must be an object.',
    );
    return;
  }
  validateKnown(value, FIELD_KNOWN, path, collector);
  const id = value.id;
  if (!isIdentifier(id)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'id'],
      'Editor field id is invalid.',
    );
  } else if (fieldIds.has(id)) {
    collector.add(
      'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
      [...path, 'id'],
      'Editor field id is duplicated.',
    );
  } else {
    fieldIds.add(id);
  }
  const target = value.target;
  if (target !== 'props' && target !== 'style' && target !== 'data' && target !== 'interaction') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'target'],
      'Editor field target is unsupported.',
    );
    return;
  }
  const projection = value.projection;
  if (target === 'interaction') {
    if (projection !== 'props' && projection !== 'style') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'projection'],
        'Interaction field must project to props or style semantics.',
      );
      return;
    }
  } else if (projection !== undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'projection'],
      'Projection is only allowed on interaction fields.',
    );
    return;
  }
  const rawPath = value.path;
  const fieldPath = isPath(rawPath, MAX_EDITOR_PATH_DEPTH, path, collector) ? rawPath : undefined;
  if (fieldPath === undefined) return;
  const control = value.control;
  if (typeof control !== 'string' || !EDITOR_CONTROLS.has(control)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'control'],
      'Editor control is unsupported.',
    );
    return;
  }
  validateColorGradientCapability(value.allowGradient, control, path, collector);
  if (!isDisplayString(value.label, 256)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'label'],
      'Editor field label must be a display string.',
    );
  }
  if (value.help !== undefined && !isDisplayString(value.help, MAX_EDITOR_HELP_LENGTH)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'help'],
      'Editor field help must be a display string.',
    );
  }
  if (value.keywords !== undefined) {
    if (
      !Array.isArray(value.keywords) ||
      value.keywords.length > MAX_EDITOR_FIELD_KEYWORDS ||
      value.keywords.some((keyword) => !isDisplayString(keyword, 64))
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'keywords'],
        'Editor field keywords must be a bounded list of display strings.',
      );
    }
  }
  if (value.advanced !== undefined && typeof value.advanced !== 'boolean') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'advanced'],
      'Editor field advanced must be a boolean.',
    );
  }
  if (value.batchable !== undefined && typeof value.batchable !== 'boolean') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'batchable'],
      'Editor field batchable must be a boolean.',
    );
  }
  if (value.placeholder !== undefined && !isDisplayString(value.placeholder, 256)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'placeholder'],
      'Editor field placeholder must be a display string.',
    );
  }
  if (value.unit !== undefined && !isDisplayString(value.unit, 16)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'unit'],
      'Editor field unit must be a display string.',
    );
  }
  for (const field of ['min', 'max', 'step'] as const) {
    const number = value[field];
    if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number))) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, field],
        'Editor field numeric range must be finite.',
      );
    }
  }
  if (typeof value.min === 'number' && typeof value.max === 'number' && value.min > value.max) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Editor field min cannot exceed max.',
    );
  }
  validateConditions(value.when, [...path, 'when'], collector);
  const schema = schemaForTarget(target, projection, propsSchema, styleSchema);
  validateFieldPath(target, fieldPath, schema, dataBindingRoles, collector, path);
  validateControlForSchema(target, control, fieldPath, schema, collector, path);
  if (ARRAY_CONTROLS.has(control)) {
    const items = schema === undefined ? undefined : resolveSchema(fieldPath, schema);
    if (items?.kind === 'array' && items.items.kind === 'object') {
      validateItemFields(
        value.itemFields,
        path,
        fieldIds,
        items.items,
        propsSchema,
        styleSchema,
        collector,
      );
    } else if (value.itemFields !== undefined) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'itemFields'],
        'Item fields require an object item array field.',
      );
    }
  } else if (value.itemFields !== undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'itemFields'],
      'Item fields are only supported on array controls.',
    );
  }
  if (value.itemLabel !== undefined && !isDisplayString(value.itemLabel, 256)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'itemLabel'],
      'Editor field item label must be a display string.',
    );
  }
}
