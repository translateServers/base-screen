import type {
  ScreenBlueprint,
  ScreenBlueprintCondition,
  ScreenBlueprintValueExpression,
  ScreenDocument,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  buildDesignerBlueprintComponentLibrary,
  buildDesignerBlueprintVariableLibrary,
  type DesignerBlueprintNodeSpec,
  deleteDesignerBlueprintSelection,
  findBlueprintEdge,
  findBlueprintNode,
  insertDesignerBlueprintNode,
  reorderDesignerBlueprintEdge,
  setDesignerBlueprintNodesEnabled,
  updateDesignerBlueprintEdge,
  updateDesignerBlueprintNode,
} from '../../../common/operations/blueprint/designer-blueprint-model.js';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasInsertNode,
  BaseScreenBlueprintCanvasSelection,
  BaseScreenBlueprintCanvasTrace,
  BaseScreenDesignerWorkbenchMode,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME,
  EMPTY_BLUEPRINT_CANVAS_SELECTION,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  designerBlueprintEventFieldPaths,
  parseDesignerBlueprintEventFieldPath,
} from '../../../common/operations/blueprint/designer-blueprint-value-sources.js';
import { readDesignerVariableViews } from '../../../common/operations/designer-variable-view.js';
import {
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelGroupSupportsMode,
} from '../../../common/operations/workbench/designer-left-panel-groups.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { syncDesignerBlueprintHostLeftPanel } from '../../dom/blueprint/designer-blueprint-host-left-panel-dom.js';
import {
  type DesignerBlueprintInspectorTab,
  renderDesignerBlueprintInspector,
} from '../../dom/blueprint/designer-blueprint-inspector-dom.js';
import {
  type DesignerBlueprintLibraryTab,
  renderDesignerBlueprintLibrary,
} from '../../dom/blueprint/designer-blueprint-library-dom.js';
import { adoptDesignerFormControls } from '../../dom/designer-form-controls-dom.js';
import {
  hostLeftPanelGroupId,
  hostLeftPanelTab,
} from '../../dom/designer-left-panel-groups-dom.js';
import { isInspectorTab, isLibraryTab } from './designer-blueprint-panel-tabs.js';

const OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists']);
const EVENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

export interface DesignerBlueprintPanelsCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGraph: () => BaseScreenBlueprintCanvasGraph;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly getSelection: () => BaseScreenBlueprintCanvasSelection;
  readonly getShowSemantic: () => boolean;
  readonly setShowSemantic: (value: boolean) => void;
  readonly requestView: (type: 'fit' | 'auto-layout') => void;
  readonly simulate: (
    nodeId: string,
    port: string,
    payload: ScreenJsonValue,
  ) => ScreenParseResult<null>;
  readonly clearTrace: () => void;
  readonly getDiagnostics: () => ScreenParseResult<unknown>['diagnostics'];
  readonly getTrace: () => BaseScreenBlueprintCanvasTrace | null;
  readonly getLeftPanelGroups: () => readonly BaseScreenDesignerLeftPanelGroup[] | undefined;
  readonly getMode: () => BaseScreenDesignerWorkbenchMode;
  readonly select: (selection: BaseScreenBlueprintCanvasSelection, requestView: boolean) => void;
  readonly commitBlueprint: (
    blueprint: ScreenBlueprint | null,
  ) => ScreenParseResult<ScreenDocument>;
  readonly expandLeftPanel: () => void;
  readonly onActiveLeftPanelGroupChange: () => void;
  readonly emitDiagnostics: (diagnostics: ScreenParseResult<unknown>['diagnostics']) => void;
}

/** 左侧节点库与右侧检查器：渲染与表单写回。写回一律经 `commitBlueprint`（解析 + 单条命令）。 */
export class DesignerBlueprintPanelsController {
  #library: HTMLElement | undefined;
  #inspector: HTMLElement | undefined;
  #search = '';
  #libraryTab: DesignerBlueprintLibraryTab = 'components';
  #inspectorTab: DesignerBlueprintInspectorTab = 'configuration';

