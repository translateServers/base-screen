import type { ScreenDocument } from '@base-screen/contracts';
import {
  reduceScreenViewport,
  type ScreenPoint,
  type ScreenViewportState,
} from '@base-screen/core';
import { DESIGNER_TOOLS, type DesignerToolId } from '../../common/tools/designer-tools.js';
import { designerToolGlyph } from '../dom/designer-workspace.js';
import {
  clampDesignerZoom,
  getFitDesignerZoom,
  getViewportAnchor,
  viewportTransform,
} from '../viewport/designer-viewport.js';

export interface DesignerViewportControllerCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly onBlur: () => void;
  readonly onToolChange: (tool: DesignerToolId) => void;
  readonly onViewportChange?: () => void;
}

export class DesignerViewportController {
  #state: ScreenViewportState = { zoom: 1, offset: { x: 0, y: 0 } };
  #viewport: HTMLDivElement | undefined;
  #canvas: HTMLDivElement | undefined;
  #listeners: readonly { readonly type: string; readonly listener: EventListener }[] = [];
  #spacePressed = false;
  #activeTool: DesignerToolId = 'select';
  #hovered = false;

  constructor(private readonly callbacks: DesignerViewportControllerCallbacks) {}

  get state(): ScreenViewportState {
    return this.#state;
  }
  get activeTool(): DesignerToolId {
    return this.#spacePressed ? 'hand' : this.#activeTool;
  }
  /** 指针当前悬停在视窗表面（window 级空格抓手的前置条件，与键盘焦点解耦）。 */
  get hovered(): boolean {
    return this.#hovered;
  }

  connect(viewport: HTMLDivElement, canvas: HTMLDivElement): void {
    if (this.#viewport === viewport && this.#canvas === canvas) return;
    this.disconnect();
    this.#viewport = viewport;
    this.#canvas = canvas;
    this.#listeners = [
      { type: 'wheel', listener: (event) => this.onWheel(event as WheelEvent) },
      {
        type: 'blur',
        listener: () => {
          delete viewport.dataset.pointerFocus;
          this.releaseSpace();
          this.callbacks.onBlur();
        },
      },
      // hover 状态：空格抓手不依赖键盘焦点，鼠标移入视窗即可激活（PS 语义）。
      // pointerenter/leave 不冒泡，且 pointer capture 期间不会误触发（enter/leave 派发到 capture 元素）。
      {
        type: 'pointerenter',
        listener: () => {
          this.#hovered = true;
        },
      },
      {
        type: 'pointerleave',
        listener: () => {
          this.#hovered = false;
        },
      },
    ];
    for (const { type, listener } of this.#listeners) {
      viewport.addEventListener(type, listener, type === 'wheel' ? { passive: false } : undefined);
    }
    viewport.tabIndex = 0;
    this.render();
  }

  /** 成对移除视窗监听并复位悬停状态（元素 disconnect 时由宿主调用）。 */
  disconnect(): void {
    const viewport = this.#viewport;
    if (viewport !== undefined) {
      for (const { type, listener } of this.#listeners) {
        viewport.removeEventListener(type, listener);
      }
      delete viewport.dataset.pointerFocus;
    }
    this.#listeners = [];
    this.#viewport = undefined;
    this.#canvas = undefined;
    this.#hovered = false;
  }

  /** 把键盘焦点收敛到 viewport 焦点容器，作为画布交互的统一快捷键命中目标。 */
  focus(preventScroll = true): void {
    this.#viewport?.focus({ preventScroll });
  }

  /** 指针操作聚焦 viewport，但不把页面初始的 focus-visible 状态继承到画布。 */
  focusFromPointer(preventScroll = true): void {
    const viewport = this.#viewport;
    if (viewport === undefined) return;
    viewport.dataset.pointerFocus = '';
    // focusVisible 是渐进增强；不支持该选项的基线浏览器由 data-pointer-focus CSS 守卫兜底。
    const options = { preventScroll, focusVisible: false };
    viewport.focus(options);
  }

