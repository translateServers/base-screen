// 物料库分组契约：宿主声明的分组树（id/label/materialTypes/children）的
// 失败关闭解析——含分组 id 模式、数量/深度/标签长度等上限校验。

import {
  isScreenMaterialType,
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export interface BaseScreenMaterialLibraryGroup {
  readonly id: string;
  readonly label: string;
  readonly materialTypes?: readonly string[];
  readonly children?: readonly BaseScreenMaterialLibraryGroup[];
}

export interface BaseScreenMaterialLibraryGrouping {
  readonly groups: readonly BaseScreenMaterialLibraryGroup[];
}

const ROOT_FIELDS = new Set(['groups']);
const GROUP_FIELDS = new Set(['id', 'label', 'materialTypes', 'children']);
const GROUP_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MAX_GROUPS = 128;
const MAX_GROUP_DEPTH = 8;
const MAX_GROUP_LABEL_LENGTH = 96;
const MAX_GROUP_MATERIAL_TYPES = 512;

interface GroupParseState {
  readonly groupIds: Set<string>;
  readonly materialTypes: Set<string>;
  groupCount: number;
  materialTypeCount: number;
}

export function parseBaseScreenMaterialLibraryGrouping(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialLibraryGrouping> {
  const parsed = parseScreenJsonValue(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(parsed.value)) {
    return failure([], 'Material library grouping must be an object.');
  }

  const diagnostics: ScreenDiagnostic[] = [];
  for (const field of Object.keys(parsed.value)) {
    if (!ROOT_FIELDS.has(field)) {
      diagnostics.push(diagnostic([field], 'Material library grouping contains an unknown field.'));
    }
  }

  const groups = parseGroups(parsed.value.groups, ['groups'], 1, createParseState(), diagnostics);
  if (diagnostics.length > 0 || groups === undefined) return { ok: false, diagnostics };

  return {
    ok: true,
    value: Object.freeze({ groups }),
    diagnostics: [],
  };
}

export function validateBaseScreenMaterialLibraryGroupingForCatalog(
  grouping: BaseScreenMaterialLibraryGrouping,
  catalog: BaseScreenMaterialCatalog,
): ScreenParseResult<BaseScreenMaterialLibraryGrouping> {
  const catalogTypes = new Set<string>();
  const visibleTypes = new Set<string>();
  for (const entry of catalog.list()) {
    catalogTypes.add(entry.manifest.type);
    if (entry.manifest.libraryVisible !== false) visibleTypes.add(entry.manifest.type);
  }

  const diagnostics: ScreenDiagnostic[] = [];
  const referencedTypes = new Set<string>();
  visitGroups(grouping.groups, ['groups'], (group, path) => {
    for (const [index, type] of (group.materialTypes ?? []).entries()) {
      const typePath = [...path, 'materialTypes', index];
      referencedTypes.add(type);
      if (!catalogTypes.has(type)) {
        diagnostics.push(
          diagnostic(typePath, 'Material library group references a missing catalog type.'),
        );
      } else if (!visibleTypes.has(type)) {
        diagnostics.push(
          diagnostic(typePath, 'Material library group references a hidden material type.'),
        );
      }
    }
  });

  for (const type of visibleTypes) {
    if (!referencedTypes.has(type)) {
      diagnostics.push(
        diagnostic(
          ['groups'],
          `Material library grouping is missing visible material type "${type}".`,
        ),
      );
    }
  }

  return diagnostics.length === 0
    ? { ok: true, value: grouping, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function materialLibraryGroupChildren(
  grouping: BaseScreenMaterialLibraryGrouping,
  groupId: string | undefined,
): readonly BaseScreenMaterialLibraryGroup[] {
  if (groupId === undefined) return grouping.groups;
  return findMaterialLibraryGroup(grouping.groups, groupId)?.children ?? [];
}

export function materialLibraryGroupMaterialTypes(
  grouping: BaseScreenMaterialLibraryGrouping,
  groupId?: string,
): readonly string[] {
  const roots =
    groupId === undefined
      ? grouping.groups
      : (() => {
          const group = findMaterialLibraryGroup(grouping.groups, groupId);
          return group === undefined ? [] : [group];
        })();
  const types: string[] = [];
  visitGroups(roots, [], (group) => types.push(...(group.materialTypes ?? [])));
  return types;
}

export function materialLibraryGroupPath(
  grouping: BaseScreenMaterialLibraryGrouping,
  groupId: string,
): readonly BaseScreenMaterialLibraryGroup[] {
  return findMaterialLibraryGroupPath(grouping.groups, groupId) ?? [];
}

export function hasMaterialLibraryGroup(
  grouping: BaseScreenMaterialLibraryGrouping,
  groupId: string,
): boolean {
  return findMaterialLibraryGroup(grouping.groups, groupId) !== undefined;
}

function createParseState(): GroupParseState {
  return {
    groupIds: new Set<string>(),
    materialTypes: new Set<string>(),
    groupCount: 0,
    materialTypeCount: 0,
  };
}

function parseGroups(
  value: unknown,
  path: readonly (string | number)[],
  depth: number,
  state: GroupParseState,
  diagnostics: ScreenDiagnostic[],
): readonly BaseScreenMaterialLibraryGroup[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(diagnostic(path, 'Material library groups must be a non-empty array.'));
    return undefined;
  }
  if (value.length > MAX_GROUPS) {
    diagnostics.push(
      diagnostic(path, `Material library groups must contain at most ${MAX_GROUPS} nodes.`),
    );
    return undefined;
  }

  const groups: BaseScreenMaterialLibraryGroup[] = [];
  for (const [index, candidate] of value.entries()) {
    const group = parseGroup(candidate, [...path, index], depth, state, diagnostics);
    if (group !== undefined) groups.push(group);
  }
  return Object.freeze(groups);
}

function parseGroup(
  value: unknown,
  path: readonly (string | number)[],
  depth: number,
  state: GroupParseState,
  diagnostics: ScreenDiagnostic[],
): BaseScreenMaterialLibraryGroup | undefined {
  if (depth > MAX_GROUP_DEPTH) {
    diagnostics.push(
      diagnostic(path, `Material library groups cannot exceed ${MAX_GROUP_DEPTH} nesting levels.`),
    );
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(path, 'Material library group must be an object.'));
    return undefined;
  }
  state.groupCount++;
  if (state.groupCount > MAX_GROUPS) {
    diagnostics.push(
      diagnostic(path, `Material library groups must contain at most ${MAX_GROUPS} nodes.`),
    );
    return undefined;
  }
  for (const field of Object.keys(value)) {
    if (!GROUP_FIELDS.has(field)) {
      diagnostics.push(
        diagnostic([...path, field], 'Material library group contains an unknown field.'),
      );
    }
  }

  const id = parseGroupId(value.id, [...path, 'id'], state, diagnostics);
  const label = parseGroupLabel(value.label, [...path, 'label'], diagnostics);
  const materialTypes =
    value.materialTypes === undefined
      ? undefined
      : parseMaterialTypes(value.materialTypes, [...path, 'materialTypes'], state, diagnostics);
  const children =
    value.children === undefined
      ? undefined
      : parseGroups(value.children, [...path, 'children'], depth + 1, state, diagnostics);

  if (materialTypes === undefined && children === undefined) {
    diagnostics.push(
      diagnostic(path, 'Material library group must contain materialTypes or children.'),
    );
  }
  if (
    id === undefined ||
    label === undefined ||
    (value.materialTypes !== undefined && materialTypes === undefined) ||
    (value.children !== undefined && children === undefined)
  ) {
    return undefined;
  }
  if (materialTypes === undefined && children === undefined) return undefined;

  return Object.freeze({
    id,
    label,
    ...(materialTypes === undefined ? {} : { materialTypes }),
    ...(children === undefined ? {} : { children }),
  });
}

function parseGroupId(
  value: unknown,
  path: readonly (string | number)[],
  state: GroupParseState,
  diagnostics: ScreenDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || !GROUP_ID_PATTERN.test(value)) {
    diagnostics.push(diagnostic(path, 'Material library group id is invalid.'));
    return undefined;
  }
  if (state.groupIds.has(value)) {
    diagnostics.push(diagnostic(path, 'Material library group id must be unique.'));
    return undefined;
  }
  state.groupIds.add(value);
  return value;
}

function parseGroupLabel(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    [...value].length > MAX_GROUP_LABEL_LENGTH
  ) {
    diagnostics.push(diagnostic(path, 'Material library group label is invalid.'));
    return undefined;
  }
  return value;
}

