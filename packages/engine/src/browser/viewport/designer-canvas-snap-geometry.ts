import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds, isScreenComponentEffectivelyHidden } from '@base-screen/core';
import type { DesignerSelectionSnapBounds } from './designer-canvas-aids-types.js';

export interface DesignerSnapComponentBounds extends DesignerSelectionSnapBounds {
  readonly centerX: number;
  readonly centerY: number;
}

/** One geometry projection shared by snap targets and alignment-rail measurements. */
export function collectDesignerSnapComponentBounds(
  document: ScreenDocument,
  excluded: ReadonlySet<string>,
): readonly DesignerSnapComponentBounds[] {
  const components: DesignerSnapComponentBounds[] = [];
  for (const component of document.components) {
    if (excluded.has(component.id) || isScreenComponentEffectivelyHidden(document, component.id)) {
      continue;
    }
    components.push({
      // Use the same Core visual bounds as the selection outline, including rotated elements.
      ...getScreenComponentBounds(component),
      centerX: component.position.x + component.size.width / 2,
      centerY: component.position.y + component.size.height / 2,
    });
  }
  return components;
}
