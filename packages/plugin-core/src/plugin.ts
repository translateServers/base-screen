import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  type BaseScreenPluginManifest,
  type BaseScreenPluginPanelActionDetail,
  type PluginCommandRequest,
} from './contracts.js';
import { PluginDiagnosticCollector } from './diagnostics.js';
import {
  isValidCustomElementName,
  validateBaseScreenMaterialIdentity,
  validatePropsSchema,
} from './material/material.js';

const MAX_PLUGIN_MANIFEST_BYTES = 128 * 1024;
const MAX_COMMAND_BYTES = 256 * 1024;
const MAX_ITEMS = 128;
const PLUGIN_FIELDS = new Set(['id', 'dependencies', 'capabilities', 'contributions']);

export function parseBaseScreenPluginManifest(
  input: unknown,
): ScreenParseResult<BaseScreenPluginManifest> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, MAX_PLUGIN_MANIFEST_BYTES);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [], 'Plugin manifest must be an object.');
  }
  const manifest = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateExactObject(manifest, PLUGIN_FIELDS, [], collector);
  if (!isIdentifier(manifest.id)) {
    collector.add('PLUGIN_CORE_IDENTITY_INVALID', ['id'], 'Plugin id must be an ASCII identifier.');
  }
  validateDependencies(manifest.dependencies, collector);
  validateIdentifiers(manifest.capabilities, ['capabilities'], collector);
  validateContributions(manifest.contributions, collector);
  if (collector.hasErrors) {
    return collector.failure();
  }
  return collector.result(manifest as unknown as BaseScreenPluginManifest);
}

export function parsePluginCommandRequest(input: unknown): ScreenParseResult<PluginCommandRequest> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, MAX_COMMAND_BYTES);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
      [],
      'Plugin command request must be an object.',
    );
  }
  const request = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateExactObject(request, new Set(['commandId', 'args']), [], collector);
  if (!isIdentifier(request.commandId)) {
    collector.add(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
      ['commandId'],
      'Plugin command id must be an ASCII identifier.',
    );
  }
  if (!Object.hasOwn(request, 'args')) {
    collector.add(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
      ['args'],
      'Plugin command arguments are required.',
    );
  }
  return collector.hasErrors
    ? collector.failure()
    : collector.result(request as unknown as PluginCommandRequest);
}

export function parseBaseScreenPluginPanelActionDetail(
  input: unknown,
): ScreenParseResult<BaseScreenPluginPanelActionDetail> {
  const parsed = parsePluginJson<ScreenJsonValue>(input, MAX_COMMAND_BYTES);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isRecord(parsed.value)) {
    return failure(
      'PLUGIN_CORE_EVENT_INVALID',
      [],
      'Plugin panel action detail must be an object.',
    );
  }
  const detail = parsed.value;
  const collector = new PluginDiagnosticCollector();
  validateExactObject(detail, new Set(['panelId', 'commandId', 'args']), [], collector);
  validatePanelActionIdentifier(detail, 'panelId', collector);
  validatePanelActionIdentifier(detail, 'commandId', collector);
  if (!Object.hasOwn(detail, 'args')) {
    collector.add(
      'PLUGIN_CORE_EVENT_PAYLOAD_INVALID',
      ['args'],
      'Plugin panel action arguments are required.',
    );
  }
  return collector.hasErrors
    ? collector.failure()
    : collector.result(detail as unknown as BaseScreenPluginPanelActionDetail);
}

function validatePanelActionIdentifier(
  detail: ScreenJsonObject,
  field: 'panelId' | 'commandId',
  collector: PluginDiagnosticCollector,
): void {
  if (!isIdentifier(detail[field])) {
    collector.add(
      'PLUGIN_CORE_EVENT_INVALID',
      [field],
      `Plugin panel action ${field} must be an ASCII identifier.`,
    );
  }
}