function parseMaterialTypes(
  value: unknown,
  path: readonly (string | number)[],
  state: GroupParseState,
  diagnostics: ScreenDiagnostic[],
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      diagnostic(path, 'Material library group materialTypes must be a non-empty array.'),
    );
    return undefined;
  }

  const materialTypes: string[] = [];
  for (const [index, type] of value.entries()) {
    if (!isScreenMaterialType(type)) {
      diagnostics.push(diagnostic([...path, index], 'Material type is not a canonical identity.'));
      continue;
    }
    if (state.materialTypes.has(type)) {
      diagnostics.push(
        diagnostic([...path, index], 'Material type must appear in only one group.'),
      );
      continue;
    }
    state.materialTypes.add(type);
    state.materialTypeCount++;
    if (state.materialTypeCount > MAX_GROUP_MATERIAL_TYPES) {
      diagnostics.push(
        diagnostic(
          path,
          `Material library grouping supports at most ${MAX_GROUP_MATERIAL_TYPES} types.`,
        ),
      );
      continue;
    }
    materialTypes.push(type);
  }
  return materialTypes.length === 0 ? undefined : Object.freeze(materialTypes);
}

function findMaterialLibraryGroup(
  groups: readonly BaseScreenMaterialLibraryGroup[],
  groupId: string,
): BaseScreenMaterialLibraryGroup | undefined {
  for (const group of groups) {
    if (group.id === groupId) return group;
    const descendant = findMaterialLibraryGroup(group.children ?? [], groupId);
    if (descendant !== undefined) return descendant;
  }
  return undefined;
}

function findMaterialLibraryGroupPath(
  groups: readonly BaseScreenMaterialLibraryGroup[],
  groupId: string,
): readonly BaseScreenMaterialLibraryGroup[] | undefined {
  for (const group of groups) {
    if (group.id === groupId) return [group];
    const descendant = findMaterialLibraryGroupPath(group.children ?? [], groupId);
    if (descendant !== undefined) return [group, ...descendant];
  }
  return undefined;
}

function visitGroups(
  groups: readonly BaseScreenMaterialLibraryGroup[],
  path: readonly (string | number)[],
  visit: (group: BaseScreenMaterialLibraryGroup, path: readonly (string | number)[]) => void,
): void {
  for (const [index, group] of groups.entries()) {
    const groupPath = [...path, index];
    visit(group, groupPath);
    visitGroups(group.children ?? [], [...groupPath, 'children'], visit);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<BaseScreenMaterialLibraryGrouping> {
  return { ok: false, diagnostics: [diagnostic(path, message)] };
}

function diagnostic(path: readonly (string | number)[], message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
    path,
    message,
  };
}
