import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  hitTestScreenComponents,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  queryScreenComponentsInRect,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenViewportState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  hasDirectChildren,
  parentIdOf,
  selectedComponents,
  selectedRootIds,
  selectionSubtree,
  selectionTargetInContext,
  selectionTargetsInContext,
} from '../../common/operations/designer-selection.js';
import {
  type BaseScreenTransformHandle,
  createTransformTransaction,
  resizeScreenComponents,
  rotateScreenComponents,
} from '../../common/operations/designer-transform.js';
import type {
  DesignerToolId,
  DesignerToolMaterialTypes,
} from '../../common/tools/designer-tools.js';
import type {
  DesignerSnapPoint,
  DesignerSnapPreview,
  DesignerSnapTranslation,
} from '../viewport/designer-canvas-aids.js';
import {
  clientPointToDesignerCanvasPoint,
  type DesignerClientPoint,
  getDesignerCanvasBounds,
} from '../viewport/designer-canvas-coordinates.js';
import { MATERIAL_DRAG_TYPE } from './designer-panel-controller.js';

// Movement below this screen-pixel distance is treated as a selection click, not a drag.
// Otherwise a click could snap the component to a smart guide and move it.
const DESIGNER_DRAG_CLICK_THRESHOLD = 3;

interface Drag {
  readonly components: readonly ScreenComponentNode[];
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly bounds: {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  };
  /** 拖拽的目标是 selection（控制器）；组件内容作为被选实体的内容一起跟随移动。 */
  readonly selection: HTMLElement | undefined;
  readonly elements: readonly HTMLElement[];
  readonly moved: boolean;
}

interface Transform {
  readonly pointerId: number;
  readonly kind: 'resize' | 'rotate';
  readonly handle: BaseScreenTransformHandle | undefined;
  readonly start: Point;
  readonly components: readonly ScreenComponentNode[];
  /** 变换预览覆盖的 Material 根元素内联样式（结束/取消手势时恢复，与拖拽 translate 清理对称）。 */
  readonly previewStyles: ReadonlyMap<string, TransformPreviewStyle>;
}

interface Marquee {
  readonly pointerId: number;
  readonly start: Point;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly union: boolean;
  readonly contain: boolean;
  readonly moved: boolean;
}

interface Pan {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
}

interface Create {
  readonly pointerId: number;
  readonly start: Point;
  readonly tool: DesignerToolId;
  readonly materialType: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DesignerGestureCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => {
    readonly selectedComponentIds: readonly string[];
    readonly focusedComponentId: string | null;
  };
  readonly getViewport: () => ScreenViewportState;
  readonly panBy: (delta: Point) => void;
  readonly zoomBy: (factor: number) => void;
  readonly isHandActive: () => boolean;
  readonly getActiveTool: () => DesignerToolId;
  readonly getToolMaterialTypes: () => DesignerToolMaterialTypes | undefined;
  readonly snapCanvasPoint: (
    point: { readonly x: number; readonly y: number },
    excludedComponentIds?: readonly string[],
  ) => DesignerSnapPoint;
  readonly snapCanvasSelection: (
    bounds: {
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
      readonly top: number;
    },
    offset: Point,
    excludedComponentIds?: readonly string[],
  ) => DesignerSnapTranslation;
  readonly renderSnapPreview?: (point: DesignerSnapPreview | undefined) => void;
  /** 吸附会话生命周期：拖拽/变换/创建手势开始与结束时切换候选缓存与滞后状态。 */
  readonly setSnapSessionActive?: (active: boolean) => void;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly reportTransaction: (transaction: ScreenDocumentTransaction) => void;
  readonly renderSelection: () => void;
  /** 系统级焦点约束：画布点击时把键盘焦点收敛到 viewport 容器。 */
  readonly focusViewport?: () => void;
  /** 平移拖拽期间同步抓握光标（grabbing）状态。 */
  readonly setPanning?: (panning: boolean) => void;
}

export class DesignerGestureController {
  #canvas: HTMLDivElement | undefined;
  #drag: Drag | undefined;
  #transform: Transform | undefined;
  #marquee: Marquee | undefined;
  #pan: Pan | undefined;
  #create: Create | undefined;
  #selectSuppression: string | null = null;
  #editingParentId: string | null = null;

  constructor(private readonly callbacks: DesignerGestureCallbacks) {}

  get groupEditingParentId(): string | null {
    return this.#editingParentId;
  }

  /** 任一画布手势激活中（拖拽/变换/框选/平移/创建）。事件系统据此抑制快捷键与默认行为。 */
  get active(): boolean {
    return (
      this.#drag !== undefined ||
      this.#transform !== undefined ||
      this.#marquee !== undefined ||
      this.#pan !== undefined ||
      this.#create !== undefined
    );
  }

