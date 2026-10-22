import {
  type ScreenBlueprint,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  componentBlueprintNodeId,
  deleteDesignerBlueprintSelection,
  insertDesignerBlueprintComponentNode,
  insertDesignerBlueprintVariableNode,
  updateDesignerBlueprintAction,
  updateDesignerBlueprintCondition,
  variableBlueprintNodeId,
} from '../../../common/operations/blueprint/designer-blueprint-model.js';
import type {
  BaseScreenBlueprintCanvasGraph,
  BaseScreenBlueprintCanvasInsertNode,
  BaseScreenBlueprintCanvasNode,
  BaseScreenBlueprintCanvasSelection,
  BaseScreenBlueprintCanvasTrace,
  BaseScreenDesignerWorkbenchMode,
} from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { BASE_SCREEN_BLUEPRINT_NODE_DRAG_MIME } from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import { insertDesignerBlueprintLibraryNode } from '../../../common/operations/blueprint/designer-blueprint-unconnected-nodes.js';
import {
  type BaseScreenDesignerLeftPanelGroup,
  baseScreenDesignerLeftPanelGroupSupportsMode,
} from '../../../common/operations/workbench/designer-left-panel-groups.js';
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
import {
  isDesignerBlueprintConditionOperator,
  updateDesignerBlueprintActionFromTarget,
} from './designer-blueprint-panel-mutations.js';
import { isInspectorTab, isLibraryTab } from './designer-blueprint-panel-tabs.js';

export interface DesignerBlueprintPanelsCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getGraph: () => BaseScreenBlueprintCanvasGraph;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getComponentLibrary: () => readonly BaseScreenBlueprintCanvasNode[];
  readonly getSelection: () => BaseScreenBlueprintCanvasSelection;
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
    const componentLibrary = this.callbacks.getComponentLibrary();
    const selection = this.callbacks.getSelection();
    renderDesignerBlueprintLibrary(
      this.#library,
      document,
      graph,
      componentLibrary,
      selection,
      this.#search,
      this.#libraryTab,
      this.callbacks.getLeftPanelGroups(),
    );
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
        componentLibrary.length,
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
    const selectedNode = target.closest<HTMLElement>('[data-blueprint-select-node]')?.dataset
      .blueprintSelectNode;
    if (selectedNode !== undefined) {
      this.callbacks.select({ kind: 'node', id: selectedNode }, true);
      return true;
    }
    const componentId = target.closest<HTMLElement>('[data-blueprint-add-component]')?.dataset
      .blueprintAddComponent;
    if (componentId !== undefined) {
      const document = this.callbacks.getDocument();
      const id = componentBlueprintNodeId(componentId);
      if (this.callbacks.getGraph().nodes.some((node) => node.id === id)) {
        this.callbacks.select({ kind: 'node', id }, true);
        return true;
      }
      const result = this.callbacks.commitBlueprint(
        document === undefined ? null : insertDesignerBlueprintComponentNode(document, componentId),
      );
      if (result.ok) this.callbacks.select({ kind: 'node', id }, true);
      this.report(result);
      return true;
    }
    const variableId = target.closest<HTMLElement>('[data-blueprint-add-variable]')?.dataset
      .blueprintAddVariable;
    if (variableId !== undefined) {
      const document = this.callbacks.getDocument();
      const id = variableBlueprintNodeId(variableId);
      if (this.callbacks.getGraph().nodes.some((node) => node.id === id)) {
        this.callbacks.select({ kind: 'node', id }, true);
        return true;
      }
      const result = this.callbacks.commitBlueprint(
        document === undefined ? null : insertDesignerBlueprintVariableNode(document, variableId),
      );
      if (result.ok) this.callbacks.select({ kind: 'node', id }, true);
      this.report(result);
      return true;
    }
    const insert = target.closest<HTMLButtonElement>('[data-blueprint-insert]');
    if (insert !== null) {
      const kind = insert.dataset.blueprintInsert;
      if (kind === 'condition' || kind === 'set-variable' || kind === 'emit-host-event') {
        const document = this.callbacks.getDocument();
        const insertion =
          document === undefined
            ? null
            : insertDesignerBlueprintLibraryNode(document, kind, insert.dataset.variableId);
        const result = this.callbacks.commitBlueprint(insertion?.blueprint ?? null);
        if (result.ok && insertion !== null) {
          this.callbacks.select({ kind: 'node', id: insertion.nodeId }, true);
        }
        this.report(result);
      }
      return true;
    }
    if (target.closest('[data-blueprint-delete]') !== null) {
      const document = this.callbacks.getDocument();
      const selection = this.callbacks.getSelection();
      const result = this.callbacks.commitBlueprint(
        document === undefined || selection === null
          ? null
          : deleteDesignerBlueprintSelection(document.blueprint, selection),
      );
      if (result.ok) this.callbacks.select(null, false);
      this.report(result);
      return true;
    }
    return false;
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
    } else if (kind === 'condition' || kind === 'set-variable' || kind === 'emit-host-event') {
      payload = {
        kind,
        ...(source.dataset.variableId === undefined
          ? {}
          : { variableId: source.dataset.variableId }),
      };
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
    const ruleId = (target as HTMLElement).dataset.ruleId;
    if (ruleId === undefined) return false;
    const document = this.callbacks.getDocument();
    if (document === undefined) return true;
    if (target.matches('[data-blueprint-condition-operator]')) {
      const value = (target as HTMLSelectElement).value;
      const rule = document.blueprint.rules.find((item) => item.id === ruleId);
      this.report(
        this.callbacks.commitBlueprint(
          rule?.condition === undefined || !isDesignerBlueprintConditionOperator(value)
            ? null
            : updateDesignerBlueprintCondition(document.blueprint, ruleId, {
                ...rule.condition,
                operator: value,
              }),
        ),
      );
      return true;
    }
    const actionIndex = Number((target as HTMLElement).dataset.actionIndex);
    const action = document.blueprint.rules.find((item) => item.id === ruleId)?.actions[
      actionIndex
    ];
    if (!Number.isInteger(actionIndex) || action === undefined) return true;
    const updated = updateDesignerBlueprintActionFromTarget(
      target,
      document,
      action,
      this.callbacks.getCatalog(),
    );
    if (!updated.ok) {
      this.callbacks.emitDiagnostics(updated.diagnostics);
      return true;
    }
    if (updated.value !== null) {
      this.report(
        this.callbacks.commitBlueprint(
          updateDesignerBlueprintAction(document.blueprint, ruleId, actionIndex, updated.value),
        ),
      );
    }
    return true;
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
