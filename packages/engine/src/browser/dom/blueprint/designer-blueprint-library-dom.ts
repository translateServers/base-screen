import type { ScreenDocument, ScreenVariable } from '@base-screen/contracts';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
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

export type DesignerBlueprintLibraryBuiltinTab = 'components' | 'logic' | 'variables';
export type DesignerBlueprintLibraryTab = DesignerBlueprintLibraryBuiltinTab | `host:${string}`;

const LIBRARY_TABS: readonly DesignerBlueprintLibraryBuiltinTab[] = [
  'components',
  'logic',
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
        <label class="designer-field designer-field-label layer-search blueprint-library-search">
          <span class="layer-search-glyph" aria-hidden="true">${designerIcon('search')}</span>
          <input type="search" class="designer-control designer-input" data-blueprint-library-search value="${escapeAttribute(query)}" placeholder="${DESIGNER_UI_TEXT.blueprint.librarySearch}" aria-label="${DESIGNER_UI_TEXT.blueprint.librarySearch}">
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
  if (activeTab === 'logic') return logicPane(normalized);
  return variablePane(document, normalized);
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
  return `<section class="blueprint-palette-group" aria-label="${DESIGNER_UI_TEXT.blueprint.layers}">
    <header><strong>${DESIGNER_UI_TEXT.blueprint.currentCanvas}</strong><span>${components.length}</span></header>
    <div class="blueprint-palette-list">
      ${components
        .map((node) =>
          componentItem(
            node,
            placed.has(node.id),
            selection?.kind === 'node' && selection.id === node.id,
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
  return `<div class="blueprint-palette-item" data-placed="${String(placed)}" data-selected="${String(selected)}"${placed ? '' : ` draggable="true" data-blueprint-drag-kind="component" data-component-id="${escapeAttribute(componentId)}" data-blueprint-drag-label="${escapeAttribute(name)}"`}>
    <button type="button" class="blueprint-palette-primary" ${action} aria-label="${escapeAttribute(actionLabel)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('layers')}</span>
      <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(node.materialType ?? '')} · ${DESIGNER_UI_TEXT.blueprint.componentEventCount(eventCount)}</small></span>
      ${placed ? `<em>${DESIGNER_UI_TEXT.blueprint.placed}</em>` : ''}
    </button>
    <button type="button" class="blueprint-palette-action" ${action} title="${escapeAttribute(actionLabel)}" aria-label="${escapeAttribute(actionLabel)}">${designerIcon(placed ? 'locate' : 'plus')}</button>
  </div>`;
}

function logicPane(query: string): string {
  const items = [
    {
      kind: 'condition' as const,
      label: DESIGNER_UI_TEXT.blueprint.condition,
      hint: DESIGNER_UI_TEXT.blueprint.conditionHint,
      group: DESIGNER_UI_TEXT.blueprint.conditionGroup,
    },
    {
      kind: 'set-variable' as const,
      label: DESIGNER_UI_TEXT.blueprint.setVariable,
      hint: DESIGNER_UI_TEXT.blueprint.setVariableHint,
      group: DESIGNER_UI_TEXT.blueprint.actionGroup,
    },
    {
      kind: 'emit-host-event' as const,
      label: DESIGNER_UI_TEXT.blueprint.emitHostEvent,
      hint: DESIGNER_UI_TEXT.blueprint.emitHostEventHint,
      group: DESIGNER_UI_TEXT.blueprint.actionGroup,
    },
  ].filter((item) => `${item.label} ${item.hint}`.toLocaleLowerCase().includes(query));
  if (items.length === 0) return emptyState(DESIGNER_UI_TEXT.blueprint.noLogicNodes);
  return `${directNodeContext()}
    ${logicGroup(
      DESIGNER_UI_TEXT.blueprint.conditionGroup,
      items.filter((item) => item.group === DESIGNER_UI_TEXT.blueprint.conditionGroup),
    )}
    ${logicGroup(
      DESIGNER_UI_TEXT.blueprint.actionGroup,
      items.filter((item) => item.group === DESIGNER_UI_TEXT.blueprint.actionGroup),
    )}`;
}

function variablePane(document: ScreenDocument | undefined, query: string): string {
  const variables = (document?.variables ?? []).filter((variable) =>
    `${variable.name} ${variable.type} ${variable.type === 'host' ? variable.variableId : JSON.stringify(variable.value)}`
      .toLocaleLowerCase()
      .includes(query),
  );
  if (variables.length === 0) return emptyState(DESIGNER_UI_TEXT.blueprint.noVariables);
  return `${directNodeContext()}<div class="blueprint-palette-list">
    ${variables.map((variable) => variableItem(variable)).join('')}
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
      : tab === 'logic'
        ? DESIGNER_UI_TEXT.blueprint.logic
        : DESIGNER_UI_TEXT.blueprint.globalVariables;
  const icon: DesignerIconName =
    tab === 'components' ? 'layers' : tab === 'logic' ? 'cube' : 'variable';
  return `<button type="button" class="designer-tab blueprint-library-rail-tab" id="designer-blueprint-library-${tab}-tab" role="tab" aria-controls="designer-blueprint-library-${tab}-panel" aria-selected="${String(tab === activeTab)}" tabindex="${tab === activeTab ? 0 : -1}" data-blueprint-library-tab="${tab}" title="${label}" aria-label="${label}"><span class="rail-tab-glyph" aria-hidden="true">${designerIcon(icon)}</span><span class="rail-tab-label">${visibleLabel}</span></button>`;
}

