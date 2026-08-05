import type {
  ScreenAssetCatalogPort,
  ScreenAssetSummary,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createPropertyTransaction } from '../dom/designer-panel-dom.js';

export interface DesignerAssetControllerCallbacks {
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getPort: () => ScreenAssetCatalogPort | undefined;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerAssetController {
  #listAbort: AbortController | undefined;
  #deleteAbort: AbortController | undefined;
  #query = '';
  #deleteRequestId = 0;
  #requestId = 0;
  #results: readonly ScreenAssetSummary[] = [];
  #selectedAssetId: string | undefined;
  #feedback: HTMLElement | undefined;
  #resultsElement: HTMLElement | undefined;

  constructor(private readonly callbacks: DesignerAssetControllerCallbacks) {}

  render(panel: HTMLElement | undefined): void {
    if (panel === undefined || !this.canReplaceAsset()) return;
    const section = panel.ownerDocument.createElement('section');
    section.className = 'designer-asset-section';
    section.dataset.assetSection = 'true';
    const heading = panel.ownerDocument.createElement('h3');
    heading.textContent = '资产';
    const search = panel.ownerDocument.createElement('input');
    search.className = 'designer-control designer-input';
    search.dataset.assetQuery = 'true';
    search.placeholder = '搜索资产';
    search.value = this.#query;
    search.setAttribute('aria-label', '搜索资产');
    const results = panel.ownerDocument.createElement('div');
    results.dataset.assetResults = 'true';
    const feedback = panel.ownerDocument.createElement('p');
    feedback.className = 'designer-empty-state';
    feedback.dataset.assetFeedback = 'true';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    section.append(heading, search, results, feedback);
    panel.appendChild(section);
    this.#resultsElement = results;
    this.#feedback = feedback;
    this.renderResults();
    void this.list(this.#query);
  }

  clear(): void {
    this.#listAbort?.abort();
    this.#deleteAbort?.abort();
    this.#listAbort = undefined;
    this.#deleteAbort = undefined;
    this.#deleteRequestId++;
    this.#resultsElement = undefined;
    this.#feedback = undefined;
  }

  onClick(target: Element): boolean {
    const button = target.closest<HTMLButtonElement>('[data-asset-action]');
    const action = button?.dataset.assetAction;
    if (action === undefined) return false;
    const assetId = button?.closest<HTMLElement>('[data-asset-id]')?.dataset.assetId;
    if (assetId === undefined) return true;
    if (action === 'select') {
      this.#selectedAssetId = assetId;
      this.setFeedback('已选择资产，请确认替换。');
      this.renderResults();
      return true;
    }
    if (action === 'replace') {
      if (this.#selectedAssetId !== assetId) {
        this.setFeedback('请先选择要替换的资产。');
        return true;
      }
      this.replace(assetId);
      return true;
    }
    if (action === 'check-delete') {
      void this.checkDelete(assetId);
      return true;
    }
    return true;
  }

  onInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) || target.dataset.assetQuery === undefined)
      return false;
    const query = target.value;
    if (query === this.#query) return true;
    this.#query = query;
    void this.list(query);
    return true;
  }

  private canReplaceAsset(): boolean {
    const component = this.callbacks
      .getDocument()
      ?.components.find((item) => item.id === this.callbacks.getInteraction().focusedComponentId);
    const manifest = component && this.callbacks.getCatalog()?.get(component.type)?.manifest;
    return (
      this.callbacks.getPort() !== undefined &&
      manifest?.propertyPanel.some((field) => field.prop === 'source') === true &&
      manifest.propsSchema.properties.source?.kind === 'string'
    );
  }

  private async list(query: string): Promise<void> {
    const port = this.callbacks.getPort();
    if (port === undefined) return;
    this.#listAbort?.abort();
    const controller = new AbortController();
    this.#listAbort = controller;
    const requestId = ++this.#requestId;
    this.setFeedback('正在加载资产。');
    const result = await port.list({ query, signal: controller.signal });
    if (controller.signal.aborted || requestId !== this.#requestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.setFeedback('资产加载失败，请重试。');
      return;
    }
    this.#results = result.value;
    if (!this.#results.some((asset) => asset.assetId === this.#selectedAssetId)) {
      this.#selectedAssetId = undefined;
    }
    this.renderResults();
    this.setFeedback(`已显示 ${result.value.length} 个资产。`);
  }

  private replace(assetId: string): void {
    const transaction = createPropertyTransaction(
      { dataset: { prop: 'source' }, value: assetId } as unknown as HTMLInputElement,
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (transaction === undefined || !transaction.ok) {
      if (transaction !== undefined) this.callbacks.report(transaction.diagnostics);
      this.setFeedback('资产替换不可用，未保存修改。');
      return;
    }
    const result = this.callbacks.executeTransaction(transaction.value);
    if (result.ok) this.setFeedback('资产已替换。');
    else {
      this.callbacks.report(result.diagnostics);
      this.setFeedback('资产替换失败，未保存修改。');
    }
  }

  private async checkDelete(assetId: string): Promise<void> {
    const port = this.callbacks.getPort();
    if (port === undefined) return;
    this.#deleteAbort?.abort();
    const controller = new AbortController();
    this.#deleteAbort = controller;
    const requestId = ++this.#deleteRequestId;
    this.setFeedback('正在检查删除保护。');
    const result = await port.canDelete(assetId, controller.signal);
    if (controller.signal.aborted || requestId !== this.#deleteRequestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.setFeedback('无法确认删除保护，请重试。');
      return;
    }
    this.setFeedback(
      result.value ? '该资产当前可由宿主删除。' : '该资产仍被引用，宿主将阻止删除。',
    );
  }

  private renderResults(): void {
    const results = this.#resultsElement;
    if (results === undefined) return;
    results.replaceChildren();
    if (this.#results.length === 0) {
      const empty = results.ownerDocument.createElement('p');
      empty.className = 'designer-empty-state';
      empty.textContent = '没有可用资产。';
      results.appendChild(empty);
      return;
    }
    for (const asset of this.#results) {
      const item = results.ownerDocument.createElement('div');
      item.className = 'designer-asset-item';
      item.dataset.assetId = asset.assetId;
      const name = results.ownerDocument.createElement('span');
      name.textContent = `${asset.name}（${asset.mediaType}）`;
      const select = this.button(results, '选择', 'select');
      const replace = this.button(results, '替换', 'replace');
      replace.disabled = this.#selectedAssetId !== asset.assetId;
      item.append(name, select, replace, this.button(results, '检查删除保护', 'check-delete'));
      results.appendChild(item);
    }
  }

  private button(container: HTMLElement, label: string, action: string): HTMLButtonElement {
    const button = container.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button';
    button.dataset.assetAction = action;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  private setFeedback(message: string): void {
    if (this.#feedback !== undefined) this.#feedback.textContent = message;
  }
}
