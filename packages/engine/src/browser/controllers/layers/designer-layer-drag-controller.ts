import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  buildComponentIndex,
  getDescendantIds,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentTransaction,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createLayerDropTransaction } from '../../../common/operations/element/designer-layout-operations.js';
import {
  createDesignerLayerDragImage,
  type DesignerLayerDragImage,
} from '../../dom/layers/designer-layer-drag-image-dom.js';

/** 落点相对某一行的位置：行上缘之前、行下缘之后、或落进容器行内部。 */
export type DesignerLayerDropEdge = 'before' | 'after' | 'inside';

export interface DesignerLayerDropIndicator {
  /** 指示线 / 高亮所在的图层行。 */
  readonly rowId: string;
  readonly edge: DesignerLayerDropEdge;
}

export interface DesignerLayerDropTarget {
  readonly parentId: string | null;
  readonly index: number;
}

interface DesignerLayerDragControllerCallbacks {
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  /** 当前图层面板容器：拖拽期间就地改属性，绝不重渲染（重渲染会替换拖拽源、中断拖拽）。 */
  readonly getLayers: () => HTMLElement | undefined;
}

/**
 * 图层拖拽：整行 HTML5 拖拽 + 落点指示。
 *
 * 落点由指针落在行的哪一个纵向区带决定（与原型一致）：上缘 → 插到该行之前，
 * 下缘 → 插到该行之后，容器行的中段 → 成为该容器的第一个子图层。落点换算成
 * 「父级 + 兄弟位次」后交给 createLayerDropTransaction，与菜单里的上移 / 下移
 * 共用同一条 zIndex 重排规则，因此拖拽与菜单排列产出的文档形态一致。
 *
 * 关键约束：拖拽期间只就地切换行的 `data-dragging` / `data-drop-target` 属性。
 * 一旦在 dragstart / dragover 里重渲染图层树，拖拽源节点会被替换，浏览器会直接
 * 中止整个拖拽（表现为松手没有任何效果）。
 */
export class DesignerLayerDragController {
  #draggedLayerId: string | undefined;
  #dropIndicator: DesignerLayerDropIndicator | undefined;
  #dropTarget: DesignerLayerDropTarget | undefined;
  #dragImage: DesignerLayerDragImage | undefined;

  constructor(private readonly callbacks: DesignerLayerDragControllerCallbacks) {}

  /** 当前落点行与方位，供渲染画指示线。 */
  get dropIndicator(): DesignerLayerDropIndicator | undefined {
    return this.#dropIndicator;
  }

  /** 拖拽中的图层 id（用于给被拖行降档）。 */
  get draggedId(): string | undefined {
    return this.#draggedLayerId;
  }

