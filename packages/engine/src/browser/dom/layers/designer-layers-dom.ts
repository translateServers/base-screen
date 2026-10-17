import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { createDesignerButton } from '../designer-ui-primitives.js';
import {
  type DesignerLayerItem,
  type DesignerLayersRenderOptions,
  type DesignerLayerView,
  filterDesignerLayerItems,
} from './designer-layers-model.js';

export * from './designer-layers-model.js';

export function renderDesignerLayers(
  layers: HTMLElement,
  view: DesignerLayerView,
  options: DesignerLayersRenderOptions,
): void {
  layers.replaceChildren();
  const heading = layers.ownerDocument.createElement('p');
  heading.className = 'list-heading';
  heading.textContent = DESIGNER_UI_TEXT.layersPanel.heading;
  layers.appendChild(heading);

  // 搜索是长文档的刚需；保留为紧凑单行，不恢复原型的工具栏/操作簇。
  const searchControl = layers.ownerDocument.createElement('label');
  searchControl.className = 'layer-search';
  const searchGlyph = layers.ownerDocument.createElement('span');
  searchGlyph.className = 'layer-search-glyph';
  searchGlyph.setAttribute('aria-hidden', 'true');
  searchGlyph.innerHTML = designerIcon('search');
  searchControl.appendChild(searchGlyph);
  const searchInput = layers.ownerDocument.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'designer-control designer-input';
  searchInput.value = options.search;
  searchInput.placeholder = DESIGNER_UI_TEXT.layersPanel.searchPlaceholder;
  searchInput.ariaLabel = DESIGNER_UI_TEXT.layersPanel.searchLabel;
  searchInput.dataset.layerSearch = 'true';
  searchControl.appendChild(searchInput);
  layers.appendChild(searchControl);

  const tree = layers.ownerDocument.createElement('div');
  tree.setAttribute('role', 'tree');
  tree.ariaLabel = DESIGNER_UI_TEXT.layersPanel.aria;
  tree.dataset.layerRoot = 'true';
  const visible = filterDesignerLayerItems(view.items, options.search, options.collapsed);
  const indicator = options.dropIndicator;
  for (const item of visible.slice(0, options.renderLimit)) {
    tree.appendChild(
      createLayerNode(
        layers.ownerDocument,
        item,
        options.interaction.selectedComponentIds.includes(item.id),
        item.id === options.interaction.focusedComponentId,
        options.collapsed.has(item.id),
        item.id === indicator?.rowId ? indicator.edge : undefined,
        item.id === options.draggingId,
        item.id === options.renamingId,
        options.renameDrafts.get(item.id),
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
  dropEdge: 'before' | 'after' | 'inside' | undefined,
  dragging: boolean,
  renaming: boolean,
  renameDraft: string | undefined,
): HTMLElement {
  const row = ownerDocument.createElement('div');
  row.className = 'layer-row';
  // 20px 缩进单位：padding 与引导线（CSS --layer-depth 驱动）共享同一基准。
  row.style.paddingInlineStart = `${item.depth * 20}px`;
  row.style.setProperty('--layer-depth', String(item.depth));
  row.style.setProperty('--layer-hue', String(layerHue(item.type)));
  row.setAttribute('role', 'treeitem');
  row.ariaLevel = String(item.depth + 1);
  row.ariaSelected = String(selected);
  row.dataset.layerId = item.id;
  // 拖拽落点换算需要行所属父级与物料类型：父级决定兄弟序列，类型决定能否接收子图层。
  row.dataset.layerParent = item.parentId ?? '';
  row.dataset.layerType = item.type;
  // 锁定只约束画布变换、拖拽与重命名；图层树仍需允许选中，以便查看并解除锁定。
  const selectable = !item.hidden;
  if (selectable) row.dataset.layerSelectable = 'true';
  if (item.hidden) row.dataset.hidden = 'true';
  if (item.locked) row.dataset.locked = 'true';
  // 整行即拖拽把手：行上的名称区、图标、缩进留白都可以起手，只排除按钮类控件
  // （折叠、锁、显隐、重命名输入），它们各自有自己的语义。
  row.draggable = selectable && !item.locked;
  if (focused) row.ariaCurrent = 'true';
  if (dropEdge !== undefined) row.dataset.dropTarget = dropEdge;
  if (dragging) row.dataset.dragging = 'true';
  if (renaming) row.dataset.renaming = 'true';

  // 状态不渲染可见芯片：隐藏/锁定由常驻的警示色开关图标（aria-pressed）与名称压暗表达，
  // 选中/焦点/放置目标由行背景、左侧 accent 条与指示线表达；完整状态保留于 aria-description。
  const states = layerStateLabels(item, selected, focused, dropEdge);
  if (states.length > 0)
    row.setAttribute('aria-description', states.map((state) => state.label).join('，'));

  // 首列：只有分组行有折叠箭头；叶子行不再渲染拖拽把手——整行即可起手拖拽，
  // 少一个装饰位，名称也就多了 16px 的可用宽度。
  if (item.hasChildren) {
    row.dataset.layerGroup = 'true';
    const collapse = button(
      ownerDocument,
      '',
      collapsed
        ? DESIGNER_UI_TEXT.layersPanel.expandChildren
        : DESIGNER_UI_TEXT.layersPanel.collapseChildren,
    );
    collapse.className += ' layer-collapse';
    collapse.dataset.layerCollapse = item.id;
    collapse.ariaExpanded = String(!collapsed);
    collapse.innerHTML = designerIcon(collapsed ? 'chevron-right' : 'chevron-down');
    row.appendChild(collapse);
  }

  const select = button(ownerDocument, '', DESIGNER_UI_TEXT.layersPanel.selectLayer(item.name));
  select.dataset.layerSelect = item.id;
  // 保留按钮基础类：字体/颜色/光标/焦点环由 .designer-control/.designer-button 提供，
  // .layer-select 只覆盖几何与绘制，否则名称会退化为 UA 默认字体与颜色。
  select.className = 'designer-control designer-button layer-select';
  select.disabled = !selectable;
  select.setAttribute('data-tip', DESIGNER_UI_TEXT.layersPanel.renameHint);
  // 行首类型图标：与物料库同一派生规则，并沿用素材表色相，库与图层同色。
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'layer-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon(item.icon ?? 'grid');
  select.appendChild(glyph);
  // 双行正文：名称在上，`类型 · 宽 × 高` 读数在下（对齐工作台原型的 layer-copy）。
  // 按钮已有显式 aria-label，副行文本不进入可访问名称。
  const copy = ownerDocument.createElement('span');
  copy.className = 'layer-copy';
  const name = ownerDocument.createElement('span');
  name.className = 'layer-name';
  name.textContent = item.name;
  const meta = ownerDocument.createElement('span');
  meta.className = 'layer-meta';
  meta.setAttribute('aria-hidden', 'true');
  meta.textContent = `${item.type} · ${item.width} × ${item.height}`;
  copy.appendChild(name);
  copy.appendChild(meta);
  select.appendChild(copy);
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

  // 行级状态开关：锁在常态隐藏、悬停/聚焦或已锁定时露出；可见性开关常驻。
  row.appendChild(layerButton(ownerDocument, item, 'locked'));
  row.appendChild(layerButton(ownerDocument, item, 'hidden'));

  if (item.missingMaterial) {
    const diagnostic = ownerDocument.createElement('span');
    diagnostic.className = 'layer-diagnostic';
    diagnostic.setAttribute('role', 'status');
    diagnostic.textContent = DESIGNER_UI_TEXT.layersPanel.missingMaterial(item.type);
    row.appendChild(diagnostic);
  }
  return row;
}

function layerStateLabels(
  item: DesignerLayerItem,
  selected: boolean,
  focused: boolean,
  dropEdge: 'before' | 'after' | 'inside' | undefined,
): readonly { readonly key: string; readonly label: string }[] {
  return [
    ...(item.hidden ? [{ key: 'hidden', label: DESIGNER_UI_TEXT.layersPanel.hidden }] : []),
    ...(item.locked ? [{ key: 'locked', label: DESIGNER_UI_TEXT.layersPanel.locked }] : []),
    ...(selected ? [{ key: 'selected', label: DESIGNER_UI_TEXT.layersPanel.selected }] : []),
    ...(focused ? [{ key: 'focused', label: DESIGNER_UI_TEXT.layersPanel.focused }] : []),
    ...(dropEdge !== undefined
      ? [{ key: 'dropTarget', label: DESIGNER_UI_TEXT.layersPanel.dropTarget }]
      : []),
  ];
}

/**
 * 图层行的类型色相：与素材卡同一“每类一色”的语言，由 type 稳定派生（同一物料永远同色），
 * 不引入第二张需要跟物料表同步的颜色表。
 */
function layerHue(type: string): number {
  let hash = 0;
  for (let index = 0; index < type.length; index += 1) {
    hash = (hash * 31 + type.charCodeAt(index)) % 360;
  }
  return hash;
}

function layerButton(
  ownerDocument: Document,
  item: DesignerLayerItem,
  property: 'hidden' | 'locked',
): HTMLButtonElement {
  const label =
    property === 'hidden'
      ? item.hidden
        ? DESIGNER_UI_TEXT.layersPanel.show
        : DESIGNER_UI_TEXT.layersPanel.hide
      : item.locked
        ? DESIGNER_UI_TEXT.layersPanel.unlock
        : DESIGNER_UI_TEXT.layersPanel.lock;
  const control = button(ownerDocument, '', `${label} ${item.name}`);
  control.className += property === 'hidden' ? ' layer-eye' : ' layer-lock';
  control.dataset.layerToggle = property;
  control.dataset.layerId = item.id;
  control.ariaPressed = String(property === 'hidden' ? item.hidden : item.locked);
  control.innerHTML = designerIcon(
    property === 'hidden' ? (item.hidden ? 'eye-off' : 'eye') : 'lock',
  );
  return control;
}

function button(ownerDocument: Document, text: string, label: string): HTMLButtonElement {
  return createDesignerButton(ownerDocument, { ariaLabel: label, text });
}
