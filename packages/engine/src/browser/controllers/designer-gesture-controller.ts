import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  queryScreenComponentsInRect,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
  type ScreenViewportState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { selectedComponents } from '../../common/operations/designer-selection.js';
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
import type { DesignerSnapPoint } from '../viewport/designer-canvas-aids.js';
import {
  clientPointToDesignerCanvasPoint,
  type DesignerClientPoint,
} from '../viewport/designer-canvas-coordinates.js';
import { MATERIAL_DRAG_TYPE } from './designer-panel-controller.js';

// Movement below this screen-pixel distance is treated as a selection click, not a drag.
// Otherwise a click would snap the component to the grid / smart guides and move it.
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
}

interface Marquee {
  readonly pointerId: number;
  readonly start: Point;
  readonly union: boolean;
  readonly contain: boolean;
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
  ) => {
    readonly x: number;
    readonly y: number;
    readonly snappedX?: number | undefined;
    readonly snappedY?: number | undefined;
  };
  readonly renderSnapPreview?: (point: DesignerSnapPoint | undefined) => void;
  readonly reduceSelection: (action: ScreenInteractionAction) => void;
  readonly reportTransaction: (transaction: ScreenDocumentTransaction) => void;
  readonly renderSelection: () => void;
  /** 系统级焦点约束：画布点击时把键盘焦点收敛到 viewport 容器。 */
  readonly focusViewport?: () => void;
}

export class DesignerGestureController {
  #canvas: HTMLDivElement | undefined;
  #drag: Drag | undefined;
  #transform: Transform | undefined;
  #marquee: Marquee | undefined;
  #pan: Pan | undefined;
  #create: Create | undefined;
  #selectSuppression: string | null = null;

  constructor(private readonly callbacks: DesignerGestureCallbacks) {}

