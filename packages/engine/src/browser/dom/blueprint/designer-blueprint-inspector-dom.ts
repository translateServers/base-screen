import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasSelection,
  BaseScreenBlueprintCanvasTrace,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../ui/designer-icons.js';
import { escapeHtml } from './designer-blueprint-dom-helpers.js';
import { renderDesignerBlueprintConfiguration } from './designer-blueprint-inspector-configuration.js';

export type DesignerBlueprintInspectorTab = 'configuration' | 'problems' | 'trace';

const INSPECTOR_TABS: readonly DesignerBlueprintInspectorTab[] = [
  'configuration',
  'problems',
  'trace',
];

export function renderDesignerBlueprintInspector(
  container: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  activeTab: DesignerBlueprintInspectorTab,
  diagnostics: readonly ScreenDiagnostic[],
  trace: BaseScreenBlueprintCanvasTrace | null,
  catalog?: BaseScreenMaterialCatalog,
): void {
  if (container === undefined) return;
  const counts: Record<DesignerBlueprintInspectorTab, number> = {
    configuration: selection === null ? 0 : 1,
    problems: diagnostics.length,
    trace: trace?.executedEdgeIds.length ?? 0,
  };
  const heading = inspectorHeading(document, graph, selection, activeTab);
  container.innerHTML = `<div class="blueprint-inspector-shell">
    <header class="blueprint-inspector-topbar">
      <span><strong>${escapeHtml(heading.title)}</strong><small>${escapeHtml(heading.detail)}</small></span>
      <div class="blueprint-inspector-modes" role="tablist" aria-label="${DESIGNER_UI_TEXT.blueprint.inspector}">
        ${INSPECTOR_TABS.map((tab) => inspectorTab(tab, activeTab, counts[tab])).join('')}
      </div>
    </header>
    <div class="blueprint-panel-scroll" id="designer-blueprint-inspector-${activeTab}-panel" role="tabpanel" aria-labelledby="designer-blueprint-inspector-${activeTab}-tab" tabindex="0" aria-live="polite">
      ${inspectorPane(activeTab, document, graph, selection, diagnostics, trace, catalog)}
    </div>
  </div>`;
}

function inspectorPane(
  activeTab: DesignerBlueprintInspectorTab,
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  diagnostics: readonly ScreenDiagnostic[],
  trace: BaseScreenBlueprintCanvasTrace | null,
  catalog: BaseScreenMaterialCatalog | undefined,
): string {
  if (activeTab === 'problems') return problemsPane(diagnostics);
  if (activeTab === 'trace') return tracePane(trace);
  return renderDesignerBlueprintConfiguration(document, graph, selection, catalog);
}

function problemsPane(diagnostics: readonly ScreenDiagnostic[]): string {
  const problems = diagnostics.slice(0, 8);
  if (problems.length === 0) {
    return `<div class="blueprint-inspector-empty" data-state="healthy"><span aria-hidden="true">${designerIcon('check')}</span><strong>${DESIGNER_UI_TEXT.blueprint.problemsHealthy}</strong><p>${DESIGNER_UI_TEXT.blueprint.problemsHealthyHint}</p></div>`;
  }
  return `<section class="blueprint-inspector-status" data-blueprint-problems><ul>${problems
    .map(
      (item) =>
        `<li data-severity="${item.severity}"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.message)}</span><small>${escapeHtml(item.path.join('.') || '—')}</small></li>`,
    )
    .join('')}</ul></section>`;
}

function tracePane(trace: BaseScreenBlueprintCanvasTrace | null): string {
  if (trace === null) {
    return `<div class="blueprint-inspector-empty"><span aria-hidden="true">${designerIcon('terminal')}</span><strong>${DESIGNER_UI_TEXT.blueprint.noTrace}</strong><p>${DESIGNER_UI_TEXT.blueprint.noTraceHint}</p></div>`;
  }
  return `<section class="blueprint-inspector-status" data-blueprint-trace>
    <div class="blueprint-trace-summary">${DESIGNER_UI_TEXT.blueprint.traceSummary(trace.executedEdgeIds.length, trace.failedRuleIds.length)}</div>
    <ol>${trace.lines
      .slice(-20)
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('')}</ol>
  </section>`;
}

