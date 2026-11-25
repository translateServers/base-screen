import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds, isScreenComponentEffectivelyHidden } from '@base-screen/core';
import type { DesignerSelectionSnapBounds } from './designer-canvas-aids-types.js';

export interface DesignerSnapComponentBounds extends DesignerSelectionSnapBounds {
  readonly centerX: number;
  readonly centerY: number;
}

/**
 * Snap scope (tldraw `getCurrentCommonAncestor`, Penpot same-board rule): the common parent of
 * the dragged selection's roots. Selections spanning several parents, and gestures with no
 * selection (drawing, dropping), use the canvas root (`null`).
 */
export function resolveDesignerSnapScope(
  document: ScreenDocument,
  excluded: ReadonlySet<string>,
): string | null {
  let scope: string | null | undefined;
  for (const component of document.components) {
    if (!excluded.has(component.id)) continue;
    // Only the selection's roots decide; their descendants are dragged along with them.
    if (component.parentId !== null && excluded.has(component.parentId)) continue;
    if (scope === undefined) scope = component.parentId;
    else if (scope !== component.parentId) return null;
  }
  return scope ?? null;
}

/**
 * One geometry projection shared by snap targets and alignment-rail measurements.
 *
 * With a `scope`, only that parent's direct children and the parent container itself are
 * targets: a container at that level snaps as a whole and its descendants do not.
 */
export function collectDesignerSnapComponentBounds(
  document: ScreenDocument,
  excluded: ReadonlySet<string>,
  scope?: string | null,
): readonly DesignerSnapComponentBounds[] {
  const components: DesignerSnapComponentBounds[] = [];
  for (const component of document.components) {
    if (excluded.has(component.id)) continue;
    if (scope !== undefined && component.parentId !== scope && component.id !== scope) continue;
    if (isScreenComponentEffectivelyHidden(document, component.id)) continue;
    components.push({
      // Use the same Core visual bounds as the selection outline, including rotated elements.
      ...getScreenComponentBounds(component),
      centerX: component.position.x + component.size.width / 2,
      centerY: component.position.y + component.size.height / 2,
    });
  }
  return components;
}
