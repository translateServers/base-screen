import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasSelection,
  BaseScreenBlueprintCanvasTrace,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { type DesignerIconName, designerIcon } from '../../dom/designer-icons.js';
import { escapeHtml } from './designer-blueprint-dom-helpers.js';
import {
  hydrateDesignerBlueprintFieldRows,
  renderDesignerBlueprintConfiguration,
} from './designer-blueprint-inspector-configuration.js';

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
  // 「配置」不挂计数：选中数量不是需要处理的事项，挂红点会被读成报错。
  const counts: Record<DesignerBlueprintInspectorTab, number> = {
    configuration: 0,
    problems: diagnostics.length,
    trace: trace?.steps.length ?? 0,
  };
  const heading = inspectorHeading(document, graph, selection, activeTab);
  container.innerHTML = `<div class="blueprint-inspector-shell">
    <header class="blueprint-inspector-topbar">
      <span><strong>${escapeHtml(heading.title)}</strong><small>${escapeHtml(heading.detail)}</small></span>
      <div class="blueprint-inspector-modes" role="tablist" aria-label="${DESIGNER_UI_TEXT.blueprint.inspector}">
        ${INSPECTOR_TABS.map((tab) => inspectorTab(tab, activeTab, counts[tab])).join('')}
      </div>
    </header>
    <div class="blueprint-panel-scroll inspector-pane" data-blueprint-inspector-pane id="designer-blueprint-inspector-${activeTab}-panel" role="tabpanel" aria-labelledby="designer-blueprint-inspector-${activeTab}-tab" tabindex="0" aria-live="polite">
      ${inspectorPane(activeTab, document, graph, selection, diagnostics, trace, catalog)}
    </div>
  </div>`;
  hydrateDesignerBlueprintFieldRows(container);
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
    return `<div class="designer-empty" data-tone="success"><span class="designer-empty-icon" aria-hidden="true">${designerIcon('check')}</span><p class="designer-empty-title">${DESIGNER_UI_TEXT.blueprint.problemsHealthy}</p><p class="designer-empty-hint">${DESIGNER_UI_TEXT.blueprint.problemsHealthyHint}</p></div>`;
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
    return `<div class="designer-empty"><span class="designer-empty-icon" aria-hidden="true">${designerIcon('terminal')}</span><p class="designer-empty-title">${DESIGNER_UI_TEXT.blueprint.noTrace}</p><p class="designer-empty-hint">${DESIGNER_UI_TEXT.blueprint.noTraceHint}</p></div>`;
  }
  const failedConditions = trace.steps.filter(
    (step) => step.kind === 'condition' && step.passed === false,
  ).length;
  return `<section class="blueprint-inspector-status" data-blueprint-trace data-failed="${String(trace.failed)}">
    <div class="blueprint-trace-summary">${DESIGNER_UI_TEXT.blueprint.traceSummary(trace.executedEdgeIds.length, failedConditions)}</div>
    <ol class="blueprint-trace-steps">${trace.steps
      .slice(0, 200)
      .map(
        (step) =>
          // 带节点的步骤可点：选中并定位到该节点（检查器停留在「运行」页）。
          `<li data-kind="${step.kind}"${step.passed === undefined ? '' : ` data-passed="${String(step.passed)}"`} style="--bp-trace-depth: ${Math.min(step.depth, 12)}">${
            step.nodeId === undefined
              ? escapeHtml(step.text)
              : `<button type="button" class="blueprint-trace-step" data-blueprint-select-node="${escapeHtml(step.nodeId)}">${escapeHtml(step.text)}</button>`
          }</li>`,
      )
      .join('')}</ol>
    <button type="button" class="designer-button" data-blueprint-clear-trace>${DESIGNER_UI_TEXT.blueprint.graph.simulation.clear}</button>
  </section>`;
}

function inspectorHeading(
  _document: ScreenDocument | undefined,
  graph: BaseScreenBlueprintCanvasGraph,
  selection: BaseScreenBlueprintCanvasSelection,
  activeTab: DesignerBlueprintInspectorTab,
): { readonly title: string; readonly detail: string } {
  const text = DESIGNER_UI_TEXT.blueprint;
  if (activeTab === 'problems') return { title: text.problemsTitle, detail: text.inspector };
  if (activeTab === 'trace') return { title: text.traceTitle, detail: text.inspector };
  const total = selection.nodes.length + selection.edges.length;
  if (total === 0) return { title: text.inspector, detail: text.inspectorEmpty };
  if (total > 1) {
    return {
      title: text.selectionOverview,
      detail: text.graph.multiSelection(selection.nodes.length, selection.edges.length),
    };
  }
  const node = graph.nodes.find((candidate) => candidate.id === selection.nodes[0]);
  if (node !== undefined) {
    return { title: node.title, detail: `${node.id} | ${text.graph.nodeKinds[node.kind]}` };
  }
  const edge = graph.edges.find((candidate) => candidate.id === selection.edges[0]);
  return {
    title: edge?.label ?? text.selectionType.edge,
    detail:
      edge === undefined
        ? text.selectionType.edge
        : `${edge.id} | ${text.graph.edgeCategories[edge.category]}`,
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
  return `<button type="button" class="blueprint-inspector-mode" id="designer-blueprint-inspector-${tab}-tab" role="tab" aria-controls="designer-blueprint-inspector-${tab}-panel" aria-selected="${String(tab === activeTab)}" tabindex="${tab === activeTab ? 0 : -1}" data-blueprint-inspector-tab="${tab}" data-tip="${label}" aria-label="${label}"><span aria-hidden="true">${designerIcon(icon)}</span>${count === 0 ? '' : `<em data-tone="${tab === 'problems' ? 'danger' : 'neutral'}">${count}</em>`}</button>`;
}
