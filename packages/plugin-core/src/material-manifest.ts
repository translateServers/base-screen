import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialManifest, BaseScreenMaterialObjectSchema } from './contracts.js';
import { PluginDiagnosticCollector } from './diagnostics.js';
import { parseBaseScreenMaterialEditorDescriptor } from './editor-descriptor.js';
import { validateDefaultValues, validateMaterialFields } from './material-manifest-fields.js';
import { validatePropertyPanel, validateStylePanel } from './material-panel.js';
import { validatePropsSchema } from './material-schema.js';
import { validateStaticData } from './material-static-data.js';
import { MANIFEST_FIELDS, MAX_MATERIAL_MANIFEST_BYTES } from './material-validation-constants.js';
import {
  failure,
  isRecord,
  parsePluginJson,
  validateKnownObject,
} from './material-validation-utils.js';

export function parseBaseScreenMaterialManifest(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialManifest> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, MAX_MATERIAL_MANIFEST_BYTES);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [], 'Material manifest must be an object.');
  }

  const manifest = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateKnownObject(manifest, MANIFEST_FIELDS, [], collector);
  for (const field of MANIFEST_FIELDS) {
    if (
      field !== 'dataBinding' &&
      field !== 'libraryVisible' &&
      field !== 'defaultData' &&
      field !== 'staticData' &&
      field !== 'editorDescriptor' &&
      field !== 'cover' &&
      !Object.hasOwn(manifest, field)
    ) {
      collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', [field], 'Manifest field is required.');
    }
  }
  validateMaterialFields(manifest, collector);
  const parsedPropsSchema = validatePropsSchema(
    manifest.propsSchema,
    ['propsSchema'],
    collector,
    1,
  );
  const propsSchema = parsedPropsSchema?.kind === 'object' ? parsedPropsSchema : undefined;
  if (parsedPropsSchema !== undefined && propsSchema === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['propsSchema'],
      'Material props schema must be an object schema.',
    );
  }
  const parsedStyleSchema = validatePropsSchema(
    manifest.styleSchema,
    ['styleSchema'],
    collector,
    1,
  );
  const styleSchema = parsedStyleSchema?.kind === 'object' ? parsedStyleSchema : undefined;
  if (parsedStyleSchema !== undefined && styleSchema === undefined) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['styleSchema'],
      'Material style schema must be an object schema.',
    );
  }
  validateDefaultValues(manifest.defaultProps, propsSchema, ['defaultProps'], collector);
  validateDefaultValues(manifest.defaultStyle, styleSchema, ['defaultStyle'], collector);
  validateStaticData(manifest, collector);
  validatePropertyPanel(manifest.propertyPanel, propsSchema, collector);
  validateStylePanel(manifest.stylePanel, styleSchema, collector);
  if (manifest.editorDescriptor !== undefined) {
    const descriptor = parseBaseScreenMaterialEditorDescriptor(
      manifest.editorDescriptor,
      propsSchema,
      styleSchema,
      Array.isArray(manifest.events) ? (manifest.events as readonly string[]) : undefined,
      (manifest.dataBinding as { readonly roles?: readonly { readonly id: string }[] } | undefined)
        ?.roles,
    );
    if (!descriptor.ok) {
      for (const diagnostic of descriptor.diagnostics) {
        collector.add(diagnostic.code, diagnostic.path, diagnostic.message);
      }
    }
  }
  if (collector.hasErrors) {
    return collector.failure();
  }
  return collector.result(manifest as unknown as BaseScreenMaterialManifest);
}
