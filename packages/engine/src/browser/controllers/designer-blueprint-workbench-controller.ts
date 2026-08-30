import type { ScreenBlueprint, ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  actionBlueprintNodeId,
  buildDesignerBlueprintComponentLibrary,
  buildDesignerBlueprintGraph,
} from '../../common/operations/designer-blueprint-model.js';
import {
  BASE_SCREEN_DESIGNER_WORKBENCH_MODE_CHANGE_EVENT,
  type BaseScreenBlueprintCanvasGraph,
  type BaseScreenBlueprintCanvasSelection,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenDesignerSetWorkbenchModeOptions,
  type BaseScreenDesignerWorkbenchFocus,
  type BaseScreenDesignerWorkbenchMode,
  type BaseScreenDesignerWorkbenchModeChangeEventDetail,
  type BaseScreenDesignerWorkbenchModeChangeReason,
} from '../../common/operations/designer-blueprint-protocol.js';
import { parseDesignerWorkbenchModeRequest } from '../../common/operations/designer-workbench-mode.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { renderDesignerBlueprintWorkbenchChrome } from '../dom/designer-blueprint-workbench-dom.js';
import { DesignerBlueprintCanvasBridge } from './designer-blueprint-canvas-bridge.js';
import { DesignerBlueprintPanelsController } from './designer-blueprint-panels-controller.js';
import type { DesignerBlueprintWorkbenchCallbacks } from './designer-blueprint-workbench-callbacks.js';

export class DesignerBlueprintWorkbenchController {
  #root: ShadowRoot | undefined;
  #slot: HTMLSlotElement | undefined;
  #mode: BaseScreenDesignerWorkbenchMode = 'canvas';
  #selection: BaseScreenBlueprintCanvasSelection = null;
  #viewRequest: BaseScreenBlueprintCanvasState['viewRequest'];
  #viewRequestId = 0;
  readonly #bridge: DesignerBlueprintCanvasBridge;
  readonly #panels: DesignerBlueprintPanelsController;
  readonly #onSlotChange = (): void => this.resolveCanvas();

