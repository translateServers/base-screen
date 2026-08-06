import type { ScreenDocument } from '@base-screen/contracts';
import {
  getScreenComponentBounds,
  getScreenSelectionBounds,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { selectedComponents } from '../../common/operations/designer-selection.js';
import type { BaseScreenTransformHandle } from '../../common/operations/designer-transform.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

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
  appendSelectionGrab(selection, ownerDocument, selected, bounds);
  appendTransformControls(selection, ownerDocument, document, selected, catalog);
}

// 拖拽层覆盖包围盒空白区域（clip-path 挖掉组件区域），组件区域仍可点击；
// grab 先于 handles 插入，handles/rotate 在命中测试中优先。
function appendSelectionGrab(
  selection: HTMLDivElement,
  ownerDocument: Document,
  selected: ReturnType<typeof selectedComponents>,
  bounds: NonNullable<ReturnType<typeof getScreenSelectionBounds>>,
): void {
  const grab = ownerDocument.createElement('div');
  grab.className = 'selection-grab';
  grab.dataset.selectionGrab = 'true';
  grab.style.clipPath = selectionGrabClipPath(selected, bounds);
  selection.appendChild(grab);
}

function selectionGrabClipPath(
  selected: ReturnType<typeof selectedComponents>,
  bounds: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
): string {
  const points = [
    '0px 0px',
    `${bounds.right - bounds.left}px 0px`,
    `${bounds.right - bounds.left}px ${bounds.bottom - bounds.top}px`,
    `0px ${bounds.bottom - bounds.top}px`,
  ];
  for (const component of selected) {
    const componentBounds = getScreenComponentBounds(component);
    points.push(
      `${componentBounds.left - bounds.left}px ${componentBounds.top - bounds.top}px`,
      `${componentBounds.right - bounds.left}px ${componentBounds.top - bounds.top}px`,
      `${componentBounds.right - bounds.left}px ${componentBounds.bottom - bounds.top}px`,
      `${componentBounds.left - bounds.left}px ${componentBounds.bottom - bounds.top}px`,
    );
  }
  return `polygon(evenodd, ${points.join(', ')})`;
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
      control.ariaLabel = DESIGNER_UI_TEXT.selection.resizeHandle(handleLabel(handle));
      selection.appendChild(control);
    }
  }
  if (canTransform(document, selected, catalog, 'rotate')) {
    const rotate = ownerDocument.createElement('button');
    rotate.type = 'button';
    rotate.className = 'transform-rotate';
    rotate.dataset.transformRotate = 'true';
    rotate.ariaLabel = DESIGNER_UI_TEXT.selection.rotate;
    selection.appendChild(rotate);
  }
}

function handleLabel(handle: BaseScreenTransformHandle): string {
  switch (handle) {
    case 'north-west':
      return DESIGNER_UI_TEXT.selection.northWest;
    case 'north':
      return DESIGNER_UI_TEXT.selection.north;
    case 'north-east':
      return DESIGNER_UI_TEXT.selection.northEast;
    case 'east':
      return DESIGNER_UI_TEXT.selection.east;
    case 'south-east':
      return DESIGNER_UI_TEXT.selection.southEast;
    case 'south':
      return DESIGNER_UI_TEXT.selection.south;
    case 'south-west':
      return DESIGNER_UI_TEXT.selection.southWest;
    case 'west':
      return DESIGNER_UI_TEXT.selection.west;
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
