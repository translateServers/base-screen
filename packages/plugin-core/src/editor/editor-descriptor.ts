import type { ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import { validateEventDeclarations } from './editor-descriptor-events.js';
import { inferBaseScreenMaterialEditorControl } from './editor-descriptor-inference.js';
import {
  ARRAY_CONTROLS,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialEditorFieldInput,
  type BaseScreenMaterialEditorSection,
  type BaseScreenMaterialEditorSectionInput,
  EDITOR_ZONES,
  MAX_EDITOR_SECTIONS_PER_ZONE,
} from './editor-descriptor-model.js';
import { resolveSchema, schemaForTarget } from './editor-descriptor-schema.js';
import { validateSections } from './editor-descriptor-sections.js';
import { isRecord } from './editor-descriptor-validation-utils.js';

export * from './editor-descriptor-inference.js';
export * from './editor-descriptor-model.js';
export { resolveSchema } from './editor-descriptor-schema.js';

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
  if (collector.hasErrors) return collector.failure();
  return collector.result(normalizeDescriptor(input, propsSchema, styleSchema));
}

/**
 * 规范化（ADR-0102 D2）：省略 `control` 的字段按语义补齐，解析结果里每个字段都带 `control`，
 * 消费方（引擎、门禁）不必再做推导。只在校验通过后执行，结构已确认合法。
 */
function normalizeDescriptor(
  input: Record<string, unknown>,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
): BaseScreenMaterialEditorDescriptor {
  const output: Record<string, unknown> = { ...input };
  for (const zone of ['appearance', 'data', 'interaction'] as const) {
    const sections = input[zone] as readonly BaseScreenMaterialEditorSectionInput[] | undefined;
    if (sections === undefined) continue;
    output[zone] = sections.map(
      (section): BaseScreenMaterialEditorSection => ({
        ...section,
        fields: section.fields.map((field) => normalizeField(field, propsSchema, styleSchema)),
      }),
    );
  }
  return output as BaseScreenMaterialEditorDescriptor;
}

function normalizeField(
  field: BaseScreenMaterialEditorFieldInput,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
): BaseScreenMaterialEditorField {
  const root = schemaForTarget(field.target, field.projection, propsSchema, styleSchema);
  const schema = root === undefined ? undefined : resolveSchema(field.path, root);
  const control = field.control ?? inferBaseScreenMaterialEditorControl(field, schema);
  const { itemFields, ...rest } = field;
  const normalized = { ...rest, control } as BaseScreenMaterialEditorField;
  if (itemFields === undefined) return normalized;
  const items =
    ARRAY_CONTROLS.has(normalized.control) &&
    schema?.kind === 'array' &&
    schema.items.kind === 'object'
      ? schema.items
      : undefined;
  return {
    ...normalized,
    itemFields: itemFields.map((item) => normalizeItemField(item, items, propsSchema, styleSchema)),
  };
}

function normalizeItemField(
  field: BaseScreenMaterialEditorFieldInput,
  itemsSchema: BaseScreenMaterialObjectSchema | undefined,
  propsSchema: BaseScreenMaterialObjectSchema | undefined,
  styleSchema: BaseScreenMaterialObjectSchema | undefined,
): BaseScreenMaterialEditorField {
  // 与条目字段校验同一口径：交互字段按投影取根 schema，props/style 相对条目 schema。
  const root =
    field.target === 'interaction'
      ? field.projection === 'style'
        ? styleSchema
        : propsSchema
      : field.target === 'props' || field.target === 'style'
        ? itemsSchema
        : undefined;
  const schema = root === undefined ? undefined : resolveSchema(field.path, root);
  const control = field.control ?? inferBaseScreenMaterialEditorControl(field, schema);
  return { ...field, control } as BaseScreenMaterialEditorField;
}
