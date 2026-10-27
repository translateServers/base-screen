import type { ScreenBlueprintRelation, ScreenDocument } from '@base-screen/contracts';
import { readScreenBlueprintRelationCategory } from '@base-screen/contracts';
import type {
  BaseScreenBlueprintCanvasEdge,
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type DesignerVariableView,
  readDesignerVariableViews,
} from '../../../common/operations/designer-variable-view.js';
import {
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelGroupSupportsMode,
} from '../../../common/operations/workbench/designer-left-panel-groups.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';
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

export function renderDesignerBlueprintLibrary(
  container: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  componentLibrary: readonly BaseScreenBlueprintCanvasNode[],
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
  activeTab: DesignerBlueprintLibraryTab,
  groups: readonly BaseScreenDesignerLeftPanelGroup[] | undefined,
): void {
  if (container === undefined) return;
  const hostGroups = (groups ?? []).filter((group) =>
    baseScreenDesignerLeftPanelGroupSupportsMode(group, 'blueprint'),
  );
  const requestedHostGroupId = hostLeftPanelGroupId(activeTab);
  const activeHostGroupId = hostGroups.some((group) => group.id === requestedHostGroupId)
    ? requestedHostGroupId
    : undefined;
  const activeBuiltinTab = isDesignerBlueprintLibraryBuiltinTab(activeTab)
    ? activeTab
    : 'components';
  const resolvedActiveTab =
    activeHostGroupId === undefined ? activeBuiltinTab : hostLeftPanelTab(activeHostGroupId);
  container.innerHTML = `<div class="blueprint-library-shell">
    <nav class="rail-tabs blueprint-library-rail" role="tablist" aria-orientation="vertical" aria-label="${DESIGNER_UI_TEXT.blueprint.library}">
      ${LIBRARY_TABS.map((tab) => libraryTab(tab, resolvedActiveTab)).join('')}
      ${hostGroups.map((group) => hostLibraryTab(group, activeHostGroupId)).join('')}
    </nav>
    <section class="rail-view blueprint-library-main"${activeHostGroupId === undefined ? '' : ' hidden'}>
      <div class="layer-panel-controls blueprint-library-controls">
        <label class="designer-field layer-search blueprint-library-search">
          <span class="layer-search-glyph" aria-hidden="true">${designerIcon('search')}</span>
          <input type="search" class="designer-control designer-input" data-blueprint-library-search value="${escapeAttribute(query)}" placeholder="${activeBuiltinTab === 'relations' ? DESIGNER_UI_TEXT.blueprint.relationList.search : DESIGNER_UI_TEXT.blueprint.librarySearch}" aria-label="${activeBuiltinTab === 'relations' ? DESIGNER_UI_TEXT.blueprint.relationList.search : DESIGNER_UI_TEXT.blueprint.librarySearch}">
        </label>
      </div>
      <div class="blueprint-panel-scroll" id="designer-blueprint-library-${activeBuiltinTab}-panel" role="tabpanel" aria-labelledby="designer-blueprint-library-${activeBuiltinTab}-tab" tabindex="0">
        ${libraryPane(activeBuiltinTab, document, graph, componentLibrary, selection, query)}
      </div>
    </section>
  </div>`;
}

function libraryPane(
  activeTab: DesignerBlueprintLibraryBuiltinTab,
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  componentLibrary: readonly BaseScreenBlueprintCanvasNode[],
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
): string {
  const normalized = query.trim().toLocaleLowerCase();
  if (activeTab === 'components') {
    return componentPane(graph, componentLibrary, selection, normalized);
  }
  if (activeTab === 'relations') return relationsPane(document, graph, selection, normalized);
  return variablePane(document, graph, selection, normalized);
}

function componentPane(
  graph: BaseScreenBlueprintCanvasGraph,
  componentLibrary: readonly BaseScreenBlueprintCanvasNode[],
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
): string {
  const placed = new Set(
    graph.nodes.filter((node) => node.kind === 'component').map((node) => node.id),
  );
  const components = componentLibrary.filter(
    (node) =>
      node.kind === 'component' &&
      (query.length === 0 ||
        `${node.componentName ?? ''} ${node.componentId ?? ''} ${node.materialType ?? ''}`
          .toLocaleLowerCase()
          .includes(query)),
  );
  if (components.length === 0) return emptyState(DESIGNER_UI_TEXT.blueprint.noComponentNodes);
  const byId = new Map(components.map((node) => [node.componentId ?? '', node] as const));
  const countsById = new Map(
    graph.nodes
      .filter((node) => node.componentId !== undefined)
      .map((node) => [node.componentId ?? '', node] as const),
  );
  const depthOf = (node: BaseScreenBlueprintCanvasNode): number => {
    let depth = 0;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId !== undefined && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = byId.get(parentId)?.parentId;
    }
    return depth;
  };
  return `<section class="blueprint-palette-group" aria-label="${DESIGNER_UI_TEXT.blueprint.layers}">
    <header><strong>${DESIGNER_UI_TEXT.blueprint.currentCanvas}</strong><span>${components.length}</span></header>
    <div class="blueprint-palette-list">
      ${components
        .map((node) =>
          componentItem(
            node,
            placed.has(node.id),
            selection?.kind === 'node' && selection.id === node.id,
            depthOf(node),
            countsById.get(node.componentId ?? ''),
          ),
        )
        .join('')}
    </div>
    <p class="blueprint-library-hint">${DESIGNER_UI_TEXT.blueprint.componentNodeHint}</p>
  </section>`;
}

