import type {
  BaseScreenPluginDesignSnapshot,
  BaseScreenPluginPanelCatalogEntry,
  BaseScreenPluginPanelElement,
} from '@base-screen/plugin-core';
import { BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT } from '@base-screen/plugin-core';
import { designerIcon } from '../../dom/designer-icons.js';
import { createDesignerTabButton } from '../designer-ui-primitives.js';

const PLUGIN_TAB_PREFIX = 'plugin:';

export function pluginPanelTab(panelId: string): `plugin:${string}` {
  return `${PLUGIN_TAB_PREFIX}${panelId}`;
}

export function pluginPanelGroupId(tab: string): string | undefined {
  return tab.startsWith(PLUGIN_TAB_PREFIX) ? tab.slice(PLUGIN_TAB_PREFIX.length) : undefined;
}

export function pluginPanelTabId(panelId: string): string {
  return `designer-plugin-${panelId}-tab`;
}

export function pluginPanelViewId(panelId: string): string {
  return `designer-plugin-${panelId}-view`;
}

/**
 * 以 append-only 方式把插件面板挂到左栏，复用宿主分组已有的 tab/tabpanel 结构。
 * 已存在的面板只同步标题、不重建元素：面板可能持有自己的展开态或滚动位置。
 * 图标不在 panel 贡献契约内，暂用内建 sliders 字形。
 */
export function renderDesignerPluginPanels(
  root: HTMLElement,
  entries: readonly BaseScreenPluginPanelCatalogEntry[],
  onAction: (panelId: string, detail: unknown) => void,
): void {
  const tabs = root.querySelector<HTMLElement>('.rail-tabs');
  const rail = root.querySelector<HTMLElement>('[data-left-panel]');
  if (tabs === null || rail === null) return;
  const wanted = new Map(entries.map((entry) => [entry.contribution.id, entry]));

  for (const stale of root.querySelectorAll<HTMLElement>('[data-plugin-panel-view]')) {
    if (!wanted.has(stale.dataset.pluginPanelView ?? '')) stale.remove();
  }
  for (const stale of root.querySelectorAll<HTMLElement>('button[data-plugin-panel-tab]')) {
    if (!wanted.has(stale.dataset.pluginPanelTab ?? '')) stale.remove();
  }

  for (const entry of entries) {
    const existingTab = findTab(root, entry.contribution.id);
    if (existingTab !== undefined) {
      syncPanelTab(existingTab, entry);
      continue;
    }
    const view = createPanelView(root, entry.contribution.id);
    const tab = createPanelTab(root, entry);
    tab.setAttribute('aria-controls', view.id);
    view.setAttribute('aria-labelledby', tab.id);
    tab.append(panelGlyph(root), panelLabel(root, entry.contribution.name));
    view.append(createPanelElement(entry, onAction));
    tabs.append(tab);
    rail.append(view);
  }
  // 宿主分组每次渲染都移除再追加自己的 tab，会把先挂上的面板挤到前面，静默改变键盘导航
  // 顺序。这里保证面板占据容器末尾；只在真的被挤开时移动，避免高频路径反复 disconnect/connect。
  keepTrailing(tabs, 'button[data-plugin-panel-tab]');
  keepTrailing(rail, '[data-plugin-panel-view]');
}

function keepTrailing(container: HTMLElement, selector: string): void {
  const own = Array.from(container.querySelectorAll<HTMLElement>(`:scope > ${selector}`));
  if (own.length === 0) return;
  const children = Array.from(container.children);
  const start = children.length - own.length;
  if (own.every((node, index) => children[start + index] === node)) return;
  for (const node of own) container.append(node);
}

/**
 * 只在文档代际或选区真的变化时写 model。model 每次都是新的冻结快照，因此用外部传入的 key
 * 去重，避免 hover、拖动预览等高频渲染路径反复触发面板重绘造成抖动。
 */
export function updateDesignerPluginPanelModels(
  root: HTMLElement,
  model: BaseScreenPluginDesignSnapshot | undefined,
  key: string,
): void {
  if (model === undefined) return;
  for (const element of root.querySelectorAll<BaseScreenPluginPanelElement>(
    '[data-plugin-panel]',
  )) {
    if (modelKeys.get(element) === key) continue;
    element.model = model;
    modelKeys.set(element, key);
  }
}

const modelKeys = new WeakMap<BaseScreenPluginPanelElement, string>();

function findTab(root: HTMLElement, panelId: string): HTMLButtonElement | undefined {
  for (const tab of root.querySelectorAll<HTMLButtonElement>('button[data-plugin-panel-tab]')) {
    if (tab.dataset.pluginPanelTab === panelId) return tab;
  }
  return undefined;
}

function syncPanelTab(tab: HTMLButtonElement, entry: BaseScreenPluginPanelCatalogEntry): void {
  tab.dataset.panelLabel = entry.contribution.name;
  tab.setAttribute('data-tip', entry.contribution.name);
  const label = tab.querySelector<HTMLElement>('.rail-tab-label');
  if (label !== null) label.textContent = entry.contribution.name;
}

function createPanelTab(
  root: HTMLElement,
  entry: BaseScreenPluginPanelCatalogEntry,
): HTMLButtonElement {
  const panelId = entry.contribution.id;
  const tab = createDesignerTabButton(root.ownerDocument, {
    label: '',
    tip: entry.contribution.name,
    value: panelId,
  });
  tab.id = pluginPanelTabId(panelId);
  tab.dataset.panelTab = pluginPanelTab(panelId);
  tab.dataset.panelLabel = entry.contribution.name;
  tab.dataset.pluginPanelTab = panelId;
  return tab;
}

function createPanelView(root: HTMLElement, panelId: string): HTMLElement {
  const view = root.ownerDocument.createElement('div');
  view.className = 'rail-view designer-plugin-panel-view';
  view.id = pluginPanelViewId(panelId);
  view.setAttribute('role', 'tabpanel');
  view.dataset.pluginPanelView = panelId;
  view.hidden = true;
  return view;
}

function createPanelElement(
  entry: BaseScreenPluginPanelCatalogEntry,
  onAction: (panelId: string, detail: unknown) => void,
): BaseScreenPluginPanelElement {
  const panelId = entry.contribution.id;
  const element = new entry.constructor();
  element.dataset.pluginPanel = panelId;
  element.dataset.pluginPanelOwner = entry.pluginId;
  // 监听器按元素绑定，归属面板 id 因此是已知的：detail 里冒充别的面板不会得到更高权限。
  element.addEventListener(BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT, (event) => {
    onAction(panelId, (event as CustomEvent).detail);
  });
  return element;
}

function panelGlyph(root: HTMLElement): HTMLElement {
  const glyph = root.ownerDocument.createElement('span');
  glyph.className = 'rail-tab-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  // designerIcon 只接受本模块内置的图标键，取值为编译期字面量，不含任何外部数据。
  glyph.innerHTML = designerIcon('sliders');
  return glyph;
}

function panelLabel(root: HTMLElement, name: string): HTMLElement {
  const label = root.ownerDocument.createElement('span');
  label.className = 'rail-tab-label';
  label.textContent = name;
  return label;
}
