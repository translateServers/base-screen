import type { ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema } from './contracts.js';
import { PluginDiagnosticCollector } from './diagnostics.js';
import { validateEventDeclarations } from './editor-descriptor-events.js';
import {
  type BaseScreenMaterialEditorDescriptor,
  EDITOR_ZONES,
  MAX_EDITOR_SECTIONS_PER_ZONE,
} from './editor-descriptor-model.js';
import { resolveSchema } from './editor-descriptor-schema.js';
import { validateSections } from './editor-descriptor-sections.js';
import { isRecord } from './editor-descriptor-validation-utils.js';

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
  return collector.result(input as unknown as BaseScreenMaterialEditorDescriptor);
}
