import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenAlignment,
  BaseScreenDistribution,
} from '../../../common/operations/element/designer-layout-operations.js';
import type { DesignerPanelControllerCallbacks } from './designer-panel-controller-callbacks.js';
import { DesignerPanelInspectorController } from './designer-panel-inspector-controller.js';
import {
  DesignerPanelMaterialController,
  MATERIAL_DRAG_TYPE,
  MATERIAL_LIBRARY_FRAGMENT_DRAG_TYPE,
  MATERIAL_LIBRARY_ITEM_DRAG_TYPE,
  MATERIAL_SEARCH_DEBOUNCE_MS,
} from './designer-panel-material-controller.js';
import { DesignerPanelPropertyController } from './designer-panel-property-controller.js';
import { DesignerPanelSelectionController } from './designer-panel-selection-controller.js';

export type { DesignerPanelControllerCallbacks } from './designer-panel-controller-callbacks.js';
export {
  MATERIAL_DRAG_TYPE,
  MATERIAL_LIBRARY_FRAGMENT_DRAG_TYPE,
  MATERIAL_LIBRARY_ITEM_DRAG_TYPE,
  MATERIAL_SEARCH_DEBOUNCE_MS,
};

/**
 * Stable facade for Designer panel interactions.
 *
 * State and behavior live in focused collaborators so Inspector chrome, material browsing,
 * property transactions, and selection commands can evolve independently.
 */
export class DesignerPanelController {
  readonly #inspector: DesignerPanelInspectorController;
  readonly #materials: DesignerPanelMaterialController;
  readonly #properties: DesignerPanelPropertyController;
  readonly #selection: DesignerPanelSelectionController;

  constructor(callbacks: DesignerPanelControllerCallbacks) {
    this.#inspector = new DesignerPanelInspectorController(callbacks);
    this.#materials = new DesignerPanelMaterialController(callbacks);
    this.#properties = new DesignerPanelPropertyController(callbacks);
    this.#selection = new DesignerPanelSelectionController(callbacks);
  }

  clearClipboard(): void {
    this.#selection.clearClipboard();
  }

  dispose(): void {
    this.#materials.dispose();
    this.#inspector.dispose();
  }

  /** 工作台切换到蓝图时立即收起仅属于画布模式的弹层。 */
  dismissTransientSurfaces(): void {
    this.#materials.dismissTransientSurfaces();
  }

  onPointerDown(event: PointerEvent): void {
    this.#inspector.onPointerDown(event);
  }

  get hasClipboard(): boolean {
    return this.#selection.hasClipboard;
  }

  refreshMaterialLibrary(layout: HTMLElement | null): void {
    this.#materials.refresh(layout);
  }

  get canGroup(): boolean {
    return this.#selection.canGroup;
  }

  get canUngroup(): boolean {
    return this.#selection.canUngroup;
  }

  get canAlign(): boolean {
    return this.#selection.canAlign;
  }

  get canDistribute(): boolean {
    return this.#selection.canDistribute;
  }

  copy(): void {
    this.#selection.copy();
  }

  paste(): ScreenParseResult<ScreenDocument> {
    return this.#selection.paste();
  }

  duplicate(): ScreenParseResult<ScreenDocument> {
    return this.#selection.duplicate();
  }

  group(): ScreenParseResult<ScreenDocument> {
    return this.#selection.group();
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    return this.#selection.ungroup();
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    return this.#selection.align(alignment);
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    return this.#selection.distribute(distribution);
  }

  /** `dataPane` 不参与渲染，只用来把数据面板的滚动容器登记给滚动守护。 */
  render(properties: HTMLElement | undefined, dataPane?: HTMLElement): void {
    this.#inspector.prepareRender(properties, dataPane);
    this.#properties.render(properties);
  }

  captureInspectorGroupPreferences(root: ShadowRoot | HTMLElement | null): void {
    this.#inspector.captureGroupPreferences(root);
  }

  refreshInspectorUi(root: ShadowRoot | HTMLElement | null): void {
    this.#inspector.refresh(root);
  }

  onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.#inspector.onClick(target)) return;
    if (this.#materials.onClick(target)) return;
    if (this.#properties.onClick(target)) return;
    if (target instanceof HTMLElement) this.#selection.onClick(target);
  }

  onDragStart(event: DragEvent): boolean {
    return this.#materials.onDragStart(event);
  }

  onPropertyChange(event: Event): void {
    // 检查器重渲染会移除带焦点的控件（搜索结果卡里的克隆编辑器就是这种情况），浏览器会
    // 趁控件仍在文档中（`isConnected` 仍为 true）补发一次 change。它属于渲染副作用而不是
    // 用户编辑：照常提交会在刷新内部重入一次事务，外层随后只能拿已脱离文档的字段收尾，
    // 搜索结果因此被清空。渲染窗口内的 change 一律不提交。
    if (this.#inspector.isRendering) return;
    this.#inspector.preservePropertyScroll(event.target);
    this.#properties.onPropertyChange(event);
  }

  onInput(event: Event): boolean {
    return this.#inspector.onInput(event.target) || this.#materials.onInput(event.target);
  }

  onKeyDown(event: KeyboardEvent): boolean {
    return (
      this.#inspector.onKeyDown(event) ||
      this.#materials.onKeyDown(event) ||
      this.#properties.onKeyDown(event) ||
      this.#selection.onKeyDown(event)
    );
  }
}