  constructor(private readonly callbacks: DesignerBlueprintPanelsCallbacks) {}

  connect(root: ShadowRoot): void {
    this.#library = root.querySelector<HTMLElement>('[data-blueprint-library]') ?? undefined;
    this.#inspector = root.querySelector<HTMLElement>('[data-blueprint-inspector]') ?? undefined;
  }

  release(): void {
    this.#library = undefined;
    this.#inspector = undefined;
  }

  reset(): void {
    this.#search = '';
    this.#libraryTab = 'components';
    this.#inspectorTab = 'configuration';
  }

  /** 模拟完成后切到「运行」页，让作者直接看到轨迹。 */
  showTrace(): void {
    this.#inspectorTab = 'trace';
  }

  get selectedLeftPanelGroupId(): string | undefined {
    return hostLeftPanelGroupId(this.#libraryTab);
  }

  selectLeftPanelGroup(groupId: string): boolean {
    const group = this.blueprintHostGroup(groupId);
    if (group === undefined) return false;
    this.#libraryTab = hostLeftPanelTab(group.id);
    this.callbacks.expandLeftPanel();
    this.render();
    return true;
  }

  refreshLeftPanelGroups(): void {
    this.reconcileLibraryTab();
  }

  render(): void {
    const restoreLibraryTabFocus = this.hasLibraryTabFocus();
    this.reconcileLibraryTab();
    const document = this.callbacks.getDocument();
    const graph = this.callbacks.getGraph();
    const selection = this.callbacks.getSelection();
    const components =
      document === undefined
        ? []
        : buildDesignerBlueprintComponentLibrary(
            document,
            this.callbacks.getCatalog(),
            this.callbacks.getRuntimeContributions(),
          );
    renderDesignerBlueprintLibrary(this.#library, {
      document,
      graph,
      components,
      variables:
        document === undefined
          ? []
          : buildDesignerBlueprintVariableLibrary(document, DESIGNER_UI_TEXT.blueprint),
      selection,
      query: this.#search,
      activeTab: this.#libraryTab,
      groups: this.callbacks.getLeftPanelGroups(),
    });
    renderDesignerBlueprintInspector(
      this.#inspector,
      document,
      graph,
      selection,
      this.#inspectorTab,
      this.callbacks.getDiagnostics(),
      this.callbacks.getTrace(),
      this.callbacks.getCatalog(),
    );
    // 面板外壳是 HTML 字符串：渲染后把裸控件收口到共享原语（含下拉增强），
    // 值仍由原生元素承载，change 继续冒泡给既有命令管线。
    if (this.#library !== undefined) adoptDesignerFormControls(this.#library);
    if (this.#inspector !== undefined) adoptDesignerFormControls(this.#inspector);
    if (this.callbacks.getMode() === 'blueprint' && this.#library !== undefined) {
      syncDesignerBlueprintHostLeftPanel(
        this.#library.getRootNode() as ShadowRoot,
        this.blueprintHostGroup(this.selectedLeftPanelGroupId),
        graph.nodes.length,
      );
      this.callbacks.onActiveLeftPanelGroupChange();
    }
    if (restoreLibraryTabFocus) {
      this.#library
        ?.querySelector<HTMLButtonElement>(`[data-blueprint-library-tab="${this.#libraryTab}"]`)
        ?.focus();
    }
  }

  onClick(target: Element): boolean {
    const libraryTab = target.closest<HTMLButtonElement>('[data-blueprint-library-tab]')?.dataset
      .blueprintLibraryTab;
    if (isLibraryTab(libraryTab, this.callbacks.getLeftPanelGroups())) {
      this.#libraryTab = libraryTab;
      this.callbacks.expandLeftPanel();
      this.render();
      this.#library
        ?.querySelector<HTMLButtonElement>(`[data-blueprint-library-tab="${libraryTab}"]`)
        ?.focus();
      return true;
    }
    const inspectorTab = target.closest<HTMLButtonElement>('[data-blueprint-inspector-tab]')
      ?.dataset.blueprintInspectorTab;
    if (isInspectorTab(inspectorTab)) {
      this.#inspectorTab = inspectorTab;
      this.render();
      this.#inspector
        ?.querySelector<HTMLButtonElement>(`[data-blueprint-inspector-tab="${inspectorTab}"]`)
        ?.focus();
      return true;
    }
    const element = target.closest<HTMLElement>(
      '[data-blueprint-select-node], [data-blueprint-select-edge], [data-blueprint-add-component], [data-blueprint-add-variable], [data-blueprint-add-canvas], [data-blueprint-insert-node], [data-blueprint-delete], [data-blueprint-nodes-enabled], [data-blueprint-edge-order], [data-blueprint-clear-trace]',
    );
    if (element === null) return false;
    const data = element.dataset;
    if (data.blueprintSelectNode !== undefined) {
      this.callbacks.select({ nodes: [data.blueprintSelectNode], edges: [] }, true);
      return true;
    }
    if (data.blueprintSelectEdge !== undefined) {
      this.callbacks.select({ nodes: [], edges: [data.blueprintSelectEdge] }, true);
      return true;
    }
    if (data.blueprintAddComponent !== undefined) {
      this.insert({ kind: 'component', componentId: data.blueprintAddComponent });
      return true;
    }
    if (data.blueprintAddVariable !== undefined) {
      this.insert({ kind: 'variable', variableId: data.blueprintAddVariable });
      return true;
    }
    if (data.blueprintAddCanvas !== undefined) {
      this.insert(
        data.blueprintAddCanvas === ''
          ? { kind: 'main-canvas' }
          : { kind: 'sub-canvas', canvasId: data.blueprintAddCanvas },
      );
      return true;
    }
    const insertKind = data.blueprintInsertNode;
    if (
      insertKind === 'host' ||
      insertKind === 'lifecycle' ||
      insertKind === 'timer' ||
      insertKind === 'condition'
    ) {
      this.insert({ kind: insertKind });
      return true;
    }
    if (data.blueprintClearTrace !== undefined) {
      this.callbacks.clearTrace();
      return true;
    }
    const document = this.callbacks.getDocument();
    if (document === undefined) return true;
    if (data.blueprintDelete !== undefined) {
      const result = this.callbacks.commitBlueprint(
        deleteDesignerBlueprintSelection(document.blueprint, this.callbacks.getSelection()),
      );
      if (result.ok) this.callbacks.select(EMPTY_BLUEPRINT_CANVAS_SELECTION, false);
      this.report(result);
      return true;
    }
    if (data.blueprintNodesEnabled !== undefined) {
      this.report(
        this.callbacks.commitBlueprint(
          setDesignerBlueprintNodesEnabled(
            document.blueprint,
            new Set(this.callbacks.getSelection().nodes),
            data.blueprintNodesEnabled === 'true',
          ),
        ),
      );
      return true;
    }
    const order = data.blueprintEdgeOrder;
    if ((order === 'earlier' || order === 'later') && data.edgeId !== undefined) {
      this.report(
        this.callbacks.commitBlueprint(
          reorderDesignerBlueprintEdge(document.blueprint, data.edgeId, order),
        ),
      );
      return true;
    }
    return true;
  }

  onDragStart(event: DragEvent): boolean {
    const target = event.target instanceof Element ? event.target : null;
    const source = target?.closest<HTMLElement>('[data-blueprint-drag-kind]');
    const transfer = event.dataTransfer;
    if (source === null || source === undefined || transfer === null) return false;
    const kind = source.dataset.blueprintDragKind;
    let payload: BaseScreenBlueprintCanvasInsertNode | undefined;
    if (kind === 'component' && source.dataset.componentId !== undefined) {
      payload = { kind, componentId: source.dataset.componentId };
    } else if (kind === 'variable' && source.dataset.variableId !== undefined) {
      payload = { kind, variableId: source.dataset.variableId };
    } else if (kind === 'sub-canvas' && source.dataset.canvasId !== undefined) {
      payload = { kind, canvasId: source.dataset.canvasId };
    } else if (kind === 'main-canvas') {
      payload = { kind };
    } else if (
      kind === 'host' ||
      kind === 'lifecycle' ||
      kind === 'timer' ||
      kind === 'condition'
    ) {
      payload = { kind };
    }
    if (payload === undefined) return false;
    transfer.effectAllowed = 'copy';
    transfer.setData(BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME, JSON.stringify(payload));
    transfer.setData('text/plain', source.dataset.blueprintDragLabel ?? payload.kind);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target as Element | null;
    const tab = target?.closest<HTMLButtonElement>(
      '[data-blueprint-library-tab], [data-blueprint-inspector-tab]',
    );
    if (tab === null || tab === undefined) return false;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return false;
    }
    event.preventDefault();
    const selector =
      tab.dataset.blueprintLibraryTab === undefined
        ? '[data-blueprint-inspector-tab]'
        : '[data-blueprint-library-tab]';
    const owner = tab.dataset.blueprintLibraryTab === undefined ? this.#inspector : this.#library;
    const tabs = [...(owner?.querySelectorAll<HTMLButtonElement>(selector) ?? [])];
    if (tabs.length === 0) return true;
    const current = tabs.indexOf(tab);
    const next =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs.at(-1)
          : tabs[
              (current +
                (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) +
                tabs.length) %
                tabs.length
            ];
    next?.click();
    return true;
  }

  onInput(target: Element): boolean {
    const search = target.closest<HTMLInputElement>('[data-blueprint-library-search]');
    if (search === null) return false;
    this.#search = search.value;
    this.render();
    const refreshed = this.#library?.querySelector<HTMLInputElement>(
      '[data-blueprint-library-search]',
    );
    refreshed?.focus();
    refreshed?.setSelectionRange(refreshed.value.length, refreshed.value.length);
    return true;
  }

