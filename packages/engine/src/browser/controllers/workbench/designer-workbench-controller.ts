import type { ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenDesignerWorkbenchMode } from '../../../common/operations/blueprint/designer-blueprint-protocol.js';
import {
  type DesignerSnapPoint,
  type DesignerSnapPreview,
  type DesignerSnapTranslation,
} from '../../viewport/designer-canvas-aids.js';
import { DesignerGuideController } from './designer-guide-controller.js';
import { DesignerPanelLayoutController } from './designer-panel-layout-controller.js';
import { DesignerSnapController } from './designer-snap-controller.js';
import {
  type DesignerInspectorTab,
  DesignerWorkbenchTabsController,
} from './designer-workbench-tabs-controller.js';

export type { DesignerInspectorTab } from './designer-workbench-tabs-controller.js';

interface DesignerWorkbenchCallbacks {
  readonly getCanvas: () => HTMLDivElement | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog?: () => BaseScreenMaterialCatalog | undefined;
  readonly getRoot: () => ShadowRoot | null;
  readonly getZoom: () => number;
  /** 状态栏「事件」开关切换回调：组合根据此切换渲染器 interactive 状态。 */
  readonly onNativeEventsChange?: (enabled: boolean) => void;
  /** 宿主左侧分组切换；切回内建分组时传 undefined。 */
  readonly onLeftPanelGroupChange?: (groupId: string | undefined) => void;
}

export class DesignerWorkbenchController {
  readonly #guides: DesignerGuideController;
  readonly #panelLayout: DesignerPanelLayoutController;
  readonly #snap: DesignerSnapController;
  readonly #tabs: DesignerWorkbenchTabsController;
  #nativeEventsEnabled = false;

