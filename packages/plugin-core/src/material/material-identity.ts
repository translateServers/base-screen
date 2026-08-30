import {
  isScreenMaterialType,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenMaterialEventDetail } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import {
  failure,
  isIdentifier,
  isRecord,
  isValidTagName,
  parsePluginJson,
  validateExactObject,
} from './material-validation-utils.js';

export function validateBaseScreenMaterialIdentity(
  type: unknown,
  tagName: unknown,
): ScreenParseResult<null> {
  const collector = new PluginDiagnosticCollector();
  if (!isScreenMaterialType(type)) {
    collector.add(
      'PLUGIN_CORE_IDENTITY_INVALID',
      ['type'],
      'Material type is not a canonical identity.',
    );
  }
  if (!isValidTagName(tagName, type)) {
    collector.add(
      'PLUGIN_CORE_TAG_NAME_INVALID',
      ['tagName'],
      'Tag name is not valid for the material type.',
    );
  }
  return collector.result(null);
}

export function parseBaseScreenMaterialEventDetail(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialEventDetail> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, 64 * 1024);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure('PLUGIN_CORE_EVENT_INVALID', [], 'Material event detail must be an object.');
  }
  const detail = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateExactObject(detail, new Set(['name', 'payload']), [], collector);
  if (!isIdentifier(detail.name)) {
    collector.add(
      'PLUGIN_CORE_EVENT_INVALID',
      ['name'],
      'Material event name must be an ASCII identifier.',
    );
  }
  if (!Object.hasOwn(detail, 'payload')) {
    collector.add(
      'PLUGIN_CORE_EVENT_PAYLOAD_INVALID',
      ['payload'],
      'Material event payload is required.',
    );
  }
  if (collector.hasErrors) {
    return collector.failure();
  }
  return collector.result(detail as unknown as BaseScreenMaterialEventDetail);
}
