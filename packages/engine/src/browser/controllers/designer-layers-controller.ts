import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenComponentPatch,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createReparentTransaction,
  createSiblingReorderTransaction,
  createSiblingSelectionReorderTransaction,
  createZOrderTransaction,
} from '../../common/operations/designer-layout-operations.js';
import {
  createDesignerLayerView,
  DESIGNER_LAYER_PAGE_SIZE,
  renderDesignerLayers,
} from '../dom/designer-layers-dom.js';
import type {
  DesignerLayerArrangeAction,
  DesignerLayerGroupAction,
} from '../dom/designer-layers-toolbar-dom.js';

export interface DesignerLayersControllerCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly canGroup?: () => boolean;
  readonly canUngroup?: () => boolean;
  readonly group?: () => ScreenParseResult<ScreenDocument>;
  readonly ungroup?: () => ScreenParseResult<ScreenDocument>;
  readonly locateComponent?: (componentId: string) => void;
}

// 图层单击会同步重绘树节点，浏览器因此可能无法在第二个新节点上合成原生 dblclick。
// 保留一个紧凑的同图层点击窗口，用于跨 DOM 替换恢复桌面端双击语义。
const LAYER_RENAME_DOUBLE_CLICK_MS = 500;

export class DesignerLayersController {
  #search = '';
  #collapsed = new Set<string>();
  #dropTargetId: string | null | undefined;
  #draggedLayerId: string | undefined;
  #layers: HTMLElement | undefined;
  #renameDrafts = new Map<string, string>();
  #renamingId: string | undefined;
  #lastLayerClick: { readonly componentId: string; readonly timeStamp: number } | undefined;
  #renderLimit = DESIGNER_LAYER_PAGE_SIZE;

  constructor(private readonly callbacks: DesignerLayersControllerCallbacks) {}

  render(layers: HTMLElement | undefined): void {
    if (layers === undefined) return;
    this.#layers = layers;
    const view = createDesignerLayerView(this.callbacks.getDocument(), this.callbacks.getCatalog());
    renderDesignerLayers(layers, view, {
      interaction: this.callbacks.getInteraction(),
      search: this.#search,
      collapsed: this.#collapsed,
      dropTargetId: this.#dropTargetId,
      renameDrafts: this.#renameDrafts,
      renamingId: this.#renamingId,
      renderLimit: this.#renderLimit,
      toolbarState: {
        arrange: {
          front: this.canArrangeSelection('front'),
          up: this.canArrangeSelection('up'),
          down: this.canArrangeSelection('down'),
          back: this.canArrangeSelection('back'),
        },
        group: this.callbacks.canGroup?.() ?? false,
        ungroup: this.callbacks.canUngroup?.() ?? false,
      },
      canMove: (id, direction, siblings) => this.canMove(id, direction, siblings),
    });
    if (view.diagnostics.length > 0) this.callbacks.emitDiagnostics(view.diagnostics);
  }

