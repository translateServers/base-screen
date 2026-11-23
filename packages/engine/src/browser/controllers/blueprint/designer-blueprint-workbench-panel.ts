import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  buildDesignerBlueprintGraph,
  findComponentBlueprintNode,
  findVariableBlueprintNode,
  insertDesignerBlueprintNode,
} from '../../../common/operations/blueprint/designer-blueprint-model.js';
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
  EMPTY_BLUEPRINT_CANVAS_SELECTION,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { parseDesignerWorkbenchModeRequest } from '../../../common/operations/workbench/designer-workbench-mode.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import {
  createDesignerBlueprintDefaultCanvas,
  type DesignerBlueprintDefaultCanvasHandle,
} from '../../dom/blueprint/designer-blueprint-default-canvas.js';
import { renderDesignerBlueprintWorkbenchChrome } from '../../dom/blueprint/designer-blueprint-workbench-dom.js';
import { DesignerBlueprintCanvasBridge } from './designer-blueprint-canvas-bridge.js';
import { DesignerBlueprintPanelsController } from './designer-blueprint-panels-controller.js';
import type { DesignerBlueprintWorkbenchCallbacks } from './designer-blueprint-workbench-callbacks.js';

const EMPTY_GRAPH: BaseScreenBlueprintCanvasGraph = Object.freeze({
  nodes: Object.freeze([]),
  edges: Object.freeze([]),
}) as unknown as BaseScreenBlueprintCanvasGraph;

export class DesignerBlueprintWorkbenchPanel {
  #root: ShadowRoot | undefined;
  #slot: HTMLSlotElement | undefined;
  #defaultCanvasHost: HTMLElement | undefined;
  #defaultCanvas: DesignerBlueprintDefaultCanvasHandle | undefined;
  #mode: BaseScreenDesignerWorkbenchMode = 'canvas';
  #selection: BaseScreenBlueprintCanvasSelection = EMPTY_BLUEPRINT_CANVAS_SELECTION;
  #showSemantic = true;
  #viewRequest: BaseScreenBlueprintCanvasState['viewRequest'];
  #viewRequestId = 0;
  #graphCache:
    | {
        readonly document: NonNullable<
          ReturnType<DesignerBlueprintWorkbenchCallbacks['getDocument']>
        >;
        readonly catalog: ReturnType<DesignerBlueprintWorkbenchCallbacks['getCatalog']>;
        readonly contributions: ReturnType<
          DesignerBlueprintWorkbenchCallbacks['getRuntimeContributions']
        >;
        readonly graph: BaseScreenBlueprintCanvasGraph;
      }
    | undefined;
  readonly #bridge: DesignerBlueprintCanvasBridge;
  readonly #panels: DesignerBlueprintPanelsController;
  readonly #onSlotChange = (): void => this.resolveCanvas();