  constructor(private readonly callbacks: DesignerBlueprintWorkbenchCallbacks) {
    this.#bridge = new DesignerBlueprintCanvasBridge({
      getDocument: callbacks.getDocument,
      getGraph: () => this.graph,
      getMode: () => this.#mode,
      getSelection: () => this.#selection,
      getViewRequest: () => this.#viewRequest,
      getCatalog: callbacks.getCatalog,
      getRuntimeContributions: callbacks.getRuntimeContributions,
      getDocumentRevision: callbacks.getDocumentRevision,
      getProjectRevision: callbacks.getProjectRevision,
      canUndo: callbacks.canUndo,
      canRedo: callbacks.canRedo,
      select: (selection, requestView) => this.select(selection, requestView),
      executeCommand: callbacks.executeCommand,
      undo: callbacks.undo,
      redo: callbacks.redo,
      render: () => this.render(),
      emitDiagnostics: callbacks.emitDiagnostics,
    });
    this.#panels = new DesignerBlueprintPanelsController({
      getDocument: callbacks.getDocument,
      getGraph: () => this.graph,
      getComponentLibrary: () => this.componentLibrary,
      getSelection: () => this.#selection,
      getDiagnostics: () => this.#bridge.stateDiagnostics(),
      getTrace: () => this.#bridge.trace,
      getLeftPanelGroups: callbacks.getLeftPanelGroups,
      getMode: () => this.#mode,
      select: (selection, requestView) => {
        const result = this.select(selection, requestView);
        if (!result.ok) callbacks.emitDiagnostics(result.diagnostics);
      },
      commitBlueprint: (blueprint) => this.#bridge.commitBlueprint(blueprint),
      expandLeftPanel: callbacks.expandLeftPanel,
      onActiveLeftPanelGroupChange: callbacks.onActiveLeftPanelGroupChange,
      emitDiagnostics: callbacks.emitDiagnostics,
    });
  }

  get mode(): BaseScreenDesignerWorkbenchMode {
    return this.#mode;
  }

  get available(): boolean {
    return this.#bridge.canvas !== undefined;
  }

  get selectedLeftPanelGroupId(): string | undefined {
    return this.#panels.selectedLeftPanelGroupId;
  }

  setInitialMode(mode: BaseScreenDesignerWorkbenchMode): void {
    this.#mode = mode;
  }

  connect(root: ShadowRoot): void {
    if (this.#root === root) {
      this.resolveCanvas();
      this.render();
      return;
    }
    this.disconnect();
    this.#root = root;
    this.#slot = root.querySelector<HTMLSlotElement>('[data-blueprint-canvas-slot]') ?? undefined;
    this.#panels.connect(root);
    this.#bridge.connect(this.callbacks.getHost());
    this.#slot?.addEventListener('slotchange', this.#onSlotChange);
    this.resolveCanvas();
    this.render();
  }

  disconnect(): void {
    this.#slot?.removeEventListener('slotchange', this.#onSlotChange);
    this.#bridge.disconnect();
    this.#panels.release();
    this.#root = undefined;
    this.#slot = undefined;
  }

  resetSession(): void {
    this.#selection = null;
    this.#viewRequest = undefined;
    this.#panels.reset();
    this.#bridge.reset();
    this.render();
  }

  selectLeftPanelGroup(groupId: string): boolean {
    return this.#mode === 'blueprint' && this.#panels.selectLeftPanelGroup(groupId);
  }

  refreshLeftPanelGroups(): void {
    this.#panels.refreshLeftPanelGroups();
    this.render();
  }

  setMode(
    mode: BaseScreenDesignerWorkbenchMode,
    options: BaseScreenDesignerSetWorkbenchModeOptions = {},
    reason: BaseScreenDesignerWorkbenchModeChangeReason = 'api',
  ): ScreenParseResult<null> {
    const validated = parseDesignerWorkbenchModeRequest(mode, options);
    if (!validated.ok) return validated;
    if (mode === 'blueprint' && !this.available) {
      return failure('BLUEPRINT_CAPABILITY_UNAVAILABLE', DESIGNER_UI_TEXT.blueprint.noHostCanvas);
    }
    if (options.focus !== undefined) {
      const targetId = this.resolveFocus(options.focus);
      if (targetId === undefined) {
        return failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidSelection);
      }
      this.#selection = { kind: this.graphHasEdge(targetId) ? 'edge' : 'node', id: targetId };
      this.#viewRequest = { id: ++this.#viewRequestId, type: 'focus', targetId };
    }
    const previousMode = this.#mode;
    this.#mode = mode;
    this.render();
    if (previousMode !== mode) this.emitModeChange(previousMode, mode, reason);
    return success(null);
  }

  render(): void {
    const graph = this.graph;
    this.reconcileSelection(graph);
    this.renderChrome();
    this.callbacks.setWorkbenchAuthoringMode(this.#mode);
    this.#panels.render();
    this.#bridge.dispatchState(graph);
    this.callbacks.onActiveLeftPanelGroupChange();
  }

  dispatchState(): void {
    this.#bridge.dispatchState();
  }

  onClick(target: Element): boolean {
    const modeControl = target.closest<HTMLButtonElement>('[data-workbench-mode-tab]');
    if (modeControl !== null) {
      const mode = modeControl.dataset.workbenchModeTab;
      if (mode === 'canvas' || mode === 'blueprint') {
        const result = this.setMode(mode, {}, 'user');
        if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
      }
      return true;
    }
    const paletteTarget = target.closest<HTMLElement>('[data-blueprint-search-id]')?.dataset
      .blueprintSearchId;
    if (paletteTarget !== undefined) {
      const selected = this.select(
        { kind: this.graphHasEdge(paletteTarget) ? 'edge' : 'node', id: paletteTarget },
        true,
      );
      if (!selected.ok) this.callbacks.emitDiagnostics(selected.diagnostics);
      const switched = this.setMode('blueprint', {}, 'user');
      if (!switched.ok) this.callbacks.emitDiagnostics(switched.diagnostics);
      return true;
    }
    return this.#panels.onClick(target);
  }

  onInput(target: Element): boolean {
    return this.#panels.onInput(target);
  }

  onChange(target: Element): boolean {
    return this.#panels.onChange(target);
  }

  onDragStart(event: DragEvent): boolean {
    return this.#panels.onDragStart(event);
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (this.#panels.onKeyDown(event)) return true;
    const control = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-workbench-mode-tab]',
    );
    if (control === null || control === undefined) return false;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return false;
    event.preventDefault();
    const controls = [
      ...(this.#root?.querySelectorAll<HTMLButtonElement>(
        '[data-workbench-mode-tab]:not(:disabled)',
      ) ?? []),
    ];
    if (controls.length === 0) return true;
    const current = controls.indexOf(control);
    const next =
      event.key === 'Home'
        ? controls[0]
        : event.key === 'End'
          ? controls.at(-1)
          : controls[
              (current + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length
            ];
    next?.focus();
    next?.click();
    return true;
  }

  private get graph(): BaseScreenBlueprintCanvasGraph {
    const document = this.callbacks.getDocument();
    return document === undefined
      ? { nodes: [], edges: [] }
      : buildDesignerBlueprintGraph(
          document,
          this.callbacks.getCatalog(),
          this.callbacks.getRuntimeContributions(),
        );
  }

  private get componentLibrary(): BaseScreenBlueprintCanvasGraph['nodes'] {
    const document = this.callbacks.getDocument();
    return document === undefined
      ? []
      : buildDesignerBlueprintComponentLibrary(
          document,
          this.callbacks.getCatalog(),
          this.callbacks.getRuntimeContributions(),
        );
  }

  private resolveCanvas(): void {
    const next = this.#slot?.assignedElements({ flatten: true })[0];
    const previous = this.#bridge.canvas;
    const changed = this.#bridge.setCanvas(next);
    if (!changed) {
      if (next === undefined && this.#mode === 'blueprint') this.fallbackToCanvas(false);
      else {
        this.renderChrome();
        this.#bridge.dispatchState();
      }
      return;
    }
    if (next === undefined && this.#mode === 'blueprint') {
      this.fallbackToCanvas(previous !== undefined);
      return;
    }
    this.render();
  }

  private fallbackToCanvas(reportRemoval: boolean): void {
    const previousMode = this.#mode;
    this.#mode = 'canvas';
    this.render();
    this.emitModeChange(previousMode, 'canvas', 'fallback');
    if (reportRemoval) {
      this.callbacks.emitDiagnostics([
        diagnostic('BLUEPRINT_CAPABILITY_UNAVAILABLE', DESIGNER_UI_TEXT.blueprint.noHostCanvas),
      ]);
    }
  }

  private select(
    selection: BaseScreenBlueprintCanvasSelection,
    requestView: boolean,
  ): ScreenParseResult<null> {
    if (selection !== null) {
      const exists =
        selection.kind === 'node'
          ? this.graph.nodes.some((node) => node.id === selection.id)
          : this.graph.edges.some((edge) => edge.id === selection.id);
      if (!exists) {
        return failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidSelection);
      }
    }
    this.#selection = selection;
    if (requestView && selection !== null) {
      this.#viewRequest = { id: ++this.#viewRequestId, type: 'focus', targetId: selection.id };
    }
    this.render();
    return success(null);
  }

  private reconcileSelection(graph: BaseScreenBlueprintCanvasGraph): void {
    if (this.#selection === null) return;
    const exists =
      this.#selection.kind === 'node'
        ? graph.nodes.some((node) => node.id === this.#selection?.id)
        : graph.edges.some((edge) => edge.id === this.#selection?.id);
    if (!exists) this.#selection = null;
  }

  private resolveFocus(focus: BaseScreenDesignerWorkbenchFocus): string | undefined {
    const graph = this.graph;
    if (focus.kind === 'component') {
      const id = `component:${focus.id}`;
      return graph.nodes.some((node) => node.id === id) ? id : undefined;
    }
    if (focus.kind === 'rule') {
      return (
        graph.nodes.find((node) => node.ruleId === focus.id)?.id ??
        graph.edges.find((edge) => edge.ruleId === focus.id)?.id
      );
    }
    if (graph.nodes.some((node) => node.id === focus.id) || this.graphHasEdge(focus.id)) {
      return focus.id;
    }
    const marker = focus.id.lastIndexOf(':');
    const ruleId = marker < 1 ? '' : focus.id.slice(0, marker);
    const actionIndex = Number(marker < 1 ? '' : focus.id.slice(marker + 1));
    if (!Number.isInteger(actionIndex)) return undefined;
    const nodeId = actionBlueprintNodeId(ruleId, actionIndex);
    return graph.nodes.some((node) => node.id === nodeId)
      ? nodeId
      : graph.edges.find((edge) => edge.ruleId === ruleId && edge.actionIndex === actionIndex)?.id;
  }

  private graphHasEdge(id: string): boolean {
    return this.graph.edges.some((edge) => edge.id === id);
  }

  private renderChrome(): void {
    const root = this.#root;
    if (root === undefined) return;
    const document = this.callbacks.getDocument();
    const problems = this.#bridge
      .stateDiagnostics()
      .filter((item) => item.severity === 'error').length;
    const actions =
      document?.blueprint.rules.reduce((total, rule) => total + rule.actions.length, 0) ?? 0;
    renderDesignerBlueprintWorkbenchChrome(root, this.#mode, this.available, {
      nodes: this.componentLibrary.length,
      rules: document?.blueprint.rules.length ?? 0,
      actions,
      problems,
    });
  }

  private emitModeChange(
    previousMode: BaseScreenDesignerWorkbenchMode,
    mode: BaseScreenDesignerWorkbenchMode,
    reason: BaseScreenDesignerWorkbenchModeChangeReason,
  ): void {
    this.callbacks
      .getHost()
      .dispatchEvent(
        new CustomEvent<BaseScreenDesignerWorkbenchModeChangeEventDetail>(
          BASE_SCREEN_DESIGNER_WORKBENCH_MODE_CHANGE_EVENT,
          { bubbles: true, composed: true, detail: { previousMode, mode, reason } },
        ),
      );
  }
}

function diagnostic(code: ScreenDiagnostic['code'], message: string): ScreenDiagnostic {
  return { severity: 'error', code, path: [], message };
}

function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, message)] };
}
