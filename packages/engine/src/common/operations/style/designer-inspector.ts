import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { selectedComponents } from '../selection/designer-selection.js';

export type DesignerInspectorContext =
  | { readonly kind: 'canvas' }
  | {
      readonly kind: 'single-material';
      readonly component: ScreenComponentNode;
      readonly manifest: BaseScreenMaterialManifest | undefined;
    }
  | {
      readonly kind: 'single-group';
      readonly component: ScreenComponentNode;
      readonly manifest: BaseScreenMaterialManifest | undefined;
      readonly summary: DesignerGroupSummary;
    }
  | {
      readonly kind: 'multi-selection';
      readonly components: readonly ScreenComponentNode[];
      readonly summary: DesignerSelectionSummary;
    };

export interface DesignerGroupSummary {
  readonly directChildCount: number;
  readonly descendantCount: number;
  readonly hasLockedDescendant: boolean;
  readonly hasHiddenDescendant: boolean;
  readonly canUngroup: boolean;
}

export interface DesignerSelectionSummary {
  readonly count: number;
  readonly sameParent: boolean;
  readonly hasLocked: boolean;
  readonly hasHidden: boolean;
  readonly canGroup: boolean;
  readonly canAlign: boolean;
  readonly canDistribute: boolean;
}

export function getDesignerInspectorContext(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): DesignerInspectorContext {
  if (document === undefined) return { kind: 'canvas' };
  const selected = selectedComponents(document, interaction.selectedComponentIds);
  if (selected.length > 1) {
    return {
      kind: 'multi-selection',
      components: selected,
      summary: getDesignerSelectionSummary(document, selected),
    };
  }
  const component =
    selected[0] ?? document.components.find((item) => item.id === interaction.focusedComponentId);
  if (component === undefined) return { kind: 'canvas' };
  const manifest = catalog?.get(component.type)?.manifest;
  const summary = getDesignerGroupSummary(document, component.id);
  if (summary.descendantCount > 0 && manifest?.designCapabilities.children !== false) {
    return { kind: 'single-group', component, manifest, summary };
  }
  return { kind: 'single-material', component, manifest };
}

export function getDesignerGroupSummary(
  document: ScreenDocument,
  groupId: string,
): DesignerGroupSummary {
  const directChildren = document.components.filter((component) => component.parentId === groupId);
  const descendants = getDescendants(document, groupId);
  const groupLocked = isScreenComponentEffectivelyLocked(document, groupId);
  return {
    directChildCount: directChildren.length,
    descendantCount: descendants.length,
    hasLockedDescendant: descendants.some((component) =>
      isScreenComponentEffectivelyLocked(document, component.id),
    ),
    hasHiddenDescendant: descendants.some((component) =>
      isScreenComponentEffectivelyHidden(document, component.id),
    ),
    canUngroup: !groupLocked && directChildren.length > 0,
  };
}

export function getDesignerSelectionSummary(
  document: ScreenDocument,
  components: readonly ScreenComponentNode[],
): DesignerSelectionSummary {
  const parentIds = new Set(components.map((component) => component.parentId));
  const hasLocked = components.some((component) =>
    isScreenComponentEffectivelyLocked(document, component.id),
  );
  const hasHidden = components.some((component) =>
    isScreenComponentEffectivelyHidden(document, component.id),
  );
  return {
    count: components.length,
    sameParent: parentIds.size <= 1,
    hasLocked,
    hasHidden,
    canGroup: components.length >= 2 && parentIds.size === 1 && !hasLocked,
    canAlign: components.length >= 2,
    canDistribute: components.length >= 3,
  };
}

export function createGroupPositionTransaction(
  document: ScreenDocument,
  groupId: string,
  position: { readonly x: number; readonly y: number },
): ScreenDocumentTransaction | undefined {
  const group = document.components.find((component) => component.id === groupId);
  if (group === undefined || isScreenComponentEffectivelyLocked(document, groupId)) {
    return undefined;
  }
  const delta = {
    x: position.x - group.position.x,
    y: position.y - group.position.y,
  };
  if (delta.x === 0 && delta.y === 0) return undefined;
  const moved = [group, ...getDescendants(document, groupId)].filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
  return {
    commands: moved.map((component) => ({
      type: 'update-components' as const,
      componentIds: [component.id],
      patch: {
        position: {
          x: component.position.x + delta.x,
          y: component.position.y + delta.y,
        },
      },
    })),
  };
}

function getDescendants(
  document: ScreenDocument,
  componentId: string,
): readonly ScreenComponentNode[] {
  const childrenByParent = new Map<string | null, string[]>();
  for (const component of document.components) {
    const children = childrenByParent.get(component.parentId) ?? [];
    children.push(component.id);
    childrenByParent.set(component.parentId, children);
  }
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const descendants: ScreenComponentNode[] = [];
  const pending = [...(childrenByParent.get(componentId) ?? [])];
  while (pending.length > 0) {
    const id = pending.shift()!;
    const component = byId.get(id);
    if (component === undefined) continue;
    descendants.push(component);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return descendants;
}
