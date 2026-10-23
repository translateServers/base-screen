import type {
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostResourcePort,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import type { BaseScreenViewerConfiguration } from '@base-screen/renderer';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerPreviewCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getResourcePort: () => ScreenHostResourcePort | undefined;
  readonly getHostCatalogPort: () => ScreenHostCatalogPort | undefined;
  readonly getConditionalStylePort: () => BaseScreenConditionalStylePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly isViewerRegistered: () => boolean;
}

type PreviewViewer = HTMLElement & {
  configure?: (configuration: BaseScreenViewerConfiguration) => {
    ok: boolean;
    diagnostics?: readonly { code: string }[];
  };
  unload?: () => void;
  refreshData?: (componentId?: string) => void;
  refreshVariables?: (options?: ScreenVariableRefreshOptions) => void;
  refreshConditionalStyles?: (componentIds?: readonly string[]) => void;
  document?: ScreenDocument;
};

export class DesignerPreviewController {
  #preview: HTMLElement | undefined;
  #open = false;
  #lastConfiguration: BaseScreenViewerConfiguration | undefined;
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

  refreshVariables(options?: ScreenVariableRefreshOptions): void {
    this.viewer()?.refreshVariables?.(options);
  }

  refreshConditionalStyles(componentIds?: readonly string[]): void {
    this.viewer()?.refreshConditionalStyles?.(componentIds);
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
    const document = documentOverride ?? this.callbacks.getDocument();
    if (!this.#open || document === undefined) return;
    const viewer = this.viewer();
    if (viewer === null || viewer === undefined) return;
    // BaseScreenViewerConfiguration 只要求 catalog：resource/来源目录端口是可选
    // 运行时依赖。静态预览（无宿主资源/来源目录端口）也必须能 configure 并渲染，
    // 不能因为迁移到 configure() 而把可选端口变成必填。
    const catalog = this.callbacks.getCatalog();
    if (catalog === undefined) return;
    const resourcePort = this.callbacks.getResourcePort();
    const hostCatalogPort = this.callbacks.getHostCatalogPort();
    const conditionalStylePort = this.callbacks.getConditionalStylePort();
    const runtimeContributions = this.callbacks.getRuntimeContributions();
    const configuration: BaseScreenViewerConfiguration = {
      catalog,
      ...(resourcePort === undefined ? {} : { resourcePort }),
      ...(hostCatalogPort === undefined ? {} : { hostCatalogPort }),
      ...(conditionalStylePort === undefined ? {} : { conditionalStylePort }),
      ...(runtimeContributions === undefined ? {} : { runtimeContributions }),
    };
    const configChanged =
      this.#lastConfiguration === undefined ||
      this.#lastConfiguration.catalog !== configuration.catalog ||
      this.#lastConfiguration.resourcePort !== configuration.resourcePort ||
      this.#lastConfiguration.hostCatalogPort !== configuration.hostCatalogPort ||
      this.#lastConfiguration.conditionalStylePort !== configuration.conditionalStylePort ||
      this.#lastConfiguration.runtimeContributions !== configuration.runtimeContributions;
    if (configChanged) {
      // 重新配置前先 unload（configure 拒绝在已初始化实例上二次调用），
      // 避免重复 configure 或残留陈旧渲染器；首次配置无需 unload。
      if (this.#lastConfiguration !== undefined) {
        viewer.unload?.();
      }
      const configured = viewer.configure?.(configuration);
      if (configured === undefined || !configured.ok) {
        this.#lastConfiguration = undefined;
        return;
      }
      this.#lastConfiguration = configuration;
    }
    // 配置未变化时（普通同步）只更新文档，由 document 赋值驱动渲染。
    viewer.document = document;
  }

  private viewer(): PreviewViewer | null {
    return this.#preview?.querySelector<HTMLElement>('base-screen-viewer') ?? null;
  }
}
