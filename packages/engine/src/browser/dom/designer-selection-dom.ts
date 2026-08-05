import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenSelectionBounds, isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { selectedComponents } from '../../common/operations/designer-selection.js';
import type { BaseScreenTransformHandle } from '../../common/operations/designer-transform.js';

export function renderDesignerSelection(
  selection: HTMLDivElement | undefined,
  ownerDocument: Document,
  document: ScreenDocument | undefined,
  componentIds: readonly string[],
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (selection === undefined) return;
  if (document === undefined) {
    selection.style.display = 'none';
    selection.replaceChildren();
    return;
  }
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
      control.ariaLabel = `调整大小：${handleLabel(handle)}`;
      selection.appendChild(control);
    }
  }
  if (canTransform(document, selected, catalog, 'rotate')) {
    const rotate = ownerDocument.createElement('button');
    rotate.type = 'button';
    rotate.className = 'transform-rotate';
    rotate.dataset.transformRotate = 'true';
    rotate.ariaLabel = '旋转选中组件';
    selection.appendChild(rotate);
  }
}

function handleLabel(handle: BaseScreenTransformHandle): string {
  switch (handle) {
    case 'north-west':
      return '左上';
    case 'north':
      return '上方';
    case 'north-east':
      return '右上';
    case 'east':
      return '右侧';
    case 'south-east':
      return '右下';
    case 'south':
      return '下方';
    case 'south-west':
      return '左下';
    case 'west':
      return '左侧';
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