function hostLibraryTab(
  group: BaseScreenDesignerLeftPanelGroup,
  activeGroupId: string | undefined,
): string {
  const active = group.id === activeGroupId;
  const tab = hostLeftPanelTab(group.id);
  const label = escapeAttribute(group.label);
  return `<button type="button" class="designer-tab blueprint-library-rail-tab" id="${blueprintHostLeftPanelTabId(group.id)}" role="tab" aria-controls="${hostLeftPanelPanelId(group.id)}" aria-selected="${String(active)}" tabindex="${active ? 0 : -1}" data-blueprint-library-tab="${tab}" data-host-left-panel-group="${escapeAttribute(group.id)}" data-host-left-panel-mode="blueprint" title="${label}" aria-label="${label}"><span class="rail-tab-glyph" aria-hidden="true">${designerIcon(group.icon ?? 'shapes')}</span><span class="rail-tab-label">${escapeHtml(group.label)}</span></button>`;
}

export function isDesignerBlueprintLibraryBuiltinTab(
  value: string,
): value is DesignerBlueprintLibraryBuiltinTab {
  return value === 'components' || value === 'logic' || value === 'variables';
}

function logicGroup(
  label: string,
  items: readonly {
    readonly kind: 'condition' | 'set-variable' | 'emit-host-event';
    readonly label: string;
    readonly hint: string;
  }[],
): string {
  if (items.length === 0) return '';
  return `<section class="blueprint-palette-group"><header><strong>${label}</strong><span>${items.length}</span></header><div class="blueprint-palette-list">${items
    .map((item) => logicItem(item.kind, item.label, item.hint))
    .join('')}</div></section>`;
}

function logicItem(
  kind: 'condition' | 'set-variable' | 'emit-host-event',
  label: string,
  hint: string,
): string {
  const actionLabel = DESIGNER_UI_TEXT.blueprint.addLogicNode(label);
  return `<div class="blueprint-palette-item" data-kind="logic" draggable="true" data-blueprint-drag-kind="${kind}" data-blueprint-drag-label="${escapeAttribute(label)}">
    <button type="button" class="blueprint-palette-primary" data-blueprint-insert="${kind}" title="${escapeAttribute(hint)}" aria-label="${escapeAttribute(actionLabel)}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon(kind === 'set-variable' ? 'variable' : 'cube')}</span>
      <span><strong>${label}</strong><small>${hint}</small></span><span class="blueprint-palette-inline-add" aria-hidden="true">${designerIcon('plus')}</span>
    </button>
  </div>`;
}

function variableItem(variable: ScreenVariable): string {
  const detail = variable.type === 'host' ? variable.variableId : JSON.stringify(variable.value);
  return `<div class="blueprint-palette-item" data-kind="variable" draggable="true" data-blueprint-drag-kind="set-variable" data-variable-name="${escapeAttribute(variable.name)}" data-blueprint-drag-label="${escapeAttribute(variable.name)}">
    <button type="button" class="blueprint-palette-primary" data-blueprint-insert="set-variable" data-variable-name="${escapeAttribute(variable.name)}" aria-label="${escapeAttribute(DESIGNER_UI_TEXT.blueprint.addVariableAction(variable.name))}">
      <span class="blueprint-palette-glyph" aria-hidden="true">${designerIcon('variable')}</span>
      <span><strong>${escapeHtml(variable.name)}</strong><small>${escapeHtml(DESIGNER_UI_TEXT.blueprint.variableKind[variable.type])} · ${escapeHtml(detail)}</small></span><span class="blueprint-palette-inline-add" aria-hidden="true">${designerIcon('plus')}</span>
    </button>
  </div>`;
}

function directNodeContext(): string {
  return `<div class="blueprint-rule-context" data-ready="true" data-direct-insert="true"><span aria-hidden="true">${designerIcon('cube')}</span><p>${escapeHtml(
    DESIGNER_UI_TEXT.blueprint.directNodeHint,
  )}</p></div>`;
}

function emptyState(message: string): string {
  return `<div class="blueprint-panel-empty"><span aria-hidden="true">${designerIcon('search')}</span><p>${message}</p></div>`;
}
