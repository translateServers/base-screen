import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerDatasetControllerCallbacks } from './designer-dataset-controller-context.js';

/**
 * 数据面板的按需加载门面。
 *
 * 数据源面板（含静态数据、取值引用、宿主资源与物料读数据表单）只在编辑态使用，且默认
 * 不在首屏可见。它整块从首屏闭包里切出去，通过动态 import 在真正需要时加载：
 * - 宿主声明了 `datasetPort` 时，首帧落定后预热；
 * - 否则等用户切到右栏「数据源」页签再加载。
 *
 * 未加载期间面板位置由固定尺寸占位占据，加载完成后用最新面板引用重渲染一次。面板的
 * 真实内容始终从实时回调读取（文档、目录、选区），因此加载期间的宿主命令、`document`
 * 更新与 `refreshCatalog` 都不会丢。
 */
export interface DesignerDatasetPanelDelegate {
  render(panel: HTMLElement | undefined): void;
  clear(): void;
  getFocusedDatasetFields(): readonly { readonly id: string; readonly label: string }[];
  onInput(target: EventTarget | null): boolean;
  onClick(target: Element): boolean;
  onChange(target: EventTarget | null): boolean;
  onKeyDown(event: KeyboardEvent): boolean;
}

interface DesignerDatasetPanelDelegateModule {
  readonly DesignerDatasetController: new (
    callbacks: DesignerDatasetControllerCallbacks,
  ) => DesignerDatasetPanelDelegate;
}

export interface DesignerDatasetPanelControllerOptions {
  /** 加载器接缝：默认动态 import 面板实现；测试可注入同步或失败实现。 */
  readonly load?: () => Promise<DesignerDatasetPanelDelegateModule>;
}

const PLACEHOLDER_CLASS = 'designer-dataset-panel-placeholder';
const PLACEHOLDER_ROW_CLASS = 'designer-dataset-panel-placeholder-row';
const PLACEHOLDER_ROWS = 4;
const FAILURE_CLASS = 'designer-dataset-panel-failure';

export class DesignerDatasetPanelController {
  readonly #callbacks: DesignerDatasetControllerCallbacks;
  readonly #load: () => Promise<DesignerDatasetPanelDelegateModule>;
  #delegate: DesignerDatasetPanelDelegate | undefined;
  #loading: Promise<void> | undefined;
  #failed = false;
  #panel: HTMLElement | undefined;
  #placeholder: HTMLElement | undefined;
  #failure: HTMLElement | undefined;
  #pendingRender = false;
  #warmupFrame: number | undefined;

  constructor(
    callbacks: DesignerDatasetControllerCallbacks,
    options: DesignerDatasetPanelControllerOptions = {},
  ) {
    this.#callbacks = callbacks;
    this.#load = options.load ?? (() => import('./designer-dataset-controller.js'));
  }

  /** 面板渲染入口：未加载时只画占位，不触发加载（加载由显式需求驱动）。 */
  render(panel: HTMLElement | undefined): void {
    this.#panel = panel;
    this.#pendingRender = true;
    if (this.#delegate !== undefined) {
      this.#delegate.render(panel);
      return;
    }
    if (this.#failed) {
      this.renderFailure();
      return;
    }
    this.renderPlaceholder();
  }

  /** 显式需求（页签激活 / 宿主预热）：单飞加载，成功后用最新面板重渲染。 */
  ensureLoaded(): void {
    if (this.#delegate !== undefined || this.#loading !== undefined || this.#failed) return;
    this.#loading = this.load().finally(() => {
      this.#loading = undefined;
    });
  }

  /**
   * 首帧后再预热，避免数据面板的解析与首次渲染挤进首屏关键路径。
   * 重复调用安全；断连时由 `clear()` 取消尚未执行的帧。
   */
  warmUpAfterFirstFrame(): void {
    if (this.#delegate !== undefined || this.#loading !== undefined || this.#failed) return;
    if (this.#warmupFrame !== undefined) return;
    this.#warmupFrame = requestFrame(() => {
      this.#warmupFrame = undefined;
      this.ensureLoaded();
    });
  }

  getFocusedDatasetFields(): readonly { readonly id: string; readonly label: string }[] {
    return this.#delegate?.getFocusedDatasetFields() ?? [];
  }

  clear(): void {
    this.#delegate?.clear();
    this.#pendingRender = false;
    this.#panel = undefined;
    this.removePlaceholder();
    this.removeFailure();
    if (this.#warmupFrame !== undefined) {
      cancelFrame(this.#warmupFrame);
      this.#warmupFrame = undefined;
    }
  }

  onInput(target: EventTarget | null): boolean {
    return this.#delegate?.onInput(target) ?? false;
  }

  onClick(target: Element): boolean {
    return this.#delegate?.onClick(target) ?? false;
  }

  onChange(target: EventTarget | null): boolean {
    return this.#delegate?.onChange(target) ?? false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    return this.#delegate?.onKeyDown(event) ?? false;
  }

  private async load(): Promise<void> {
    let module: DesignerDatasetPanelDelegateModule;
    try {
      module = await this.#load();
    } catch {
      this.markFailed();
      return;
    }
    try {
      this.#delegate = new module.DesignerDatasetController(this.#callbacks);
      this.removePlaceholder();
      this.removeFailure();
      if (this.#pendingRender) this.#delegate.render(this.#panel);
    } catch {
      this.#delegate = undefined;
      this.markFailed();
    }
  }

  private markFailed(): void {
    this.#failed = true;
    this.renderFailure();
  }

  private renderPlaceholder(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    if (this.#placeholder !== undefined && this.#placeholder.parentElement === panel) return;
    this.removePlaceholder();
    this.removeFailure();
    const document = panel.ownerDocument;
    const placeholder = document.createElement('div');
    placeholder.className = PLACEHOLDER_CLASS;
    placeholder.setAttribute('data-dataset-panel-placeholder', '');
    placeholder.setAttribute('aria-busy', 'true');
    for (let index = 0; index < PLACEHOLDER_ROWS; index++) {
      const row = document.createElement('span');
      row.className = PLACEHOLDER_ROW_CLASS;
      placeholder.appendChild(row);
    }
    panel.replaceChildren(placeholder);
    this.#placeholder = placeholder;
  }

  private renderFailure(): void {
    const panel = this.#panel;
    if (panel === undefined) return;
    if (this.#failure !== undefined && this.#failure.parentElement === panel) return;
    this.removePlaceholder();
    this.removeFailure();
    const failure = panel.ownerDocument.createElement('div');
    failure.className = FAILURE_CLASS;
    failure.setAttribute('data-dataset-panel-failure', '');
    failure.setAttribute('role', 'status');
    failure.textContent = DESIGNER_UI_TEXT.dataPanelLoadFailed;
    panel.replaceChildren(failure);
    this.#failure = failure;
  }

  private removePlaceholder(): void {
    if (this.#placeholder === undefined) return;
    this.#placeholder.remove();
    this.#placeholder = undefined;
  }

  private removeFailure(): void {
    if (this.#failure === undefined) return;
    this.#failure.remove();
    this.#failure = undefined;
  }
}

function requestFrame(callback: () => void): number {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 0) as unknown as number;
}

function cancelFrame(frame: number): void {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(frame);
    return;
  }
  globalThis.clearTimeout(frame);
}