function validateDependencies(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!Array.isArray(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dependencies'],
      'Dependencies must be an array.',
    );
    return;
  }
  if (value.length > MAX_ITEMS) {
    collector.add(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
      ['dependencies'],
      'Dependencies exceed the maximum count.',
    );
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const dependency = value[index];
    if (!isRecord(dependency)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['dependencies', index],
        'Dependency must be an object.',
      );
      continue;
    }
    validateExactObject(dependency, new Set(['id']), ['dependencies', index], collector);
    if (!isIdentifier(dependency.id)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['dependencies', index, 'id'],
        'Dependency id is invalid.',
      );
    } else if (seen.has(dependency.id)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['dependencies', index, 'id'],
        'Dependency id is duplicated.',
      );
    } else {
      seen.add(dependency.id);
    }
  }
}

function validateIdentifiers(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (!Array.isArray(value)) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Expected an array of identifiers.');
    return;
  }
  if (value.length > MAX_ITEMS) {
    collector.add(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
      path,
      'Identifier array exceeds the maximum count.',
    );
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const identifier = value[index];
    if (!isIdentifier(identifier)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, index],
        'Identifier is invalid.',
      );
    } else if (seen.has(identifier)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, index],
        'Identifier is duplicated.',
      );
    } else {
      seen.add(identifier);
    }
  }
}

function validateContributions(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!Array.isArray(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['contributions'],
      'Contributions must be an array.',
    );
    return;
  }
  if (value.length > MAX_ITEMS) {
    collector.add(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
      ['contributions'],
      'Contributions exceed the maximum count.',
    );
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const contribution = value[index];
    if (!isRecord(contribution) || typeof contribution.kind !== 'string') {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
        ['contributions', index],
        'Contribution kind is invalid.',
      );
      continue;
    }
    const identity = validateContribution(contribution, index, collector);
    if (identity !== undefined) {
      if (seen.has(identity)) {
        collector.add(
          'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
          ['contributions', index],
          'Contribution identity is duplicated.',
        );
      } else {
        seen.add(identity);
      }
    }
  }
}

function validateContribution(
  contribution: ScreenJsonObject,
  index: number,
  collector: PluginDiagnosticCollector,
): string | undefined {
  const path = ['contributions', index] as const;
  switch (contribution.kind) {
    case 'material': {
      validateExactObject(contribution, new Set(['kind', 'type', 'tagName']), path, collector);
      const result = validateBaseScreenMaterialIdentity(contribution.type, contribution.tagName);
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) {
          collector.add(diagnostic.code, [...path, ...diagnostic.path], diagnostic.message);
        }
      }
      return typeof contribution.type === 'string' ? `material:${contribution.type}` : undefined;
    }
    case 'command':
      validateExactObject(
        contribution,
        new Set(['kind', 'id', 'name', 'requiredCapability']),
        path,
        collector,
        new Set(['menus', 'shortcut']),
      );
      validateContributionIdentityFields(contribution, path, collector, [
        'id',
        'requiredCapability',
      ]);
      validateDisplayName(contribution.name, [...path, 'name'], collector);
      validateCommandMenus(contribution.menus, [...path, 'menus'], collector);
      validateCommandShortcut(contribution.shortcut, [...path, 'shortcut'], collector);
      return typeof contribution.id === 'string' ? `command:${contribution.id}` : undefined;
    case 'dataResourceType': {
      validateExactObject(
        contribution,
        new Set(['kind', 'id', 'name', 'configSchema']),
        path,
        collector,
        new Set(['queryScope']),
      );
      validateContributionIdentityFields(contribution, path, collector, ['id']);
      validateDisplayName(contribution.name, [...path, 'name'], collector);
      const schema = validatePropsSchema(
        contribution.configSchema,
        [...path, 'configSchema'],
        collector,
        1,
      );
      if (schema?.kind !== 'object') {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'configSchema'],
          'Resource config schema must be an object schema.',
        );
      }
      if (contribution.queryScope !== undefined && contribution.queryScope !== 'resource') {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'queryScope'],
          'Resource queryScope must be the literal "resource" when declared.',
        );
      }
      return typeof contribution.id === 'string'
        ? `dataResourceType:${contribution.id}`
        : undefined;
    }
    case 'blueprintCapability':
      validateExactObject(contribution, new Set(['kind', 'id', 'name']), path, collector);
      validateContributionIdentityFields(contribution, path, collector, ['id']);
      validateDisplayName(contribution.name, [...path, 'name'], collector);
      return typeof contribution.id === 'string'
        ? `blueprintCapability:${contribution.id}`
        : undefined;
    case 'panel': {
      validateExactObject(
        contribution,
        new Set(['kind', 'id', 'name', 'tagName']),
        path,
        collector,
      );
      validateContributionIdentityFields(contribution, path, collector, ['id']);
      validateDisplayName(contribution.name, [...path, 'name'], collector);
      if (!isValidCustomElementName(contribution.tagName)) {
        collector.add(
          'PLUGIN_CORE_TAG_NAME_INVALID',
          [...path, 'tagName'],
          'Panel tagName is not a valid custom element name.',
        );
      }
      return typeof contribution.id === 'string' ? `panel:${contribution.id}` : undefined;
    }
    default:
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
        [...path, 'kind'],
        'Contribution kind is unsupported.',
      );
      return undefined;
  }
}

