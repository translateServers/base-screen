import type { ScreenDocument } from '@base-screen/contracts';
import type { DesignerBlueprintLibraryEntry } from '../../../common/operations/blueprint/designer-blueprint-model.js';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNodeKind,
  BaseScreenBlueprintCanvasSelection,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelGroupSupportsMode,
} from '../../../common/operations/workbench/designer-left-panel-groups.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../dom/designer-icons.js';
import {
  blueprintHostLeftPanelTabId,
  hostLeftPanelGroupId,
  hostLeftPanelPanelId,
  hostLeftPanelTab,
} from '../designer-left-panel-groups-dom.js';
import { escapeAttribute, escapeHtml } from './designer-blueprint-dom-helpers.js';

export type DesignerBlueprintLibraryBuiltinTab = 'components' | 'relations' | 'variables';
export type DesignerBlueprintLibraryTab = DesignerBlueprintLibraryBuiltinTab | `host:${string}`;

const LIBRARY_TABS: readonly DesignerBlueprintLibraryBuiltinTab[] = [
  'components',
  'relations',
  'variables',
];

/** 「功能节点」分组里可直接加入的节点种类（组件 / 变量从各自分组加入）。 */
const FUNCTION_NODE_KINDS: readonly Exclude<
  BaseScreenBlueprintCanvasNodeKind,
  'component' | 'variable' | 'sub-canvas' | 'main-canvas'
>[] = ['lifecycle', 'timer', 'condition', 'host'];

const TEXT = DESIGNER_UI_TEXT.blueprint;

export interface DesignerBlueprintLibraryModel {
  readonly document: ScreenDocument | undefined;
  readonly graph: BaseScreenBlueprintCanvasGraph;
  readonly components: readonly DesignerBlueprintLibraryEntry[];
  readonly variables: readonly DesignerBlueprintLibraryEntry[];
  readonly selection: BaseScreenBlueprintCanvasSelection;
  readonly query: string;
  readonly activeTab: DesignerBlueprintLibraryTab;
  readonly groups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
}

/**
 * 左侧「蓝图节点库」（布局沿用设计器左栏：竖向页签 + 搜索 + 列表）。
 * 组件 / 变量条目单击加入或定位、可拖入画布；功能节点条目单击在视口中心新建；
 * 「关系」页签同时列出全部连线，单击选中并定位。
 */
export function renderDesignerBlueprintLibrary(
  container: HTMLElement | undefined,
  model: DesignerBlueprintLibraryModel,
): void {
  if (container === undefined) return;
  const hostGroups = (model.groups ?? []).filter((group) =>
    baseScreenDesignerLeftPanelGroupSupportsMode(group, 'blueprint'),
  );
  const requestedHostGroupId = hostLeftPanelGroupId(model.activeTab);
  const activeHostGroupId = hostGroups.some((group) => group.id === requestedHostGroupId)
    ? requestedHostGroupId
    : undefined;
  const activeBuiltinTab = isDesignerBlueprintLibraryBuiltinTab(model.activeTab)
    ? model.activeTab
    : 'components';
  const resolvedActiveTab =
    activeHostGroupId === undefined ? activeBuiltinTab : hostLeftPanelTab(activeHostGroupId);
  const placeholder =
    activeBuiltinTab === 'relations' ? TEXT.relationList.search : TEXT.librarySearch;
  container.innerHTML = `<div class="blueprint-library-shell">
    <nav class="rail-tabs blueprint-library-rail" role="tablist" aria-orientation="vertical" aria-label="${TEXT.library}">
      ${LIBRARY_TABS.map((tab) => libraryTab(tab, resolvedActiveTab)).join('')}
      ${hostGroups.map((group) => hostLibraryTab(group, activeHostGroupId)).join('')}
    </nav>
    <section class="rail-view blueprint-library-main"${activeHostGroupId === undefined ? '' : ' hidden'}>
      <div class="layer-panel-controls blueprint-library-controls">
        <label class="designer-field layer-search blueprint-library-search">
          <span class="layer-search-glyph" aria-hidden="true">${designerIcon('search')}</span>
          <input type="search" class="designer-control designer-input" data-blueprint-library-search value="${escapeAttribute(model.query)}" placeholder="${placeholder}" aria-label="${placeholder}">
        </label>
      </div>
      <div class="blueprint-panel-scroll" id="designer-blueprint-library-${activeBuiltinTab}-panel" role="tabpanel" aria-labelledby="designer-blueprint-library-${activeBuiltinTab}-tab" tabindex="0">
        ${libraryPane(activeBuiltinTab, model)}
      </div>
    </section>
  </div>`;
}

