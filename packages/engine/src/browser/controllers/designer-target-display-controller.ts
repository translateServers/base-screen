import type { ScreenDocument, ScreenTargetDisplayProfile } from '@base-screen/contracts';
import {
  computeDisplayOverlay,
  type DesignerDisplayOverlayKind,
} from '../../common/operations/display/designer-target-display.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

/**
 * 目标屏叠加：安全区、拼接缝、3m 视角。
 *
 * 参数由宿主提供，叠加层只画在画布之上，不写入 Screen Document；三个开关互相独立，
 * 关掉即移除对应元素，不重建渲染器。
 */
export class DesignerTargetDisplayController {
  #layer: HTMLElement | undefined;
  #document: ScreenDocument | undefined;
  #profile: ScreenTargetDisplayProfile | undefined;
  #toggles = new Set<DesignerDisplayOverlayKind>();

  connect(layer: HTMLElement): void {
    this.#layer = layer;
    this.render();
  }

  release(): void {
    this.#layer = undefined;
    this.#document = undefined;
    this.#profile = undefined;
    this.#toggles.clear();
  }

  setDocument(document: ScreenDocument): void {
    this.#document = document;
    this.render();
  }

  setProfile(profile: ScreenTargetDisplayProfile | undefined): void {
    this.#profile = profile;
    this.render();
  }

  get profile(): ScreenTargetDisplayProfile | undefined {
    return this.#profile;
  }

  setOverlay(kind: DesignerDisplayOverlayKind, enabled: boolean): void {
    if (enabled) this.#toggles.add(kind);
    else this.#toggles.delete(kind);
    this.render();
  }

  isOverlayEnabled(kind: DesignerDisplayOverlayKind): boolean {
    return this.#toggles.has(kind);
  }

  private render(): void {
    const layer = this.#layer;
    if (layer === undefined) return;
    const document = this.#document;
    const profile = this.#profile;
    if (document === undefined || profile === undefined || this.#toggles.size === 0) {
      layer.replaceChildren();
      layer.hidden = true;
      return;
    }
    const overlay = computeDisplayOverlay(profile, document.canvas, this.#toggles);
    const nodes: Element[] = [];
    const owner = layer.ownerDocument;
    if (overlay.safeArea !== null) {
      const rect = owner.createElement('div');
      rect.className = 'display-safe-area';
      rect.dataset.displayOverlay = 'safe-area';
      place(rect, overlay.safeArea);
      nodes.push(rect);
    }
    for (const seam of overlay.seams) {
      const band = owner.createElement('div');
      band.className = 'display-seam';
      band.dataset.displayOverlay = 'seam';
      if (seam.axis === 'x') {
        place(band, {
          x: seam.at - seam.size / 2,
          y: 0,
          width: seam.size,
          height: document.canvas.height,
        });
      } else {
        place(band, {
          x: 0,
          y: seam.at - seam.size / 2,
          width: document.canvas.width,
          height: seam.size,
        });
      }
      nodes.push(band);
    }
    if (overlay.distanceLabel !== null) {
      const label = owner.createElement('div');
      label.className = 'display-distance';
      label.dataset.displayOverlay = 'distance';
      label.textContent = `${DESIGNER_UI_TEXT.targetDisplay.distance} ${overlay.distanceLabel}`;
      nodes.push(label);
    }
    layer.replaceChildren(...nodes);
    layer.hidden = false;
  }
}

function place(
  element: HTMLElement,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): void {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
}