function validateContributionIdentityFields(
  contribution: ScreenJsonObject,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (!isIdentifier(contribution[field])) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, field],
        'Contribution identifier is invalid.',
      );
    }
  }
}

function validateDisplayName(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (typeof value !== 'string' || [...value].length === 0 || [...value].length > 256) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Contribution name is invalid.');
  }
}

const COMMAND_MENUS = new Set([
  'commandPalette',
  'menu.tools',
  'context.canvas',
  'context.component',
  'context.multi',
]);

const SHORTCUT_MODIFIERS = new Set(['Ctrl', 'Cmd', 'Alt', 'Shift']);
const NAMED_SHORTCUT_KEYS = new Set([
  'Delete',
  'Escape',
  'Enter',
  'Tab',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);

function validateCommandMenus(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > COMMAND_MENUS.size) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Command menus must be an array of known menu ids.',
    );
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const menu = value[index];
    if (typeof menu !== 'string' || !COMMAND_MENUS.has(menu)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, index],
        'Command menu id is unsupported.',
      );
      continue;
    }
    if (seen.has(menu)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, index],
        'Command menu id is duplicated.',
      );
    } else {
      seen.add(menu);
    }
  }
}

function validateCommandShortcut(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !isShortcut(value)) {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Command shortcut is invalid.');
  }
}

function isShortcut(value: string): boolean {
  const parts = value.split('+');
  if (parts.length === 0 || parts.some((part) => part.length === 0)) return false;
  const key = parts[parts.length - 1]!;
  const modifiers = parts.slice(0, -1);
  const seen = new Set<string>();
  for (const modifier of modifiers) {
    if (!SHORTCUT_MODIFIERS.has(modifier) || seen.has(modifier)) return false;
    seen.add(modifier);
  }
  if (key.length === 1) {
    return /^[A-Z0-9=\[\]\\;',./`\-]$/.test(key);
  }
  return NAMED_SHORTCUT_KEYS.has(key);
}

function validateExactObject(
  value: ScreenJsonObject,
  fields: ReadonlySet<string>,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  optional?: ReadonlySet<string>,
): void {
  const allowed = optional === undefined ? fields : new Set<string>([...fields, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD',
        [...path, key],
        'Manifest contains an unknown field.',
      );
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, field],
        'Manifest field is required.',
      );
    }
  }
}

function parsePluginJson<T>(input: unknown, maxBytes: number): ScreenParseResult<T> {
  const parsed = parseScreenJsonValue(input, { maxBytes });
  if (parsed.ok) {
    return parsed as ScreenParseResult<T>;
  }
  return {
    ok: false,
    diagnostics: parsed.diagnostics.map((diagnostic) =>
      diagnostic.code === 'JSON_LIMIT_EXCEEDED'
        ? { ...diagnostic, code: 'PLUGIN_CORE_LIMIT_EXCEEDED' as const }
        : diagnostic,
    ),
  };
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

function isRecord(value: ScreenJsonValue | undefined): value is ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}
