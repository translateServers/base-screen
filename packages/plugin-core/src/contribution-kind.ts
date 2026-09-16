import {
  isScreenComponentId,
  isScreenVariableName,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenJsonValue,
} from '@base-screen/contracts';
import {
  BASE_SCREEN_PLUGIN_COMMAND_MENUS,
  type BaseScreenPluginContribution,
  type BaseScreenPluginManifest,
} from './contracts.js';
import type { PluginDiagnosticCollector } from './diagnostics.js';
import {
  isValidCustomElementName,
  validateBaseScreenMaterialIdentity,
  validatePropsSchema,
} from './material/material.js';

/**
 * 贡献类型描述符：ADR-0084 贡献词汇在 plugin-core 内的唯一实现落点。
 *
 * 每种 kind 的字段白名单、身份串形态、id 词法、专属校验与运行时 handler 字段在这里声明一次；
 * 校验、冲突身份、handler 对应关系与快照投影都从这里读取，不再各自维护 switch。
 * 描述符表本身是包内实现细节：对外只暴露 {@link contributionHandlerField} /
 * {@link declaredContributionIds} / {@link listContributionHandlerKinds} 三个窄行为接口。
 * 新增一种贡献类型时，改动应局限在描述符表与 plugin-manager 的穷尽表。
 */
export interface ContributionKindDescriptor {
  readonly kind: BaseScreenPluginContributionKind;
  readonly requiredFields: readonly string[];
  readonly optionalFields?: readonly string[];
  /** 必须是 ASCII identifier 的字段（id、requiredCapability 等）。 */
  readonly identifierFields: readonly string[];
  /** 是否要求 `name` 为合法展示名；material 无 name 字段。 */
  readonly hasDisplayName: boolean;
  /** 身份串字段；material 取 `type`，其余取 `id`。 */
  readonly identityField: string;
  readonly identityPrefix: string;
  /** 该字段的值必须同时出现在清单 `capabilities` 中（声明 ∩ 授权）。 */
  readonly capabilityField?: string;
  /** 运行时 handler 记录字段名；缺省表示该 kind 没有 handler。 */
  readonly handlerField?: BaseScreenPluginContributionHandlerField;
  readonly validate?: (
    contribution: ScreenJsonObject,
    path: readonly (string | number)[],
    collector: PluginDiagnosticCollector,
  ) => void;
}

export type BaseScreenPluginContributionKind = BaseScreenPluginContribution['kind'];

export type BaseScreenPluginContributionHandlerField =
  | 'commands'
  | 'blueprintActions'
  | 'dataProcessors';

const COMMAND_MENUS = new Set<string>(BASE_SCREEN_PLUGIN_COMMAND_MENUS);
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

/**
 * 描述符表。数组顺序即 kind 的声明顺序，也是 {@link listContributionHandlerKinds} 的顺序。
 */
