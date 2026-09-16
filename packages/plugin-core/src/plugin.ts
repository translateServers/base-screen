import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenPluginContribution,
  BaseScreenPluginManifest,
  BaseScreenPluginPanelActionDetail,
  PluginCommandRequest,
} from './contracts.js';
import { contributionIdentity, contributionKindDescriptor } from './contribution-kind.js';
import { PluginDiagnosticCollector } from './diagnostics.js';

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
  const descriptor = contributionKindDescriptor(contribution.kind as string);
  if (descriptor === undefined) {
    collector.add(
      'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
      [...path, 'kind'],
      'Contribution kind is unsupported.',
    );
    return undefined;
  }
  validateExactObject(
    contribution,
    new Set(descriptor.requiredFields),
    path,
    collector,
    descriptor.optionalFields === undefined ? undefined : new Set(descriptor.optionalFields),
  );
  validateContributionIdentityFields(contribution, path, collector, descriptor.identifierFields);
  if (descriptor.hasDisplayName) {
    validateDisplayName(contribution.name, [...path, 'name'], collector);
  }
  descriptor.validate?.(contribution, path, collector);
  return contributionIdentity(contribution as unknown as BaseScreenPluginContribution);
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
