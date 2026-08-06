import type { ScreenDocument, ScreenHostResourcePort } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerPreviewCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly isViewerRegistered: () => boolean;
}

export class DesignerPreviewController {
  #preview: HTMLElement | undefined;
  #open = false;

  constructor(private readonly callbacks: DesignerPreviewCallbacks) {}

  connect(shadow: ShadowRoot): void {
    const preview = shadow.ownerDocument.createElement('section');
    preview.className = 'direct-preview';
    preview.hidden = true;
    const header = shadow.ownerDocument.createElement('header');
    const close = shadow.ownerDocument.createElement('button');
    close.type = 'button';
    close.className = 'designer-control designer-button';
    close.dataset.action = 'preview';
    close.textContent = DESIGNER_UI_TEXT.closePreview;
    header.appendChild(close);
    preview.append(header, shadow.ownerDocument.createElement('base-screen-viewer'));
    shadow.querySelector<HTMLElement>('.designer')?.appendChild(preview);
    this.#preview = preview;
    this.render();
  }

  toggle(): boolean {
    if (this.#preview === undefined || (!this.#open && !this.callbacks.isViewerRegistered())) {
      return false;
    }
    this.#open = !this.#open;
    this.render();
    return true;
  }

  clear(): void {
    this.#open = false;
    this.render();
  }

  private render(): void {
    if (this.#preview !== undefined) this.#preview.hidden = !this.#open;
    const viewer = this.#preview?.querySelector<HTMLElement>('base-screen-viewer') as {
      catalog: BaseScreenMaterialCatalog | undefined;
      resourcePort: ScreenHostResourcePort | undefined;
      document: ScreenDocument | undefined;
    } | null;
    const document = this.callbacks.getDocument();
    if (!this.#open || viewer === null || viewer === undefined || document === undefined) return;
    viewer.catalog = this.callbacks.getCatalog();
    viewer.resourcePort = this.callbacks.getResourcePort();
    viewer.document = document;
  }
}
