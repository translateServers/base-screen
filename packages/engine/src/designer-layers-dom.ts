import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export interface DesignerLayerItem {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly depth: number;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly missingMaterial: boolean;
}

export interface DesignerLayerView {
  readonly items: readonly DesignerLayerItem[];
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export function createDesignerLayerView(
  document: ScreenDocument | undefined,
  catalog: BaseScreenMaterialCatalog | undefined,
): DesignerLayerView {
  if (document === undefined) return { items: [], diagnostics: [] };
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const order = new Map(document.components.map((component, index) => [component.id, index]));
  const children = new Map<string | null, string[]>();
  for (const component of document.components) {
    const siblings = children.get(component.parentId) ?? [];
    siblings.push(component.id);
    children.set(component.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => compareSiblings(left, right, byId, order));
  }
  const items: DesignerLayerItem[] = [];
  visitLayer(null, 0, children, byId, document, catalog, items);
  return {
    items,
    diagnostics: items.filter((item) => item.missingMaterial).map(missingMaterialDiagnostic),
  };
}

export function renderDesignerLayers(
  layers: HTMLElement,
  view: DesignerLayerView,
  focusedComponentId: string | null,
  search: string,
  canMove: (componentId: string, direction: 'up' | 'down') => boolean,
): void {
  layers.replaceChildren();
  const searchControl = layers.ownerDocument.createElement('label');
  searchControl.className = 'layer-search';
  searchControl.textContent = '搜索图层';
  const input = layers.ownerDocument.createElement('input');
  input.type = 'search';
  input.value = search;
  input.placeholder = '搜索';
  input.dataset.layerSearch = 'true';
  searchControl.appendChild(input);
  layers.appendChild(searchControl);

  const tree = layers.ownerDocument.createElement('div');
  tree.setAttribute('role', 'tree');
  tree.ariaLabel = '图层';
  const query = search.trim().toLowerCase();
  for (const item of view.items) {
    if (query !== '' && !`${item.name} ${item.type}`.toLowerCase().includes(query)) continue;
    tree.appendChild(
      createLayerNode(layers.ownerDocument, item, item.id === focusedComponentId, canMove),
    );
  }
  layers.appendChild(tree);
}

function visitLayer(
  parentId: string | null,
  depth: number,
  children: ReadonlyMap<string | null, readonly string[]>,
  byId: ReadonlyMap<string, { readonly id: string; readonly name: string; readonly type: string }>,
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  items: DesignerLayerItem[],
): void {
  for (const id of children.get(parentId) ?? []) {
    const component = byId.get(id)!;
    items.push({
      id: component.id,
      name: component.name,
      type: component.type,
      depth,
      hidden: isScreenComponentEffectivelyHidden(document, component.id),
      locked: isScreenComponentEffectivelyLocked(document, component.id),
      missingMaterial: catalog?.get(component.type) === undefined,
    });
    visitLayer(id, depth + 1, children, byId, document, catalog, items);
  }
}

function compareSiblings(
  leftId: string,
  rightId: string,
  byId: ReadonlyMap<string, { readonly zIndex: number }>,
  order: ReadonlyMap<string, number>,
): number {
  const left = byId.get(leftId)!;
  const right = byId.get(rightId)!;
  return left.zIndex - right.zIndex || order.get(leftId)! - order.get(rightId)!;
}

function createLayerNode(
  ownerDocument: Document,
  item: DesignerLayerItem,
  selected: boolean,
  canMove: (componentId: string, direction: 'up' | 'down') => boolean,
): HTMLElement {
  const row = ownerDocument.createElement('div');
  row.className = 'layer-row';
  row.style.paddingInlineStart = `${item.depth * 16}px`;
  row.setAttribute('role', 'treeitem');
  row.ariaLevel = String(item.depth + 1);
  row.ariaSelected = String(selected);
  row.dataset.layerId = item.id;
  row.draggable = true;

  const select = button(ownerDocument, item.name, '选择图层');
  select.dataset.layerSelect = item.id;
  select.className = 'layer-select';
  const type = ownerDocument.createElement('small');
  type.textContent = item.type;
  select.appendChild(type);
  row.appendChild(select);

  const rename = ownerDocument.createElement('input');
  rename.type = 'text';
  rename.value = item.name;
  rename.dataset.layerRename = item.id;
  rename.ariaLabel = `重命名 ${item.name}`;
  row.appendChild(rename);
  row.appendChild(layerButton(ownerDocument, item, 'hidden', item.hidden ? '显示' : '隐藏'));
  row.appendChild(layerButton(ownerDocument, item, 'locked', item.locked ? '解锁' : '锁定'));
  row.appendChild(moveButton(ownerDocument, item.id, 'up', canMove(item.id, 'up')));
  row.appendChild(moveButton(ownerDocument, item.id, 'down', canMove(item.id, 'down')));
  if (item.missingMaterial) {
    const diagnostic = ownerDocument.createElement('span');
    diagnostic.className = 'layer-diagnostic';
    diagnostic.setAttribute('role', 'status');
    diagnostic.textContent = `缺少物料：${item.type}`;
    row.appendChild(diagnostic);
  }
  return row;
}

function layerButton(
  ownerDocument: Document,
  item: DesignerLayerItem,
  property: 'hidden' | 'locked',
  label: string,
): HTMLButtonElement {
  const control = button(ownerDocument, label, `${label} ${item.name}`);
  control.dataset.layerToggle = property;
  control.dataset.layerId = item.id;
  control.ariaPressed = String(property === 'hidden' ? item.hidden : item.locked);
  return control;
}

function moveButton(
  ownerDocument: Document,
  id: string,
  direction: 'up' | 'down',
  enabled: boolean,
): HTMLButtonElement {
  const label = direction === 'up' ? '上移' : '下移';
  const control = button(ownerDocument, label, label);
  control.dataset.layerMove = direction;
  control.dataset.layerId = id;
  control.disabled = !enabled;
  return control;
}

function button(ownerDocument: Document, text: string, label: string): HTMLButtonElement {
  const control = ownerDocument.createElement('button');
  control.type = 'button';
  control.textContent = text;
  control.ariaLabel = label;
  return control;
}

function missingMaterialDiagnostic(item: DesignerLayerItem): ScreenDiagnostic {
  return {
    severity: 'warning',
    code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
    path: ['components', item.id, 'type'],
    message: `Material "${item.type}" for layer "${item.name}" is unavailable.`,
  };
}