  setZoom(zoom: number, anchor = { x: 0, y: 0 }): void {
    this.#state = reduceScreenViewport(this.#state, {
      type: 'set-zoom',
      zoom: clampDesignerZoom(zoom),
      anchor,
    });
    this.render();
  }

  setZoomCentered(zoom: number): void {
    const viewport = this.#viewport;
    if (viewport === undefined) {
      this.setZoom(zoom);
      return;
    }
    this.setZoom(zoom, { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  }

  panBy(delta: { readonly x: number; readonly y: number }): void {
    this.#state = reduceScreenViewport(this.#state, { type: 'pan-by', delta });
    this.render();
  }

  centerOn(point: ScreenPoint): void {
    const viewport = this.#viewport;
    const canvas = this.#canvas;
    if (viewport === undefined || canvas === undefined) return;
    const target = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    const current = {
      x: canvas.offsetLeft + this.#state.offset.x + point.x * this.#state.zoom,
      y: canvas.offsetTop + this.#state.offset.y + point.y * this.#state.zoom,
    };
    this.panBy({ x: target.x - current.x, y: target.y - current.y });
    this.focus();
  }

  reset(): void {
    this.#state = reduceScreenViewport(this.#state, { type: 'reset' });
    this.render();
  }

  fit(): void {
    const document = this.callbacks.getDocument();
    const viewport = this.#viewport;
    if (document === undefined || viewport === undefined) return;
    this.setZoom(
      getFitDesignerZoom(document, { width: viewport.clientWidth, height: viewport.clientHeight }),
    );
  }

  fitSelection(size: { readonly width: number; readonly height: number }): void {
    const viewport = this.#viewport;
    if (viewport === undefined) return;
    this.setZoom(
      getFitDesignerZoom(
        {
          canvas: { width: size.width, height: size.height, backgroundColor: '#000000' },
          components: [],
          variables: [],
          blueprint: { rules: [] },
        },
        { width: viewport.clientWidth, height: viewport.clientHeight },
      ),
    );
  }

  /** 同步手型/平移状态到 viewport 表面，供 CSS 切换抓手工标（空格临时或抓手工具）。 */
  setPanning(panning: boolean): void {
    const dataset = (this.#viewport as { readonly dataset?: DOMStringMap } | undefined)?.dataset;
    if (dataset !== undefined) dataset.panning = String(panning);
  }

  render(root: ParentNode | null = getParentNode(this.#canvas)): void {
    if (this.#canvas !== undefined) this.#canvas.style.transform = viewportTransform(this.#state);
    const dataset = (this.#viewport as { readonly dataset?: DOMStringMap } | undefined)?.dataset;
    // 用 data-active-tool 而非 data-tool 存储当前工具：data-tool 是工具栏按钮的
    // 命中选择器（executeToolFromTarget 的 closest('[data-tool]')），同名会被误命中。
    if (dataset !== undefined) dataset.activeTool = this.activeTool;
    for (const output of root?.querySelectorAll<HTMLOutputElement>('[data-zoom]') ?? []) {
      output.value = `${Math.round(this.#state.zoom * 100)}%`;
    }
    const zoomTrigger = root?.querySelector<HTMLElement>('[data-status-zoom]');
    if (zoomTrigger !== null && zoomTrigger !== undefined) {
      zoomTrigger.textContent = `${Math.round(this.#state.zoom * 100)}%`;
    }
    const tool = DESIGNER_TOOLS.find((entry) => entry.id === this.activeTool);
    const statusTool = root?.querySelector<HTMLElement>('[data-status-tool]');
    if (statusTool !== null && statusTool !== undefined && tool !== undefined) {
      // 图标+名称均由静态常量派生（designerToolGlyph / DESIGNER_TOOLS），无用户输入。
      statusTool.innerHTML = `${designerToolGlyph(tool.id)}<span class="status-tool-name">${tool.label}</span>`;
    }
    this.callbacks.onViewportChange?.();
  }

  private onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.setZoom(
        this.#state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
        getViewportAnchor(event, this.#viewport!),
      );
      return;
    }
    // 画布内普通滚轮 = 平移画布（shift+wheel = 水平平移），阻断宿主页面滚动。
    // 方向约定与直接拖拽相反：滚轮向下滚动等价于"视图内容上移"，即画布 offset 减少。
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 512 : 1;
    const dx = (event.shiftKey ? event.deltaY : event.deltaX) * scale;
    const dy = (event.shiftKey ? event.deltaX : event.deltaY) * scale;
    this.panBy({ x: -dx, y: -dy });
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (isEditable(event.target)) return false;
    if (event.code === 'Space') {
      // 即使是按住空格重复触发（连续平移），也必须阻止浏览器默认滚动，
      // 否则焦点容器上的空格会滚动页面，干扰快捷键平移。
      event.preventDefault();
      this.#spacePressed = true;
      this.render();
      return true;
    }
    return false;
  }

  onKeyUp(event: KeyboardEvent): boolean {
    if (event.code !== 'Space') return false;
    this.releaseSpace();
    return true;
  }

  /**
   * window 级空格抓手（与键盘焦点解耦）：鼠标悬停在视窗内即可激活临时抓手，
   * 无需先点击聚焦视窗。由事件系统的 window capture 通道在"事件落点不在本设计器
   * shadow 内"时调用（焦点在 shadow 内时走既有 onKeyDown/onKeyUp 链路）。
   * 可编辑目标（输入框/内容可编辑）保留原生空格输入。
   */
  onWindowKeyDown(event: KeyboardEvent): boolean {
    if (event.code !== 'Space' || !this.#hovered || isEditable(event.target)) return false;
    event.preventDefault();
    this.#spacePressed = true;
    this.render();
    return true;
  }

  onWindowKeyUp(event: KeyboardEvent): boolean {
    if (event.code !== 'Space') return false;
    this.releaseSpace();
    return true;
  }

  private releaseSpace(): void {
    if (!this.#spacePressed) return;
    this.#spacePressed = false;
    this.render();
  }

  setActiveTool(tool: DesignerToolId): void {
    // 选择主工具时清空临时空格抓手（对标 Nebula 的 setTool 会清空临时工具栈），
    // 避免前一次按住空格的状态残留到新选中的工具上（例如按住空格后点选矩形，仍被当作抓手）。
    this.#spacePressed = false;
    this.#activeTool = tool;
    this.render();
    this.callbacks.onToolChange(tool);
  }
}

function getParentNode(element: Element | undefined): ParentNode | null {
  const root = element?.getRootNode();
  return root instanceof Document || root instanceof DocumentFragment ? root : null;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