  connect(canvas: HTMLDivElement): void {
    this.#canvas = canvas;
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => this.cancel());
    // 画布是可拖拽交互表面：系统性禁止原生文本选择（selectstart 是浏览器启动文本选择的
    // 事件通道，即使 CSS user-select 未级联到某些内容也能拦截，参考 Nebula/Moveable）。
    canvas.addEventListener('selectstart', (event) => event.preventDefault());
    // 从物料面板拖拽物料到画布：dragover 需要 preventDefault 才能触发 drop。
    canvas.addEventListener('dragover', (event) => this.onDragOverCanvas(event));
    canvas.addEventListener('drop', (event) => this.onDropOnCanvas(event));
  }

  cancel(): void {
    this.cancelDrag();
    this.cancelTransform();
    this.cancelMarquee();
    this.cancelPan();
    this.cancelCreate();
    this.clearSnapPreview();
  }

  private onPointerDown(event: PointerEvent): void {
    const target = event.target;
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (!(target instanceof HTMLElement) || document === undefined || canvas === undefined) {
      return;
    }
    // 系统级焦点约束：画布是键盘交互表面。阻止浏览器默认把焦点分配给被点击的子元素，
    // 并把焦点收敛到 viewport 容器，保证后续快捷键（空格平移、删除等）始终命中画布上下文，
    // 不会残留到某个已聚焦控件（否则空格/回车会触发该控件的默认激活，干扰快捷键）。
    event.preventDefault();
    this.callbacks.focusViewport?.();
    if (this.callbacks.isHandActive()) {
      event.preventDefault();
      this.capturePointer(event.pointerId);
      this.#pan = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
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
    const material = target.closest<HTMLElement>('[data-base-screen-component-id]');
    const componentId = material?.dataset.baseScreenComponentId;
    if (componentId === undefined || material === null) {
      event.preventDefault();
      this.capturePointer(event.pointerId);
      this.#marquee = {
        pointerId: event.pointerId,
        start: this.canvasPointFromPointer(event),
        union: event.shiftKey,
        contain: event.altKey,
      };
      this.renderMarquee(this.#marquee.start, this.#marquee.start);
      return;
    }
    const component = document.components.find((item) => item.id === componentId);
    if (component === undefined) {
      return;
    }
    if (isScreenComponentEffectivelyHidden(document, componentId)) {
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      this.callbacks.reduceSelection({ type: 'toggle-selection', componentId });
      return;
    }
    const interaction = this.callbacks.getInteraction();
    const selected = selectedComponents(document, interaction.selectedComponentIds);
    const components = interaction.selectedComponentIds.includes(componentId)
      ? selected
      : [component];
    if (
      components.length === 0 ||
      new Set(components.map((item) => item.parentId)).size !== 1 ||
      components.some((item) => isScreenComponentEffectivelyLocked(document, item.id))
    ) {
      return;
    }
    if (!interaction.selectedComponentIds.includes(componentId)) {
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: [componentId],
        focusedComponentId: componentId,
      });
    }
    event.preventDefault();
    this.capturePointer(event.pointerId);
    const bounds = getScreenSelectionBounds(components);
    if (bounds === null) return;
    this.#drag = {
      components,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      bounds,
      selection: canvas.querySelector<HTMLElement>('[data-selection]') ?? undefined,
      elements: [
        material,
        ...components.flatMap((selected) => {
          const element = canvas.querySelector<HTMLElement>(
            `[data-base-screen-component-id="${selected.id}"]`,
          );
          return element === null || element === material ? [] : [element];
        }),
      ],
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
      this.renderMarquee(this.#marquee.start, this.canvasPointFromPointer(event));
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
      this.callbacks.reduceSelection({
        type: 'replace-selection',
        componentIds: marquee.union ? [...interaction.selectedComponentIds, ...ids] : ids,
        focusedComponentId: ids.at(-1) ?? (marquee.union ? interaction.focusedComponentId : null),
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
      this.callbacks.reportTransaction({
        commands: drag.components.map((source, index) => ({
          type: 'add-component' as const,
          component: {
            ...source,
            id: nextComponentId(document, `${source.type}-${index}`),
            name: `${source.name} copy`,
            position: {
              x: clampCoordinate(source.position.x + translation.x),
              y: clampCoordinate(source.position.y + translation.y),
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
            x: clampCoordinate(component.position.x + translation.x),
            y: clampCoordinate(component.position.y + translation.y),
          },
        },
      })),
    });
  }

  private startTransform(event: PointerEvent, handle: BaseScreenTransformHandle | undefined): void {
    const document = this.callbacks.getDocument();
    const canvas = this.#canvas;
    if (document === undefined || canvas === undefined) {
      return;
    }
    const components = selectedComponents(
      document,
      this.callbacks.getInteraction().selectedComponentIds,
    );
    const capability = handle === undefined ? 'rotate' : 'resize';
    if (
      components.length === 0 ||
      !components.every((component) => {
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
    this.#transform = {
      pointerId: event.pointerId,
      kind: handle === undefined ? 'rotate' : 'resize',
      handle,
      start: this.canvasPointFromPointer(event),
      components,
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
    const selection = this.#canvas?.querySelector<HTMLElement>('[data-selection]');
    if (this.#transform === undefined || selection === null || selection === undefined) {
      return;
    }
    const bounds = getScreenSelectionBounds(this.transformComponents(this.#transform, event));
    if (bounds === null) {
      return;
    }
    selection.style.left = `${bounds.left}px`;
    selection.style.top = `${bounds.top}px`;
    selection.style.width = `${bounds.right - bounds.left}px`;
    selection.style.height = `${bounds.bottom - bounds.top}px`;
  }

  private cancelTransform(): void {
    if (this.#transform === undefined) {
      return;
    }
    this.releasePointerCapture(this.#transform.pointerId);
    this.#transform = undefined;
    this.clearSnapPreview();
    this.callbacks.renderSelection();
  }

  private cancelDrag(): void {
    if (this.#drag === undefined) {
      return;
    }
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
      this.releasePointerCapture(this.#create.pointerId);
      this.#create = undefined;
    }
    this.#canvas?.querySelector<HTMLElement>('[data-create-preview]')?.remove();
    this.clearSnapPreview();
  }

  private canvasPointFromPointer(point: DesignerClientPoint): Point {
    const bounds = this.#canvas!.getBoundingClientRect();
    return clientPointToDesignerCanvasPoint(point, bounds, this.callbacks.getViewport().zoom);
  }

  private dragTranslation(drag: Drag, event: PointerEvent): Point {
    const zoom = this.callbacks.getViewport().zoom;
    const translation = {
      x: clampCoordinate((event.clientX - drag.startClientX) / zoom),
      y: clampCoordinate((event.clientY - drag.startClientY) / zoom),
    };
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
