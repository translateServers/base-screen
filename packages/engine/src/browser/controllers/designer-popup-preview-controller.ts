import type { ScreenDocument, ScreenJsonObject } from '@base-screen/contracts';
import type { ScreenBlueprintCanvasEffect } from '@base-screen/core';
import type {
  BaseScreenCanvasChange,
  BaseScreenMaterialEvent,
  BaseScreenRenderer,
} from '@base-screen/renderer';
import { listDesignerPopupComponentIds } from '../../common/session/designer-artboard.js';

export interface DesignerPopupPreviewCallbacks {
  /** 建一个只给弹框预览用的渲染器（预览模式、可交互），挂在 `root` 上。 */
  readonly createRenderer: (
    root: HTMLElement,
    onMaterialEvent: (event: BaseScreenMaterialEvent) => void,
    onCanvasChange: (change: BaseScreenCanvasChange) => void,
  ) => BaseScreenRenderer | undefined;
  /** 渲染器的身份（物料目录）：变化时丢弃旧渲染器、按新目录重建。 */
  readonly getRendererKey: () => unknown;
  /** 完整文档（含全部从画布），不是当前画板视图。 */
  readonly getDocument: () => ScreenDocument | undefined;
  /** 状态栏「事件」开着且正在编辑主画布或页面时才预览弹框。 */
  readonly isEnabled: () => boolean;
  /** 弹框里的组件事件：走与画布组件同一条蓝图分派。 */
  readonly onMaterialEvent: (event: BaseScreenMaterialEvent) => void;
  /** 弹框真正打开 / 关闭后回调：用于分派「已打开 / 已关闭」。 */
  readonly onPopupChange: (change: Extract<BaseScreenCanvasChange, { type: 'canvas' }>) => void;
}

/** 等关闭动画（160ms）放完再收起预览层。 */
const HIDE_DELAY_MS = 200;

/**
 * 设计态的弹框预览（ADR-0108 §2.7，ADR-0109 沿用）。
 *
 * 设计器主渲染器是 design 模式，不建弹框浮层，主画布视图里弹框组件也被隐藏锁定。状态栏「事件」打开后，
 * 蓝图里的「打开弹框」在这里以预览模式另起一个渲染器呈现：只挂弹框里的组件、画布背景透明，
 * 遮罩 / 定位 / Esc / 焦点全部沿用运行时的弹框浮层，所以看到的就是查看器里的样子。
 * 预览层里的指针与键盘事件不再冒泡到设计器（不会触发框选、删除等编辑操作）；弹框全部关闭后预览层收起。
 */
export class DesignerPopupPreviewController {
  #host: HTMLElement | undefined;
  #root: HTMLElement | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #rendererKey: unknown;
  #variables: ScreenJsonObject = {};
  #open = new Set<string>();
  #rendered: ScreenDocument | undefined;
  #source: ScreenDocument | undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #removers: (() => void)[] = [];

  constructor(private readonly callbacks: DesignerPopupPreviewCallbacks) {}

  connect(host: HTMLElement, root: HTMLElement): void {
    if (this.#host === host && this.#root === root) return;
    this.release();
    this.#host = host;
    this.#root = root;
    host.hidden = true;
    const stop = (event: Event): void => event.stopPropagation();
    for (const type of [
      'pointerdown',
      'pointerup',
      'click',
      'dblclick',
      'contextmenu',
      'keydown',
      'keyup',
    ]) {
      host.addEventListener(type, stop);
      this.#removers.push(() => host.removeEventListener(type, stop));
    }
  }

  release(): void {
    this.#clearHideTimer();
    for (const remove of this.#removers.splice(0)) remove();
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#host = undefined;
    this.#root = undefined;
    this.#rendered = undefined;
    this.#source = undefined;
    this.#open.clear();
  }

  get active(): boolean {
    return this.#open.size > 0;
  }

  /** 蓝图分派结果落地：先同步变量与文档，再执行弹框开合（页面与导航由画布运行时切画板）。 */
  apply(effects: readonly ScreenBlueprintCanvasEffect[], variables: ScreenJsonObject): void {
    this.#variables = variables;
    if (effects.length === 0) {
      if (this.active) this.#render();
      return;
    }
    if (!this.callbacks.isEnabled()) return;
    const renderer = this.#ensureRenderer();
    if (renderer === undefined || !this.#render()) return;
    renderer.applyBlueprintCanvasEffects(effects);
  }

  /** 文档编辑、关掉「事件」、切到弹框画板时：全部关闭，不发通知（同主画布显隐复位）。 */
  reset(): void {
    this.#clearHideTimer();
    this.#renderer?.resetBlueprintVisibility();
    this.#open.clear();
    if (this.#host !== undefined) this.#host.hidden = true;
  }

  #ensureRenderer(): BaseScreenRenderer | undefined {
    const key = this.callbacks.getRendererKey();
    if (this.#renderer !== undefined && this.#rendererKey === key) return this.#renderer;
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#rendered = undefined;
    this.#open.clear();
    const root = this.#root;
    if (root === undefined) return undefined;
    this.#rendererKey = key;
    this.#renderer = this.callbacks.createRenderer(
      root,
      (event) => this.callbacks.onMaterialEvent(event),
      (change) => this.#onChange(change),
    );
    return this.#renderer;
  }

  /**
   * 弹框预览文档：只含弹框与其中的组件，画布背景透明（主画布 / 页面由设计器自己的渲染器画）。
   * 页面从画布不进预览文档，预览渲染器不建页面层、不会自己切页。
   */
  #render(): boolean {
    const renderer = this.#renderer;
    const source = this.callbacks.getDocument();
    if (renderer === undefined || source === undefined) return false;
    if (source !== this.#source || this.#rendered === undefined) {
      this.#source = source;
      const inside = listDesignerPopupComponentIds(source);
      this.#rendered = {
        ...source,
        canvas: {
          width: source.canvas.width,
          height: source.canvas.height,
          backgroundColor: 'transparent',
        },
        components: source.components.filter((component) => inside.has(component.id)),
        blueprint: { nodes: [], edges: [] },
      };
      const { startCanvasId: _start, ...rest } = this.#rendered;
      const popups = (source.subCanvases ?? []).filter((canvas) => canvas.display === 'popup');
      this.#rendered = { ...rest, subCanvases: popups };
    }
    const variables = renderer.setVariables(this.#variables);
    if (!variables.ok) return false;
    return renderer.render(this.#rendered, { trigger: 'variable' }).ok;
  }

  #onChange(change: BaseScreenCanvasChange): void {
    if (change.type !== 'canvas' || change.display !== 'popup') return;
    if (change.open) this.#open.add(change.canvasId);
    else this.#open.delete(change.canvasId);
    const host = this.#host;
    if (host !== undefined) {
      this.#clearHideTimer();
      if (this.#open.size > 0) host.hidden = false;
      else {
        this.#hideTimer = setTimeout(() => {
          this.#hideTimer = undefined;
          if (this.#open.size === 0 && this.#host !== undefined) this.#host.hidden = true;
        }, HIDE_DELAY_MS);
      }
    }
    this.callbacks.onPopupChange(change);
  }

  #clearHideTimer(): void {
    if (this.#hideTimer === undefined) return;
    clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
  }
}
