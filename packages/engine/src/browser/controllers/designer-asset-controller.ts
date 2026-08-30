import type {
  ScreenAssetCatalogPort,
  ScreenAssetSummary,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { createPropertyTransaction } from '../dom/panel/designer-panel-dom.js';

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
    heading.textContent = DESIGNER_UI_TEXT.asset.title;
    const search = panel.ownerDocument.createElement('input');
    search.className = 'designer-control designer-input';
    search.dataset.assetQuery = 'true';
    search.placeholder = DESIGNER_UI_TEXT.asset.search;
    search.value = this.#query;
    search.setAttribute('aria-label', DESIGNER_UI_TEXT.asset.search);
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
      this.setFeedback(DESIGNER_UI_TEXT.asset.selectedConfirm);
      this.renderResults();
      return true;
    }
    if (action === 'replace') {
      if (this.#selectedAssetId !== assetId) {
        this.setFeedback(DESIGNER_UI_TEXT.asset.selectFirst);
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
    this.setFeedback(DESIGNER_UI_TEXT.asset.loading);
    const result = await port.list({ query, signal: controller.signal });
    if (controller.signal.aborted || requestId !== this.#requestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.setFeedback(DESIGNER_UI_TEXT.asset.loadFailed);
      return;
    }
    this.#results = result.value;
    if (!this.#results.some((asset) => asset.assetId === this.#selectedAssetId)) {
      this.#selectedAssetId = undefined;
    }
    this.renderResults();
    this.setFeedback(DESIGNER_UI_TEXT.asset.shown(result.value.length));
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
      this.setFeedback(DESIGNER_UI_TEXT.asset.replaceUnavailable);
      return;
    }
    const result = this.callbacks.executeTransaction(transaction.value);
    if (result.ok) this.setFeedback(DESIGNER_UI_TEXT.asset.replaced);
    else {
      this.callbacks.report(result.diagnostics);
      this.setFeedback(DESIGNER_UI_TEXT.asset.replaceFailed);
    }
  }

  private async checkDelete(assetId: string): Promise<void> {
    const port = this.callbacks.getPort();
    if (port === undefined) return;
    this.#deleteAbort?.abort();
    const controller = new AbortController();
    this.#deleteAbort = controller;
    const requestId = ++this.#deleteRequestId;
    this.setFeedback(DESIGNER_UI_TEXT.asset.checkingDelete);
    const result = await port.canDelete(assetId, controller.signal);
    if (controller.signal.aborted || requestId !== this.#deleteRequestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.setFeedback(DESIGNER_UI_TEXT.asset.deleteCheckFailed);
      return;
    }
    this.setFeedback(
      result.value ? DESIGNER_UI_TEXT.asset.deletable : DESIGNER_UI_TEXT.asset.referenced,
    );
  }

  private renderResults(): void {
    const results = this.#resultsElement;
    if (results === undefined) return;
    results.replaceChildren();
    if (this.#results.length === 0) {
      const empty = results.ownerDocument.createElement('p');
      empty.className = 'designer-empty-state';
      empty.textContent = DESIGNER_UI_TEXT.asset.empty;
      results.appendChild(empty);
      return;
    }
    for (const asset of this.#results) {
      const item = results.ownerDocument.createElement('div');
      item.className = 'designer-asset-item';
      item.dataset.assetId = asset.assetId;
      const name = results.ownerDocument.createElement('span');
      name.textContent = DESIGNER_UI_TEXT.asset.nameWithType(asset.name, asset.mediaType);
      const select = this.button(results, DESIGNER_UI_TEXT.asset.select, 'select');
      const replace = this.button(results, DESIGNER_UI_TEXT.asset.replace, 'replace');
      replace.disabled = this.#selectedAssetId !== asset.assetId;
      item.append(
        name,
        select,
        replace,
        this.button(results, DESIGNER_UI_TEXT.asset.checkDelete, 'check-delete'),
      );
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