function inspectorHeading(
  document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  activeTab: DesignerBlueprintInspectorTab,
): { readonly title: string; readonly detail: string } {
  if (activeTab === 'problems') {
    return {
      title: DESIGNER_UI_TEXT.blueprint.problemsTitle,
      detail: DESIGNER_UI_TEXT.blueprint.inspector,
    };
  }
  if (activeTab === 'trace') {
    return {
      title: DESIGNER_UI_TEXT.blueprint.traceTitle,
      detail: DESIGNER_UI_TEXT.blueprint.inspector,
    };
  }
  if (selection === null) {
    return {
      title: DESIGNER_UI_TEXT.blueprint.inspector,
      detail: DESIGNER_UI_TEXT.blueprint.inspectorEmpty,
    };
  }
  const node =
    selection.kind === 'node'
      ? graph.nodes.find((candidate) => candidate.id === selection.id)
      : undefined;
  if (node?.kind === 'component') {
    return {
      title: node.componentName ?? node.componentId ?? DESIGNER_UI_TEXT.blueprint.layers,
      detail: node.materialType ?? DESIGNER_UI_TEXT.blueprint.selectionType.component,
    };
  }
  if (node?.kind === 'condition') {
    return {
      title: DESIGNER_UI_TEXT.blueprint.condition,
      detail:
        node.unconnected === true
          ? DESIGNER_UI_TEXT.blueprint.unconnectedNode
          : '@base-screen/logic/condition',
    };
  }
  if (node?.kind === 'variable') {
    return {
      title: node.variableName ?? node.variableId ?? DESIGNER_UI_TEXT.blueprint.globalVariables,
      detail:
        node.variableType === undefined
          ? DESIGNER_UI_TEXT.blueprint.globalVariables
          : DESIGNER_UI_TEXT.blueprint.variableKind[node.variableType],
    };
  }
  if (node?.kind === 'action') {
    return {
      title:
        node.summary?.primary === undefined || node.summary.primary.length === 0
          ? DESIGNER_UI_TEXT.blueprint.interactionActions
          : node.summary.primary,
      detail:
        node.unconnected === true
          ? DESIGNER_UI_TEXT.blueprint.unconnectedNode
          : (node.action?.type ?? ''),
    };
  }
  const edge = graph.edges.find((candidate) => candidate.id === selection.id);
  const rule = document?.blueprint.rules.find((candidate) => candidate.id === edge?.ruleId);
  return {
    title: rule?.id ?? DESIGNER_UI_TEXT.blueprint.selectionType.edge,
    detail: DESIGNER_UI_TEXT.blueprint.selectionType.edge,
  };
}

function inspectorTab(
  tab: DesignerBlueprintInspectorTab,
  activeTab: DesignerBlueprintInspectorTab,
  count: number,
): string {
  const label = DESIGNER_UI_TEXT.blueprint.inspectorTabs[tab];
  const icon: DesignerIconName =
    tab === 'configuration' ? 'sliders' : tab === 'problems' ? 'check' : 'terminal';
  return `<button type="button" class="blueprint-inspector-mode" id="designer-blueprint-inspector-${tab}-tab" role="tab" aria-controls="designer-blueprint-inspector-${tab}-panel" aria-selected="${String(tab === activeTab)}" tabindex="${tab === activeTab ? 0 : -1}" data-blueprint-inspector-tab="${tab}" data-tip="${label}" aria-label="${label}"><span aria-hidden="true">${designerIcon(icon)}</span>${count === 0 ? '' : `<em>${count}</em>`}</button>`;
}