  constructor(private readonly callbacks: DesignerWorkbenchCallbacks) {
    this.#panelLayout = new DesignerPanelLayoutController({ getRoot: callbacks.getRoot });
    this.#guides = new DesignerGuideController({
      getCanvas: callbacks.getCanvas,
      getDocument: callbacks.getDocument,
      getRoot: callbacks.getRoot,
      getSnapState: () => ({
        canvasAids: this.#snap.canvasAids,
        enabled: this.#snap.enabled,
        preview: this.#snap.preview,
      }),
      getZoom: callbacks.getZoom,
      invalidateSnap: () => this.#snap.invalidateCandidates(),
      onLostPointerCapture: (event) => this.onPointerCancel(event),
      renderStatus: () => this.renderStatusToggles(),
    });
    this.#snap = new DesignerSnapController({
      getDocument: callbacks.getDocument,
      getGuides: () => this.#guides.guides,
      getRoot: callbacks.getRoot,
      getZoom: callbacks.getZoom,
      renderGuides: () => this.#guides.render(),
      renderRulers: () => this.#guides.renderRulers(),
      renderStatus: () => this.renderStatusToggles(),
    });
    this.#tabs = new DesignerWorkbenchTabsController({
      expandPanel: (side) => {
        this.#panelLayout.expand(side);
      },
      ...(callbacks.getCatalog === undefined ? {} : { getCatalog: callbacks.getCatalog }),
      getDocument: callbacks.getDocument,
      getInteraction: callbacks.getInteraction,
      getRoot: callbacks.getRoot,
      ...(callbacks.onLeftPanelGroupChange === undefined
        ? {}
        : { onLeftPanelGroupChange: callbacks.onLeftPanelGroupChange }),
    });
  }

  initialize(): void {
    this.#panelLayout.initialize();
    this.connect(this.callbacks.getCanvas());
    this.#tabs.initialize();
    this.#snap.initialize();
    this.renderStatusToggles();
    this.#guides.render();
    this.#guides.renderRulers();
    this.#guides.observeRulerResize();
  }

  connect(canvas: HTMLDivElement | undefined): void {
    if (canvas === undefined || this.#guides.isConnected(canvas)) return;
    this.disconnect();
    this.#guides.connect(canvas);
  }

  disconnect(): void {
    this.cancelTransientState();
    this.#guides.disconnect();
  }

  // 手势首帧建立吸附/测量共享的几何快照，结束或取消后释放；每轴独立记录吸附状态。
  setSnapSessionActive(active: boolean): void {
    this.#snap.setSessionActive(active);
  }

  invalidateGeometry(): void {
    this.#snap.invalidateCandidates();
  }

  snapPoint(
    point: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapPoint {
    return this.#snap.snapPoint(point, excludedComponentIds);
  }

  snapSelectionOffset(
    bounds: {
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
      readonly top: number;
    },
    offset: { readonly x: number; readonly y: number },
    excludedComponentIds: readonly string[] = [],
  ): DesignerSnapTranslation {
    return this.#snap.snapSelectionOffset(bounds, offset, excludedComponentIds);
  }

  // 预览只绘制求解器显式给出的 guides，吸附结果本身不代表已经进入显示阈值。
  renderSnapPreview(point: DesignerSnapPreview | undefined): void {
    this.#snap.renderPreview(point);
  }

  renderCanvasPrecision(): void {
    this.#snap.renderCanvasPrecision();
  }

  toggleCanvasAid(aid: 'gridEnabled'): void {
    this.#snap.toggleCanvasAid(aid);
  }

  /** 吸附总开关（状态栏 Snap 开关）：关闭时 snapPoint/snapSelectionOffset 原样返回。 */
  get snapEnabled(): boolean {
    return this.#snap.enabled;
  }

  /** 画布辅助开关当前值：菜单勾选状态与状态栏开关共用同一状态源。 */
  isCanvasAidEnabled(aid: 'gridEnabled'): boolean {
    return this.#snap.isCanvasAidEnabled(aid);
  }

  /** 用户参考线显示开关（视图 > 画布辅助 > 参考线，与标尺角眼睛按钮共用）。 */
  get guidesVisible(): boolean {
    return this.#guides.visible;
  }

  /** 边框参考线（智能吸附参考线/测量标注）开关当前值。 */
  get borderGuidesEnabled(): boolean {
    return this.#snap.borderGuidesEnabled;
  }

  toggleSnap(): void {
    this.#snap.toggleSnap();
  }

  toggleGuides(): void {
    this.#guides.toggleVisible();
  }

  /** 状态栏「事件」开关当前值（设计态画布 interactive 状态的唯一来源）。 */
  get nativeEventsEnabled(): boolean {
    return this.#nativeEventsEnabled;
  }

  /** 切换设计态画布原生事件（interactive）开关，并通知组合根应用新状态。 */
  toggleNativeEvents(): void {
    this.#nativeEventsEnabled = !this.#nativeEventsEnabled;
    this.callbacks.onNativeEventsChange?.(this.#nativeEventsEnabled);
    this.renderStatusToggles();
  }

  toggleBorderGuides(): void {
    this.#snap.toggleBorderGuides();
  }

  cycleMode(): void {
    this.#panelLayout.cycleMode();
  }

  onClick(target: Element): boolean {
    const collapse =
      target.closest<HTMLButtonElement>('[data-panel-collapse]')?.dataset.panelCollapse;
    if (collapse === 'left' || collapse === 'right') {
      this.#panelLayout.toggle(collapse);
      return true;
    }
    if (this.#tabs.onClick(target)) return true;
    // 状态栏与标尺角的辅助开关共用菜单/快捷键状态。
    const statusToggle =
      target.closest<HTMLButtonElement>('[data-status-toggle]')?.dataset.statusToggle;
    if (statusToggle === 'snap') {
      this.toggleSnap();
      return true;
    }
    if (statusToggle === 'guides') {
      this.toggleGuides();
      return true;
    }
    if (statusToggle === 'native-events') {
      this.toggleNativeEvents();
      return true;
    }
    return false;
  }

  selectInspectorTab(tab: DesignerInspectorTab): void {
    this.#tabs.selectInspectorTab(tab);
  }

  get selectedLeftPanelGroupId(): string | undefined {
    return this.#tabs.selectedLeftPanelGroupId;
  }

  setAuthoringMode(mode: BaseScreenDesignerWorkbenchMode): void {
    this.#tabs.setAuthoringMode(mode);
  }

  expandLeftPanel(): void {
    this.#panelLayout.expand('left');
  }

  selectLeftPanelGroup(groupId: string): boolean {
    return this.#tabs.selectLeftPanelGroup(groupId);
  }

  refreshLeftPanelGroups(): void {
    this.#tabs.refreshLeftPanelGroups();
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (
      !event.isComposing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === ' ' || event.key === 'Enter')
    ) {
      const target = event.target as Element | null;
      const toggle = target?.closest?.<HTMLButtonElement>('[data-status-toggle]');
      if (toggle !== null && toggle !== undefined && !toggle.disabled) {
        event.preventDefault();
        if (!event.repeat) this.onClick(target!);
        return true;
      }
    }
    if (this.#panelLayout.onKeyDown(event)) return true;
    return this.#tabs.onKeyDown(event);
  }

  onPointerDown(event: PointerEvent): void {
    if (!isPrimaryPointer(event)) return;
    const target = event.target as HTMLElement | null;
    // 把手上的折叠胶囊钮是按钮不是拖拽面：按下它只触发 click 切换折叠，不能启动拖拽改宽，
    // 否则点击会被当成 0 位移的 resize（把手其余区域仍可拖拽）。
    if (target?.closest<HTMLElement>('[data-panel-collapse]') !== null) return;
    const side = target?.closest<HTMLElement>('[data-panel-handle]')?.dataset.panelHandle;
    if (side === 'left' || side === 'right') {
      this.#panelLayout.onPointerDown(event, side);
      return;
    }
    this.#guides.onPointerDown(event);
  }

  onPointerMove(event: PointerEvent): void {
    this.#panelLayout.onPointerMove(event);
    this.#guides.onPointerMove(event);
  }

  onPointerUp(event: PointerEvent): void {
    this.#panelLayout.onPointerUp(event.pointerId);
    this.#guides.onPointerUp(event);
  }

  onPointerCancel(event: PointerEvent): void {
    if (
      event.type === 'lostpointercapture' &&
      !this.#panelLayout.isResizingPointer(event.pointerId) &&
      !this.#guides.isDraggingPointer(event.pointerId)
    ) {
      return;
    }
    this.cancelTransientState();
  }

  onDoubleClick(event: MouseEvent): void {
    this.#guides.onDoubleClick(event);
  }

  cancelTransientState(): void {
    this.#guides.resetTransient();
    this.#panelLayout.cancelResize();
    this.#snap.setSessionActive(false);
    this.#snap.clearPreview();
    this.#guides.render();
  }

  // 选中变化时刷新右侧检查器：只有单选显示"外观/数据/交互/事件"tab 栏。
  // 画布和多选只保留外观 pane，避免暴露单组件才有意义的检查器页签。
  renderInspectorTabs(): void {
    this.#tabs.renderInspectorTabs();
  }

  clearGuides(): void {
    this.cancelTransientState();
    this.#guides.clear();
  }

  // 状态栏与标尺角开关的 aria-checked 同步到菜单/快捷键共用的状态源。
  private renderStatusToggles(): void {
    const root = this.callbacks.getRoot();
    if (root === null) return;
    const setToggle = (name: 'snap' | 'guides' | 'native-events', active: boolean) => {
      root
        .querySelector<HTMLButtonElement>(`[data-status-toggle="${name}"]`)
        ?.setAttribute('aria-checked', String(active));
    };
    setToggle('snap', this.#snap.enabled);
    setToggle('guides', this.#guides.visible);
    setToggle('native-events', this.#nativeEventsEnabled);
  }
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.button === undefined || event.button === 0;
}