  onDragStart(event: DragEvent): boolean {
    // 整行可拖（行内名称区、图标、缩进留白都算），但行内按钮各管各的语义：
    // 折叠、锁定、显隐、重命名输入不进入拖拽。
    if (event.target instanceof Element && isLayerRowControl(event.target)) return false;
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
    this.setDrop(undefined);
    // 先拍幽灵快照，再给源行降档：顺序反了会把 45% 透明的行截进幽灵里，
    // 拖拽影像就变成一团发灰的重影，和列表底色糊在一起。
    this.setDragImage(event, row);
    this.paintDragState();
    event.dataTransfer?.setData('text/plain', row);
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.effectAllowed = 'move';
    }
    return true;
  }

  onDragOver(event: DragEvent): boolean {
    if (this.#draggedLayerId === undefined) return false;
    // 指针不在图层树内：让宿主/画布自行决定，不拦截。
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-layer-root]') === null) {
      this.setDrop(undefined);
      return false;
    }
    // HTML5 拖拽的硬性要求：只要还想继续拖，就必须在 dragover 里 preventDefault，
    // 否则浏览器会判定本次拖拽无效并停止派发后续事件（松手什么都收不到）。
    // 因此这里无条件接受事件，落点合法性只决定是否画指示线。
    event.preventDefault();
    if (event.dataTransfer !== null && event.dataTransfer !== undefined) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.setDrop(this.resolveDrop(event));
    return true;
  }

  onDrop(event: DragEvent): boolean {
    const resolved = this.resolveDrop(event);
    const componentIds = this.draggedSelection();
    this.#draggedLayerId = undefined;
    this.disposeDragImage();
    this.setDrop(undefined);
    const document = this.callbacks.getDocument();
    if (document === undefined || resolved === undefined || componentIds.length === 0) return false;
    event.preventDefault();
    const transaction = createLayerDropTransaction(
      document,
      componentIds,
      resolved.target.parentId,
      resolved.target.index,
    );
    if (transaction === undefined) return false;
    const result = this.callbacks.executeTransaction(transaction);
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
    return true;
  }

  clear(): void {
    this.#draggedLayerId = undefined;
    this.disposeDragImage();
    this.setDrop(undefined);
    this.paintDragState();
  }

  reset(): void {
    this.#draggedLayerId = undefined;
    this.disposeDragImage();
    this.#dropIndicator = undefined;
    this.#dropTarget = undefined;
  }

  /**
   * 用自绘幽灵替换原生 drag image：原生截取发生在 dragstart 之后，会把即将降档的
   * 源行一起截进去，得到一张半透明灰影。这里在降档前建好一张干净的行卡片交给浏览器。
   */
  private setDragImage(event: DragEvent, rowId: string): void {
    this.disposeDragImage();
    const layers = this.callbacks.getLayers();
    const row = layers?.querySelector<HTMLElement>(`.layer-row[data-layer-id="${rowId}"]`);
    if (row === null || row === undefined) return;
    const dragImage = createDesignerLayerDragImage(row);
    if (dragImage === undefined) return;
    this.#dragImage = dragImage;
    const dataTransfer = event.dataTransfer;
    if (dataTransfer === null || dataTransfer === undefined) return;
    // 光标落在幽灵左侧中部：与原型“抓住行本身”的手感一致，也不会让卡片盖住落点行。
    dataTransfer.setDragImage(
      dragImage.image,
      Math.min(24, dragImage.image.getBoundingClientRect().width / 2),
      Math.max(1, dragImage.image.getBoundingClientRect().height / 2),
    );
  }

  private disposeDragImage(): void {
    this.#dragImage?.dispose();
    this.#dragImage = undefined;
  }

  private draggedSelection(): readonly string[] {
    if (this.#draggedLayerId === undefined) return [];
    const selected = this.callbacks.getInteraction().selectedComponentIds;
    return selected.includes(this.#draggedLayerId) ? selected : [this.#draggedLayerId];
  }

  /**
   * 把一次 dragover / drop 换算成「父级 + 兄弟位次」，顺带校验是否可落。
   * 未拖拽、指针不在图层树内、或目标非法时返回 undefined（浏览器显示禁止光标）。
   */
  private resolveDrop(
    event: DragEvent,
  ):
    | { readonly target: DesignerLayerDropTarget; readonly indicator: DesignerLayerDropIndicator }
    | undefined {
    const componentIds = this.draggedSelection();
    const document = this.callbacks.getDocument();
    if (componentIds.length === 0 || document === undefined) return undefined;
    const target = event.target;
    if (!(target instanceof Element)) return undefined;
    if (target.closest<HTMLElement>('[data-layer-root]') === null) return undefined;

    const row = target.closest<HTMLElement>('[data-layer-id]');
    const selection = new Set(componentIds);
    if (row === null) {
      // 列表空白处：落到根图层最末尾（最后层）。位次用「全部根图层数」而不是
      // 过滤后的数量——位次始终在原始兄弟序列的坐标系里，由事务统一换算。
      const roots = siblingIds(document, null);
      const last = roots.filter((id) => !selection.has(id)).at(-1);
      if (last === undefined) return undefined;
      return this.accept(
        componentIds,
        { parentId: null, index: roots.length },
        { rowId: last, edge: 'after' },
      );
    }
    const rowId = row.dataset.layerId!;
    if (selection.has(rowId)) return undefined;
    const info = layerRowInfo(row);
    if (info === undefined) return undefined;
    const ratio = rowDropRatio(row, event.clientY);
    const acceptsChildren =
      this.callbacks.getCatalog()?.get(info.type)?.manifest.designCapabilities.children === true;
    if (acceptsChildren && ratio > 0.3 && ratio < 0.7) {
      return this.accept(componentIds, { parentId: rowId, index: 0 }, { rowId, edge: 'inside' });
    }
    const position = siblingIds(document, info.parentId).indexOf(rowId);
    if (position < 0) return undefined;
    const edge: DesignerLayerDropEdge = ratio < 0.5 ? 'before' : 'after';
    return this.accept(
      componentIds,
      { parentId: info.parentId, index: edge === 'before' ? position : position + 1 },
      { rowId, edge },
    );
  }

  private accept(
    componentIds: readonly string[],
    target: DesignerLayerDropTarget,
    indicator: DesignerLayerDropIndicator,
  ):
    | { readonly target: DesignerLayerDropTarget; readonly indicator: DesignerLayerDropIndicator }
    | undefined {
    return this.canDrop(componentIds, target) ? { target, indicator } : undefined;
  }

  private canDrop(componentIds: readonly string[], target: DesignerLayerDropTarget): boolean {
    const document = this.callbacks.getDocument();
    if (document === undefined) return false;
    const index = buildComponentIndex(document);
    const moving = new Set(componentIds);
    const sources = componentIds.map((componentId) => index.byId.get(componentId)?.component);
    if (sources.some((component) => component === undefined)) return false;
    if (
      sources.some(
        (component) =>
          component !== undefined &&
          (isScreenComponentEffectivelyHidden(document, component.id) ||
            isScreenComponentEffectivelyLocked(document, component.id)),
      )
    ) {
      return false;
    }
    if (target.parentId !== null) {
      const parent = index.byId.get(target.parentId)?.component;
      if (parent === undefined || moving.has(parent.id)) return false;
      if (
        isScreenComponentEffectivelyHidden(document, parent.id) ||
        isScreenComponentEffectivelyLocked(document, parent.id)
      ) {
        return false;
      }
      // 物料是否接受子图层只约束「新建立的父子关系」：同一父级内部的排序
      // 不改变层级结构，即使该容器物料（如历史文档里的文本容器）不再声明
      // children，也不该让既有子图层之间无法拖动排序。
      const reparents = sources.some(
        (component) => (component?.parentId ?? null) !== target.parentId,
      );
      if (
        reparents &&
        this.callbacks.getCatalog()?.get(parent.type)?.manifest.designCapabilities.children !== true
      ) {
        return false;
      }
      for (const componentId of componentIds) {
        if (getDescendantIds(index, componentId).includes(parent.id)) return false;
      }
    }

    // 被跨越的兄弟必须都可编辑：与上移 / 下移的锁定约束一致，否则事务必然失败。
    const original = siblingIds(document, target.parentId);
    const remaining = original.filter((id) => !moving.has(id));
    const insertAt = insertionIndex(original, remaining, moving, target.index);
    const movingPositions = original
      .map((id, position) => (moving.has(id) ? position : -1))
      .filter((position) => position >= 0);
    const sameParent = sources.every(
      (component) => (component?.parentId ?? null) === target.parentId,
    );
    const spanStart =
      sameParent && movingPositions.length > 0 ? Math.min(...movingPositions) : insertAt;
    const spanEnd =
      sameParent && movingPositions.length > 0 ? Math.max(...movingPositions) + 1 : insertAt;
    const crossed = original
      .slice(Math.min(spanStart, spanEnd), Math.max(spanStart, spanEnd))
      .filter((id) => !moving.has(id));
    if (crossed.some((id) => isScreenComponentEffectivelyLocked(document, id))) return false;
    // 目标父级里被跨越的项同样不能是隐藏层（隐藏层的层序不参与可见排序）。
    if (crossed.some((id) => isScreenComponentEffectivelyHidden(document, id))) return false;

    const transaction = createLayerDropTransaction(
      document,
      componentIds,
      target.parentId,
      target.index,
    );
    // 原位落回（没有任何命令）不算可落目标：避免松手时给出一次空的成功反馈。
    if (transaction === undefined) return false;
    return applyScreenDocumentTransaction(document, transaction).ok;
  }

  private setDrop(
    drop:
      | { readonly target: DesignerLayerDropTarget; readonly indicator: DesignerLayerDropIndicator }
      | undefined,
  ): void {
    const nextTarget = drop?.target;
    const nextIndicator = drop?.indicator;
    const changed =
      nextTarget?.parentId !== this.#dropTarget?.parentId ||
      nextTarget?.index !== this.#dropTarget?.index ||
      nextIndicator?.rowId !== this.#dropIndicator?.rowId ||
      nextIndicator?.edge !== this.#dropIndicator?.edge;
    this.#dropTarget = nextTarget;
    this.#dropIndicator = nextIndicator;
    // 拖拽期间指针每移动一像素都会触发 dragover：只在落点真正变化时才改 DOM。
    if (changed) this.paintDragState();
  }

  /**
   * 就地更新拖拽态：只切换行的 data 属性，不重建节点。拖拽源一旦被替换，
   * 浏览器会中止整个拖拽流程，所以这里绝不能走 render。
   */
  private paintDragState(): void {
    const layers = this.callbacks.getLayers();
    if (layers === undefined) return;
    for (const row of layers.querySelectorAll<HTMLElement>('.layer-row')) {
      const indicator =
        this.#dropIndicator !== undefined && row.dataset.layerId === this.#dropIndicator.rowId
          ? this.#dropIndicator.edge
          : undefined;
      const dragging =
        this.#draggedLayerId !== undefined && row.dataset.layerId === this.#draggedLayerId;
      setRowAttribute(row, 'data-drop-target', indicator);
      setRowAttribute(row, 'data-dragging', dragging ? 'true' : undefined);
    }
  }
}

function setRowAttribute(row: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    if (row.hasAttribute(name)) row.removeAttribute(name);
    return;
  }
  if (row.getAttribute(name) !== value) row.setAttribute(name, value);
}

