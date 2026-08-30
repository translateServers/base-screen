import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyLocked,
  type ScreenComponentPatch,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createSiblingReorderTransaction,
  createSiblingSelectionReorderTransaction,
  createZOrderTransaction,
} from '../../common/operations/designer-layout-operations.js';
import {
  createDesignerLayerView,
  DESIGNER_LAYER_PAGE_SIZE,
  type DesignerLayerSelectionDirection,
  getDesignerLayerSelectionTarget,
  renderDesignerLayers,
} from '../dom/designer-layers-dom.js';
import type {
  DesignerLayerArrangeAction,
  DesignerLayerGroupAction,
} from '../dom/designer-layers-toolbar-dom.js';
import { DesignerLayerDragController } from './layers/designer-layer-drag-controller.js';
import { DesignerLayerRenameController } from './layers/designer-layer-rename-controller.js';

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

export class DesignerLayersController {
  #search = '';
  #collapsed = new Set<string>();
  readonly #drag: DesignerLayerDragController;
  #layers: HTMLElement | undefined;
  readonly #rename: DesignerLayerRenameController;
  #renderLimit = DESIGNER_LAYER_PAGE_SIZE;

  constructor(private readonly callbacks: DesignerLayersControllerCallbacks) {
    this.#drag = new DesignerLayerDragController({
      ...callbacks,
      onDropTargetChange: () => this.render(this.#layers),
    });
    this.#rename = new DesignerLayerRenameController({
      ...callbacks,
      getLayers: () => this.#layers,
      render: () => this.render(this.#layers),
    });
  }

  canStepSelection(direction: DesignerLayerSelectionDirection): boolean {
    return this.selectionStepTarget(direction) !== undefined;
  }

  stepSelection(direction: DesignerLayerSelectionDirection): void {
    const componentId = this.selectionStepTarget(direction);
    if (componentId === undefined) return;
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
  }

  render(layers: HTMLElement | undefined): void {
    if (layers === undefined) return;
    this.#layers = layers;
    const view = createDesignerLayerView(this.callbacks.getDocument(), this.callbacks.getCatalog());
    renderDesignerLayers(layers, view, {
      interaction: this.callbacks.getInteraction(),
      search: this.#search,
      collapsed: this.#collapsed,
      dropTargetId: this.#drag.dropTargetId,
      renameDrafts: this.#rename.drafts,
      renamingId: this.#rename.renamingId,
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
      this.#rename.clearLastLayerClick();
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
      this.#rename.selectFromLayerClick(select.dataset.layerSelect!, event as MouseEvent);
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
      this.#rename.selectFromLayerClick(row.dataset.layerId, event as MouseEvent);
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
    this.#rename.updateDraft(id, target.value);
    return true;
  }

  onChange(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return false;
    if (target.dataset.layerSearch !== undefined) return true;
    const id = target.dataset.layerRename;
    if (id === undefined) return false;
    this.#rename.commit(id, target.value);
    return true;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (isLayerSelectButton(target)) {
      return this.navigateTree(target, event);
    }
    if (!(target instanceof HTMLInputElement) || target.dataset.layerRename === undefined)
      return false;
    return this.#rename.onKeyDown(target, event);
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
    this.#rename.clearLastLayerClick();
    const renamed = this.#rename.begin(id);
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
    return this.#rename.onFocusOut(target);
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
    this.#rename.select(next.dataset.layerSelect!, event);
    return true;
  }

  onDragStart(event: DragEvent): boolean {
    return this.#drag.onDragStart(event);
  }

  onDragOver(event: DragEvent): boolean {
    return this.#drag.onDragOver(event);
  }

  onDrop(event: DragEvent): boolean {
    return this.#drag.onDrop(event);
  }

  clearDrag(): void {
    this.#drag.clear();
  }

  clearSessionState(): void {
    this.#search = '';
    this.#collapsed.clear();
    this.#drag.reset();
    this.#rename.reset();
    this.#renderLimit = DESIGNER_LAYER_PAGE_SIZE;
    this.render(this.#layers);
    // 释放面板引用：断开场景不再牵住 detached 节点；下一次 render(layers) 会重新注入。
    this.#layers = undefined;
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

  private selectionStepTarget(direction: DesignerLayerSelectionDirection): string | undefined {
    return getDesignerLayerSelectionTarget(
      createDesignerLayerView(this.callbacks.getDocument(), this.callbacks.getCatalog()),
      this.callbacks.getInteraction(),
      direction,
    );
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

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }
}

function isLayerSelectButton(target: EventTarget | null): target is HTMLButtonElement {
  const candidate = target as { readonly dataset?: DOMStringMap; readonly tagName?: string } | null;
  return candidate?.tagName === 'BUTTON' && candidate.dataset?.layerSelect !== undefined;
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