function libraryPane(
  activeTab: DesignerBlueprintLibraryBuiltinTab,
  model: DesignerBlueprintLibraryModel,
): string {
  const query = model.query.trim().toLocaleLowerCase();
  if (activeTab === 'components') {
    return entityPane(model.components, model.selection, query, TEXT.layers, TEXT.noComponentNodes);
  }
  if (activeTab === 'variables') {
    return entityPane(
      model.variables,
      model.selection,
      query,
      TEXT.globalVariables,
      TEXT.noVariables,
    );
  }
  return functionPane(model, query);
}

function entityPane(
  entries: readonly DesignerBlueprintLibraryEntry[],
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
  title: string,
  empty: string,
): string {
  const visible = entries.filter(
    (entry) =>
      query.length === 0 ||
      `${entry.name} ${entry.entityId} ${entry.subtitle}`.toLocaleLowerCase().includes(query),
  );
  if (visible.length === 0) return emptyState(empty);
  return `<section class="blueprint-palette-group" aria-label="${escapeAttribute(title)}">
    <header><strong>${escapeHtml(title)}</strong><span>${visible.length}</span></header>
    <div class="blueprint-palette-list">
      ${visible.map((entry) => entityItem(entry, selection)).join('')}
    </div>
    <p class="blueprint-library-hint">${TEXT.componentNodeHint}</p>
  </section>`;
}

function entityItem(
  entry: DesignerBlueprintLibraryEntry,
  selection: BaseScreenBlueprintCanvasSelection,
): string {
  const placed = entry.nodeId !== undefined;
  const selected = placed && selection.nodes.includes(entry.nodeId ?? '');
  const isComponent = entry.kind === 'component';
  const action = placed
    ? `data-blueprint-select-node="${escapeAttribute(entry.nodeId ?? '')}"`
    : isComponent
      ? `data-blueprint-add-component="${escapeAttribute(entry.entityId)}"`
      : `data-blueprint-add-variable="${escapeAttribute(entry.entityId)}"`;
  const label = placed
    ? isComponent
      ? TEXT.locateComponent(entry.name)
      : TEXT.locateVariable(entry.name)
    : isComponent
      ? TEXT.addComponent(entry.name)
      : TEXT.addVariableNode(entry.name);
  const drag = placed
    ? ''
    : ` draggable="true" data-blueprint-drag-kind="${entry.kind}" data-${isComponent ? 'component' : 'variable'}-id="${escapeAttribute(entry.entityId)}" data-blueprint-drag-label="${escapeAttribute(entry.name)}"`;
  const icon: DesignerIconName = isComponent ? 'layers' : 'variable';
  const detail = isComponent ? TEXT.componentEventCount(entry.eventCount) : entry.subtitle;
  return `<div class="designer-list-row blueprint-palette-item" data-density="default" data-depth="${entry.depth}" style="--bp-indent: ${entry.depth * 16}px" data-placed="${String(placed)}" data-selected="${String(selected)}" data-node-kind="${entry.kind}"${drag}>
    <button type="button" class="blueprint-palette-primary" ${action} aria-label="${escapeAttribute(label)}" data-tip="${escapeAttribute(label)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon(icon)}</span>
      <span class="blueprint-palette-copy"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(detail)}</small></span>
      <span class="blueprint-palette-state" aria-hidden="true">${placed ? designerIcon('check') : designerIcon('plus')}</span>
    </button>
  </div>`;
}

