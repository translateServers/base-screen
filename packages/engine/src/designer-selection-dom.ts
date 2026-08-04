import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenSelectionBounds, isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { selectedComponents } from './designer-selection.js';

export function renderDesignerSelection(
  selection: HTMLDivElement | undefined,
  ownerDocument: Document,
  document: ScreenDocument | undefined,
  componentIds: readonly string[],
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (selection === undefined || document === undefined) return;
  const selected = selectedComponents(document, componentIds);
  const bounds = getScreenSelectionBounds(selected);
  if (bounds === null) {
    selection.style.display = 'none';
    return;
  }
  selection.style.display = 'block';
  selection.style.left = `${bounds.left}px`;
  selection.style.top = `${bounds.top}px`;
  selection.style.width = `${bounds.right - bounds.left}px`;
  selection.style.height = `${bounds.bottom - bounds.top}px`;
  selection.replaceChildren();
  appendTransformControls(selection, ownerDocument, document, selected, catalog);
}

function appendTransformControls(
  selection: HTMLDivElement,
  ownerDocument: Document,
  document: ScreenDocument,
  selected: ReturnType<typeof selectedComponents>,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (canTransform(document, selected, catalog, 'resize')) {
    for (const handle of [
      'north-west',
      'north',
      'north-east',
      'east',
      'south-east',
      'south',
      'south-west',
      'west',
    ] as const) {
      const control = ownerDocument.createElement('button');
      control.type = 'button';
      control.className = `transform-handle handle-${handle}`;
      control.dataset.transformHandle = handle;
      control.ariaLabel = `Resize ${handle}`;
      selection.appendChild(control);
    }
  }
  if (canTransform(document, selected, catalog, 'rotate')) {
    const rotate = ownerDocument.createElement('button');
    rotate.type = 'button';
    rotate.className = 'transform-rotate';
    rotate.dataset.transformRotate = 'true';
    rotate.ariaLabel = 'Rotate selection';
    selection.appendChild(rotate);
  }
}

function canTransform(
  document: ScreenDocument,
  selected: ReturnType<typeof selectedComponents>,
  catalog: BaseScreenMaterialCatalog | undefined,
  capability: 'resize' | 'rotate',
): boolean {
  return (
    selected.length > 0 &&
    selected.every(
      (component) =>
        catalog?.get(component.type)?.manifest.designCapabilities[capability] === true &&
        !isScreenComponentEffectivelyLocked(document, component.id),
    )
  );
}
