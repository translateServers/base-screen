import type {
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerPreviewCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly getVariablePort: () => ScreenHostVariablePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
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

  refreshData(componentId?: string): void {
    const viewer = this.viewer();
    viewer?.refreshData?.(componentId);
  }

  sync(document?: ScreenDocument): void {
    this.render(document);
  }

  clear(): void {
    this.#open = false;
    this.render();
  }

  private render(documentOverride?: ScreenDocument): void {
    if (this.#preview !== undefined) this.#preview.hidden = !this.#open;
    const viewer = this.viewer() as {
      catalog: BaseScreenMaterialCatalog | undefined;
      resourcePort: ScreenHostResourcePort | undefined;
      variablePort: ScreenHostVariablePort | undefined;
      runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
      document: ScreenDocument | undefined;
    } | null;
    const document = documentOverride ?? this.callbacks.getDocument();
    if (!this.#open || viewer === null || viewer === undefined || document === undefined) return;
    viewer.resourcePort = this.callbacks.getResourcePort();
    viewer.variablePort = this.callbacks.getVariablePort();
    viewer.runtimeContributions = this.callbacks.getRuntimeContributions();
    viewer.catalog = this.callbacks.getCatalog();
    viewer.document = document;
  }

  private viewer(): (HTMLElement & { refreshData?: (componentId?: string) => void }) | null {
    return this.#preview?.querySelector<HTMLElement>('base-screen-viewer') ?? null;
  }
}
