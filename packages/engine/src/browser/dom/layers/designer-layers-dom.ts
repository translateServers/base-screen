import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { designerIcon } from '../../ui/designer-icons.js';
import { createDesignerButton, createDesignerInput } from '../designer-ui-primitives.js';
import {
  type DesignerLayerItem,
  type DesignerLayersRenderOptions,
  type DesignerLayerView,
  filterDesignerLayerItems,
} from './designer-layers-model.js';
import {
  applyDesignerLayerToolbarState,
  createDesignerLayerToolbar,
  type DesignerLayerToolbarState,
} from './designer-layers-toolbar-dom.js';

export * from './designer-layers-model.js';

export function renderDesignerLayers(
  layers: HTMLElement,
  view: DesignerLayerView,
  options: DesignerLayersRenderOptions,
): void {
  // 标题、层级操作、搜索是常驻外壳：每次重渲染只替换树，搜索输入不因过滤结果重建而丢焦点/丢光标。
  const chrome = ensureLayerChrome(layers, options.toolbarState);
  applyDesignerLayerToolbarState(chrome.toolbar, options.toolbarState);
  if (chrome.input.value !== options.search) chrome.input.value = options.search;
  chrome.clear.hidden = options.search === '';

  const tree = chrome.tree;
  tree.replaceChildren();
  const visible = filterDesignerLayerItems(view.items, options.search, options.collapsed);
  const rendered = visible.slice(0, options.renderLimit);
  const selectedIds = new Set(options.interaction.selectedComponentIds);
  const indicator = options.dropIndicator;
  for (const [index, item] of rendered.entries()) {
    const selected = selectedIds.has(item.id);
    tree.appendChild(
      createLayerNode(layers.ownerDocument, item, {
        selected,
        // 相邻多选合并成一段：连续被选中的行只保留最上/最下的圆角，中间无缝相接。
        selectedRun: selected ? selectedRunAt(rendered, index, selectedIds) : undefined,
        focused: item.id === options.interaction.focusedComponentId,
        collapsed: options.collapsed.has(item.id),
        dropEdge: item.id === indicator?.rowId ? indicator.edge : undefined,
        dragging: item.id === options.draggingId,
        renaming: item.id === options.renamingId,
        renameDraft: options.renameDrafts.get(item.id),
        search: options.search,
      }),
    );
  }
  if (visible.length === 0) {
    tree.appendChild(createLayerEmptyState(layers.ownerDocument, options.search));
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
}

interface DesignerLayerChrome {
  readonly header: HTMLElement;
  readonly toolbar: HTMLElement;
  readonly search: HTMLElement;
  readonly input: HTMLInputElement;
  readonly clear: HTMLButtonElement;
  readonly tree: HTMLElement;
}

/** 面板外壳只在首次渲染时创建；后续渲染复用它，保证搜索输入与滚动位置连续。 */
function ensureLayerChrome(
  layers: HTMLElement,
  toolbarState: DesignerLayerToolbarState,
): DesignerLayerChrome {
  const ownerDocument = layers.ownerDocument;
  const existing = Array.from(layers.children ?? []) as HTMLElement[];
  const isClass = (element: HTMLElement, name: string): boolean =>
    typeof element.className === 'string' && element.className.split(' ').includes(name);
  const header =
    existing.find((element) => isClass(element, 'list-heading')) ??
    append(
      layers,
      (() => {
        const heading = ownerDocument.createElement('p');
        heading.className = 'list-heading';
        heading.textContent = DESIGNER_UI_TEXT.layersPanel.heading;
        return heading;
      })(),
    );
  // 层级操作条排在搜索之上：选中后先改层级、再找图层，与画布上的对象操作顺序一致。
  const toolbar =
    existing.find((element) => element.dataset.layerToolbar === 'true') ??
    append(layers, createDesignerLayerToolbar(ownerDocument, toolbarState));
  const search =
    existing.find((element) => isClass(element, 'layer-search')) ??
    append(layers, createSearchControl(ownerDocument));
  const tree =
    existing.find((element) => element.dataset.layerRoot === 'true') ??
    append(layers, createTreeRoot(ownerDocument));
  const input = search.children[1] as HTMLInputElement;
  const clear = search.children[2] as HTMLButtonElement;
  return { header, toolbar, search, input, clear, tree };
}

function append<T extends HTMLElement>(parent: HTMLElement, child: T): T {
  parent.appendChild(child);
  return child;
}

function createSearchControl(ownerDocument: Document): HTMLElement {
  const searchControl = ownerDocument.createElement('div');
  searchControl.className = 'layer-search';
  const searchGlyph = ownerDocument.createElement('span');
  searchGlyph.className = 'layer-search-glyph';
  searchGlyph.setAttribute('aria-hidden', 'true');
  searchGlyph.innerHTML = designerIcon('search');
  searchControl.appendChild(searchGlyph);
  const searchInput = createDesignerInput(ownerDocument, {
    type: 'search',
    placeholder: DESIGNER_UI_TEXT.layersPanel.searchPlaceholder,
    ariaLabel: DESIGNER_UI_TEXT.layersPanel.searchLabel,
  });
  searchInput.dataset.layerSearch = 'true';
  searchControl.appendChild(searchInput);
  const clear = createDesignerButton(ownerDocument, {
    ariaLabel: DESIGNER_UI_TEXT.layersPanel.clearSearch,
    className: 'designer-icon-button layer-search-clear',
    variant: 'ghost',
  });
  clear.dataset.layerSearchClear = 'true';
  clear.hidden = true;
  clear.innerHTML = designerIcon('close');
  searchControl.appendChild(clear);
  return searchControl;
}

function createTreeRoot(ownerDocument: Document): HTMLElement {
  const tree = ownerDocument.createElement('div');
  tree.setAttribute('role', 'tree');
  tree.ariaLabel = DESIGNER_UI_TEXT.layersPanel.aria;
  tree.dataset.layerRoot = 'true';
  return tree;
}

function createLayerEmptyState(ownerDocument: Document, search: string): HTMLElement {
  const query = search.trim();
  const empty = ownerDocument.createElement('div');
  empty.className = 'designer-empty-state layer-empty';
  empty.setAttribute('role', 'status');
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'layer-empty-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon(query === '' ? 'layers' : 'search');
  const title = ownerDocument.createElement('p');
  title.className = 'layer-empty-title';
  title.textContent =
    query === ''
      ? DESIGNER_UI_TEXT.layersPanel.empty
      : DESIGNER_UI_TEXT.layersPanel.emptySearch(query);
  const hint = ownerDocument.createElement('p');
  hint.className = 'layer-empty-hint';
  hint.textContent =
    query === ''
      ? DESIGNER_UI_TEXT.layersPanel.emptyHint
      : DESIGNER_UI_TEXT.layersPanel.emptySearchHint;
  empty.appendChild(glyph);
  empty.appendChild(title);
  empty.appendChild(hint);
  if (query !== '') {
    const reset = button(
      ownerDocument,
      DESIGNER_UI_TEXT.layersPanel.clearSearch,
      DESIGNER_UI_TEXT.layersPanel.clearSearch,
    );
    reset.className += ' layer-empty-reset';
    reset.dataset.layerSearchClear = 'true';
    empty.appendChild(reset);
  }
  return empty;
}

interface DesignerLayerNodeState {
  readonly selected: boolean;
  /** 相邻多选连段中的位置：undefined = 孤立选中（四角全圆），首/中/尾各自只保留一端圆角。 */
  readonly selectedRun: 'first' | 'middle' | 'last' | undefined;
  readonly focused: boolean;
  readonly collapsed: boolean;
  readonly dropEdge: 'before' | 'after' | 'inside' | undefined;
  readonly dragging: boolean;
  readonly renaming: boolean;
  readonly renameDraft: string | undefined;
  readonly search: string;
}

/** 选中连段判定只看屏幕上的相邻行：跨父级的相邻选中同样连成一块，与指针所见一致。 */
function selectedRunAt(
  items: readonly DesignerLayerItem[],
  index: number,
  selectedIds: ReadonlySet<string>,
): 'first' | 'middle' | 'last' | undefined {
  const previous = index > 0 && selectedIds.has(items[index - 1]!.id);
  const next = index + 1 < items.length && selectedIds.has(items[index + 1]!.id);
  if (previous && next) return 'middle';
  if (next) return 'first';
  if (previous) return 'last';
  return undefined;
}

function createLayerNode(
  ownerDocument: Document,
  item: DesignerLayerItem,
  state: DesignerLayerNodeState,
): HTMLElement {
  const {
    selected,
    selectedRun,
    focused,
    collapsed,
    dropEdge,
    dragging,
    renaming,
    renameDraft,
    search,
  } = state;
  const row = ownerDocument.createElement('div');
  row.className = 'layer-row';
  // 缩进模型：所有行都留出 18px 折叠位（叶子行留空），此后每级 16px。
  // 这样同一级的图标永远落在同一条竖线上，分组行不会比同级叶子行右移一格。
  row.style.paddingInlineStart = `${18 + item.depth * 16}px`;
  row.style.setProperty('--layer-depth', String(item.depth));
  row.style.setProperty('--layer-hue', String(layerHue(item.type)));
  if (item.depth > 0) row.dataset.layerNested = 'true';
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
  if (selectedRun !== undefined) row.dataset.layerSelectedRun = selectedRun;

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
  // 行首类型图标：与物料库同一派生规则，并沿用素材表色相，库与图层同色。
  const glyph = ownerDocument.createElement('span');
  glyph.className = 'layer-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = designerIcon(item.icon ?? 'grid');
  select.appendChild(glyph);
  // 双行正文：名称在上，`类型 · 宽 × 高` 读数在下。类型用物料清单的可读名称而不是
  // 技术 id；尺寸单独成段，空间不足时先压缩类型、保住尺寸读数。
  const copy = ownerDocument.createElement('span');
  copy.className = 'layer-copy';
  const name = ownerDocument.createElement('span');
  name.className = 'layer-name';
  appendSearchHighlight(ownerDocument, name, item.name, search);
  const meta = ownerDocument.createElement('span');
  meta.className = 'layer-meta';
  meta.setAttribute('aria-hidden', 'true');
  // 类型名与图层名相同时只说尺寸：重复一遍同一个词不增加信息，只增加噪音。
  const showType = item.typeLabel.trim() !== item.name.trim();
  if (showType) {
    const type = ownerDocument.createElement('span');
    type.className = 'layer-type';
    type.textContent = item.typeLabel;
    const separator = ownerDocument.createElement('span');
    separator.className = 'layer-separator';
    // 空格留在文本里：副行是纯文本读数（测试与读屏都按 `类型 · 宽 × 高` 读），不靠 CSS gap 拼。
    separator.textContent = ' · ';
    meta.appendChild(type);
    meta.appendChild(separator);
  }
  const size = ownerDocument.createElement('span');
  size.className = 'layer-size';
  size.textContent = `${item.width} × ${item.height}`;
  meta.appendChild(size);
  copy.appendChild(name);
  copy.appendChild(meta);
  select.appendChild(copy);
  row.appendChild(select);

  if (renaming) {
    const rename = createDesignerInput(ownerDocument, {
      value: renameDraft ?? item.name,
      ariaLabel: DESIGNER_UI_TEXT.layersPanel.rename(item.name),
      disabled: item.locked,
    });
    rename.dataset.layerRename = item.id;
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

/** 命中片段高亮：把查询词从名称里切出来包 <mark>，让用户在长列表里直接看到为何命中。 */
function appendSearchHighlight(
  ownerDocument: Document,
  target: HTMLElement,
  text: string,
  search: string,
): void {
  const needle = search.trim().toLowerCase();
  if (needle === '') {
    target.textContent = text;
    return;
  }
  const haystack = text.toLowerCase();
  let cursor = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    if (index > cursor) appendText(ownerDocument, target, text.slice(cursor, index));
    const mark = ownerDocument.createElement('mark');
    mark.className = 'layer-hit';
    mark.textContent = text.slice(index, index + needle.length);
    target.appendChild(mark);
    cursor = index + needle.length;
    index = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) appendText(ownerDocument, target, text.slice(cursor));
}

function appendText(ownerDocument: Document, target: HTMLElement, text: string): void {
  if (text === '') return;
  const span = ownerDocument.createElement('span');
  span.textContent = text;
  target.appendChild(span);
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
