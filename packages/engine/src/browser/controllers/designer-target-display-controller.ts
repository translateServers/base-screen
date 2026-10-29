import type { ScreenDocument, ScreenTargetDisplayProfile } from '@base-screen/contracts';
import {
  computeAngularSize,
  computeDisplayOverlay,
  computeMinimumLegibleFontPx,
  computePhysicalSize,
  type DesignerDisplayMetrics,
  type DesignerDisplayOverlayKind,
} from '../../common/operations/display/designer-target-display.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { renderDisplayPanel } from '../dom/display/designer-display-dom.js';

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
  #panel: HTMLElement | undefined;
  #toggle: HTMLElement | undefined;
  #open = false;

  connect(layer: HTMLElement): void {
    this.#layer = layer;
    this.render();
  }

  /** 顶栏入口与浮层：面板内容由参数与开关派生，不持有第二份状态。 */
  setPanel(panel: HTMLElement, toggle: HTMLElement): void {
    this.#panel = panel;
    this.#toggle = toggle;
    this.render();
  }

  get panelOpen(): boolean {
    return this.#open;
  }

  closePanel(): boolean {
    if (!this.#open) return false;
    this.#open = false;
    this.render();
    this.#toggle?.focus();
    return true;
  }

  onClick(target: Element): boolean {
    if (target.closest('[data-display-toggle]') !== null) {
      this.#open = !this.#open;
      this.render();
      if (this.#open) this.#panel?.querySelector<HTMLElement>('[data-display-close]')?.focus();
      return true;
    }
    if (target.closest('[data-display-close]') !== null) {
      return this.closePanel();
    }
    const toggle = target.closest<HTMLElement>('[data-display-overlay]');
    if (toggle !== null) {
      const kind = toggle.dataset.displayOverlay;
      if (kind === 'safe-area' || kind === 'seam' || kind === 'distance') {
        this.setOverlay(kind, !this.#toggles.has(kind));
      }
      return true;
    }
    return false;
  }

  release(): void {
    this.#panel = undefined;
    this.#toggle = undefined;
    this.#open = false;
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

  /**
   * 读数只依赖「参数 + 画布逻辑尺寸」，不读 DOM、不测量渲染结果；
   * 实际最小字号由调用方在渲染后测得并自行比对。
   */
  readMetrics(): DesignerDisplayMetrics | undefined {
    const profile = this.#profile;
    const document = this.#document;
    if (profile === undefined || document === undefined) return undefined;
    return {
      physical: computePhysicalSize(profile, document.canvas),
      angular: computeAngularSize(profile, document.canvas),
      minimumLegibleFontPx: computeMinimumLegibleFontPx(profile),
      brightnessCdM2: profile.brightnessCdM2,
      ambientLux: profile.ambientLux,
    };
  }

  private render(): void {
    const toggle = this.#toggle;
    if (toggle !== undefined) {
      toggle.setAttribute('aria-expanded', String(this.#open));
    }
    const panel = this.#panel;
    if (panel !== undefined) {
      panel.hidden = !this.#open;
      if (this.#open) {
        renderDisplayPanel(panel, this.#profile, this.readMetrics(), this.#toggles);
      }
    }
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
      const metrics = this.readMetrics();
      const size =
        metrics?.physical === null || metrics?.physical === undefined
          ? null
          : DESIGNER_UI_TEXT.targetDisplay.physicalSize(
              round(metrics.physical.widthMm / 1000),
              round(metrics.physical.heightMm / 1000),
            );
      label.textContent = DESIGNER_UI_TEXT.targetDisplay.readout(
        `${DESIGNER_UI_TEXT.targetDisplay.distance} ${overlay.distanceLabel}`,
        size,
        metrics?.minimumLegibleFontPx === null || metrics?.minimumLegibleFontPx === undefined
          ? null
          : Math.round(metrics.minimumLegibleFontPx),
      );
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
