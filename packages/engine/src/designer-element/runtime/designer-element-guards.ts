import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, getAncestorIds } from '@base-screen/core';
import type { ScreenProjectPhase } from '../../common/project/project-controller.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export function lifecycleDiagnostic(message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message };
}

export function isBaseScreenMaterialCatalog(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).get === 'function' &&
    typeof (value as Record<string, unknown>).has === 'function' &&
    typeof (value as Record<string, unknown>).list === 'function'
  );
}

export function isScreenHostResourcePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

export function isScreenHostCatalogPort(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['list', 'describe', 'resolve'].every((name) => typeof record[name] === 'function');
}

export function isBaseScreenConditionalStylePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

export function isBaseScreenHostConditionalStyleAuthoringPort(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.sources)) return false;
  if (typeof record.bindings !== 'function' || typeof record.save !== 'function') return false;
  return record.sources.every((source) => {
    if (source === null || typeof source !== 'object') return false;
    const entry = source as Record<string, unknown>;
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string') return false;
    if (!Array.isArray(entry.conditions)) return false;
    return entry.conditions.every((condition) => {
      if (condition === null || typeof condition !== 'object') return false;
      const item = condition as Record<string, unknown>;
      return typeof item.id === 'string' && typeof item.label === 'string';
    });
  });
}

export function isBaseScreenRuntimeContributionIndex(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).getResourceType === 'function' &&
    typeof (value as Record<string, unknown>).hasBlueprintCapability === 'function'
  );
}

export function isBaseScreenPluginCatalog(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).get === 'function' &&
    typeof (value as Record<string, unknown>).has === 'function' &&
    typeof (value as Record<string, unknown>).list === 'function'
  );
}

function hasPluginCatalogShape(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).get === 'function' &&
    typeof (value as Record<string, unknown>).has === 'function' &&
    typeof (value as Record<string, unknown>).list === 'function'
  );
}

function everyEntryContributionKind(value: unknown, kind: string): boolean {
  return (value as { list: () => readonly unknown[] })
    .list()
    .every(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        (entry as { contribution?: { kind?: unknown } }).contribution?.kind === kind,
    );
}

export function isBaseScreenPluginPanelCatalog(value: unknown): boolean {
  // 三种 catalog 形状相同，只能按条目内容区分。不要改用 entry.constructor 判定，
  // 任何普通对象都继承 constructor，那个检查是空的。
  return hasPluginCatalogShape(value) && everyEntryContributionKind(value, 'panel');
}

export function isBaseScreenPluginInspectorControlCatalog(value: unknown): boolean {
  return hasPluginCatalogShape(value) && everyEntryContributionKind(value, 'inspectorControl');
}

export function isPluginCommandPort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).execute === 'function'
  );
}

export function projectPhaseLabel(phase: ScreenProjectPhase): string {
  return DESIGNER_UI_TEXT.projectPhases[phase];
}

export function groupEditingPath(document: ScreenDocument, groupId: string | null): string | null {
  if (groupId === null) return null;
  const index = buildComponentIndex(document);
  const names: string[] = [];
  for (const id of [groupId, ...getAncestorIds(index, groupId)]) {
    const component = index.byId.get(id)?.component;
    if (component === undefined) break;
    names.unshift(component.name);
  }
  return names.length === 0 ? null : names.join(' / ');
}

// 保存状态指示器与图标族同网格：圆弧 spinner 保留自身 CSS 动画与 class。
export function saveStatusSpinnerGlyph(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M12 3a9 9 0 1 1-9 9"/></svg>';
}

export function formatSavedTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
