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
} from '../../../common/operations/element/designer-layout-operations.js';
import {
  createDesignerLayerView,
  DESIGNER_LAYER_PAGE_SIZE,
  type DesignerLayerDropIndicator,
  type DesignerLayerSelectionDirection,
  type DesignerLayerView,
  filterDesignerLayerItems,
  getDesignerLayerSelectionTarget,
  renderDesignerLayers,
} from '../../dom/layers/designer-layers-dom.js';
import type {
  DesignerLayerArrangeAction,
  DesignerLayerGroupAction,
} from '../../dom/layers/designer-layers-toolbar-dom.js';
import { DesignerLayerDragController } from './designer-layer-drag-controller.js';
import { DesignerLayerRenameController } from './designer-layer-rename-controller.js';

/** 图层右键的菜单归属，供表面路由决定弹哪张菜单（见 onContextMenu）。 */
export type DesignerLayerContextMenuTarget = 'row' | 'blank' | 'ignore';

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
  /** Shift 连选的锚点：最近一次「无 Shift」点击的行，连选期间保持不变（Windows 列表语义）。 */
  #anchor: string | undefined;
  #search = '';
  #collapsed = new Set<string>();
  readonly #drag: DesignerLayerDragController;
  #layers: HTMLElement | undefined;
  readonly #rename: DesignerLayerRenameController;
  #renderLimit = DESIGNER_LAYER_PAGE_SIZE;
  /** 最近一次渲染出的行序（含搜索过滤、折叠与分页）：Shift 连选只能落在看得见的行上。 */
  #visibleIds: readonly string[] = [];
  /** 最近一次树渲染的内容签名：再次渲染输入全同时跳过整树重建。 */
  #renderedSignature: string | undefined;

  constructor(private readonly callbacks: DesignerLayersControllerCallbacks) {
    this.#drag = new DesignerLayerDragController({
      ...callbacks,
      // 拖拽期间只就地改行属性：重渲染会替换拖拽源节点并中止浏览器的拖拽流程。
      getLayers: () => this.#layers,
    });
    this.#rename = new DesignerLayerRenameController({
      ...callbacks,
      getLayers: () => this.#layers,
      render: () => this.render(this.#layers),
      selectComponent: (componentId, event) => this.selectLayer(componentId, event),
    });
  }

  canStepSelection(direction: DesignerLayerSelectionDirection): boolean {
    return this.selectionStepTarget(direction) !== undefined;
  }

  stepSelection(direction: DesignerLayerSelectionDirection): void {
    const componentId = this.selectionStepTarget(direction);
    if (componentId === undefined) return;
    this.#anchor = componentId;
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
  }

  /**
   * 行的选中语义，对齐 Windows 资源管理器：
   * - 单击：只选这一行，并把连选锚点移到这里；
   * - Ctrl / Cmd 单击：切换这一行，锚点也移到这里（资源管理器会重新锚定）；
   * - Shift 单击：从锚点到这一行整段选中并覆盖原选区；按住 Ctrl 时并入原选区。
   * 锚点在连选期间不动，所以反复 Shift 点击是以同一起点伸缩，而不是每点一次再吞掉一段。
   */
  private selectLayer(componentId: string, event: Event): void {
    const { shiftKey, ctrlKey, metaKey } = event as MouseEvent;
    const additive = ctrlKey === true || metaKey === true;
    if (shiftKey === true) {
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: this.rangeTo(componentId, additive),
        focusedComponentId: componentId,
      });
      return;
    }
    this.#anchor = componentId;
    if (additive) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId });
      return;
    }
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
  }

  /** 锚点到目标的连续区间（按屏幕上看得见的行序）。锚点无效时退化为单行选中。 */
  private rangeTo(componentId: string, additive: boolean): readonly string[] {
    const target = this.#visibleIds.indexOf(componentId);
    if (target === -1) return [componentId];
    const anchor = this.resolveAnchor(componentId);
    const index = this.#visibleIds.indexOf(anchor);
    if (index === -1) return [componentId];
    const [start, end] = index <= target ? [index, target] : [target, index];
    const range = this.#visibleIds.slice(start, end + 1);
    if (!additive) return range;
    return [...new Set([...this.callbacks.getInteraction().selectedComponentIds, ...range])];
  }

  /**
   * 锚点优先取上一次无 Shift 点击；没有锚点时退回当前焦点行（先在画布选中、再到面板里
   * Shift 连选），并把它固化下来 —— 否则连选会一路跟着焦点漂移，变成逐段吞并。
   */
  private resolveAnchor(componentId: string): string {
    if (this.#anchor !== undefined && this.#visibleIds.includes(this.#anchor)) return this.#anchor;
    const focused = this.callbacks.getInteraction().focusedComponentId;
    if (focused !== null && this.#visibleIds.includes(focused)) {
      this.#anchor = focused;
      return focused;
    }
    return componentId;
  }

  render(layers: HTMLElement | undefined): void {
    if (layers === undefined) return;
    this.#layers = layers;
    const view = createDesignerLayerView(this.callbacks.getDocument(), this.callbacks.getCatalog());
    // 行序与面板实际渲染的那一屏保持一致：搜索过滤、折叠与分页都会改变可见区间，
    // Shift 连选必须按用户看到的顺序取区间，而不是按文档顺序。
    this.#visibleIds = filterDesignerLayerItems(view.items, this.#search, this.#collapsed)
      .slice(0, this.#renderLimit)
      .map((item) => item.id);
    const interaction = this.callbacks.getInteraction();
    const signature = layerRenderSignature(view, interaction, {
      search: this.#search,
      collapsed: this.#collapsed,
      renderLimit: this.#renderLimit,
      draggingId: this.#drag.draggedId,
      dropIndicator: this.#drag.dropIndicator,
      renamingId: this.#rename.renamingId,
      renameDraft:
        this.#rename.renamingId === undefined
          ? undefined
          : this.#rename.drafts.get(this.#rename.renamingId),
    });
    if (signature === this.#renderedSignature) {
      // 输入全同：树、外壳、工具条状态与诊断都不会变。几何/样式/数据类提交不再
      // 重建图层面板，也不重复上报同一份诊断。
      return;
    }
    this.#renderedSignature = signature;
    const focusedRowId = activeLayerSelectId(layers);
    renderDesignerLayers(layers, view, {
      interaction,
      search: this.#search,
      collapsed: this.#collapsed,
      draggingId: this.#drag.draggedId,
      dropIndicator: this.#drag.dropIndicator,
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
    // 重渲染会把聚焦按钮连同节点一起换掉，焦点随之掉到空处 —— 那样单击之后
    // Shift+方向键就接不上了。只在「刚才焦点在行上、渲染后掉了」时接回来：
    // 若焦点已被别处接管（点击画布、切到重命名输入框），这里不抢。
    if (focusedRowId !== undefined && activeElementIn(layers) === null) {
      const next = [...layers.querySelectorAll<HTMLElement>('[data-layer-select]')].find(
        (button) => button.dataset.layerSelect === focusedRowId,
      );
      next?.focus({ preventScroll: true });
    }
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
    // 搜索清除：空结果页与搜索框内的清除按钮共用一条路径，清空后焦点回到搜索框。
    if (target.closest('[data-layer-search-clear]') !== null) {
      this.clearSearch(target.closest<HTMLElement>('[data-layers]') ?? this.#layers);
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
    // 整行命中：除折叠与独立操作按钮外，高亮到哪里就可以点到哪里。
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
    // 搜索框：Escape 清空查询并保持焦点（与素材搜索一致），不让用户为了看清全部图层
    // 手动退格或先点清除按钮。
    if (target instanceof HTMLInputElement && target.dataset.layerSearch !== undefined) {
      if (event.key !== 'Escape' || this.#search === '') return false;
      event.preventDefault();
      this.clearSearch(target.closest<HTMLElement>('[data-layers]') ?? undefined);
      return true;
    }
    if (!(target instanceof HTMLInputElement) || target.dataset.layerRename === undefined)
      return false;
    return this.#rename.onKeyDown(target, event);
  }

  /**
   * 右键图层行的选区语义（菜单本身由 DesignerMenuController 弹出，与画布共用一套）：
   * 行不在选区里就先把选区换成这一行，菜单随后按单组件解析；行已在多选里则原样保留，
   * 菜单升级为多选菜单，动作仍然落在整段选区上 —— 与右键画布上的已选组件一致。
   *
   * 返回值说明菜单归属：`row` = 命中可选行；`blank` = 图层树空白区（回落画布菜单）；
   * `ignore` = 不归对象菜单管 —— 隐藏行不可选（core 的选择归约会剔除有效隐藏组件，
   * 认领它只会让菜单动作落到上一次选择上），重命名输入框则交还文本编辑。
   */
  onContextMenu(event: MouseEvent): DesignerLayerContextMenuTarget {
    const target = event.target;
    if (!(target instanceof Element)) return 'ignore';
    if (target.closest('[data-layer-rename]') !== null) return 'ignore';
    const row = target.closest<HTMLElement>('[data-layer-selectable="true"]');
    const componentId = row?.dataset.layerId;
    if (row === null || componentId === undefined) {
      return target.closest('[data-layer-id]') === null ? 'blank' : 'ignore';
    }
    const selected = this.callbacks.getInteraction().selectedComponentIds;
    if (selected.includes(componentId)) return 'row';
    // 右键同时重新锚定：之后的 Shift 连选从这一行开始，与单击后的行为一致。
    this.#anchor = componentId;
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [componentId],
      focusedComponentId: componentId,
    });
    return 'row';
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
    this.selectLayer(next.dataset.layerSelect!, event);
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

  /** 当前拖拽落点（行 + 方位）；无拖拽时为 undefined。 */
  get dropIndicator(): DesignerLayerDropIndicator | undefined {
    return this.#drag.dropIndicator;
  }

  /** 拖拽中的图层 id；无拖拽时为 undefined。 */
  get draggedId(): string | undefined {
    return this.#drag.draggedId;
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

  /** 清空图层搜索并把焦点交还搜索框：过滤是即时重渲染，焦点不能跟着树一起消失。 */
  private clearSearch(panel: HTMLElement | undefined): void {
    this.#search = '';
    this.#renderLimit = DESIGNER_LAYER_PAGE_SIZE;
    this.render(panel);
    panel?.querySelector<HTMLInputElement>('[data-layer-search]')?.focus();
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

/** 面板可能挂在 shadow root 里（产品）也挂过普通文档（测试），两边的 activeElement 都要能取。 */
function activeElementIn(layers: HTMLElement): Element | null {
  const root = typeof layers.getRootNode === 'function' ? layers.getRootNode() : null;
  const active = (root as { readonly activeElement?: Element | null } | null)?.activeElement;
  return active ?? null;
}

/**
 * 树渲染的内容签名：视图逐行字段（顺序即层级/绘制序）+ 选区/焦点 + 面板状态
 * （搜索、折叠、分页、拖拽、重命名）+ 诊断计数。全同则树、外壳、工具条与
 * 诊断输出都不会变，可跳过整树重建。工具条可用性由选区与行的 locked/顺序派生，
 * 已被签名覆盖。
 */
function layerRenderSignature(
  view: DesignerLayerView,
  interaction: ScreenInteractionState,
  state: {
    readonly search: string;
    readonly collapsed: ReadonlySet<string>;
    readonly renderLimit: number;
    readonly draggingId: string | undefined;
    readonly dropIndicator: DesignerLayerDropIndicator | undefined;
    readonly renamingId: string | null | undefined;
    readonly renameDraft: string | undefined;
  },
): string {
  const head = [
    state.search,
    String(state.renderLimit),
    [...state.collapsed].join(','),
    interaction.selectedComponentIds.join(','),
    interaction.focusedComponentId ?? '',
    state.draggingId ?? '',
    state.dropIndicator === undefined
      ? ''
      : `${state.dropIndicator.rowId}:${state.dropIndicator.edge}`,
    state.renamingId ?? '',
    state.renameDraft ?? '',
    String(view.diagnostics.length),
  ];
  const rows = view.items.map(
    (item) =>
      `${item.id}|${item.parentId ?? ''}|${item.name}|${item.type}|${item.depth}|${item.childCount}|${item.hidden}|${item.locked}|${item.missingMaterial}|${item.typeLabel}|${item.icon ?? ''}|${item.width}|${item.height}`,
  );
  return `${head.join('\u0001')}\u0002${rows.join('\u0002')}`;
}

function activeLayerSelectId(layers: HTMLElement): string | undefined {
  const active = activeElementIn(layers);
  const button = (active as HTMLElement | null)?.closest?.<HTMLElement>('[data-layer-select]');
  return button?.dataset.layerSelect;
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