function componentItem(
  node: BaseScreenBlueprintCanvasNode,
  placed: boolean,
  selected: boolean,
  depth = 0,
  counts?: BaseScreenBlueprintCanvasNode,
): string {
  const componentId = node.componentId ?? '';
  const name = node.componentName ?? componentId;
  const eventCount = (node.events ?? []).filter((event) => event.available).length;
  const action = placed
    ? `data-blueprint-select-node="${escapeAttribute(node.id)}"`
    : `data-blueprint-add-component="${escapeAttribute(componentId)}"`;
  const actionLabel = placed
    ? DESIGNER_UI_TEXT.blueprint.locateComponent(name)
    : DESIGNER_UI_TEXT.blueprint.addComponent(name);
  const structure =
    node.childCount === undefined
      ? ''
      : ` · ${DESIGNER_UI_TEXT.blueprint.structure.children} ${node.childCount}`;
  const relationCount =
    placed && counts !== undefined
      ? `<em class="blueprint-palette-counts">${escapeHtml(DESIGNER_UI_TEXT.blueprint.relationCounts(counts.outboundCount ?? 0, counts.inboundCount ?? 0))}</em>`
      : '';
  return `<div class="designer-list-row blueprint-palette-item" data-density="comfortable" data-depth="${depth}" style="--bp-indent: ${depth * 12}px" data-placed="${String(placed)}" data-selected="${String(selected)}"${placed ? '' : ` draggable="true" data-blueprint-drag-kind="component" data-component-id="${escapeAttribute(componentId)}" data-blueprint-drag-label="${escapeAttribute(name)}"`}>
    <button type="button" class="blueprint-palette-primary" ${action} aria-label="${escapeAttribute(actionLabel)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('layers')}</span>
      <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(node.materialType ?? '')} · ${DESIGNER_UI_TEXT.blueprint.componentEventCount(eventCount)}${escapeHtml(structure)}</small></span>
      ${relationCount}
    </button>
    <button type="button" class="blueprint-palette-action" ${action} data-tip="${escapeAttribute(actionLabel)}" aria-label="${escapeAttribute(actionLabel)}">${designerIcon(placed ? 'locate' : 'plus')}</button>
  </div>`;
}

