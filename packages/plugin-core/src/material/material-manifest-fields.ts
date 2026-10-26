import { isBoundedScreenImageUrl, type ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema } from '../contracts.js';
import { PluginDiagnosticCollector } from '../diagnostics.js';
import { validateBaseScreenMaterialIdentity } from './material-identity.js';
import { matchesSchema } from './material-schema.js';
import { MAX_COVER_LENGTH, MAX_EVENTS, MAX_KEYWORDS } from './material-validation-constants.js';
import {
  isDisplayString,
  isIdentifier,
  isNonNegativeInteger,
  isRecord,
  validateExactObject,
  validateStringList,
} from './material-validation-utils.js';

export function validateMaterialFields(
  manifest: Record<string, ScreenJsonValue>,
  collector: PluginDiagnosticCollector,
): void {
  const identity = validateBaseScreenMaterialIdentity(manifest.type, manifest.tagName);
  if (!identity.ok) {
    for (const diagnostic of identity.diagnostics) {
      collector.add(diagnostic.code, diagnostic.path, diagnostic.message);
    }
  }
  for (const field of ['name', 'category'] as const) {
    if (!isDisplayString(manifest[field], 256)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [field],
        `${field} must be a display string.`,
      );
    }
  }
  validateStringList(manifest.keywords, ['keywords'], MAX_KEYWORDS, 64, collector);
  validateDefaultSize(manifest.defaultSize, collector);
  if (!isRecord(manifest.defaultProps)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultProps'],
      'Default props must be an object.',
    );
  }
  if (!isRecord(manifest.defaultStyle)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultStyle'],
      'Default style must be an object.',
    );
  }
  validateStringList(manifest.events, ['events'], MAX_EVENTS, 128, collector, true);
  if (!Array.isArray(manifest.dataCapabilities)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dataCapabilities'],
      'Data capabilities must be an array.',
    );
  } else if (
    manifest.dataCapabilities.some(
      (capability) =>
        capability !== 'dataset' &&
        capability !== 'static' &&
        capability !== 'host-resource' &&
        capability !== 'variable',
    ) ||
    new Set(manifest.dataCapabilities).size !== manifest.dataCapabilities.length
  ) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dataCapabilities'],
      'Only unique static, host-resource, and variable data capability declarations are supported.',
    );
  }
  if (
    manifest.hostResourceSelection !== undefined &&
    typeof manifest.hostResourceSelection !== 'boolean'
  ) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['hostResourceSelection'],
      'Host resource selection must be a boolean.',
    );
  } else if (
    manifest.hostResourceSelection === true &&
    Array.isArray(manifest.dataCapabilities) &&
    !manifest.dataCapabilities.includes('host-resource')
  ) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['hostResourceSelection'],
      'Host resource selection requires the host-resource data capability.',
    );
  }
  validateDesignCapabilities(manifest.designCapabilities, collector);
  validateDataBinding(manifest.dataBinding, collector);
  validateCover(manifest.cover, collector);
  if (manifest.libraryVisible !== undefined && typeof manifest.libraryVisible !== 'boolean') {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['libraryVisible'],
      'Library visibility must be a boolean.',
    );
  }
}

// 封面 URL 校验（ADR-0040，规则同形收敛至 contracts 的 isBoundedScreenImageUrl）：缺省即未声明；
// 存在时必须是有界 http(s)/协议相对/根相对/点相对 URL，拒绝其他 scheme、裸相对路径与边界形式，
// 失败关闭不静默修复。
function validateCover(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (!isBoundedScreenImageUrl(value, MAX_COVER_LENGTH)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['cover'],
      'Cover must be a bounded HTTP(S) or relative URL string.',
    );
  }
}

function validateDataBinding(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dataBinding'],
      'Data binding must be an object.',
    );
    return;
  }
  validateExactObject(value, new Set(['roles']), ['dataBinding'], collector);
  if (!Array.isArray(value.roles) || value.roles.length === 0 || value.roles.length > 16) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['dataBinding', 'roles'],
      'Data binding roles are invalid.',
    );
    return;
  }
  const ids = new Set<string>();
  value.roles.forEach((role, index) => {
    const path = ['dataBinding', 'roles', index] as const;
    if (!isRecord(role)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        path,
        'Data binding role must be an object.',
      );
      return;
    }
    validateExactObject(
      role,
      new Set(['id', 'minFields', 'maxFields', 'valueTypes']),
      path,
      collector,
    );
    if (!isIdentifier(role.id)) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'id'],
        'Data binding role id is invalid.',
      );
    } else if (ids.has(role.id)) {
      collector.add(
        'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
        [...path, 'id'],
        'Data binding role is duplicated.',
      );
    } else {
      ids.add(role.id);
    }
    if (
      !isNonNegativeInteger(role.minFields) ||
      !isNonNegativeInteger(role.maxFields) ||
      role.minFields > role.maxFields ||
      role.maxFields > 256
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        path,
        'Data binding role field range is invalid.',
      );
    }
    if (
      !Array.isArray(role.valueTypes) ||
      role.valueTypes.length === 0 ||
      new Set(role.valueTypes).size !== role.valueTypes.length ||
      role.valueTypes.some(
        (type) => !['string', 'number', 'boolean', 'date'].includes(type as string),
      )
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, 'valueTypes'],
        'Data binding role value types are invalid.',
      );
    }
  });
}

function validateDefaultSize(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['defaultSize'],
      'Default size must be an object.',
    );
    return;
  }
  validateExactObject(value, new Set(['width', 'height']), ['defaultSize'], collector);
  for (const field of ['width', 'height'] as const) {
    const number = value[field];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number <= 0 ||
      number > 1_000_000
    ) {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['defaultSize', field],
        'Default size dimensions must be finite positive numbers.',
      );
    }
  }
}

function validateDesignCapabilities(
  value: ScreenJsonValue | undefined,
  collector: PluginDiagnosticCollector,
): void {
  if (!isRecord(value)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['designCapabilities'],
      'Design capabilities must be an object.',
    );
    return;
  }
  validateExactObject(
    value,
    new Set(['resize', 'rotate', 'children']),
    ['designCapabilities'],
    collector,
  );
  for (const field of ['resize', 'rotate', 'children']) {
    if (typeof value[field] !== 'boolean') {
      collector.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['designCapabilities', field],
        'Design capability flags must be boolean.',
      );
    }
  }
}

export function validateDefaultValues(
  value: ScreenJsonValue | undefined,
  schema: BaseScreenMaterialObjectSchema | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
): void {
  if (schema === undefined || !isRecord(value)) {
    return;
  }
  if (!matchesSchema(value, schema)) {
    collector.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      path,
      'Default values do not satisfy the declared schema.',
    );
  }
}