  onClick(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (
      target.closest(
        '[data-layer-show-more], [data-layer-arrange], [data-layer-group-action], [data-layer-locate], [data-layer-collapse], [data-layer-toggle], [data-layer-move], .layer-actions, [data-layer-rename]',
      ) !== null ||
      (target.closest('[data-layer-select]') === null &&
        target.closest('[data-layer-selectable="true"]') === null)
    ) {
      this.#lastLayerClick = undefined;
    }
    const showMore = target.closest<HTMLElement>('[data-layer-show-more]');
    if (showMore !== null) {
      this.#renderLimit += DESIGNER_LAYER_PAGE_SIZE;
      this.render(showMore.closest<HTMLElement>('[data-layers]') ?? this.#layers);
      return true;
    }
    const arrange = target.closest<HTMLElement>('[data-layer-arrange]')?.dataset.layerArrange as
      | DesignerLayerArrangeAction
      | undefined;
    if (arrange !== undefined) {
      this.arrangeSelection(arrange);
      return true;
    }
    const groupAction = target.closest<HTMLElement>('[data-layer-group-action]')?.dataset
      .layerGroupAction as DesignerLayerGroupAction | undefined;
    if (groupAction !== undefined) {
      const result = this.callbacks[groupAction]?.();
      if (result !== undefined) this.report(result);
      return true;
    }
    const locate = target.closest<HTMLElement>('[data-layer-locate]')?.dataset.layerLocate;
    if (locate !== undefined) {
      this.callbacks.locateComponent?.(locate);
      return true;
    }
    const select = target.closest<HTMLElement>('[data-layer-select]');
    if (select !== null) {
      this.selectFromLayerClick(select.dataset.layerSelect!, event as MouseEvent);
      return true;
    }
    const collapse = target.closest<HTMLElement>('[data-layer-collapse]');
    if (collapse?.dataset.layerCollapse !== undefined) {
      const id = collapse.dataset.layerCollapse;
      if (this.#collapsed.has(id)) this.#collapsed.delete(id);
      else this.#collapsed.add(id);
      this.render(collapse.closest<HTMLElement>('[data-layers]') ?? undefined);
      return true;
    }
    const toggle = target.closest<HTMLElement>('[data-layer-toggle]');
    if (toggle !== null) {
      this.toggle(toggle.dataset.layerId!, toggle.dataset.layerToggle!);
      return true;
    }
    const move = target.closest<HTMLElement>('[data-layer-move]');
    if (move !== null) {
      this.move(move.dataset.layerId!, move.dataset.layerMove as 'up' | 'down');
      return true;
    }
    // 操作簇的空隙属于操作区，不应穿透为行选择；重命名输入由自身编辑流程接管。
    if (target.closest('.layer-actions') !== null) return true;
    if (target.closest('[data-layer-rename]') !== null) return false;
    // DataV 风格整行命中：除折叠与独立操作按钮外，高亮到哪里就可以点到哪里。
    const row = target.closest<HTMLElement>('[data-layer-selectable="true"]');
    if (row?.dataset.layerId !== undefined) {
      this.selectFromLayerClick(row.dataset.layerId, event as MouseEvent);
      return true;
    }
    return false;
  }

  onInput(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.layerSearch !== undefined) {
      this.#search = target.value;
      this.#renderLimit = DESIGNER_LAYER_PAGE_SIZE;
      this.render(target.closest<HTMLElement>('[data-layers]') ?? undefined);
      return true;
    }
    const id = target.dataset.layerRename;
    if (id === undefined) return false;
    this.#renameDrafts.set(id, target.value);
    return true;
  }

  onChange(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.layerSearch !== undefined) return true;
    const id = target.dataset.layerRename;
    if (id === undefined) return false;
    this.commitRename(id, target.value);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (isLayerSelectButton(target)) {
      return this.navigateTree(target, event);
    }
    if (!(target instanceof HTMLInputElement) || target.dataset.layerRename === undefined)
      return false;
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === target.dataset.layerRename);
    if (component === undefined) return false;
    if (event.key === 'Escape') {
      this.#renameDrafts.delete(component.id);
      target.value = component.name;
      this.endRename();
      event.preventDefault();
      return true;
    }
    if (event.key !== 'Enter' || event.isComposing) return false;
    event.preventDefault();
    this.commitRename(component.id, target.value);
    return true;
  }

  // 双击图层名称进入重命名：重命名输入框只在编辑期存在，名称行保持单行展示。
  onDoubleClick(event: MouseEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (
      target.closest('.layer-actions') !== null ||
      target.closest('[data-layer-collapse], [data-layer-rename]') !== null
    )
      return false;
    const select = target.closest<HTMLElement>('[data-layer-select]');
    const row = target.closest<HTMLElement>('[data-layer-selectable="true"]');
    const id = select?.dataset.layerSelect ?? row?.dataset.layerId;
    if (id === undefined) return false;
    this.#lastLayerClick = undefined;
    const renamed = this.beginRename(id);
    if (renamed) event.preventDefault?.();
    return renamed;
  }

  // 焦点离开重命名输入：值有变化时 change 事件随后接管提交；无变化时直接退出编辑态，
  // 避免只读 Tab/点击空白后重命名输入残留。
  // 渲染重建会移除聚焦中的输入框并同步派发 focusout：此时目标已脱离文档（isConnected
  // false），状态由渲染方持有，必须忽略，否则会在外层渲染中途重入 endRename/render，
  // 使陈旧的 renamingId 快照把面板渲染回重命名态。
  onFocusOut(event: FocusEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.layerRename === undefined)
      return false;
    if (!target.isConnected) return true;
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === target.dataset.layerRename);
    if (component === undefined || target.value !== component.name) return true;
    this.#renameDrafts.delete(component.id);
    this.endRename();
    return true;
  }

  private navigateTree(target: HTMLButtonElement, event: KeyboardEvent): boolean {
    const root = target.closest<HTMLElement>('[data-layer-root]');
    if (root === null) return false;
    const controls = [...root.querySelectorAll<HTMLButtonElement>('[data-layer-select]')].filter(
      (control) => !control.disabled,
    );
    const index = controls.indexOf(target);
    const nextIndex =
      event.key === 'ArrowDown'
        ? index + 1
        : event.key === 'ArrowUp'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? controls.length - 1
              : undefined;
    if (nextIndex === undefined) return false;
    const next = controls[nextIndex];
    if (next === undefined) return true;
    event.preventDefault();
    next.focus();
    this.select(next.dataset.layerSelect!, event);
    return true;
  }

  onDragStart(event: DragEvent): boolean {
    const row = getLayerRow(event.target);
    const document = this.callbacks.getDocument();
    if (row === undefined || document === undefined) return false;
    if (
      isScreenComponentEffectivelyHidden(document, row) ||
      isScreenComponentEffectivelyLocked(document, row)
    ) {
      return false;
    }
    this.#draggedLayerId = row;
    this.setDropTarget(undefined);
    event.dataTransfer?.setData('text/plain', row);
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.effectAllowed = 'move';
    }
    return true;
  }

  onDragOver(event: DragEvent): boolean {
    const parentId = getDropParent(event.target);
    if (
      this.#draggedLayerId === undefined ||
      parentId === undefined ||
      parentId === this.#draggedLayerId
    ) {
      this.setDropTarget(undefined);
      return false;
    }
    if (!this.canReparent(this.draggedSelection(), parentId)) {
      this.setDropTarget(undefined);
      return false;
    }
    event.preventDefault();
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.setDropTarget(parentId);
    return true;
  }

  onDrop(event: DragEvent): boolean {
    const parentId = getDropParent(event.target);
    const componentIds = this.draggedSelection();
    this.#draggedLayerId = undefined;
    this.setDropTarget(undefined);
    if (
      parentId === undefined ||
      componentIds.length === 0 ||
      !this.canReparent(componentIds, parentId)
    ) {
      return false;
    }
    event.preventDefault();
    this.report(
      this.callbacks.executeTransaction(
        createReparentTransaction(this.callbacks.getDocument()!, componentIds, parentId),
      ),
    );
    return true;
  }

  clearDrag(): void {
    this.#draggedLayerId = undefined;
    this.setDropTarget(undefined);
  }

  clearSessionState(): void {
    this.#search = '';
    this.#collapsed.clear();
    this.#draggedLayerId = undefined;
    this.#dropTargetId = undefined;
    this.#renameDrafts.clear();
    this.#renamingId = undefined;
    this.#lastLayerClick = undefined;
    this.#renderLimit = DESIGNER_LAYER_PAGE_SIZE;
    this.render(this.#layers);
    // 释放面板引用：断开场景不再牵住 detached 节点；下一次 render(layers) 会重新注入。
    this.#layers = undefined;
  }

  private select(componentId: string, event: Event): void {
    const modifiers = event as MouseEvent;
    if (modifiers.shiftKey || modifiers.ctrlKey || modifiers.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId });
      return;
    }
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
  }

  private selectFromLayerClick(componentId: string, event: MouseEvent): void {
    const modified = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    const primary = event.button === 0 || event.button === undefined;
    const pointerClick = event.detail > 0;
    const timeStamp = Number.isFinite(event.timeStamp) ? event.timeStamp : undefined;
    const repeated =
      !modified &&
      primary &&
      pointerClick &&
      (event.detail >= 2 ||
        (timeStamp !== undefined &&
          this.#lastLayerClick?.componentId === componentId &&
          timeStamp - this.#lastLayerClick.timeStamp >= 0 &&
          timeStamp - this.#lastLayerClick.timeStamp <= LAYER_RENAME_DOUBLE_CLICK_MS));

    this.#lastLayerClick =
      !modified && primary && pointerClick && timeStamp !== undefined
        ? { componentId, timeStamp }
        : undefined;
    if (repeated && this.beginRename(componentId)) {
      this.#lastLayerClick = undefined;
      event.preventDefault();
      return;
    }
    this.select(componentId, event);
  }

  private beginRename(componentId: string): boolean {
    const document = this.callbacks.getDocument();
    const component = document?.components.find((item) => item.id === componentId);
    if (
      document === undefined ||
      component === undefined ||
      isScreenComponentEffectivelyHidden(document, componentId) ||
      isScreenComponentEffectivelyLocked(document, componentId)
    )
      return false;
    this.#renamingId = componentId;
    this.render(this.#layers);
    const rename = this.#layers?.querySelector<HTMLInputElement>('[data-layer-rename]');
    rename?.focus();
    rename?.select();
    return true;
  }

  private toggle(componentId: string, property: string): void {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === componentId);
    if (component === undefined || (property !== 'hidden' && property !== 'locked')) return;
    this.update(componentId, {
      status: { ...component.status, [property]: !component.status[property] },
    });
  }

  private move(componentId: string, direction: 'up' | 'down'): void {
    if (!this.canMove(componentId, direction)) return;
    const document = this.callbacks.getDocument()!;
    const transaction = createSiblingReorderTransaction(document, componentId, direction);
    if (transaction !== undefined) this.report(this.callbacks.executeTransaction(transaction));
  }

  private arrangeSelection(action: DesignerLayerArrangeAction): void {
    const transaction = this.arrangeSelectionTransaction(action);
    if (transaction !== undefined) this.report(this.callbacks.executeTransaction(transaction));
  }

  private canArrangeSelection(action: DesignerLayerArrangeAction): boolean {
    return this.arrangeSelectionTransaction(action) !== undefined;
  }

  private arrangeSelectionTransaction(
    action: DesignerLayerArrangeAction,
  ): ScreenDocumentTransaction | undefined {
    const document = this.callbacks.getDocument();
    if (document === undefined) return undefined;
    const componentIds = this.callbacks.getInteraction().selectedComponentIds;
    return action === 'front' || action === 'back'
      ? createZOrderTransaction(document, componentIds, action)
      : createSiblingSelectionReorderTransaction(document, componentIds, action);
  }

  private update(componentId: string, patch: ScreenComponentPatch): void {
    this.report(
      this.callbacks.executeTransaction({
        commands: [{ type: 'update-components', componentIds: [componentId], patch }],
      }),
    );
  }

  private commitRename(componentId: string, name: string): void {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === componentId);
    if (component === undefined || component.name === name) {
      this.#renameDrafts.delete(componentId);
      this.endRename();
      return;
    }
    const result = this.callbacks.executeTransaction({
      commands: [{ type: 'update-components', componentIds: [componentId], patch: { name } }],
    });
    this.#renameDrafts.delete(componentId);
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
    this.endRename();
  }

  // 无条件退出并重绘：事务路径会同步触发一次携带旧 renamingId 快照的面板渲染，
  // 若这里按标志提前返回，残留的重命名 DOM 将无法被修正。渲染幂等，代价可忽略。
  private endRename(): void {
    this.#renamingId = undefined;
    this.render(this.#layers);
  }

  // 渲染路径传入视图已排序的兄弟表（避免每行重新 filter+sort）；未传时（如 move
  // 点击路径）自行计算，排序规则与 createDesignerLayerView 一致（最前层在顶部）。
  private canMove(
    componentId: string,
    direction: 'up' | 'down',
    siblings?: readonly string[],
  ): boolean {
    const document = this.callbacks.getDocument();
    const component = document?.components.find((item) => item.id === componentId);
    if (
      document === undefined ||
      component === undefined ||
      isScreenComponentEffectivelyLocked(document, componentId)
    ) {
      return false;
    }
    const ordered = siblings ?? getSiblingIds(document, component.parentId);
    const index = ordered.indexOf(componentId);
    if (index < 0) return false;
    // 上移 = 向列表顶部/绘制前层移动，下移 = 向列表底部/绘制后层移动。
    // 被移动组件与目标位置之间的全部兄弟都不得锁定：任何锁定兄弟都会迫使
    // 本组件（或与它交换 zIndex 的中间组件）跨越锁定边界，破坏锁定约束。
    const targetIndex = index + (direction === 'up' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= ordered.length) return false;
    const span =
      direction === 'up'
        ? ordered.slice(targetIndex, index)
        : ordered.slice(index + 1, targetIndex + 1);
    return span.every((id) => !isScreenComponentEffectivelyLocked(document, id));
  }

  private draggedSelection(): readonly string[] {
    if (this.#draggedLayerId === undefined) return [];
    const selected = this.callbacks.getInteraction().selectedComponentIds;
    return selected.includes(this.#draggedLayerId) ? selected : [this.#draggedLayerId];
  }

  private canReparent(componentIds: readonly string[], parentId: string | null): boolean {
    const document = this.callbacks.getDocument();
    const sources =
      document === undefined
        ? []
        : componentIds.map((componentId) =>
            document.components.find((component) => component.id === componentId),
          );
    const parent =
      parentId === null
        ? undefined
        : document?.components.find((component) => component.id === parentId);
    return (
      document !== undefined &&
      componentIds.length > 0 &&
      new Set(componentIds).size === componentIds.length &&
      sources.every(
        (component) =>
          component !== undefined &&
          !isScreenComponentEffectivelyHidden(document, component.id) &&
          !isScreenComponentEffectivelyLocked(document, component.id),
      ) &&
      (parentId === null ||
        (parent !== undefined &&
          !isScreenComponentEffectivelyHidden(document, parentId) &&
          !isScreenComponentEffectivelyLocked(document, parentId) &&
          this.callbacks.getCatalog()?.get(parent.type)?.manifest.designCapabilities.children ===
            true)) &&
      applyScreenDocumentTransaction(
        document,
        createReparentTransaction(document, componentIds, parentId),
      ).ok
    );
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private setDropTarget(parentId: string | null | undefined): void {
    if (this.#dropTargetId === parentId) return;
    this.#dropTargetId = parentId;
    this.render(this.#layers);
  }
}

function isLayerSelectButton(target: EventTarget | null): target is HTMLButtonElement {
  const candidate = target as { readonly dataset?: DOMStringMap; readonly tagName?: string } | null;
  return candidate?.tagName === 'BUTTON' && candidate.dataset?.layerSelect !== undefined;
}

function getLayerRow(target: EventTarget | null): string | undefined {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    : undefined;
}

function getDropParent(target: EventTarget | null): string | null | undefined {
  if (!(target instanceof Element)) return undefined;
  const row = target.closest<HTMLElement>('[data-layer-id]');
  if (row !== null) return row.dataset.layerId;
  return target.closest<HTMLElement>('[data-layer-root]') === null ? undefined : null;
}

function getSiblingIds(document: ScreenDocument, parentId: string | null): readonly string[] {
  return document.components
    .filter((component) => component.parentId === parentId)
    .sort(
      (left, right) =>
        right.zIndex - left.zIndex ||
        document.components.indexOf(right) - document.components.indexOf(left),
    )
    .map((component) => component.id);
}