  connect(canvas: HTMLDivElement): void {
    this.#canvas = canvas;
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => this.cancel());
    canvas.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    // 画布是可拖拽交互表面：系统性禁止原生文本选择（selectstart 是浏览器启动文本选择的
    // 事件通道，即使 CSS user-select 未级联到某些内容也能拦截，参考 Nebula/Moveable）。
    canvas.addEventListener('selectstart', (event) => event.preventDefault());
    // 从物料面板拖拽物料到画布：dragover 需要 preventDefault 才能触发 drop。
    canvas.addEventListener('dragover', (event) => this.onDragOverCanvas(event));
    canvas.addEventListener('drop', (event) => this.onDropOnCanvas(event));
  }

  /**
   * 视窗背景（画布外）点击：退出选中状态。画布区域内的指针事件由 {@link connect}
   * 的手势处理，这里只兜底落在视窗背景（点阵网格 / padding 区域）的点击，
   * 与画布空白点击的取消选中语义一致。
   */
  connectViewport(viewport: HTMLDivElement): void {
    viewport.addEventListener('pointerdown', (event) =>
      this.onViewportBackgroundPointerDown(event),
    );
    viewport.addEventListener('pointermove', (event) => {
      if (!this.isCanvasEvent(event)) this.onPointerMove(event);
    });
    viewport.addEventListener('pointerup', (event) => {
      if (!this.isCanvasEvent(event)) this.onPointerUp(event);
    });
    viewport.addEventListener('pointercancel', (event) => {
      if (!this.isCanvasEvent(event)) this.cancel();
    });
  }

  private isCanvasEvent(event: Event): boolean {
    const canvas = this.#canvas;
    return canvas !== undefined && event.target !== null && canvas.contains(event.target as Node);
  }

  private onViewportBackgroundPointerDown(event: PointerEvent): void {
    const target = event.target;
    const canvas = this.#canvas;
    if (
      !isPrimaryPointer(event) ||
      !(target instanceof Element) ||
      canvas === undefined ||
      canvas.contains(target)
    ) {
      return;
    }
    if (this.callbacks.getInteraction().selectedComponentIds.length === 0) {
      return;
    }
    this.#editingParentId = null;
    this.callbacks.reduceSelection({ type: 'clear-selection' });
  }

  cancel(): void {
    this.cancelDrag();
    this.cancelTransform();
    this.cancelMarquee();
    this.cancelPan();
    this.cancelCreate();
    this.clearSnapPreview();
  }

  exitGroupEditingContext(): boolean {
    const document = this.callbacks.getDocument();
    const editingParentId = this.validEditingParentId(document);
    if (document === undefined || editingParentId === null) return false;
    this.#editingParentId = parentIdOf(document, editingParentId);
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [editingParentId],
      focusedComponentId: editingParentId,
    });
    return true;
  }

  canEnterGroupEditingContext(): boolean {
    const document = this.callbacks.getDocument();
    const interaction = this.callbacks.getInteraction();
    if (document === undefined || interaction.selectedComponentIds.length !== 1) return false;
    const componentId = interaction.selectedComponentIds[0];
    return componentId !== undefined && this.canEditChildren(document, componentId);
  }

  canExitGroupEditingContext(): boolean {
    return this.validEditingParentId(this.callbacks.getDocument()) !== null;
  }

  enterGroupEditingContext(): boolean {
    const document = this.callbacks.getDocument();
    const interaction = this.callbacks.getInteraction();
    const groupId = interaction.selectedComponentIds[0];
    if (
      document === undefined ||
      interaction.selectedComponentIds.length !== 1 ||
      groupId === undefined ||
      !this.canEditChildren(document, groupId)
    ) {
      return false;
    }
    const child = document.components.find(
      (component) =>
        component.parentId === groupId &&
        !isScreenComponentEffectivelyLocked(document, component.id) &&
        !isScreenComponentEffectivelyHidden(document, component.id),
    );
    if (child === undefined) return false;
    this.#editingParentId = groupId;
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [child.id],
      focusedComponentId: child.id,
    });
    return true;
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    // 注意：物料内部可能包含 SVG（图表/图标），SVG 元素不是 HTMLElement，
    // 用 Element 判定 + closest 命中测试，避免点击 SVG 时手势被跳过导致拖拽失败。
    if (!(target instanceof Element) || document === undefined || canvas === undefined) {
      return;
    }
    if (!isPrimaryPointer(event)) return;
    // 系统级焦点约束：画布是键盘交互表面。阻止浏览器默认把焦点分配给被点击的子元素，
    // 并把焦点收敛到 viewport 容器，保证后续快捷键（空格平移、删除等）始终命中画布上下文，
    // 不会残留到某个已聚焦控件（否则空格/回车会触发该控件的默认激活，干扰快捷键）。
    event.preventDefault();
    this.callbacks.focusViewport?.();
    if (this.callbacks.isHandActive()) {
      // 仅主键（左键）用于平移；非主键（右键/中键）在抓手工具下不触发框选等其他手势，
      // 对齐 Nebula handlePanStart 的 `e.button !== 0` 守卫。
      event.preventDefault();
      this.capturePointer(event.pointerId);
      this.#pan = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      this.callbacks.setPanning?.(true);
      return;
    }
    if (this.callbacks.getActiveTool() === 'zoom') {
      this.callbacks.zoomBy(event.shiftKey ? 1 / 1.2 : 1.2);
      return;
    }
    const create = this.getCreateTool();
    if (create !== undefined && target.closest('[data-base-screen-component-id]') === null) {
      event.preventDefault();
      this.capturePointer(event.pointerId);
      this.callbacks.setSnapSessionActive?.(true);
      this.#create = {
        pointerId: event.pointerId,
        start: this.snapCanvasPoint(event),
        ...create,
      };
      return;
    }
    const transformHandle = target.closest<HTMLElement>('[data-transform-handle]');
    if (transformHandle !== null) {
      this.startTransform(
        event,
        transformHandle.dataset.transformHandle as BaseScreenTransformHandle,
      );
      return;
    }
    if (target.closest<HTMLElement>('[data-transform-rotate]') !== null) {
      this.startTransform(event, undefined);
      return;
    }
    // 选中框（控制器）的空白区域可拖拽：普通按下建立待确认移动，修饰键按下时按命中测试切换单个组件。
    if (target.closest<HTMLElement>('[data-selection-grab]') !== null) {
      this.onSelectionPointerDown(event);
      return;
    }
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const componentId = material?.dataset.baseScreenComponentId;
    if (componentId === undefined || material === null) {
      this.#editingParentId = null;
      event.preventDefault();
      // 框选从按下即捕获指针：pointerup 被重定向到画布，释放落在状态栏/面板等视窗之外
      // 的表面也不会漏掉手势，避免 #marquee 悬挂导致 active 常驻、快捷键与右键菜单被吞。
      this.capturePointer(event.pointerId);
      this.#marquee = {
        pointerId: event.pointerId,
        start: this.canvasPointFromPointer(event),
        startClientX: event.clientX,
        startClientY: event.clientY,
        union: event.ctrlKey || event.metaKey,
        contain: event.altKey,
        moved: false,
      };
      return;
    }
    const selectableComponentId = this.selectableComponentId(document, componentId);
    const component =
      selectableComponentId === null
        ? undefined
        : document.components.find((item) => item.id === selectableComponentId);
    if (component === undefined) {
      return;
    }
    if (isScreenComponentEffectivelyHidden(document, component.id)) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId: component.id });
      return;
    }
    const interaction = this.callbacks.getInteraction();
    const selected = selectedComponents(document, interaction.selectedComponentIds);
    const components = interaction.selectedComponentIds.includes(component.id)
      ? selected
      : [component];
    if (
      components.length === 0 ||
      new Set(components.map((item) => item.parentId)).size !== 1 ||
      components.some((item) => isScreenComponentEffectivelyLocked(document, item.id))
    ) {
      return;
    }
    if (!interaction.selectedComponentIds.includes(component.id)) {
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: [component.id],
        focusedComponentId: component.id,
      });
    }
    event.preventDefault();
    // 移动按子树生效：编组/容器连同其子组件一起拖动，保持相对位置。
    const moved = mutableSelectionSubtree(
      document,
      components.map((component) => component.id),
    );
    const bounds = getScreenSelectionBounds(moved);
    if (bounds === null) {
      this.releasePointerCapture(event.pointerId);
      return;
    }
    this.#drag = {
      components: moved,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      bounds,
      selection: canvas.querySelector<HTMLElement>('[data-selection]') ?? undefined,
      elements: moved.flatMap((item) => {
        const element = canvas.querySelector<HTMLElement>(
          `[data-base-screen-component-id="${item.id}"]`,
        );
        return element === null ? [] : [element];
      }),
      moved: false,
    };
  }

  private onSelectionPointerDown(event: PointerEvent): void {
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (document === undefined || canvas === undefined) return;
    if (event.ctrlKey || event.metaKey) {
      // 选中框覆盖组件区域，修饰键点击按当前组内编辑上下文切换同层组件选择。
      const point = this.canvasPointFromPointer(event);
      const componentId = hitTestScreenComponents(document, point)[0];
      const selectableComponentId =
        componentId === undefined ? null : this.selectableComponentId(document, componentId);
      if (selectableComponentId !== null) {
        this.callbacks.reduceSelection({
          type: 'toggle-selection',
          componentId: selectableComponentId,
        });
      }
      return;
    }
    const components = selectedComponents(
      document,
      this.callbacks.getInteraction().selectedComponentIds,
    );
    if (
      components.length === 0 ||
      new Set(components.map((item) => item.parentId)).size !== 1 ||
      components.some((item) => isScreenComponentEffectivelyLocked(document, item.id))
    ) {
      return;
    }
    event.preventDefault();
    // 选中框拖拽与框选同理：按下即捕获，释放落在视窗之外也不会悬挂拖拽手势。
    this.capturePointer(event.pointerId);
    const moved = mutableSelectionSubtree(
      document,
      components.map((component) => component.id),
    );
    const bounds = getScreenSelectionBounds(moved);
    if (bounds === null) {
      this.releasePointerCapture(event.pointerId);
      return;
    }
    this.#drag = {
      components: moved,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      bounds,
      selection: canvas.querySelector<HTMLElement>('[data-selection]') ?? undefined,
      elements: moved.flatMap((component) => {
        const element = canvas.querySelector<HTMLElement>(
          `[data-base-screen-component-id="${component.id}"]`,
        );
        return element === null ? [] : [element];
      }),
      moved: false,
    };
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.#pan !== undefined && event.pointerId === this.#pan.pointerId) {
      this.callbacks.panBy({
        x: event.clientX - this.#pan.startClientX,
        y: event.clientY - this.#pan.startClientY,
      });
      this.#pan = { ...this.#pan, startClientX: event.clientX, startClientY: event.clientY };
      return;
    }
    if (this.#create !== undefined && event.pointerId === this.#create.pointerId) {
      this.renderCreatePreview(this.#create, this.snapCanvasPoint(event));
      return;
    }
    if (this.#marquee !== undefined && event.pointerId === this.#marquee.pointerId) {
      const marquee = this.#marquee;
      const distance = Math.hypot(
        event.clientX - marquee.startClientX,
        event.clientY - marquee.startClientY,
      );
      if (distance < DESIGNER_DRAG_CLICK_THRESHOLD) return;
      if (!marquee.moved) {
        this.capturePointer(event.pointerId);
        this.#marquee = { ...marquee, moved: true };
      }
      this.renderMarquee(marquee.start, this.canvasPointFromPointer(event));
      return;
    }
    if (this.#transform !== undefined && event.pointerId === this.#transform.pointerId) {
      this.renderTransformPreview(event);
      return;
    }
    if (this.#drag === undefined || event.pointerId !== this.#drag.pointerId) {
      return;
    }
    const drag = this.#drag;
    const distance = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
    );
    if (distance < DESIGNER_DRAG_CLICK_THRESHOLD) {
      return;
    }
    if (!drag.moved) {
      this.capturePointer(event.pointerId);
      this.callbacks.setSnapSessionActive?.(true);
      this.#drag = { ...drag, moved: true };
    }
    const translation = this.dragTranslation(this.#drag, event);
    // 拖拽以 selection（控制器）为目标，组件内容作为被选实体一起跟随移动，二者保持同步。
    const selection = this.#drag.selection;
    for (const element of this.#drag.elements) {
      element.style.translate = `${translation.x}px ${translation.y}px`;
    }
    if (selection !== undefined) {
      selection.style.translate = `${translation.x}px ${translation.y}px`;
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.#pan !== undefined && event.pointerId === this.#pan.pointerId) {
      this.cancelPan();
      return;
    }
    if (this.#create !== undefined && event.pointerId === this.#create.pointerId) {
      this.commitCreate(event);
      return;
    }
    if (this.#marquee !== undefined && event.pointerId === this.#marquee.pointerId) {
      const marquee = this.#marquee;
      const end = this.canvasPointFromPointer(event);
      this.cancelMarquee();
      const rect = normalizedRect(marquee.start, end);
      if (rect.width < 1 || rect.height < 1) {
        this.callbacks.reduceSelection({ type: 'clear-selection' });
        return;
      }
      const document = this.callbacks.getDocument();
      if (document === undefined) {
        return;
      }
      const ids = queryScreenComponentsInRect(
        document,
        rect,
        marquee.contain ? 'contain' : 'intersect',
      );
      const interaction = this.callbacks.getInteraction();
      const editingParentId = this.validEditingParentId(document);
      const componentIds = selectedRootIds(
        document,
        marquee.union
          ? [
              ...interaction.selectedComponentIds,
              ...selectionTargetsInContext(document, ids, editingParentId),
            ]
          : selectionTargetsInContext(document, ids, editingParentId),
      );
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds,
        focusedComponentId:
          componentIds.at(-1) ?? (marquee.union ? interaction.focusedComponentId : null),
      });
      return;
    }
    if (this.#transform !== undefined && event.pointerId === this.#transform.pointerId) {
      const transform = this.#transform;
      const after = this.transformComponents(transform, event);
      this.cancelTransform();
      this.callbacks.reportTransaction(createTransformTransaction(transform.components, after));
      return;
    }
    if (this.#drag === undefined || event.pointerId !== this.#drag.pointerId) {
      return;
    }
    const drag = this.#drag;
    if (!drag.moved) {
      this.cancelDrag();
      return;
    }
    const translation = this.dragTranslation(drag, event);
    this.cancelDrag();
    const document = this.callbacks.getDocument();
    if (event.altKey && document !== undefined) {
      const copiedIds = new Map(
        drag.components.map((source, index) => [
          source.id,
          nextComponentId(document, `${source.type}-${index}`),
        ]),
      );
      this.callbacks.reportTransaction({
        commands: drag.components.map((source, index) => ({
          type: 'add-component' as const,
          component: {
            ...source,
            id: copiedIds.get(source.id)!,
            name: `${source.name} copy`,
            parentId:
              source.parentId === null ? null : (copiedIds.get(source.parentId) ?? source.parentId),
            position: {
              x: roundCoordinate(clampCoordinate(source.position.x + translation.x)),
              y: roundCoordinate(clampCoordinate(source.position.y + translation.y)),
            },
            zIndex:
              document.components.reduce(
                (maximum, component) => Math.max(maximum, component.zIndex),
                -1,
              ) +
              index +
              1,
          },
        })),
      });
      return;
    }
    this.callbacks.reportTransaction({
      commands: drag.components.map((component) => ({
        type: 'update-components' as const,
        componentIds: [component.id],
        patch: {
          position: {
            x: roundCoordinate(clampCoordinate(component.position.x + translation.x)),
            y: roundCoordinate(clampCoordinate(component.position.y + translation.y)),
          },
        },
      })),
    });
  }

  private onDoubleClick(event: MouseEvent): void {
    const target = event.target;
    const document = this.callbacks.getDocument();
    if (!(target instanceof Element) || document === undefined) return;
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const hitId = material?.dataset.baseScreenComponentId;
    if (hitId === undefined) return;
    const groupId = this.selectableComponentId(document, hitId);
    if (groupId === null || !this.canEditChildren(document, groupId)) return;
    const childId = selectionTargetInContext(document, hitId, groupId);
    this.#editingParentId = groupId;
    this.callbacks.reduceSelection({
      type: 'replace-selection',
      componentIds: [childId ?? groupId],
      focusedComponentId: childId ?? groupId,
    });
    event.preventDefault();
  }

  private selectableComponentId(document: ScreenDocument, hitComponentId: string): string | null {
    const editingParentId = this.validEditingParentId(document);
    const target = selectionTargetInContext(document, hitComponentId, editingParentId);
    if (target !== null) return target;
    this.#editingParentId = null;
    return selectionTargetInContext(document, hitComponentId, null);
  }

  private validEditingParentId(document: ScreenDocument | undefined): string | null {
    if (
      document === undefined ||
      this.#editingParentId === null ||
      !document.components.some((component) => component.id === this.#editingParentId)
    ) {
      this.#editingParentId = null;
      return null;
    }
    return this.#editingParentId;
  }

  private canEditChildren(document: ScreenDocument, componentId: string): boolean {
    const component = document.components.find((item) => item.id === componentId);
    if (
      component === undefined ||
      !hasDirectChildren(document, componentId) ||
      isScreenComponentEffectivelyLocked(document, componentId)
    ) {
      return false;
    }
    return (
      this.callbacks.getCatalog()?.get(component.type)?.manifest.designCapabilities.children ===
      true
    );
  }

  private startTransform(event: PointerEvent, handle: BaseScreenTransformHandle | undefined): void {
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (document === undefined || canvas === undefined) {
      return;
    }
    const roots = selectedComponents(
      document,
      this.callbacks.getInteraction().selectedComponentIds,
    );
    const capability = handle === undefined ? 'rotate' : 'resize';
    if (
      roots.length === 0 ||
      !roots.every((component) => {
        const entry = this.callbacks.getCatalog()?.get(component.type);
        return (
          entry?.manifest.designCapabilities[capability] === true &&
          !isScreenComponentEffectivelyLocked(document, component.id)
        );
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.capturePointer(event.pointerId);
    this.callbacks.setSnapSessionActive?.(true);
    // 变换按子树生效：能力门禁只看选中根组件，子组件随组一起缩放/旋转。
    const components = mutableSelectionSubtree(
      document,
      roots.map((component) => component.id),
    );
    this.#transform = {
      pointerId: event.pointerId,
      kind: handle === undefined ? 'rotate' : 'resize',
      handle,
      start: this.canvasPointFromPointer(event),
      components,
      previewStyles: captureTransformPreviewStyles(canvas, components),
    };
  }

  private transformComponents(
    transform: Transform,
    event: PointerEvent,
  ): readonly ScreenComponentNode[] {
    const pointer = this.snapCanvasPoint(
      event,
      transform.components.map((component) => component.id),
    );
    return transform.kind === 'resize'
      ? resizeScreenComponents(transform.components, transform.handle!, pointer, {
          shift: event.shiftKey,
          alt: event.altKey,
        })
      : rotateScreenComponents(transform.components, transform.start, pointer, event.shiftKey);
  }

  private renderTransformPreview(event: PointerEvent): void {
    const transform = this.#transform;
    const canvas = this.#canvas;
    const selection = canvas?.querySelector<HTMLElement>('[data-selection]');
    if (
      transform === undefined ||
      canvas === undefined ||
      selection === null ||
      selection === undefined
    ) {
      return;
    }
    const after = this.transformComponents(transform, event);
    const bounds = getScreenSelectionBounds(after);
    if (bounds === null) {
      return;
    }
    selection.style.left = `${bounds.left}px`;
    selection.style.top = `${bounds.top}px`;
    selection.style.width = `${bounds.right - bounds.left}px`;
    selection.style.height = `${bounds.bottom - bounds.top}px`;
    // Material 根元素实时变换（V10）：resize/rotate 直接作用于组件元素，与 renderer 的
    // left/top/width/height + rotate() 定位一致；手势结束/取消时按捕获样式恢复。
    for (const component of after) {
      const element = canvas.querySelector<HTMLElement>(
        `[data-base-screen-component-id="${component.id}"]`,
      );
      if (element === null || element === undefined) continue;
      element.style.left = `${component.position.x}px`;
      element.style.top = `${component.position.y}px`;
      element.style.width = `${component.size.width}px`;
      element.style.height = `${component.size.height}px`;
      element.style.transform = `rotate(${component.rotation}deg)`;
    }
  }

  private cancelTransform(): void {
    if (this.#transform === undefined) {
      return;
    }
    this.callbacks.setSnapSessionActive?.(false);
    this.releasePointerCapture(this.#transform.pointerId);
    for (const [componentId, styles] of this.#transform.previewStyles) {
      const element = this.#canvas?.querySelector<HTMLElement>(
        `[data-base-screen-component-id="${componentId}"]`,
      );
      if (element === null || element === undefined) continue;
      element.style.left = styles.left;
      element.style.top = styles.top;
      element.style.width = styles.width;
      element.style.height = styles.height;
      element.style.transform = styles.transform;
    }
    this.#transform = undefined;
    this.clearSnapPreview();
    this.callbacks.renderSelection();
  }

  private cancelDrag(): void {
    if (this.#drag === undefined) {
      return;
    }
    this.callbacks.setSnapSessionActive?.(false);
    for (const element of this.#drag.elements) {
      element.style.translate = '';
    }
    const selection = this.#drag.selection;
    if (selection !== undefined) {
      selection.style.translate = '';
    }
    this.releasePointerCapture(this.#drag.pointerId);
    this.#drag = undefined;
    this.clearSnapPreview();
  }

  private cancelPan(): void {
    if (this.#pan === undefined) return;
    this.releasePointerCapture(this.#pan.pointerId);
    this.#pan = undefined;
    // 平移结束须复位抓握光标（grabbing），否则 data-panning 残留 true，光标一直卡在实心抓握。
    this.callbacks.setPanning?.(false);
    this.clearSnapPreview();
  }

  private cancelMarquee(): void {
    if (this.#marquee !== undefined) {
      this.releasePointerCapture(this.#marquee.pointerId);
      this.#marquee = undefined;
    }
    const marquee = this.#canvas?.querySelector<HTMLElement>('[data-marquee]');
    if (marquee !== null && marquee !== undefined) {
      marquee.style.display = 'none';
    }
    this.clearSnapPreview();
  }

  private cancelCreate(): void {
    if (this.#create !== undefined) {
      this.callbacks.setSnapSessionActive?.(false);
      this.releasePointerCapture(this.#create.pointerId);
      this.#create = undefined;
    }
    this.#canvas?.querySelector<HTMLElement>('[data-create-preview]')?.remove();
    this.clearSnapPreview();
  }

  private canvasPointFromPointer(point: DesignerClientPoint): Point {
    const bounds = getDesignerCanvasBounds(this.#canvas!);
    return clientPointToDesignerCanvasPoint(point, bounds, this.callbacks.getViewport().zoom);
  }

  private dragTranslation(drag: Drag, event: PointerEvent): DesignerSnapTranslation {
    const zoom = this.callbacks.getViewport().zoom;
    const translation = {
      x: clampCoordinate((event.clientX - drag.startClientX) / zoom),
      y: clampCoordinate((event.clientY - drag.startClientY) / zoom),
    };
    // 移动以选区锚点匹配组件、画布和用户参考线；网格不参与吸附。
    const snapped = this.callbacks.snapCanvasSelection(
      drag.bounds,
      translation,
      drag.components.map((component) => component.id),
    );
    this.callbacks.renderSnapPreview?.(snapped);
    return snapped;
  }

  private snapCanvasPoint(
    event: PointerEvent,
    excludedComponentIds: readonly string[] = [],
  ): Point {
    return this.snapPoint(this.canvasPointFromPointer(event), excludedComponentIds);
  }

  private snapPoint(point: Point, excludedComponentIds: readonly string[] = []): Point {
    const snapped = this.callbacks.snapCanvasPoint(point, excludedComponentIds);
    this.callbacks.renderSnapPreview?.(snapped);
    return snapped;
  }

  private clearSnapPreview(): void {
    this.callbacks.renderSnapPreview?.(undefined);
  }

  // 从物料面板拖拽物料到画布：dragover 只有 preventDefault 才会放行 drop。
  private onDragOverCanvas(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes(MATERIAL_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  // 在画布上释放物料：以释放位置为左上角新增组件（吸附后），复用创建工具的默认尺寸与属性。
  private onDropOnCanvas(event: DragEvent): boolean {
    const type = event.dataTransfer?.getData(MATERIAL_DRAG_TYPE);
    if (type === undefined || type === '') return false;
    const document = this.callbacks.getDocument();
    const entry = this.callbacks.getCatalog()?.get(type);
    if (document === undefined || entry === undefined) return false;
    // snapPoint 返回的吸附点带 snappedX/snappedY 辅助字段，不能直接写入组件 position
    // （fail-closed 校验会拒绝未知字段），这里只取规范化后的 x/y。
    const snapped = this.snapPoint(this.canvasPointFromPointer(event));
    const position = { x: snapped.x, y: snapped.y };
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'add-component',
          component: {
            id: nextComponentId(document, entry.manifest.type),
            type: entry.manifest.type,
            name: entry.manifest.name,
            parentId: null,
            position,
            size: entry.manifest.defaultSize,
            rotation: 0,
            zIndex:
              document.components.reduce(
                (maximum, component) => Math.max(maximum, component.zIndex),
                -1,
              ) + 1,
            status: { locked: false, hidden: false },
            props: entry.manifest.defaultProps,
            style: entry.manifest.defaultStyle,
            dataSource: null,
          },
        },
      ],
    });
    this.clearSnapPreview();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  private renderMarquee(start: Point, end: Point): void {
    const marquee = this.#canvas?.querySelector<HTMLElement>('[data-marquee]');
    if (marquee === null || marquee === undefined) {
      return;
    }
    const rect = normalizedRect(start, end);
    marquee.style.display = 'block';
    marquee.style.left = `${rect.x}px`;
    marquee.style.top = `${rect.y}px`;
    marquee.style.width = `${rect.width}px`;
    marquee.style.height = `${rect.height}px`;
  }

  private renderCreatePreview(create: Create, end: Point): void {
    const canvas = this.#canvas;
    if (canvas === undefined) return;
    const preview =
      canvas.querySelector<HTMLElement>('[data-create-preview]') ??
      canvas.ownerDocument.createElement('div');
    preview.className = 'create-preview';
    preview.dataset.createPreview = 'true';
    const rect = normalizedRect(create.start, end);
    preview.style.left = `${rect.x}px`;
    preview.style.top = `${rect.y}px`;
    preview.style.width = `${Math.max(1, rect.width)}px`;
    preview.style.height = `${Math.max(1, rect.height)}px`;
    if (!preview.isConnected) canvas.appendChild(preview);
  }

  private releasePointerCapture(pointerId: number): void {
    if (this.#canvas?.hasPointerCapture(pointerId)) {
      this.#canvas.releasePointerCapture(pointerId);
    }
    this.restoreSelection();
  }

  private capturePointer(pointerId: number): void {
    try {
      this.#canvas?.setPointerCapture(pointerId);
    } catch {
      // Synthetic or detached pointers cannot capture; the gesture remains valid while events arrive.
    }
    this.suppressSelection();
  }

  // 手势激活期间，把画布自身的 user-select 临时置为 none，阻止拖拽选中组件内的文本。
  // 画布在设计器 shadow root 内，body 的 user-select 不会跨 shadow 边界继承到组件，
  // 因此必须直接作用于 canvas 元素（连同其子树一起继承）。参考 Nebula/Moveable 的
  // dragStart/dragEnd 阶段处理。
  private suppressSelection(): void {
    const canvas = this.#canvas;
    if (canvas === undefined || this.#selectSuppression !== null) return;
    this.#selectSuppression = canvas.style.userSelect;
    canvas.style.userSelect = 'none';
  }

  private restoreSelection(): void {
    const canvas = this.#canvas;
    if (canvas === undefined || this.#selectSuppression === null) return;
    canvas.style.userSelect = this.#selectSuppression;
    this.#selectSuppression = null;
  }

  private getCreateTool():
    | { readonly tool: DesignerToolId; readonly materialType: string }
    | undefined {
    const tool = this.callbacks.getActiveTool();
    if (!['text', 'rectangle', 'ellipse', 'image'].includes(tool)) return undefined;
    const materialType = this.callbacks.getToolMaterialTypes()?.[tool];
    if (
      materialType === undefined ||
      this.callbacks.getCatalog()?.get(materialType) === undefined
    ) {
      return undefined;
    }
    return { tool, materialType };
  }

  private commitCreate(event: PointerEvent): void {
    const create = this.#create;
    const document = this.callbacks.getDocument();
    const end = create === undefined ? undefined : this.snapCanvasPoint(event);
    this.cancelCreate();
    if (create === undefined || document === undefined) return;
    const entry = this.callbacks.getCatalog()?.get(create.materialType);
    if (entry === undefined) return;
    if (end === undefined) return;
    const width = Math.abs(end.x - create.start.x);
    const height = Math.abs(end.y - create.start.y);
    if (create.tool !== 'text' && (width > 0 || height > 0) && Math.max(width, height) < 4) return;
    const dragged = create.tool !== 'text' && (width >= 4 || height >= 4);
    this.callbacks.reportTransaction({
      commands: [
        {
          type: 'add-component',
          component: {
            id: nextComponentId(document, entry.manifest.type),
            type: entry.manifest.type,
            name: entry.manifest.name,
            parentId: null,
            position: dragged
              ? { x: Math.min(create.start.x, end.x), y: Math.min(create.start.y, end.y) }
              : create.start,
            size: dragged ? { width, height } : entry.manifest.defaultSize,
            rotation: 0,
            zIndex:
              document.components.reduce(
                (maximum, component) => Math.max(maximum, component.zIndex),
                -1,
              ) + 1,
            status: { locked: false, hidden: false },
            props: entry.manifest.defaultProps,
            style: entry.manifest.defaultStyle,
            dataSource: null,
          },
        },
      ],
    });
  }
}

interface TransformPreviewStyle {
  readonly height: string;
  readonly left: string;
  readonly top: string;
  readonly transform: string;
  readonly width: string;
}

// 变换手势开始前捕获 Material 根元素内联几何样式（renderer 以 left/top/width/height + rotate()
// 定位组件），供预览结束/取消时恢复，与拖拽 preview 的 translate 清理语义对称。
function captureTransformPreviewStyles(
  canvas: HTMLElement,
  components: readonly ScreenComponentNode[],
): ReadonlyMap<string, TransformPreviewStyle> {
  const styles = new Map<string, TransformPreviewStyle>();
  for (const component of components) {
    const element = canvas.querySelector<HTMLElement>(
      `[data-base-screen-component-id="${component.id}"]`,
    );
    if (element === null || element === undefined) continue;
    styles.set(component.id, {
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
      transform: element.style.transform,
    });
  }
  return styles;
}

function mutableSelectionSubtree(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  return selectionSubtree(document, componentIds).filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function normalizedRect(
  start: Point,
  end: Point,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function clampCoordinate(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPrimaryPointer(event: PointerEvent): boolean {
  // Synthetic test events may omit button; real PointerEvent always exposes 0 for the
  // primary pointer. Treat the omitted value as primary without allowing secondary buttons.
  return event.button === undefined || event.button === 0;
}
