import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenDesignerWorkbenchMode } from './common/operations/designer-blueprint-protocol.js';

export const BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT =
  'base-screen-designer-left-panel-group-change' as const;

export const BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX =
  'base-screen-designer-left-panel-' as const;

export const BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS = [
  'chart',
  'container',
  'cube',
  'grid',
  'image',
  'map',
  'shapes',
  'sparkle',
  'table',
  'terminal',
  'text',
  'variable',
] as const;

export type BaseScreenDesignerLeftPanelGroupIcon =
  (typeof BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS)[number];

export interface BaseScreenDesignerLeftPanelGroup {
  readonly id: string;
  readonly label: string;
  readonly icon?: BaseScreenDesignerLeftPanelGroupIcon;
  /** 省略时仅用于画布；显式声明后可用于画布、事件蓝图或两者。 */
  readonly workbenchModes?: readonly BaseScreenDesignerWorkbenchMode[];
}

export interface BaseScreenDesignerLeftPanelGroupChangeEventDetail {
  /** 当前宿主分组；切回 Engine 内建分组时为 null。 */
  readonly groupId: string | null;
}

const GROUP_FIELDS = new Set(['id', 'label', 'icon', 'workbenchModes']);
const GROUP_ICONS = new Set<string>(BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS);
const WORKBENCH_MODES = new Set<BaseScreenDesignerWorkbenchMode>(['canvas', 'blueprint']);
const GROUP_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const RESERVED_GROUP_IDS = new Set(['layers', 'materials', 'variables']);
const MAX_GROUPS = 6;
const MAX_GROUP_ID_LENGTH = 64;
const MAX_GROUP_LABEL_LENGTH = 48;

export function parseBaseScreenDesignerLeftPanelGroups(
  input: unknown,
): ScreenParseResult<readonly BaseScreenDesignerLeftPanelGroup[]> {
  const parsed = parseScreenJsonValue(input);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) {
    return failure([], 'Designer left panel groups must be an array.');
  }
  if (parsed.value.length > MAX_GROUPS) {
    return failure([], `Designer left panel groups support at most ${MAX_GROUPS} entries.`);
  }

  const diagnostics: ScreenDiagnostic[] = [];
  const ids = new Set<string>();
  const groups: BaseScreenDesignerLeftPanelGroup[] = [];
  for (const [index, value] of parsed.value.entries()) {
    const group = parseGroup(value, index, ids, diagnostics);
    if (group !== undefined) groups.push(group);
  }

  return diagnostics.length === 0
    ? { ok: true, value: Object.freeze(groups), diagnostics: [] }
    : { ok: false, diagnostics };
}

export function baseScreenDesignerLeftPanelSlotName(groupId: string): string {
  return `${BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX}${groupId}`;
}

export function baseScreenDesignerLeftPanelGroupSupportsMode(
  group: BaseScreenDesignerLeftPanelGroup,
  mode: BaseScreenDesignerWorkbenchMode,
): boolean {
  return group.workbenchModes?.includes(mode) ?? mode === 'canvas';
}

function parseGroup(
  value: unknown,
  index: number,
  ids: Set<string>,
  diagnostics: ScreenDiagnostic[],
): BaseScreenDesignerLeftPanelGroup | undefined {
  const path = [index] as const;
  if (!isRecord(value)) {
    diagnostics.push(diagnostic(path, 'Designer left panel group must be an object.'));
    return undefined;
  }
  for (const field of Object.keys(value)) {
    if (!GROUP_FIELDS.has(field)) {
      diagnostics.push(
        diagnostic([...path, field], 'Designer left panel group contains an unknown field.'),
      );
    }
  }

  const id = parseGroupId(value.id, [...path, 'id'], ids, diagnostics);
  const label = parseGroupLabel(value.label, [...path, 'label'], diagnostics);
  const icon = parseGroupIcon(value.icon, [...path, 'icon'], diagnostics);
  const workbenchModes = parseWorkbenchModes(
    value.workbenchModes,
    [...path, 'workbenchModes'],
    diagnostics,
  );
  if (
    id === undefined ||
    label === undefined ||
    (value.icon !== undefined && icon === undefined) ||
    (value.workbenchModes !== undefined && workbenchModes === undefined)
  ) {
    return undefined;
  }

  return Object.freeze({
    id,
    label,
    ...(icon === undefined ? {} : { icon }),
    ...(workbenchModes === undefined ? {} : { workbenchModes }),
  });
}

function parseGroupId(
  value: unknown,
  path: readonly (string | number)[],
  ids: Set<string>,
  diagnostics: ScreenDiagnostic[],
): string | undefined {
  if (
    typeof value !== 'string' ||
    [...value].length > MAX_GROUP_ID_LENGTH ||
    !GROUP_ID_PATTERN.test(value) ||
    RESERVED_GROUP_IDS.has(value)
  ) {
    diagnostics.push(diagnostic(path, 'Designer left panel group id is invalid or reserved.'));
    return undefined;
  }
  if (ids.has(value)) {
    diagnostics.push(diagnostic(path, 'Designer left panel group id must be unique.'));
    return undefined;
  }
  ids.add(value);
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
    CONTROL_CHARACTER_PATTERN.test(value) ||
    [...value].length > MAX_GROUP_LABEL_LENGTH
  ) {
    diagnostics.push(diagnostic(path, 'Designer left panel group label is invalid.'));
    return undefined;
  }
  return value;
}

function parseGroupIcon(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): BaseScreenDesignerLeftPanelGroupIcon | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !GROUP_ICONS.has(value)) {
    diagnostics.push(diagnostic(path, 'Designer left panel group icon is invalid.'));
    return undefined;
  }
  return value as BaseScreenDesignerLeftPanelGroupIcon;
}

function parseWorkbenchModes(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: ScreenDiagnostic[],
): readonly BaseScreenDesignerWorkbenchMode[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > WORKBENCH_MODES.size) {
    diagnostics.push(diagnostic(path, 'Designer left panel workbench modes are invalid.'));
    return undefined;
  }
  const modes = new Set<BaseScreenDesignerWorkbenchMode>();
  for (const [index, mode] of value.entries()) {
    if (typeof mode !== 'string' || !WORKBENCH_MODES.has(mode as BaseScreenDesignerWorkbenchMode)) {
      diagnostics.push(
        diagnostic([...path, index], 'Designer left panel workbench mode is invalid.'),
      );
      return undefined;
    }
    if (modes.has(mode as BaseScreenDesignerWorkbenchMode)) {
      diagnostics.push(
        diagnostic([...path, index], 'Designer left panel workbench mode must be unique.'),
      );
      return undefined;
    }
    modes.add(mode as BaseScreenDesignerWorkbenchMode);
  }
  return Object.freeze([...modes]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<readonly BaseScreenDesignerLeftPanelGroup[]> {
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
