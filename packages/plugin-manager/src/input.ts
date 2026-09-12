import type { ScreenParseResult } from '@base-screen/contracts';
import { DiagnosticCollector } from './diagnostics.js';
import type { ManagerInput } from './preflight-types.js';
import type { BaseScreenPluginManagerOptions } from './types.js';

const MAX_PLUGINS = 128;
const MAX_STANDALONE_MATERIALS = 512;

export function snapshotManagerInput(
  options: BaseScreenPluginManagerOptions,
): ScreenParseResult<ManagerInput> {
  const diagnostics = new DiagnosticCollector();
  if (!isObject(options)) {
    diagnostics.add('PLUGIN_CORE_MANIFEST_NOT_OBJECT', [], 'Manager options must be an object.');
    return diagnostics.failure();
  }
  try {
    const values = readOptions(options, diagnostics);
    if (values === undefined) return diagnostics.failure();
    const standaloneMaterialTagNames = readStringArray(
      values.standaloneMaterialTagNames,
      ['standaloneMaterialTagNames'],
      MAX_STANDALONE_MATERIALS,
      diagnostics,
    );
    const runtimes = readArray(values.plugins, ['plugins'], MAX_PLUGINS, diagnostics);
    const grantedCapabilities = snapshotGrants(values.grantedCapabilities, diagnostics);
    const registry = snapshotRegistry(values.registry, diagnostics);
    const instanceId = values.instanceId;
    if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
      diagnostics.add('PLUGIN_CORE_IDENTITY_INVALID', ['instanceId'], 'Instance id is invalid.');
    }
    if (values.createCommandPort !== undefined && typeof values.createCommandPort !== 'function') {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['createCommandPort'],
        'Command port factory is invalid.',
      );
    }
    if (
      values.createDesignReadPort !== undefined &&
      typeof values.createDesignReadPort !== 'function'
    ) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['createDesignReadPort'],
        'Design read port factory is invalid.',
      );
    }
    if (
      diagnostics.hasErrors ||
      standaloneMaterialTagNames === undefined ||
      runtimes === undefined ||
      grantedCapabilities === undefined ||
      registry === undefined
    ) {
      return diagnostics.failure();
    }
    return {
      ok: true,
      value: Object.freeze({
        instanceId: instanceId as string,
        standaloneMaterialTagNames: Object.freeze(standaloneMaterialTagNames),
        runtimes: Object.freeze(runtimes),
        grantedCapabilities,
        registry: registry.value,
        registryGet: registry.get,
        createCommandPort: values.createCommandPort as ManagerInput['createCommandPort'],
        createDesignReadPort: values.createDesignReadPort as ManagerInput['createDesignReadPort'],
      }),
      diagnostics: [],
    };
  } catch {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      [],
      'Manager options cannot be safely read.',
    );
    return diagnostics.failure();
  }
}

function readOptions(
  value: object,
  diagnostics: DiagnosticCollector,
):
  | {
      readonly instanceId: unknown;
      readonly standaloneMaterialTagNames: unknown;
      readonly plugins: unknown;
      readonly grantedCapabilities: unknown;
      readonly registry: unknown;
      readonly createCommandPort: unknown;
      readonly createDesignReadPort: unknown;
    }
  | undefined {
  const fields = [
    'instanceId',
    'standaloneMaterialTagNames',
    'plugins',
    'grantedCapabilities',
    'registry',
  ] as const;
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [field],
        'Manager option must be an own data property.',
      );
    } else {
      values[field] = descriptor.value;
    }
  }
  // 可选工厂：缺键即无端口，与显式 undefined 同义；能力门控已负责拒绝无工厂的
  // command.execute 与 design.read。
  const readCommandPort = Object.getOwnPropertyDescriptor(value, 'createCommandPort');
  if (readCommandPort !== undefined && !Object.hasOwn(readCommandPort, 'value')) {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['createCommandPort'],
      'Manager option must be an own data property.',
    );
  } else {
    values.createCommandPort = readCommandPort?.value;
  }
  const readPort = Object.getOwnPropertyDescriptor(value, 'createDesignReadPort');
  if (readPort !== undefined && !Object.hasOwn(readPort, 'value')) {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['createDesignReadPort'],
      'Manager option must be an own data property.',
    );
  } else {
    values.createDesignReadPort = readPort?.value;
  }
  return diagnostics.hasErrors
    ? undefined
    : (values as {
        readonly instanceId: unknown;
        readonly standaloneMaterialTagNames: unknown;
        readonly plugins: unknown;
        readonly grantedCapabilities: unknown;
        readonly registry: unknown;
        readonly createCommandPort: unknown;
        readonly createDesignReadPort: unknown;
      });
}

function snapshotGrants(
  value: unknown,
  diagnostics: DiagnosticCollector,
): ReadonlyMap<string, readonly string[]> | undefined {
  if (!isObject(value)) {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['grantedCapabilities'],
      'Granted capabilities must be an object.',
    );
    return undefined;
  }
  const grants = new Map<string, readonly string[]>();
  for (const pluginId of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, pluginId);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['grantedCapabilities', pluginId],
        'Capability grant must be data.',
      );
      continue;
    }
    const capabilities = readStringArray(
      descriptor.value,
      ['grantedCapabilities', pluginId],
      128,
      diagnostics,
    );
    if (capabilities !== undefined)
      grants.set(pluginId, Object.freeze(capabilities.sort(compareStrings)));
  }
  return diagnostics.hasErrors ? undefined : grants;
}

function snapshotRegistry(
  value: unknown,
  diagnostics: DiagnosticCollector,
):
  | { readonly value: ManagerInput['registry']; readonly get: (tagName: string) => unknown }
  | undefined {
  if (!isObject(value)) {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['registry'],
      'Registry port is invalid.',
    );
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'get');
  if (descriptor === undefined || typeof descriptor.value !== 'function') {
    diagnostics.add(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      ['registry'],
      'Registry port is invalid.',
    );
    return undefined;
  }
  return { value: value as ManagerInput['registry'], get: descriptor.value.bind(value) };
}

function readStringArray(
  value: unknown,
  path: readonly (string | number)[],
  limit: number,
  diagnostics: DiagnosticCollector,
): string[] | undefined {
  const values = readArray(value, path, limit, diagnostics);
  if (values === undefined) return undefined;
  if (values.some((item) => typeof item !== 'string')) {
    diagnostics.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Expected a string array.');
    return undefined;
  }
  return values as string[];
}

function readArray(
  value: unknown,
  path: readonly (string | number)[],
  limit: number,
  diagnostics: DiagnosticCollector,
): unknown[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, 'Expected an array.');
    return undefined;
  }
  if (value.length > limit) {
    diagnostics.add('PLUGIN_CORE_LIMIT_EXCEEDED', path, 'Candidate limit exceeded.');
    return undefined;
  }
  const values: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      diagnostics.add(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        [...path, index],
        'Array item must be data.',
      );
      continue;
    }
    values.push(descriptor.value);
  }
  return diagnostics.hasErrors ? undefined : values;
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
