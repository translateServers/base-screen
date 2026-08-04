import type { ScreenDocument, ScreenHostResourcePort } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export interface DesignerPreviewCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
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
    close.textContent = '关闭预览';
    header.appendChild(close);
    preview.append(header, shadow.ownerDocument.createElement('base-screen-viewer'));
    shadow.querySelector<HTMLElement>('.designer')?.appendChild(preview);
    this.#preview = preview;
    this.render();
  }

  toggle(): void {
    if (this.#preview === undefined) return;
    this.#open = !this.#open;
    this.render();
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
