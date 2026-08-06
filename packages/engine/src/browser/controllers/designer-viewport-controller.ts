import type { ScreenDocument } from '@base-screen/contracts';
import { reduceScreenViewport, type ScreenViewportState } from '@base-screen/core';
import { DESIGNER_TOOLS, type DesignerToolId } from '../../common/tools/designer-tools.js';
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
  #spacePressed = false;
  #activeTool: DesignerToolId = 'select';

  constructor(private readonly callbacks: DesignerViewportControllerCallbacks) {}

  get state(): ScreenViewportState {
    return this.#state;
  }
  get activeTool(): DesignerToolId {
    return this.#spacePressed ? 'hand' : this.#activeTool;
  }

  connect(viewport: HTMLDivElement, canvas: HTMLDivElement): void {
    this.#viewport = viewport;
    this.#canvas = canvas;
    viewport.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    viewport.addEventListener('blur', () => {
      this.releaseSpace();
      this.callbacks.onBlur();
    });
    viewport.tabIndex = 0;
    this.render();
  }

  /** 把键盘焦点收敛到 viewport 焦点容器，作为画布交互的统一快捷键命中目标。 */
  focus(preventScroll = true): void {
    this.#viewport?.focus({ preventScroll });
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
    if (dataset !== undefined) dataset.tool = this.activeTool;
    for (const output of root?.querySelectorAll<HTMLOutputElement>(
      '[data-zoom], [data-status-zoom]',
    ) ?? []) {
      output.value = `${Math.round(this.#state.zoom * 100)}%`;
    }
    root
      ?.querySelector<HTMLElement>('[data-status-tool]')
      ?.replaceChildren(DESIGNER_TOOLS.find((tool) => tool.id === this.activeTool)?.label ?? '');
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
