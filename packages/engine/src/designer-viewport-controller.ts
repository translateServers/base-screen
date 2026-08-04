import type { ScreenDocument } from '@base-screen/contracts';
import { reduceScreenViewport, type ScreenViewportState } from '@base-screen/core';
import type { DesignerToolId } from './designer-tools.js';
import {
  clampDesignerZoom,
  getFitDesignerZoom,
  getViewportAnchor,
  viewportTransform,
} from './designer-viewport.js';

export interface DesignerViewportControllerCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
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
    viewport.addEventListener('keydown', (event) => this.onKeyDown(event));
    viewport.addEventListener('keyup', (event) => this.onKeyUp(event));
    viewport.addEventListener('blur', () => this.releaseSpace());
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

  onClick(target: HTMLElement): boolean {
    const tool = target.closest<HTMLButtonElement>('[data-tool]')?.dataset.tool as
      | DesignerToolId
      | undefined;
    if (tool !== undefined) {
      this.#activeTool = tool;
      this.callbacks.onToolChange(tool);
      return true;
    }
    switch (target.dataset.action) {
      case 'zoom-reset':
        this.reset();
        return true;
      case 'zoom-fit':
        this.fit();
        return true;
      default:
        return false;
    }
  }

  render(root: ParentNode | null = getParentNode(this.#canvas)): void {
    if (this.#canvas !== undefined) this.#canvas.style.transform = viewportTransform(this.#state);
    for (const output of root?.querySelectorAll<HTMLOutputElement>(
      '[data-zoom], [data-status-zoom]',
    ) ?? []) {
      output.value = `${Math.round(this.#state.zoom * 100)}%`;
    }
    root?.querySelector<HTMLElement>('[data-status-tool]')?.replaceChildren(this.activeTool);
  }

  private onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.setZoom(
      this.#state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
      getViewportAnchor(event, this.#viewport!),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'Space' || event.repeat || isEditable(event.target)) return;
    event.preventDefault();
    this.#spacePressed = true;
    this.render();
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code !== 'Space') return;
    this.releaseSpace();
  }

  private releaseSpace(): void {
    if (!this.#spacePressed) return;
    this.#spacePressed = false;
    this.render();
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