export const CONTRIBUTION_KIND_DESCRIPTORS: readonly ContributionKindDescriptor[] = Object.freeze([
  {
    kind: 'material',
    requiredFields: ['kind', 'type', 'tagName'],
    identifierFields: [],
    hasDisplayName: false,
    identityField: 'type',
    identityPrefix: 'material',
    validate(contribution, path, collector) {
      const result = validateBaseScreenMaterialIdentity(contribution.type, contribution.tagName);
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) {
          collector.add(diagnostic.code, [...path, ...diagnostic.path], diagnostic.message);
        }
      }
    },
  },
  {
    kind: 'command',
    requiredFields: ['kind', 'id', 'name', 'requiredCapability'],
    optionalFields: ['menus', 'shortcut'],
    identifierFields: ['id', 'requiredCapability'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'command',
    capabilityField: 'requiredCapability',
    handlerField: 'commands',
    validate(contribution, path, collector) {
      validateCommandMenus(contribution.menus, [...path, 'menus'], collector);
      validateCommandShortcut(contribution.shortcut, [...path, 'shortcut'], collector);
    },
  },
  {
    kind: 'dataResourceType',
    requiredFields: ['kind', 'id', 'name', 'configSchema'],
    optionalFields: ['queryScope'],
    identifierFields: ['id'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'dataResourceType',
    validate(contribution, path, collector) {
      // dataResourceType id 会被写进文档 dataSource.resourceType，必须满足文档契约的
      // 命名模式（contracts 的 VARIABLE_NAME_PATTERN），否则作者期合法、提交文档时才失败。
      if (typeof contribution.id === 'string' && !isScreenVariableName(contribution.id)) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'id'],
          'dataResourceType id must match the screen variable name pattern so it can be stored as dataSource.resourceType.',
        );
      }
      validateObjectSchema(
        contribution.configSchema,
        [...path, 'configSchema'],
        collector,
        'Resource config schema must be an object schema.',
      );
      if (contribution.queryScope !== undefined && contribution.queryScope !== 'resource') {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'queryScope'],
          'Resource queryScope must be the literal "resource" when declared.',
        );
      }
    },
  },
  {
    kind: 'blueprintAction',
    requiredFields: ['kind', 'id', 'name', 'payloadSchema', 'requiredCapability'],
    identifierFields: ['id', 'requiredCapability'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'blueprintAction',
    capabilityField: 'requiredCapability',
    handlerField: 'blueprintActions',
    validate(contribution, path, collector) {
      // actionId 会被写进文档 host-action.actionId，必须满足文档契约的组件 id 模式。
      if (typeof contribution.id === 'string' && !isScreenComponentId(contribution.id)) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'id'],
          'blueprintAction id must match the screen component id pattern so it can be stored as host-action.actionId.',
        );
      }
      validateObjectSchema(
        contribution.payloadSchema,
        [...path, 'payloadSchema'],
        collector,
        'Blueprint action payload schema must be an object schema.',
      );
    },
  },
  {
    kind: 'dataProcessor',
    requiredFields: ['kind', 'id', 'name', 'configSchema'],
    identifierFields: ['id'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'dataProcessor',
    handlerField: 'dataProcessors',
    validate(contribution, path, collector) {
      // processorId 会被写进文档变量/数据源，同样必须满足变量名模式。
      if (typeof contribution.id === 'string' && !isScreenVariableName(contribution.id)) {
        collector.add(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, 'id'],
          'dataProcessor id must match the screen variable name pattern so it can be stored as processorId.',
        );
      }
      validateObjectSchema(
        contribution.configSchema,
        [...path, 'configSchema'],
        collector,
        'Data processor config schema must be an object schema.',
      );
    },
  },
  {
    kind: 'blueprintCapability',
    requiredFields: ['kind', 'id', 'name'],
    identifierFields: ['id'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'blueprintCapability',
  },
  {
    kind: 'panel',
    requiredFields: ['kind', 'id', 'name', 'tagName'],
    identifierFields: ['id'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'panel',
    validate(contribution, path, collector) {
      validateTagName(contribution.tagName, path, collector, 'Panel');
    },
  },
  {
    kind: 'inspectorControl',
    requiredFields: ['kind', 'id', 'name', 'tagName'],
    identifierFields: ['id'],
    hasDisplayName: true,
    identityField: 'id',
    identityPrefix: 'inspectorControl',
    validate(contribution, path, collector) {
      validateTagName(contribution.tagName, path, collector, 'Inspector control');
    },
  },
]);

const DESCRIPTORS_BY_KIND = new Map<BaseScreenPluginContributionKind, ContributionKindDescriptor>(
  CONTRIBUTION_KIND_DESCRIPTORS.map((descriptor) => [descriptor.kind, descriptor]),
);

export function contributionKindDescriptor(kind: string): ContributionKindDescriptor | undefined {
  return DESCRIPTORS_BY_KIND.get(kind as BaseScreenPluginContributionKind);
}

/** 该 kind 的运行时 handler 记录字段名；返回 undefined 表示该 kind 不承载 handler。 */
export function contributionHandlerField(
  kind: BaseScreenPluginContributionKind,
): BaseScreenPluginContributionHandlerField | undefined {
  return DESCRIPTORS_BY_KIND.get(kind)?.handlerField;
}

/** 承载 handler 的 kind 列表，顺序即描述符表顺序。 */
export function listContributionHandlerKinds(): readonly BaseScreenPluginContributionKind[] {
  return CONTRIBUTION_KIND_DESCRIPTORS.filter(
    (descriptor) => descriptor.handlerField !== undefined,
  ).map((descriptor) => descriptor.kind);
}

/**
 * 清单中声明某类贡献的 id 列表（material 取 `type`），保持声明顺序。
 * 供"声明 ↔ handler 一一对应"校验使用。
 */
export function declaredContributionIds(
  kind: BaseScreenPluginContributionKind,
  contributions: readonly BaseScreenPluginContribution[],
): readonly string[] {
  const descriptor = DESCRIPTORS_BY_KIND.get(kind);
  if (descriptor === undefined) return [];
  const ids: string[] = [];
  for (const contribution of contributions) {
    if (contribution.kind !== kind) continue;
    const value = (contribution as unknown as ScreenJsonObject)[descriptor.identityField];
    if (typeof value === 'string') ids.push(value);
  }
  return ids;
}

