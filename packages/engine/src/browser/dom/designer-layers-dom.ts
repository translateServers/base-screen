import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export interface DesignerLayerItem {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly missingMaterial: boolean;
}

export interface DesignerLayerView {
  readonly items: readonly DesignerLayerItem[];
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export interface DesignerLayersRenderOptions {
  readonly interaction: ScreenInteractionState;
  readonly search: string;
  readonly collapsed: ReadonlySet<string>;
  readonly dropTargetId: string | null | undefined;
  readonly renameDrafts: ReadonlyMap<string, string>;
  readonly renderLimit: number;
  readonly canMove: (componentId: string, direction: 'up' | 'down') => boolean;
}

export const DESIGNER_LAYER_PAGE_SIZE = 100;

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
  options: DesignerLayersRenderOptions,
): void {
  layers.replaceChildren();
  const searchControl = layers.ownerDocument.createElement('label');
  searchControl.className = 'designer-field designer-field-label layer-search';
  searchControl.textContent = '搜索图层';
  const input = layers.ownerDocument.createElement('input');
  input.type = 'search';
  input.className = 'designer-control designer-input';
  input.value = options.search;
  input.placeholder = '搜索';
  input.dataset.layerSearch = 'true';
  searchControl.appendChild(input);
  layers.appendChild(searchControl);

  const tree = layers.ownerDocument.createElement('div');
  tree.setAttribute('role', 'tree');
  tree.ariaLabel = options.dropTargetId === null ? '图层，根图层是当前放置目标' : '图层';
  tree.dataset.layerRoot = 'true';
  if (options.dropTargetId === null) tree.dataset.dropTarget = 'true';
  const query = options.search.trim().toLowerCase();
  const visible = filterDesignerLayerItems(view.items, options.search, options.collapsed);
  for (const item of visible.slice(0, options.renderLimit)) {
    tree.appendChild(
      createLayerNode(
        layers.ownerDocument,
        item,
        options.interaction.selectedComponentIds.includes(item.id),
        item.id === options.interaction.focusedComponentId,
        query === '' && options.collapsed.has(item.id),
        item.id === options.dropTargetId,
        options.renameDrafts.get(item.id),
        options.canMove,
      ),
    );
  }
  if (visible.length === 0) {
    const empty = layers.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.setAttribute('role', 'status');
    empty.textContent = '未找到图层。';
    tree.appendChild(empty);
  } else if (visible.length > options.renderLimit) {
    const more = button(layers.ownerDocument, '显示更多图层', '显示更多图层');
    more.dataset.layerShowMore = 'true';
    tree.appendChild(more);
  }
  layers.appendChild(tree);
}

export function filterDesignerLayerItems(
  items: readonly DesignerLayerItem[],
  search: string,
  collapsed: ReadonlySet<string>,
): readonly DesignerLayerItem[] {
  const query = search.trim().toLowerCase();
  if (query !== '') {
    const byId = new Map(items.map((item) => [item.id, item]));
    const children = new Map<string, string[]>();
    for (const item of items) {
      if (item.parentId === null) continue;
      const siblings = children.get(item.parentId) ?? [];
      siblings.push(item.id);
      children.set(item.parentId, siblings);
    }
    const visible = new Set<string>();
    for (const item of items) {
      if (!matchesLayerQuery(item, query)) continue;
      let current: DesignerLayerItem | undefined = item;
      while (current !== undefined && !visible.has(current.id)) {
        visible.add(current.id);
        current = current.parentId === null ? undefined : byId.get(current.parentId);
      }
      addLayerDescendants(item.id, children, visible);
    }
    return items.filter((item) => visible.has(item.id));
  }

  const hidden = new Set<string>();
  return items.filter((item) => {
    if (item.parentId !== null && hidden.has(item.parentId)) {
      hidden.add(item.id);
      return false;
    }
    if (collapsed.has(item.id)) hidden.add(item.id);
    return true;
  });
}

function addLayerDescendants(
  componentId: string,
  children: ReadonlyMap<string, readonly string[]>,
  visible: Set<string>,
): void {
  for (const childId of children.get(componentId) ?? []) {
    visible.add(childId);
    addLayerDescendants(childId, children, visible);
  }
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
      parentId,
      name: component.name,
      type: component.type,
      depth,
      hasChildren: (children.get(component.id)?.length ?? 0) > 0,
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
  focused: boolean,
  collapsed: boolean,
  dropTarget: boolean,
  renameDraft: string | undefined,
  canMove: (componentId: string, direction: 'up' | 'down') => boolean,
): HTMLElement {
  const row = ownerDocument.createElement('div');
  row.className = 'layer-row';
  row.style.paddingInlineStart = `${item.depth * 16}px`;
  row.setAttribute('role', 'treeitem');
  row.ariaLevel = String(item.depth + 1);
  row.ariaSelected = String(selected);
  row.dataset.layerId = item.id;
  row.draggable = !item.hidden && !item.locked;
  if (focused) row.ariaCurrent = 'true';
  if (dropTarget) row.dataset.dropTarget = 'true';

  const states = layerStateLabels(item, selected, focused, dropTarget);
  if (states.length > 0) row.setAttribute('aria-description', states.join('，'));

  if (item.hasChildren) {
    const collapse = button(
      ownerDocument,
      collapsed ? '展开' : '收起',
      collapsed ? '展开子图层' : '收起子图层',
    );
    collapse.dataset.layerCollapse = item.id;
    collapse.ariaExpanded = String(!collapsed);
    row.appendChild(collapse);
  } else {
    const spacer = ownerDocument.createElement('span');
    spacer.className = 'layer-collapse-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    row.appendChild(spacer);
  }

  const select = button(ownerDocument, item.name, '选择图层');
  select.dataset.layerSelect = item.id;
  select.className = 'layer-select';
  select.disabled = item.hidden;
  const type = ownerDocument.createElement('small');
  type.textContent = item.type;
  select.appendChild(type);
  row.appendChild(select);

  const rename = ownerDocument.createElement('input');
  rename.type = 'text';
  rename.className = 'designer-control designer-input';
  rename.value = renameDraft ?? item.name;
  rename.dataset.layerRename = item.id;
  rename.ariaLabel = `重命名 ${item.name}`;
  rename.disabled = item.locked;
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
  if (states.length > 0) {
    const state = ownerDocument.createElement('small');
    state.className = 'layer-state';
    state.textContent = states.join('，');
    row.appendChild(state);
  }
  return row;
}

function matchesLayerQuery(item: DesignerLayerItem, query: string): boolean {
  return `${item.name} ${item.type}`.toLowerCase().includes(query);
}

function layerStateLabels(
  item: DesignerLayerItem,
  selected: boolean,
  focused: boolean,
  dropTarget: boolean,
): readonly string[] {
  return [
    ...(item.hidden ? ['已隐藏'] : []),
    ...(item.locked ? ['已锁定'] : []),
    ...(selected ? ['已选中'] : []),
    ...(focused ? ['当前焦点'] : []),
    ...(dropTarget ? ['放置目标'] : []),
  ];
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
  control.className = 'designer-control designer-button';
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
