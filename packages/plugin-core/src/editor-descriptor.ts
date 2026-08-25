import type { ScreenJsonObject, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema, BaseScreenMaterialPropSchema } from './contracts.js';
import { PluginDiagnosticCollector } from './diagnostics.js';

export const MAX_EDITOR_SECTIONS_PER_ZONE = 16;
export const MAX_EDITOR_FIELDS_PER_SECTION = 64;
export const MAX_EDITOR_PATH_DEPTH = 8;
export const MAX_EDITOR_CONDITIONS = 8;
export const MAX_EDITOR_ITEM_FIELDS = 16;
export const MAX_EDITOR_ITEM_PATH_DEPTH = 6;
export const MAX_EDITOR_EVENTS = 64;
export const MAX_EDITOR_HELP_LENGTH = 1024;
export const MAX_EDITOR_CONDITION_VALUES = 16;
export const MAX_EDITOR_FIELD_KEYWORDS = 16;

export type BaseScreenMaterialEditorTarget = 'props' | 'style' | 'data' | 'interaction';

export type BaseScreenMaterialEditorProjection = 'props' | 'style';

export type BaseScreenMaterialEditorControl =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'json'
  | 'group'
  | 'array'
  | 'repeatable-array'
  | 'reorderable-array'
  | 'field-selector'
  | 'unit-number';

export type BaseScreenMaterialEditorConditionOperator =
  | 'eq'
  | 'neq'
  | 'exists'
  | 'not-exists'
  | 'in'
  | 'not-in';

export type BaseScreenMaterialEditorPathSegment = string | number;

export interface BaseScreenMaterialEditorCondition {
  readonly path: readonly BaseScreenMaterialEditorPathSegment[];
  readonly operator: BaseScreenMaterialEditorConditionOperator;
  readonly value?: ScreenJsonValue;
}

export interface BaseScreenMaterialEditorField {
  readonly id: string;
  readonly target: BaseScreenMaterialEditorTarget;
  /** 仅 `interaction` target 必填：把交互字段投影到既有 props/style 语义。 */
  readonly projection?: BaseScreenMaterialEditorProjection;
  readonly path: readonly BaseScreenMaterialEditorPathSegment[];
  readonly label: string;
  readonly control: BaseScreenMaterialEditorControl;
  readonly help?: string;
  /** 属性搜索别名；仅用于作者界面，不进入 Screen Document。 */
  readonly keywords?: readonly string[];
  readonly when?: readonly BaseScreenMaterialEditorCondition[];
  readonly advanced?: boolean;
  /** 是否允许多选检查器批量写入；未声明时按控件能力保守处理。 */
  readonly batchable?: boolean;
  readonly placeholder?: string;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** 仅 object item 的 array/repeatable-array/reorderable-array 使用；相对 item 的 path。 */
  readonly itemFields?: readonly BaseScreenMaterialEditorField[];
  readonly itemLabel?: string;
}

export interface BaseScreenMaterialEditorSection {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly BaseScreenMaterialEditorField[];
  readonly help?: string;
  readonly collapsed?: boolean;
  /** 高级折叠分组：默认收起且可整体折叠。 */
  readonly advanced?: boolean;
}

export interface BaseScreenMaterialEventDescriptor {
  readonly name: string;
  readonly label?: string;
  readonly hint?: string;
  readonly payloadSchema?: BaseScreenMaterialObjectSchema;
  readonly maxPayloadBytes?: number;
  readonly triggerContexts?: readonly 'blueprint'[];
  readonly requiredCapability?: string;
}

export interface BaseScreenMaterialEditorDescriptor {
  readonly appearance?: readonly BaseScreenMaterialEditorSection[];
  readonly data?: readonly BaseScreenMaterialEditorSection[];
  readonly interaction?: readonly BaseScreenMaterialEditorSection[];
  readonly events?: readonly BaseScreenMaterialEventDescriptor[];
}

const EDITOR_ZONES = ['appearance', 'data', 'interaction', 'events'] as const;

const EDITOR_CONTROLS: ReadonlySet<string> = new Set([
  'text',
  'number',
  'boolean',
  'select',
  'color',
  'json',
  'group',
  'array',
  'repeatable-array',
  'reorderable-array',
  'field-selector',
  'unit-number',
]);