/** 换算成「移除被拖项之后」的位次：从原始位次向后找第一个未被拖走的兄弟。 */
function insertionIndex(
  original: readonly string[],
  remaining: readonly string[],
  moving: ReadonlySet<string>,
  requested: number,
): number {
  for (let position = Math.max(0, requested); position < original.length; position += 1) {
    const candidate = original[position]!;
    if (moving.has(candidate)) continue;
    return remaining.indexOf(candidate);
  }
  return remaining.length;
}

interface LayerRowInfo {
  readonly parentId: string | null;
  readonly type: string;
}

function layerRowInfo(row: HTMLElement): LayerRowInfo | undefined {
  const parentId = row.dataset.layerParent ?? '';
  const type = row.dataset.layerType;
  if (type === undefined) return undefined;
  return { parentId: parentId === '' ? null : parentId, type };
}

function rowDropRatio(row: HTMLElement, clientY: number): number {
  const rect = row.getBoundingClientRect();
  if (rect.height <= 0) return 0.5;
  return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
}

function siblingIds(document: ScreenDocument, parentId: string | null): readonly string[] {
  return document.components
    .filter((component) => component.parentId === parentId)
    .sort(
      (left, right) =>
        right.zIndex - left.zIndex ||
        document.components.indexOf(right) - document.components.indexOf(left),
    )
    .map((component) => component.id);
}

/**
 * 行整行可拖，但行内这些控件各管各的语义，不参与拖拽起手：
 * 折叠箭头、锁定/显隐开关、重命名输入框。
 */
const LAYER_ROW_CONTROL_SELECTORS = [
  '[data-layer-collapse]',
  '[data-layer-toggle]',
  '[data-layer-rename]',
] as const;

function isLayerRowControl(target: Element): boolean {
  return LAYER_ROW_CONTROL_SELECTORS.some((selector) => target.closest(selector) !== null);
}

export function getLayerRow(target: EventTarget | null): string | undefined {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId
    : undefined;
}