function functionPane(model: DesignerBlueprintLibraryModel, query: string): string {
  const graphText = TEXT.graph;
  const singletons = new Set(
    model.graph.nodes
      .filter((node) => node.kind === 'host' || node.kind === 'lifecycle')
      .map((node) => node.kind),
  );
  const kinds = FUNCTION_NODE_KINDS.filter(
    (kind) =>
      query.length === 0 ||
      `${graphText.nodeKinds[kind]} ${graphText.nodeKindHints[kind]} ${kind}`
        .toLocaleLowerCase()
        .includes(query),
  );
  const items = kinds
    .map((kind) => {
      const existing =
        kind === 'host' || kind === 'lifecycle'
          ? model.graph.nodes.find((node) => node.kind === kind)
          : undefined;
      const placed = singletons.has(kind);
      const action =
        existing !== undefined
          ? `data-blueprint-select-node="${escapeAttribute(existing.id)}"`
          : `data-blueprint-insert-node="${kind}"`;
      const label = TEXT.addLogicNode(graphText.nodeKinds[kind]);
      const icon: DesignerIconName =
        kind === 'timer'
          ? 'activity'
          : kind === 'condition'
            ? 'sliders'
            : kind === 'host'
              ? 'terminal'
              : 'play';
      return `<div class="designer-list-row blueprint-palette-item" data-density="default" data-placed="${String(placed)}" data-node-kind="${kind}"${placed ? '' : ` draggable="true" data-blueprint-drag-kind="${kind}" data-blueprint-drag-label="${escapeAttribute(graphText.nodeKinds[kind])}"`}>
        <button type="button" class="blueprint-palette-primary" ${action} aria-label="${escapeAttribute(label)}" data-tip="${escapeAttribute(label)}">
          <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon(icon)}</span>
          <span class="blueprint-palette-copy"><strong>${escapeHtml(graphText.nodeKinds[kind])}</strong><small>${escapeHtml(graphText.nodeKindHints[kind])}</small></span>
          <span class="blueprint-palette-state" aria-hidden="true">${placed ? designerIcon('check') : designerIcon('plus')}</span>
        </button>
      </div>`;
    })
    .join('');
  const titles = new Map(model.graph.nodes.map((node) => [node.id, node.title]));
  const edges = model.graph.edges.filter((edge) => {
    if (query.length === 0) return true;
    return `${titles.get(edge.source) ?? ''} ${titles.get(edge.target) ?? ''} ${edge.label} ${edge.sourcePort} ${edge.targetPort}`
      .toLocaleLowerCase()
      .includes(query);
  });
  const edgeItems = edges
    .map((edge) => {
      const selected = model.selection.edges.includes(edge.id);
      const text = `${titles.get(edge.source) ?? edge.source} → ${titles.get(edge.target) ?? edge.target}`;
      return `<div class="designer-list-row blueprint-relation-item" data-density="default" data-selected="${String(selected)}" data-category="${edge.category}" data-active="${String(edge.active)}">
        <button type="button" class="blueprint-palette-primary" data-blueprint-select-edge="${escapeAttribute(edge.id)}" aria-label="${escapeAttribute(text)}">
          <span class="blueprint-relation-swatch" aria-hidden="true"></span>
          <span class="blueprint-palette-copy"><strong>${escapeHtml(text)}</strong><small>${escapeHtml(`${graphText.edgeCategories[edge.category]} · ${edge.label}`)}</small></span>
        </button>
      </div>`;
    })
    .join('');
  return `<section class="blueprint-palette-group" aria-label="${TEXT.logic}">
      <header><strong>${TEXT.logic}</strong><span>${kinds.length}</span></header>
      <div class="blueprint-palette-list">${items || emptyState(TEXT.noLogicNodes)}</div>
      <p class="blueprint-library-hint">${TEXT.directNodeHint}</p>
    </section>
    ${canvasGroup(model, query)}
    <section class="blueprint-palette-group" aria-label="${TEXT.graph.edgeList}">
      <header><strong>${TEXT.graph.edgeList}</strong><span>${edges.length}</span></header>
      <div class="blueprint-palette-list">${edgeItems || emptyState(graphText.noEdges)}</div>
    </section>`;
}

/**
 * 画布节点（ADR-0109）：主画布（页面导航，单例）与每个从画布各一个条目；未加入时单击加入、可拖入，
 * 已加入时定位。主画布条目只在文档有页面时出现。
 */