const SCALAR_CONTROLS: ReadonlySet<string> = new Set([
  'text',
  'number',
  'boolean',
  'select',
  'color',
  'unit-number',
]);

const ARRAY_CONTROLS: ReadonlySet<string> = new Set([
  'array',
  'repeatable-array',
  'reorderable-array',
]);

const FIELD_KNOWN = new Set([
  'id',
  'target',
  'projection',
  'path',
  'label',
  'control',
  'help',
  'keywords',
  'when',
  'advanced',
  'batchable',
  'placeholder',
  'unit',
  'min',
  'max',
  'step',
  'itemFields',
  'itemLabel',
]);

const SECTION_KNOWN = new Set(['id', 'label', 'fields', 'help', 'collapsed', 'advanced']);

const EVENT_KNOWN = new Set([
  'name',
  'label',
  'hint',
  'payloadSchema',
  'maxPayloadBytes',
  'triggerContexts',
  'requiredCapability',
]);

const CONDITION_KNOWN = new Set(['path', 'operator', 'value']);

const CONDITION_OPERATORS: ReadonlySet<string> = new Set([
  'eq',
  'neq',
  'exists',
  'not-exists',
  'in',
  'not-in',
]);

export function parseBaseScreenMaterialEditorDescriptor(
  input: unknown,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
  manifestEvents: readonly string[] | undefined,
  dataBindingRoles: readonly { readonly id: string }[] | undefined,
): ScreenParseResult<BaseScreenMaterialEditorDescriptor> {
  const collector = new PluginDiagnosticCollector();
  if (!isRecord(input)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['editorDescriptor'],
      'Editor descriptor must be an object.',
    );
    return collector.failure();
  }
  const zones = new Set<string>();
  for (const [zoneName, zoneValue] of Object.entries(input)) {
    const zone = EDITOR_ZONES.find((candidate) => candidate === zoneName);
    if (zone === undefined) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD',
        ['editorDescriptor', zoneName],
        'Editor descriptor contains an unknown zone.',
      );
      continue;
    }
    if (zones.has(zone)) {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
        ['editorDescriptor', zone],
        'Editor descriptor zone is duplicated.',
      );
      continue;
    }
    zones.add(zone);
    if (!Array.isArray(zoneValue)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['editorDescriptor', zone],
        'Editor descriptor zone must be an array.',
      );
      continue;
    }
    if (zone === 'events') {
      validateEventDeclarations(zoneValue, manifestEvents, collector);
      continue;
    }
    if (zoneValue.length > MAX_EDITOR_SECTIONS_PER_ZONE) {
      collector.add(
        'PLUGIN_CORE_LIMIT_EXCEEDED',
        ['editorDescriptor', zone],
        'Editor descriptor zone has too many sections.',
      );
      continue;
    }
    validateSections(zone, zoneValue, propsSchema, styleSchema, dataBindingRoles, collector);
  }
  return collector.result(input as unknown as BaseScreenMaterialEditorDescriptor);
}

function validateSections(
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

function validateItemFields(
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

function validateConditions(
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

function validateEventDeclarations(
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

function validateFieldPath(
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

function validateControlForSchema(
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

function schemaForTarget(
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

function isPath(
  value: unknown,
  maximumDepth: number,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): value is readonly (string | number)[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumDepth) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [...path, 'path'],
      'Editor path must be a non-empty array of safe path segments.',
    );
    return false;
  }
  for (let index = 0; index < value.length; index++) {
    const segment = value[index];
    const isString = isPathSegment(segment);
    const isIndex =
      typeof segment === 'number' &&
      Number.isInteger(segment) &&
      segment >= 0 &&
      segment <= 255 &&
      index === value.length - 1;
    if (!isString && !isIndex) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'path', index],
        'Editor path segment is invalid; numeric segments are only allowed as the final binding index.',
      );
      return false;
    }
  }
  return true;
}

function isPathSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    value !== '__proto__' &&
    value !== 'prototype' &&
    value !== 'constructor'
  );
}

function validateKnown(
  value: ScreenJsonObject,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD',
        [...path, key],
        'Editor descriptor contains an unknown field.',
      );
    }
  }
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isDisplayString(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    [...value].length > 0 &&
    [...value].length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isScalar(value: ScreenJsonValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isRecord(value: unknown): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
