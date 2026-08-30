import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { createDesignerButton } from '../designer-ui-primitives.js';
import {
  type DesignerLayerItem,
  type DesignerLayersRenderOptions,
  type DesignerLayerView,
  filterDesignerLayerItems,
} from './designer-layers-model.js';
import { createDesignerLayerToolbar } from './designer-layers-toolbar-dom.js';

export * from './designer-layers-model.js';

export function renderDesignerLayers(
  layers: HTMLElement,
  view: DesignerLayerView,
  options: DesignerLayersRenderOptions,
): void {
  layers.replaceChildren();
  const controls = layers.ownerDocument.createElement('div');
  controls.className = 'layer-panel-controls';
  controls.appendChild(createDesignerLayerToolbar(layers.ownerDocument, options.toolbarState));
  const searchControl = layers.ownerDocument.createElement('label');
  searchControl.className = 'designer-field designer-field-label layer-search';
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
  input.ariaLabel = DESIGNER_UI_TEXT.layersPanel.searchLabel;
  input.dataset.layerSearch = 'true';
  searchControl.appendChild(input);
  controls.appendChild(searchControl);
  layers.appendChild(controls);

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
        (direction) =>
          options.canMove(item.id, direction, view.siblingsByParent.get(item.parentId) ?? []),
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

function createLayerNode(
  ownerDocument: Document,
  item: DesignerLayerItem,
  selected: boolean,
  focused: boolean,
  collapsed: boolean,
  dropTarget: boolean,
  renaming: boolean,
  renameDraft: string | undefined,
  canMove: (direction: 'up' | 'down') => boolean,
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
  // 锁定只约束画布变换、拖拽与重命名；图层树仍需允许选中，以便查看并解除锁定。
  const selectable = !item.hidden;
  if (selectable) row.dataset.layerSelectable = 'true';
  if (item.hidden) row.dataset.hidden = 'true';
  if (item.locked) row.dataset.locked = 'true';
  row.draggable = selectable && !item.locked;
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

  const select = button(ownerDocument, '', DESIGNER_UI_TEXT.layersPanel.selectLayer(item.name));
  select.dataset.layerSelect = item.id;
  // 保留按钮基础类：字体/颜色/光标/焦点环由 .designer-control/.designer-button 提供，
  // .layer-select 只覆盖几何与绘制，否则名称会退化为 UA 默认字体与颜色。
  select.className = 'designer-control designer-button layer-select';
  select.disabled = !selectable;
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
  // 图标操作簇：常态只露出定位，hover/focus 时向左展开；绝对定位不参与行高计算。
  // 已激活的隐藏/锁定开关常驻可见，作为行级状态指示。
  const actions = ownerDocument.createElement('span');
  actions.className = 'layer-actions';
  actions.appendChild(locateButton(ownerDocument, item));
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
  actions.appendChild(moveButton(ownerDocument, item.id, 'up', canMove('up')));
  actions.appendChild(moveButton(ownerDocument, item.id, 'down', canMove('down')));
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

function locateButton(ownerDocument: Document, item: DesignerLayerItem): HTMLButtonElement {
  const control = button(ownerDocument, '', DESIGNER_UI_TEXT.layersPanel.locate(item.name));
  control.dataset.layerLocate = item.id;
  control.innerHTML = designerIcon('locate');
  return control;
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
  return createDesignerButton(ownerDocument, { ariaLabel: label, text });
}
