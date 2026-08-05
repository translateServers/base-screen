import type { ScreenDocument } from '@base-screen/contracts';
import { reduceScreenViewport, type ScreenViewportState } from '@base-screen/core';
import { DESIGNER_TOOLS, type DesignerToolId } from '../tools/designer-tools.js';
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
  }

  setZoom(zoom: number, anchor = { x: 0, y: 0 }): void {
    this.#state = reduceScreenViewport(this.#state, {
      type: 'set-zoom',
      zoom: clampDesignerZoom(zoom),
      anchor,
    });
    this.render();
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

  render(root: ParentNode | null = getParentNode(this.#canvas)): void {
    if (this.#canvas !== undefined) this.#canvas.style.transform = viewportTransform(this.#state);
    for (const output of root?.querySelectorAll<HTMLOutputElement>(
      '[data-zoom], [data-status-zoom]',
    ) ?? []) {
      output.value = `${Math.round(this.#state.zoom * 100)}%`;
    }
    root
      ?.querySelector<HTMLElement>('[data-status-tool]')
      ?.replaceChildren(DESIGNER_TOOLS.find((tool) => tool.id === this.activeTool)?.label ?? '');
  }

  private onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.setZoom(
      this.#state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
      getViewportAnchor(event, this.#viewport!),
    );
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (event.repeat || isEditable(event.target)) return false;
    if (event.code === 'Space') {
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