function relationsPane(
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
): string {
  if (document === undefined)
    return emptyState(DESIGNER_UI_TEXT.blueprint.relationList.noRelations);
  const groups = new Map<keyof typeof DESIGNER_UI_TEXT.blueprint.relationCategories, string[]>();
  const push = (
    category: keyof typeof DESIGNER_UI_TEXT.blueprint.relationCategories,
    line: string,
  ) => {
    const rows = groups.get(category) ?? [];
    rows.push(line);
    groups.set(category, rows);
  };
  for (const relation of document.blueprint.relations) {
    const line = relationRow(document, graph, relation, selection, query);
    if (line !== null) push(readScreenBlueprintRelationCategory(relation), line);
  }
  for (const edge of graph.edges) {
    if (edge.kind !== 'containment') continue;
    const line = containmentRow(document, edge, selection, query);
    if (line !== null) push('structure', line);
  }
  const host = graph.nodes.find((node) => node.id === 'host');
  const hostRow =
    host === undefined
      ? `<div class="designer-list-row blueprint-palette-item" data-density="comfortable"><button type="button" class="blueprint-palette-primary" data-blueprint-insert-host aria-label="${DESIGNER_UI_TEXT.blueprint.relationList.addHost}"><span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('activity')}</span><span><strong>${DESIGNER_UI_TEXT.blueprint.hostNode}</strong><small>${DESIGNER_UI_TEXT.blueprint.hostNodeHint}</small></span><span class="blueprint-palette-inline-add" aria-hidden="true">${designerIcon('plus')}</span></button></div>`
      : `<div class="designer-list-row blueprint-palette-item" data-density="comfortable" data-placed="true" data-selected="${String(selection?.kind === 'node' && selection.id === host.id)}"><button type="button" class="blueprint-palette-primary" data-blueprint-select-node="${host.id}" aria-label="${DESIGNER_UI_TEXT.blueprint.hostNode}"><span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('activity')}</span><span><strong>${DESIGNER_UI_TEXT.blueprint.hostNode}</strong><small>${DESIGNER_UI_TEXT.blueprint.hostNodeHint}</small></span><em>${DESIGNER_UI_TEXT.blueprint.placed}</em></button></div>`;
  const order: readonly (keyof typeof DESIGNER_UI_TEXT.blueprint.relationCategories)[] = [
    'structure',
    'interaction',
    'data',
    'exit',
    'semantic',
  ];
  const sections = order
    .map((category) => {
      const rows = groups.get(category);
      if (rows === undefined || rows.length === 0) return '';
      return `<section class="blueprint-palette-group" aria-label="${DESIGNER_UI_TEXT.blueprint.relationCategories[category]}"><header><strong>${DESIGNER_UI_TEXT.blueprint.relationCategories[category]}</strong><span>${rows.length}</span></header><div class="blueprint-palette-list">${rows.join('')}</div></section>`;
    })
    .join('');
  const hostSection = `<section class="blueprint-palette-group" aria-label="${DESIGNER_UI_TEXT.blueprint.hostNode}"><header><strong>${DESIGNER_UI_TEXT.blueprint.hostNode}</strong><span>${host === undefined ? 0 : 1}</span></header><div class="blueprint-palette-list">${hostRow}</div></section>`;
  const content = `${sections}${hostSection}`;
  return content === '' ? emptyState(DESIGNER_UI_TEXT.blueprint.relationList.noRelations) : content;
}

function relationRow(
  document: ScreenDocument,
  graph: BaseScreenBlueprintCanvasGraph,
  relation: ScreenBlueprintRelation,
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
): string | null {
  const edgeId =
    relation.type === 'semantic' ? `semantic:${relation.id}` : `relation:${relation.id}`;
  const edge = graph.edges.find((candidate) => candidate.id === edgeId);
  if (edge === undefined) return null;
  const source = nodeLabel(document, sourceNodeId(relation));
  const target = nodeLabel(document, targetNodeId(relation));
  const meta =
    relation.type === 'semantic'
      ? DESIGNER_UI_TEXT.blueprint.semanticRoles[relation.role]
      : `${relation.source.event.eventName} · ${DESIGNER_UI_TEXT.blueprint.relationEffects[relation.effect.type]}`;
  const condition =
    relation.type === 'behavior' && relation.condition !== undefined
      ? DESIGNER_UI_TEXT.blueprint.conditionExpression
      : DESIGNER_UI_TEXT.blueprint.relationNode.noCondition;
  const text = `${source} ${target} ${meta} ${condition}`.toLocaleLowerCase();
  if (query.length > 0 && !text.includes(query)) return null;
  const selected = selection?.kind === 'edge' && selection.id === edgeId;
  return `<div class="designer-list-row blueprint-palette-item" data-density="comfortable" data-kind="relation" data-selected="${String(selected)}">
    <button type="button" class="blueprint-palette-primary" data-blueprint-select-relation="${escapeAttribute(edgeId)}" aria-label="${escapeAttribute(`${source} → ${target}`)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon(relation.type === 'semantic' ? 'link' : 'activity')}</span>
      <span><strong>${escapeHtml(source)} → ${escapeHtml(target)}</strong><small>${escapeHtml(meta)}</small></span>
    </button>
  </div>`;
}

function containmentRow(
  document: ScreenDocument,
  edge: BaseScreenBlueprintCanvasEdge,
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
): string | null {
  const source = nodeLabel(document, edge.source);
  const target = nodeLabel(document, edge.target);
  const meta = DESIGNER_UI_TEXT.blueprint.relationList.containment;
  const text = `${source} ${target} ${meta}`.toLocaleLowerCase();
  if (query.length > 0 && !text.includes(query)) return null;
  const selected = selection?.kind === 'edge' && selection.id === edge.id;
  return `<div class="designer-list-row blueprint-palette-item" data-density="comfortable" data-kind="structure" data-selected="${String(selected)}">
    <button type="button" class="blueprint-palette-primary" data-blueprint-select-relation="${escapeAttribute(edge.id)}" aria-label="${escapeAttribute(`${source} → ${target}`)}" data-tip="${escapeAttribute(DESIGNER_UI_TEXT.blueprint.relationList.containmentHint)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('group')}</span>
      <span><strong>${escapeHtml(source)} → ${escapeHtml(target)}</strong><small>${meta}</small></span>
      <em>${DESIGNER_UI_TEXT.blueprint.relationList.readOnly}</em>
    </button>
  </div>`;
}

