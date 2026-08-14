import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../ui/designer-icons.js';
import { materialCategoryIcon } from './designer-material-library-dom.js';

export interface DesignerLayerItem {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly childCount: number;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly missingMaterial: boolean;
  // 行首类型图标：由物料分类关键词确定性派生（与物料库缩略图同一规则），无匹配回退网格。
  readonly icon?: DesignerIconName;
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
  readonly renamingId: string | null | undefined;
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
  searchControl.textContent = DESIGNER_UI_TEXT.layersPanel.searchLabel;
  const glyph = layers.ownerDocument.createElement('span');
  glyph.className = 'layer-search-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon('search');
  searchControl.appendChild(glyph);
  const input = layers.ownerDocument.createElement('input');
  input.type = 'search';
  input.className = 'designer-control designer-input';
  input.value = options.search;
  input.placeholder = DESIGNER_UI_TEXT.layersPanel.searchPlaceholder;
  input.dataset.layerSearch = 'true';
  searchControl.appendChild(input);
  layers.appendChild(searchControl);

  const tree = layers.ownerDocument.createElement('div');
  tree.setAttribute('role', 'tree');
  tree.ariaLabel =
    options.dropTargetId === null
      ? DESIGNER_UI_TEXT.layersPanel.dropTargetAria
      : DESIGNER_UI_TEXT.layersPanel.aria;
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
        item.id === options.renamingId,
        options.renameDrafts.get(item.id),
        options.canMove,
      ),
    );
  }
  if (visible.length === 0) {
    const empty = layers.ownerDocument.createElement('p');
    empty.className = 'designer-empty-state';
    empty.setAttribute('role', 'status');
    empty.textContent = DESIGNER_UI_TEXT.layersPanel.empty;
    tree.appendChild(empty);
  } else if (visible.length > options.renderLimit) {
    const more = button(
      layers.ownerDocument,
      DESIGNER_UI_TEXT.layersPanel.showMore,
      DESIGNER_UI_TEXT.layersPanel.showMore,
    );
    more.className += ' layer-show-more';
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
      childCount: children.get(component.id)?.length ?? 0,
      hidden: isScreenComponentEffectivelyHidden(document, component.id),
      locked: isScreenComponentEffectivelyLocked(document, component.id),
      missingMaterial: catalog?.get(component.type) === undefined,
      icon: materialCategoryIcon(
        `${catalog?.get(component.type)?.manifest.category ?? ''} ${component.type}`,
      ),
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
  renaming: boolean,
  renameDraft: string | undefined,
  canMove: (componentId: string, direction: 'up' | 'down') => boolean,
): HTMLElement {
  const row = ownerDocument.createElement('div');
  row.className = 'layer-row';
  // 20px 缩进单位：padding 与引导线（CSS --layer-depth 驱动）共享同一基准。
  row.style.paddingInlineStart = `${item.depth * 20}px`;
  row.style.setProperty('--layer-depth', String(item.depth));
  row.setAttribute('role', 'treeitem');
  row.ariaLevel = String(item.depth + 1);
  row.ariaSelected = String(selected);
  row.dataset.layerId = item.id;
  row.draggable = !item.hidden && !item.locked;
  if (focused) row.ariaCurrent = 'true';
  if (dropTarget) row.dataset.dropTarget = 'true';
  if (renaming) row.dataset.renaming = 'true';

  // 状态不渲染可见芯片：隐藏/锁定由常驻的警示色开关图标（aria-pressed）与名称压暗表达，
  // 选中/焦点/放置目标由行背景、左侧 accent 条与虚线框表达；完整状态保留于 aria-description。
  const states = layerStateLabels(item, selected, focused, dropTarget);
  if (states.length > 0)
    row.setAttribute('aria-description', states.map((state) => state.label).join('，'));
  if (item.hasChildren) {
    const collapse = button(
      ownerDocument,
      '',
      collapsed
        ? DESIGNER_UI_TEXT.layersPanel.expandChildren
        : DESIGNER_UI_TEXT.layersPanel.collapseChildren,
    );
    collapse.dataset.layerCollapse = item.id;
    collapse.ariaExpanded = String(!collapsed);
    collapse.innerHTML = designerIcon(collapsed ? 'chevron-right' : 'chevron-down');
    row.appendChild(collapse);
  } else {
    const spacer = ownerDocument.createElement('span');
    spacer.className = 'layer-collapse-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    row.appendChild(spacer);
  }

  const select = button(ownerDocument, '', DESIGNER_UI_TEXT.layersPanel.select);
  select.dataset.layerSelect = item.id;
  // 保留按钮基础类：字体/颜色/光标/焦点环由 .designer-control/.designer-button 提供，
  // .layer-select 只覆盖几何与绘制，否则名称会退化为 UA 默认字体与颜色。
  select.className = 'designer-control designer-button layer-select';
  select.disabled = item.hidden;
  select.title = DESIGNER_UI_TEXT.layersPanel.renameHint;
  // 行首类型图标：与物料库同一派生规则，帮助快速区分图层内容形态。
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'layer-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon(item.icon ?? 'grid');
  select.appendChild(glyph);
  const name = ownerDocument.createElement('span');
  name.className = 'layer-name';
  name.textContent = item.name;
  select.appendChild(name);
  const type = ownerDocument.createElement('small');
  type.textContent = item.type;
  select.appendChild(type);
  if (item.childCount > 0) {
    const count = ownerDocument.createElement('span');
    count.className = 'layer-count';
    count.textContent = String(item.childCount);
    count.title = DESIGNER_UI_TEXT.layersPanel.childCount(item.childCount);
    select.appendChild(count);
  }
  row.appendChild(select);

  if (renaming) {
    const rename = ownerDocument.createElement('input');
    rename.type = 'text';
    rename.className = 'designer-control designer-input';
    rename.value = renameDraft ?? item.name;
    rename.dataset.layerRename = item.id;
    rename.ariaLabel = DESIGNER_UI_TEXT.layersPanel.rename(item.name);
    rename.disabled = item.locked;
    row.appendChild(rename);
  }
  // 图标操作簇：hover/focus-within/选中时逐图标淡入（CSS opacity），始终占位避免几何跳动；
  // 已激活的隐藏/锁定开关常驻可见，作为行级状态指示。
  const actions = ownerDocument.createElement('span');
  actions.className = 'layer-actions';
  actions.appendChild(
    layerButton(
      ownerDocument,
      item,
      'hidden',
      item.hidden ? DESIGNER_UI_TEXT.layersPanel.show : DESIGNER_UI_TEXT.layersPanel.hide,
    ),
  );
  actions.appendChild(
    layerButton(
      ownerDocument,
      item,
      'locked',
      item.locked ? DESIGNER_UI_TEXT.layersPanel.unlock : DESIGNER_UI_TEXT.layersPanel.lock,
    ),
  );
  actions.appendChild(moveButton(ownerDocument, item.id, 'up', canMove(item.id, 'up')));
  actions.appendChild(moveButton(ownerDocument, item.id, 'down', canMove(item.id, 'down')));
  row.appendChild(actions);
  if (item.missingMaterial) {
    const diagnostic = ownerDocument.createElement('span');
    diagnostic.className = 'layer-diagnostic';
    diagnostic.setAttribute('role', 'status');
    diagnostic.textContent = DESIGNER_UI_TEXT.layersPanel.missingMaterial(item.type);
    row.appendChild(diagnostic);
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
): readonly { readonly key: string; readonly label: string }[] {
  return [
    ...(item.hidden ? [{ key: 'hidden', label: DESIGNER_UI_TEXT.layersPanel.hidden }] : []),
    ...(item.locked ? [{ key: 'locked', label: DESIGNER_UI_TEXT.layersPanel.locked }] : []),
    ...(selected ? [{ key: 'selected', label: DESIGNER_UI_TEXT.layersPanel.selected }] : []),
    ...(focused ? [{ key: 'focused', label: DESIGNER_UI_TEXT.layersPanel.focused }] : []),
    ...(dropTarget ? [{ key: 'dropTarget', label: DESIGNER_UI_TEXT.layersPanel.dropTarget }] : []),
  ];
}

function layerButton(
  ownerDocument: Document,
  item: DesignerLayerItem,
  property: 'hidden' | 'locked',
  label: string,
): HTMLButtonElement {
  const control = button(ownerDocument, '', `${label} ${item.name}`);
  control.dataset.layerToggle = property;
  control.dataset.layerId = item.id;
  control.ariaPressed = String(property === 'hidden' ? item.hidden : item.locked);
  control.innerHTML = designerIcon(
    property === 'hidden' ? (item.hidden ? 'eye-off' : 'eye') : item.locked ? 'lock' : 'lock-open',
  );
  return control;
}

function moveButton(
  ownerDocument: Document,
  id: string,
  direction: 'up' | 'down',
  enabled: boolean,
): HTMLButtonElement {
  const label =
    direction === 'up'
      ? DESIGNER_UI_TEXT.layersPanel.moveUp
      : DESIGNER_UI_TEXT.layersPanel.moveDown;
  const control = button(ownerDocument, '', label);
  control.dataset.layerMove = direction;
  control.dataset.layerId = id;
  control.disabled = !enabled;
  control.innerHTML = designerIcon(direction === 'up' ? 'arrow-up' : 'arrow-down');
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