  constructor(private readonly callbacks: DesignerBlueprintWorkbenchCallbacks) {
    this.#bridge = new DesignerBlueprintCanvasBridge({
      getDocument: callbacks.getDocument,
      getGraph: () => this.graph,
      getMode: () => this.#mode,
      getSelection: () => this.#selection,
      getShowSemantic: () => this.#showSemantic,
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
      // 模拟后检查器切到「运行」页：作者不用再找轨迹在哪。
      onSimulated: () => this.#panels.showTrace(),
    });
    this.#panels = new DesignerBlueprintPanelsController({
      getDocument: callbacks.getDocument,
      getGraph: () => this.graph,
      getCatalog: callbacks.getCatalog,
      getRuntimeContributions: callbacks.getRuntimeContributions,
      getSelection: () => this.#selection,
      getShowSemantic: () => this.#showSemantic,
      setShowSemantic: (value) => {
        this.#showSemantic = value;
        this.render();
      },
      requestView: (type) => {
        this.#viewRequest = { id: ++this.#viewRequestId, type };
        this.render();
      },
      simulate: (nodeId, port, payload) => this.#bridge.simulate(nodeId, port, payload),
      clearTrace: () => {
        this.#bridge.clearTrace();
        this.render();
      },
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
      // 同一个 ShadowRoot 可能先承载首帧骨架、随后才换成完整工作台：
      // 只比较 root 身份会漏掉新挂上的槽位与默认画布宿主，蓝图能力就永久不可用。
      this.bindSlot(
        root.querySelector<HTMLSlotElement>('[data-blueprint-canvas-slot]') ?? undefined,
      );
      this.#defaultCanvasHost =
        root.querySelector<HTMLElement>('[data-blueprint-default-canvas]') ?? undefined;
      this.mountDefaultCanvas();
      this.#panels.connect(root);
      this.resolveCanvas();
      this.render();
      return;
    }
    this.disconnect();
    this.#root = root;
    this.bindSlot(root.querySelector<HTMLSlotElement>('[data-blueprint-canvas-slot]') ?? undefined);
    this.#defaultCanvasHost =
      root.querySelector<HTMLElement>('[data-blueprint-default-canvas]') ?? undefined;
    this.mountDefaultCanvas();
    this.#panels.connect(root);
    this.#bridge.connect(this.callbacks.getHost());
    this.resolveCanvas();
    this.render();
  }

  /** 槽位会随骨架→工作台的替换而更换，监听必须跟着换到新槽位，否则画布增删无人响应。 */
  private bindSlot(slot: HTMLSlotElement | undefined): void {
    if (this.#slot === slot) return;
    this.#slot?.removeEventListener('slotchange', this.#onSlotChange);
    this.#slot = slot;
    this.#slot?.addEventListener('slotchange', this.#onSlotChange);
  }

  disconnect(): void {
    this.#slot?.removeEventListener('slotchange', this.#onSlotChange);
    this.#bridge.disconnect();
    this.#panels.release();
    this.#defaultCanvas?.destroy();
    this.#defaultCanvas?.element.remove();
    this.#defaultCanvas = undefined;
    this.#defaultCanvasHost = undefined;
    this.#root = undefined;
    this.#slot = undefined;
  }

  /** 变量面板「加入事件图」：插入变量节点后切到事件工作台并聚焦该节点。 */
  addVariableNode(variableId: string): void {
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    const inserted = insertDesignerBlueprintNode(document, { kind: 'variable', variableId });
    if (inserted?.created === true) {
      const result = this.callbacks.executeCommand({
        type: 'replace-blueprint',
        blueprint: inserted.blueprint,
      });
      if (!result.ok) {
        this.callbacks.emitDiagnostics(result.diagnostics);
        return;
      }
    }
    this.setMode('blueprint', { focus: { kind: 'variable', id: variableId } });
  }

  resetSession(): void {
    this.#selection = EMPTY_BLUEPRINT_CANVAS_SELECTION;
    this.#showSemantic = true;
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
      const inserted = this.ensureFocusNode(options.focus);
      if (!inserted.ok) return inserted;
      const targetId = this.resolveFocus(options.focus);
      if (targetId === undefined) {
        return failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidSelection);
      }
      this.#selection = this.graphHasEdge(targetId)
        ? { nodes: [], edges: [targetId] }
        : { nodes: [targetId], edges: [] };
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
      const focus = parseBlueprintSearchId(paletteTarget);
      const switched =
        focus === undefined
          ? failure<null>('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidSelection)
          : this.focusOrInsert(focus);
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

  /**
   * 画布投影只取决于文档、物料目录与插件贡献（三者都是不可变快照，换内容即换引用）。
   * 一次选中切换会经 render → 面板 / 桥接多次读取它，按引用缓存，避免每次点击重建整张图。
   */
  private get graph(): BaseScreenBlueprintCanvasGraph {
    const document = this.callbacks.getDocument();
    if (document === undefined) return EMPTY_GRAPH;
    const catalog = this.callbacks.getCatalog();
    const contributions = this.callbacks.getRuntimeContributions();
    const cached = this.#graphCache;
    if (
      cached !== undefined &&
      cached.document === document &&
      cached.catalog === catalog &&
      cached.contributions === contributions
    ) {
      return cached.graph;
    }
    const graph = buildDesignerBlueprintGraph(
      document,
      catalog,
      contributions,
      DESIGNER_UI_TEXT.blueprint,
    );
    this.#graphCache = { document, catalog, contributions, graph };
    return graph;
  }

  /** 搜索结果 / 引用列表定位：组件与变量不在图中时先加入节点，再切到蓝图并聚焦。 */
  private focusOrInsert(focus: BaseScreenDesignerWorkbenchFocus): ScreenParseResult<null> {
    return this.setMode('blueprint', { focus }, 'user');
  }

  /** 定位组件 / 变量时它们可能还没有节点：先以一条文档命令加入，再解析聚焦目标。 */
  private ensureFocusNode(focus: BaseScreenDesignerWorkbenchFocus): ScreenParseResult<null> {
    const document = this.callbacks.getDocument();
    if (document !== undefined && (focus.kind === 'component' || focus.kind === 'variable')) {
      const inserted = insertDesignerBlueprintNode(
        document,
        focus.kind === 'component'
          ? { kind: 'component', componentId: focus.id }
          : { kind: 'variable', variableId: focus.id },
      );
      if (inserted?.created === true) {
        const result = this.callbacks.executeCommand({
          type: 'replace-blueprint',
          blueprint: inserted.blueprint,
        });
        if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
      }
    }
    return success(null);
  }

  private mountDefaultCanvas(): void {
    if (this.#defaultCanvas !== undefined || this.#defaultCanvasHost === undefined) return;
    const handle = createDesignerBlueprintDefaultCanvas(this.#defaultCanvasHost.ownerDocument);
    this.#defaultCanvasHost.append(handle.element);
    this.#defaultCanvas = handle;
  }

  private resolveCanvas(): void {
    const assigned = this.#slot?.assignedElements({ flatten: true })[0];
    const fallback = this.#defaultCanvas?.element;
    if (fallback !== undefined) fallback.hidden = assigned !== undefined;
    // 容器本身绝对定位铺满槽位：只在没有宿主画布时参与命中，否则会盖住宿主画布的手势区域。
    if (this.#defaultCanvasHost !== undefined) {
      this.#defaultCanvasHost.hidden = assigned !== undefined;
    }
    const next = assigned ?? fallback;
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
    const graph = this.graph;
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    if (
      selection.nodes.some((id) => !nodeIds.has(id)) ||
      selection.edges.some((id) => !edgeIds.has(id))
    ) {
      return failure('AUTHORING_REQUEST_INVALID', DESIGNER_UI_TEXT.blueprint.invalidSelection);
    }
    this.#selection = { nodes: [...selection.nodes], edges: [...selection.edges] };
    const target = selection.nodes[0] ?? selection.edges[0];
    if (requestView && target !== undefined) {
      this.#viewRequest = { id: ++this.#viewRequestId, type: 'focus', targetId: target };
    }
    this.render();
    return success(null);
  }

  private reconcileSelection(graph: BaseScreenBlueprintCanvasGraph): void {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    const nodes = this.#selection.nodes.filter((id) => nodeIds.has(id));
    const edges = this.#selection.edges.filter((id) => edgeIds.has(id));
    if (
      nodes.length !== this.#selection.nodes.length ||
      edges.length !== this.#selection.edges.length
    ) {
      this.#selection = { nodes, edges };
    }
  }

  private resolveFocus(focus: BaseScreenDesignerWorkbenchFocus): string | undefined {
    const document = this.callbacks.getDocument();
    if (document === undefined) return undefined;
    if (focus.kind === 'component') {
      return findComponentBlueprintNode(document.blueprint, focus.id)?.id;
    }
    if (focus.kind === 'variable') {
      return findVariableBlueprintNode(document.blueprint, focus.id)?.id;
    }
    if (focus.kind === 'node') {
      return document.blueprint.nodes.some((node) => node.id === focus.id) ? focus.id : undefined;
    }
    return this.graphHasEdge(focus.id) ? focus.id : undefined;
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
    const edges = document?.blueprint.edges ?? [];
    renderDesignerBlueprintWorkbenchChrome(root, this.#mode, this.available, {
      nodes: document?.blueprint.nodes.length ?? 0,
      relations: edges.filter((edge) => edge.kind === 'flow').length,
      semantic: edges.filter((edge) => edge.kind === 'semantic').length,
      structural: 0,
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

/** `data-blueprint-search-id` 的四种写法：`component:<id>`、`variable:<id>`、`node:<id>`、`edge:<id>`。 */
function parseBlueprintSearchId(value: string): BaseScreenDesignerWorkbenchFocus | undefined {
  const separator = value.indexOf(':');
  if (separator <= 0) return undefined;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (id === '') return undefined;
  return kind === 'component' || kind === 'variable' || kind === 'node' || kind === 'edge'
    ? { kind, id }
    : undefined;
}
