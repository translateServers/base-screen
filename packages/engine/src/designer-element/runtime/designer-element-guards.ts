import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
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

export function isScreenHostVariablePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

export function isScreenHostVariableCatalogPort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).list === 'function' &&
    typeof (value as Record<string, unknown>).describe === 'function'
  );
}

export function isBaseScreenConditionalStylePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
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
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const names: string[] = [];
  let current = byId.get(groupId);
  while (current !== undefined) {
    names.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return names.length === 0 ? null : names.join(' / ');
}

export function saveStatusSpinnerGlyph(): string {
  return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 2a6 6 0 1 1-6 6"/></svg>';
}

export function saveStatusCheckGlyph(): string {
  return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5 6.5 12 13 4.5"/></svg>';
}

export function formatSavedTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