function variablePane(
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  query: string,
): string {
  const placed = new Set(
    graph.nodes.filter((node) => node.kind === 'variable').map((node) => node.id),
  );
  const variables = readDesignerVariableViews(document).filter((variable) =>
    `${variable.name} ${variable.type} ${variable.type === 'static' ? JSON.stringify(variable.initialValue) : variable.sourceId}`
      .toLocaleLowerCase()
      .includes(query),
  );
  if (variables.length === 0) return emptyState(DESIGNER_UI_TEXT.blueprint.noVariables);
  return `<div class="blueprint-palette-list">
    ${variables
      .map((variable) =>
        variableItem(
          variable,
          placed.has(`variable:${variable.id}`),
          selection?.kind === 'node' && selection.id === `variable:${variable.id}`,
        ),
      )
      .join('')}
  </div>`;
}

function variableItem(variable: DesignerVariableView, placed: boolean, selected: boolean): string {
  const detail =
    variable.type === 'static' ? JSON.stringify(variable.initialValue) : variable.sourceId;
  const action = placed
    ? `data-blueprint-select-node="variable:${escapeAttribute(variable.id)}"`
    : `data-blueprint-add-variable="${escapeAttribute(variable.id)}"`;
  const actionLabel = placed
    ? DESIGNER_UI_TEXT.blueprint.locateVariable(variable.name)
    : DESIGNER_UI_TEXT.blueprint.addVariableNode(variable.name);
  return `<div class="designer-list-row blueprint-palette-item" data-density="comfortable" data-kind="variable" data-placed="${String(placed)}" data-selected="${String(selected)}"${placed ? '' : ` draggable="true" data-blueprint-drag-kind="variable" data-variable-id="${escapeAttribute(variable.id)}" data-blueprint-drag-label="${escapeAttribute(variable.name)}"`}>
    <button type="button" class="blueprint-palette-primary" ${action} aria-label="${escapeAttribute(actionLabel)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('variable')}</span>
      <span><strong>${escapeHtml(variable.name)}</strong><small>${escapeHtml(DESIGNER_UI_TEXT.blueprint.variableKind[variable.type])} · ${escapeHtml(detail)}</small></span>${placed ? `<em>${DESIGNER_UI_TEXT.blueprint.placed}</em>` : `<span class="blueprint-palette-inline-add" aria-hidden="true">${designerIcon('plus')}</span>`}
    </button>
  </div>`;
}

function libraryTab(
  tab: DesignerBlueprintLibraryBuiltinTab,
  activeTab: DesignerBlueprintLibraryTab,
): string {
  const visibleLabel = DESIGNER_UI_TEXT.blueprint.libraryTabs[tab];
  const label =
    tab === 'components'
      ? DESIGNER_UI_TEXT.blueprint.layers
      : tab === 'relations'
        ? DESIGNER_UI_TEXT.blueprint.library
        : DESIGNER_UI_TEXT.blueprint.globalVariables;
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

function sourceNodeId(relation: ScreenBlueprintRelation): string {
  if (relation.type === 'semantic') return `component:${relation.source.componentId}`;
  return relation.source.kind === 'component'
    ? `component:${relation.source.componentId}`
    : `variable:${relation.source.variableId}`;
}

function targetNodeId(relation: ScreenBlueprintRelation): string {
  if (relation.type === 'semantic') return `component:${relation.target.componentId}`;
  if (relation.target.kind === 'component') return `component:${relation.target.componentId}`;
  if (relation.target.kind === 'variable') return `variable:${relation.target.variableId}`;
  return 'host';
}

function nodeLabel(document: ScreenDocument, nodeId: string): string {
  if (nodeId === 'host') return DESIGNER_UI_TEXT.blueprint.hostNode;
  if (nodeId.startsWith('component:')) {
    const id = nodeId.slice('component:'.length);
    return document.components.find((component) => component.id === id)?.name ?? id;
  }
  if (nodeId.startsWith('variable:')) {
    const id = nodeId.slice('variable:'.length);
    return document.variables.find((variable) => variable.id === id)?.name ?? id;
  }
  return nodeId;
}

function emptyState(message: string): string {
  return `<div class="designer-empty"><span class="designer-empty-icon" aria-hidden="true">${designerIcon('search')}</span><p class="designer-empty-title">${message}</p></div>`;
}