function canvasGroup(model: DesignerBlueprintLibraryModel, query: string): string {
  const subCanvases = model.document?.subCanvases ?? [];
  const hasPages = subCanvases.some((canvas) => canvas.display === 'page');
  const entries: {
    readonly id: string;
    readonly name: string;
    readonly detail: string;
    readonly icon: 'grid' | 'doc' | 'copy';
    readonly kind: 'main-canvas' | 'sub-canvas';
  }[] = [
    ...(hasPages
      ? [
          {
            id: '',
            name: TEXT.graph.nodeKinds['main-canvas'],
            detail: TEXT.mainCanvasEntry,
            icon: 'grid' as const,
            kind: 'main-canvas' as const,
          },
        ]
      : []),
    ...subCanvases.map((canvas) => ({
      id: canvas.id,
      name: canvas.name,
      detail:
        canvas.display === 'page'
          ? TEXT.pageSize
          : `${TEXT.graph.subCanvasKinds.popup} · ${TEXT.popupSize(canvas.width, canvas.height)}`,
      icon: canvas.display === 'page' ? ('doc' as const) : ('copy' as const),
      kind: 'sub-canvas' as const,
    })),
  ].filter(
    (entry) =>
      query.length === 0 || `${entry.name} ${entry.id}`.toLocaleLowerCase().includes(query),
  );
  const items = entries
    .map((entry) => {
      const node = model.graph.nodes.find((candidate) =>
        entry.kind === 'main-canvas'
          ? candidate.kind === 'main-canvas'
          : candidate.kind === 'sub-canvas' && candidate.canvasId === entry.id,
      );
      const placed = node !== undefined;
      const selected = placed && model.selection.nodes.includes(node.id);
      const action = placed
        ? `data-blueprint-select-node="${escapeAttribute(node.id)}"`
        : `data-blueprint-add-canvas="${escapeAttribute(entry.id)}"`;
      const label = placed ? TEXT.locateCanvas(entry.name) : TEXT.addCanvasNode(entry.name);
      const drag = placed
        ? ''
        : ` draggable="true" data-blueprint-drag-kind="${entry.kind}"${entry.kind === 'sub-canvas' ? ` data-canvas-id="${escapeAttribute(entry.id)}"` : ''} data-blueprint-drag-label="${escapeAttribute(entry.name)}"`;
      return `<div class="designer-list-row blueprint-palette-item" data-density="default" data-placed="${String(placed)}" data-selected="${String(selected)}" data-node-kind="${entry.kind}"${drag}>
        <button type="button" class="blueprint-palette-primary" ${action} aria-label="${escapeAttribute(label)}" data-tip="${escapeAttribute(label)}">
          <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon(entry.icon)}</span>
          <span class="blueprint-palette-copy"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.detail)}</small></span>
          <span class="blueprint-palette-state" aria-hidden="true">${placed ? designerIcon('check') : designerIcon('plus')}</span>
        </button>
      </div>`;
    })
    .join('');
  return `<section class="blueprint-palette-group" aria-label="${TEXT.canvases}">
      <header><strong>${TEXT.canvases}</strong><span>${entries.length}</span></header>
      <div class="blueprint-palette-list">${items || emptyState(TEXT.noSubCanvases)}</div>
    </section>`;
}

function libraryTab(
  tab: DesignerBlueprintLibraryBuiltinTab,
  activeTab: DesignerBlueprintLibraryTab,
): string {
  const visibleLabel = TEXT.libraryTabs[tab];
  const label =
    tab === 'components' ? TEXT.layers : tab === 'relations' ? TEXT.logic : TEXT.globalVariables;
  const icon: DesignerIconName =
    tab === 'components' ? 'layers' : tab === 'relations' ? 'link' : 'variable';
  return `<button type="button" class="designer-tab blueprint-library-rail-tab" id="designer-blueprint-library-${tab}-tab" role="tab" aria-controls="designer-blueprint-library-${tab}-panel" aria-selected="${String(tab === activeTab)}" tabindex="${tab === activeTab ? 0 : -1}" data-blueprint-library-tab="${tab}" data-tip="${label}" aria-label="${label}"><span class="rail-tab-glyph" aria-hidden="true">${designerIcon(icon)}</span><span class="rail-tab-label">${visibleLabel}</span></button>`;
}

function hostLibraryTab(
  group: BaseScreenDesignerLeftPanelGroup,
  activeGroupId: string | undefined,
): string {
  const active = group.id === activeGroupId;
  const tab = hostLeftPanelTab(group.id);
  const label = escapeAttribute(group.label);
  return `<button type="button" class="designer-tab blueprint-library-rail-tab" id="${blueprintHostLeftPanelTabId(group.id)}" role="tab" aria-controls="${hostLeftPanelPanelId(group.id)}" aria-selected="${String(active)}" tabindex="${active ? 0 : -1}" data-blueprint-library-tab="${tab}" data-host-left-panel-group="${escapeAttribute(group.id)}" data-host-left-panel-mode="blueprint" data-tip="${label}" aria-label="${label}"><span class="rail-tab-glyph" aria-hidden="true">${designerIcon(group.icon ?? 'shapes')}</span><span class="rail-tab-label">${escapeHtml(group.label)}</span></button>`;
}

export function isDesignerBlueprintLibraryBuiltinTab(
  value: string,
): value is DesignerBlueprintLibraryBuiltinTab {
  return value === 'components' || value === 'relations' || value === 'variables';
}

function emptyState(message: string): string {
  return `<div class="designer-empty"><span class="designer-empty-icon" aria-hidden="true">${designerIcon('search')}</span><p class="designer-empty-title">${message}</p></div>`;
}