  onChange(target: Element): boolean {
    const document = this.callbacks.getDocument();
    const element = target as HTMLInputElement | HTMLSelectElement;
    const expressionHost = target.closest<HTMLElement>('[data-blueprint-expression]');
    if (expressionHost !== null) {
      if (document !== undefined) this.changeExpression(document, expressionHost, element);
      return true;
    }
    const nodeField = element.dataset.blueprintNodeField;
    const nodeId = element.dataset.nodeId;
    if (nodeField !== undefined && nodeId !== undefined) {
      // 启用状态是开关（checkbox）：取勾选态，不取 `value`（未设置时恒为 "on"）。
      const value =
        element instanceof HTMLInputElement && element.type === 'checkbox'
          ? String(element.checked)
          : element.value;
      if (document !== undefined) this.changeNode(document, nodeId, nodeField, value);
      return true;
    }
    const edgeField = element.dataset.blueprintEdgeField;
    const edgeId = element.dataset.edgeId;
    if (edgeField !== undefined && edgeId !== undefined) {
      const value =
        element instanceof HTMLInputElement && element.type === 'checkbox'
          ? String(element.checked)
          : element.value;
      if (document !== undefined) this.changeEdge(document, edgeId, edgeField, value);
      return true;
    }
    return false;
  }

  private insert(spec: DesignerBlueprintNodeSpec): void {
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    const inserted = insertDesignerBlueprintNode(document, spec);
    if (inserted === null) {
      this.report({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'AUTHORING_REQUEST_INVALID',
            path: [],
            message: DESIGNER_UI_TEXT.blueprint.invalidCommand,
          },
        ],
      });
      return;
    }
    const result = inserted.created
      ? this.callbacks.commitBlueprint(inserted.blueprint)
      : { ok: true as const, value: document, diagnostics: [] };
    if (result.ok) this.callbacks.select({ nodes: [inserted.nodeId], edges: [] }, true);
    this.report(result);
  }

  private changeNode(document: ScreenDocument, nodeId: string, field: string, value: string): void {
    const node = findBlueprintNode(document.blueprint, nodeId);
    if (node === undefined) return;
    let next: ScreenBlueprint | null = null;
    if (field === 'name') {
      next = updateDesignerBlueprintNode(document.blueprint, nodeId, { type: 'name', name: value });
    } else if (field === 'enabled') {
      next = updateDesignerBlueprintNode(document.blueprint, nodeId, {
        type: 'enabled',
        enabled: value === 'true',
      });
    } else if (field === 'interval') {
      next = updateDesignerBlueprintNode(document.blueprint, nodeId, {
        type: 'interval',
        intervalSeconds: Number(value),
      });
    } else if (field === 'operator' && node.kind === 'condition' && OPERATORS.has(value)) {
      const operator = value as ScreenBlueprintCondition['operator'];
      const condition: ScreenBlueprintCondition =
        operator === 'exists'
          ? { left: node.condition.left, operator }
          : {
              left: node.condition.left,
              operator,
              right: node.condition.right ?? { kind: 'literal', value: null },
            };
      next = updateDesignerBlueprintNode(document.blueprint, nodeId, {
        type: 'condition',
        condition,
      });
    }
    this.commitOrRestore(next);
  }

  private changeEdge(document: ScreenDocument, edgeId: string, field: string, value: string): void {
    const edge = findBlueprintEdge(document.blueprint, edgeId);
    if (edge === undefined) return;
    let next: ScreenBlueprint | null = null;
    if (
      field === 'role' &&
      (value === 'related' || value === 'detail' || value === 'group' || value === 'drill-down')
    ) {
      next = updateDesignerBlueprintEdge(document.blueprint, edgeId, { type: 'role', role: value });
    } else if (field === 'target-port') {
      const target = document.blueprint.nodes.find((node) => node.id === edge.to.node);
      const firstState =
        target?.kind === 'component'
          ? document.components.find((component) => component.id === target.componentId)?.states
              ?.items[0]?.id
          : undefined;
      next = updateDesignerBlueprintEdge(document.blueprint, edgeId, {
        type: 'target-port',
        port: value,
        ...(firstState === undefined ? {} : { stateId: firstState }),
      });
    } else if (field === 'state' && edge.kind === 'flow') {
      next = updateDesignerBlueprintEdge(document.blueprint, edgeId, {
        type: 'state',
        stateId: value,
      });
    } else if (field === 'host-event' && EVENT_NAME.test(value.trim())) {
      next = updateDesignerBlueprintEdge(document.blueprint, edgeId, {
        type: 'target-port',
        port: `event:${value.trim()}`,
      });
    } else if (field === 'payload-enabled' && edge.kind === 'flow') {
      next = updateDesignerBlueprintEdge(document.blueprint, edgeId, {
        type: 'payload',
        payload: value === 'true' ? { kind: 'event-payload', path: [] } : null,
      });
    } else if (field === 'transition-effect' && edge.kind === 'flow') {
      next = updateDesignerBlueprintEdge(document.blueprint, edgeId, {
        type: 'transition',
        transition:
          value === 'appear' || value === 'fade' || value === 'slide-up'
            ? {
                effect: value,
                durationMs: edge.transition?.durationMs ?? 200,
                easing: edge.transition?.easing ?? 'ease-in-out-quad',
              }
            : null,
      });
    } else if (
      field === 'transition-duration' &&
      edge.kind === 'flow' &&
      edge.transition !== undefined
    ) {
      const durationMs = Number(value);
      if (Number.isInteger(durationMs) && durationMs >= 0 && durationMs <= 10_000) {
        next = updateDesignerBlueprintEdge(document.blueprint, edgeId, {
          type: 'transition',
          transition: { ...edge.transition, durationMs },
        });
      }
    }
    this.commitOrRestore(next);
  }

  /** 表达式编辑器写回：来源切换给默认值，其余部件按来源解析当前输入。 */
  private changeExpression(
    document: ScreenDocument,
    host: HTMLElement,
    changed: HTMLInputElement | HTMLSelectElement,
  ): void {
    const slot = host.dataset.blueprintExpression;
    const owner = host.dataset.expressionOwner;
    const ownerId = host.dataset.expressionOwnerId;
    if (slot === undefined || ownerId === undefined) return;
    const part = changed.dataset.expressionPart;
    let expression: ScreenBlueprintValueExpression | undefined;
    if (part === 'source') {
      const source = changed.value;
      if (source === 'literal') expression = { kind: 'literal', value: null };
      else if (source === 'event') expression = { kind: 'event-payload', path: [] };
      else if (source === 'event-field') {
        const fields =
          owner === 'edge'
            ? designerBlueprintEventFieldPaths(document, ownerId, this.callbacks.getCatalog())
            : [];
        expression = { kind: 'event-payload', path: fields[0] ?? ['value'] };
      } else if (source === 'variable') {
        const first = readDesignerVariableViews(document)[0];
        if (first !== undefined) expression = { kind: 'variable', variableId: first.id };
      }
    } else if (part === 'literal') {
      try {
        const parsed = parseScreenJsonValue(JSON.parse(changed.value) as unknown);
        if (parsed.ok) expression = { kind: 'literal', value: parsed.value };
      } catch {
        expression = undefined;
      }
    } else if (part === 'field') {
      const path = parseDesignerBlueprintEventFieldPath(changed.value);
      if (path !== null) expression = { kind: 'event-payload', path };
    } else if (part === 'variable') {
      expression = { kind: 'variable', variableId: changed.value };
    }
    if (expression === undefined) {
      this.report({
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'AUTHORING_REQUEST_INVALID',
            path: [],
            message:
              part === 'field'
                ? DESIGNER_UI_TEXT.blueprint.eventFieldInvalid
                : DESIGNER_UI_TEXT.blueprint.graph.simulation.invalidPayload,
          },
        ],
      });
      this.render();
      return;
    }
    let next: ScreenBlueprint | null = null;
    if (owner === 'edge' && (slot === 'value' || slot === 'payload')) {
      next = updateDesignerBlueprintEdge(
        document.blueprint,
        ownerId,
        slot === 'value'
          ? { type: 'value', value: expression }
          : { type: 'payload', payload: expression },
      );
    } else if (owner === 'node' && (slot === 'left' || slot === 'right')) {
      const node = findBlueprintNode(document.blueprint, ownerId);
      if (node?.kind === 'condition') {
        next = updateDesignerBlueprintNode(document.blueprint, ownerId, {
          type: 'condition',
          condition: { ...node.condition, [slot]: expression },
        });
      }
    }
    this.commitOrRestore(next);
  }

  private commitOrRestore(next: ScreenBlueprint | null): void {
    if (next === null) {
      this.render();
      return;
    }
    const result = this.callbacks.commitBlueprint(next);
    if (!result.ok) this.render();
    this.report(result);
  }

  private report(result: ScreenParseResult<unknown>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private reconcileLibraryTab(): void {
    const groupId = this.selectedLeftPanelGroupId;
    if (groupId !== undefined && this.blueprintHostGroup(groupId) === undefined) {
      this.#libraryTab = 'components';
    }
  }

  private hasLibraryTabFocus(): boolean {
    const root = this.#library?.getRootNode() as ShadowRoot | undefined;
    const tab = root?.activeElement?.closest('[data-blueprint-library-tab]');
    return tab !== null && tab !== undefined;
  }

  private blueprintHostGroup(
    groupId: string | undefined,
  ): BaseScreenDesignerLeftPanelGroup | undefined {
    if (groupId === undefined) return undefined;
    return this.callbacks
      .getLeftPanelGroups()
      ?.find(
        (group) =>
          group.id === groupId && baseScreenDesignerLeftPanelGroupSupportsMode(group, 'blueprint'),
      );
  }
}