/**
 * 该贡献的全局唯一身份串（`material:<type>` 或 `<kind>:<id>`）；kind 未知或身份字段非字符串时返回 undefined。
 * 跨插件的贡献冲突判定与清单内重复判定共用同一身份定义。
 */
export function contributionIdentity(
  contribution: BaseScreenPluginContribution,
): string | undefined {
  const descriptor = contributionKindDescriptor(contribution.kind);
  if (descriptor === undefined) return undefined;
  const value = (contribution as unknown as ScreenJsonObject)[descriptor.identityField];
  return typeof value === 'string' ? `${descriptor.identityPrefix}:${value}` : undefined;
}

function validateObjectSchema(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  message: string,
): void {
  const schema = validatePropsSchema(value, path, collector, 1);
  if (schema?.kind !== 'object') {
    collector.add('PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, message);
  }
}

function validateTagName(
  value: ScreenJsonValue | undefined,
  path: readonly (string | number)[],
  collector: PluginDiagnosticCollector,
  label: string,
): void {
  if (!isValidCustomElementName(value)) {
    collector.add(
      'PLUGIN_CORE_TAG_NAME_INVALID',
      [...path, 'tagName'],
      `${label} tagName is not a valid custom element name.`,
    );
  }
}

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

export interface ContributionHandlerRecordInput {
  readonly kind: BaseScreenPluginContributionKind;
  readonly manifest: BaseScreenPluginManifest;
  /** 运行时记录字段名（`commands` / `blueprintActions` / `dataProcessors`）。 */
  readonly field: string;
  readonly value: unknown;
  /** 诊断路径前缀：manager 预检用 `['plugins', index]`，作者面用 `[]`。 */
  readonly pathPrefix?: readonly (string | number)[];
}

export interface ContributionHandlerRecordResult {
  /** handler 记录；undefined 表示校验未通过（诊断已给出）。 */
  readonly handlers: ReadonlyMap<string, (...args: never[]) => unknown> | undefined;
  readonly diagnostics: readonly ScreenDiagnostic[];
}

/**
 * 读取并校验"声明 ↔ handler 一一对应"的运行时记录。
 *
 * 规则（缺 handler、多 handler 都失败关闭）在 manager 预检与 plugin-sdk 作者面完全一致，
 * 因此只有这一份实现。诊断按确定顺序产出：先记录形状，再逐个 handler 的取值形状，
 * 再按声明顺序找缺失，最后找未声明的多余项。调用方自行决定报告粒度。
 */
export function readContributionHandlerRecord(
  input: ContributionHandlerRecordInput,
): ContributionHandlerRecordResult {
  const { kind, manifest, field, value } = input;
  const prefix = input.pathPrefix ?? [];
  const path = [...prefix, field];
  const declared = declaredContributionIds(kind, manifest.contributions);
  if (value === undefined) {
    if (declared.length === 0) {
      return { handlers: new Map(), diagnostics: [] };
    }
    return {
      handlers: undefined,
      diagnostics: [
        failureDiagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          path,
          `Plugin ${kind} contributions require matching handlers.`,
        ),
      ],
    };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      handlers: undefined,
      diagnostics: [
        failureDiagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          path,
          `Plugin ${kind} handlers must be an object.`,
        ),
      ],
    };
  }
  const record = value as Record<string, unknown>;
  const diagnostics: ScreenDiagnostic[] = [];
  const handlers = new Map<string, (...args: never[]) => unknown>();
  let invalid = false;
  for (const key of Object.getOwnPropertyNames(record)) {
    const handler = readOwnDataProperty(record, key);
    if (typeof handler !== 'function') {
      diagnostics.push(
        failureDiagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          [...path, key],
          `Plugin ${kind} handler is invalid.`,
        ),
      );
      invalid = true;
      continue;
    }
    handlers.set(key, handler as (...args: never[]) => unknown);
  }
  for (const id of declared) {
    if (!handlers.has(id)) {
      diagnostics.push(
        failureDiagnostic(
          'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
          [...path, id],
          `Plugin ${kind} contribution is missing a handler.`,
        ),
      );
      invalid = true;
    }
  }
  const declaredSet = new Set(declared);
  for (const id of handlers.keys()) {
    if (!declaredSet.has(id)) {
      diagnostics.push(
        failureDiagnostic(
          'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
          [...path, id],
          `Plugin ${kind} handler is not declared as a contribution.`,
        ),
      );
      invalid = true;
    }
  }
  return { handlers: invalid ? undefined : handlers, diagnostics };
}

/** 读取自身数据属性（不触发 getter），与预检对 runtime 的读取口径一致。 */
function readOwnDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function failureDiagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}
