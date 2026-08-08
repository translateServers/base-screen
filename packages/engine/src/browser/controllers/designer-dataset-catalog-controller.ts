import {
  parseScreenDatasetDescriptor,
  parseScreenDatasetPage,
  type ScreenDatasetDescriptor,
  type ScreenDatasetPage,
  type ScreenDatasetSummary,
  type ScreenDiagnostic,
  type ScreenHostDatasetCatalogPort,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

interface DesignerDatasetCatalogControllerCallbacks {
  readonly getPort: () => ScreenHostDatasetCatalogPort | undefined;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly setFeedback: (message: string) => void;
  readonly render: () => void;
}

/** Keeps host catalog requests, cursors, and cancellation separate from authoring state. */
export class DesignerDatasetCatalogController {
  #listAbort: AbortController | undefined;
  #describeAbort: AbortController | undefined;
  #requestId = 0;
  #describeRequestId = 0;
  #query = '';
  #listedQuery: string | undefined;
  #cursor: string | undefined;
  #items: readonly ScreenDatasetSummary[] = [];

  constructor(private readonly callbacks: DesignerDatasetCatalogControllerCallbacks) {}

  get query(): string {
    return this.#query;
  }

  get cursor(): string | undefined {
    return this.#cursor;
  }

  get items(): readonly ScreenDatasetSummary[] {
    return this.#items;
  }

  ensureList(): void {
    if (this.#items.length === 0 || this.#listedQuery !== this.#query) {
      void this.list(undefined);
    }
  }

  updateQuery(query: string): void {
    if (query === this.#query) return;
    this.#query = query;
    this.#cursor = undefined;
    void this.list(undefined);
  }

  loadMore(): void {
    if (this.#cursor !== undefined) void this.list(this.#cursor);
  }

  async describe(
    resourceType: string,
    resourceId: string,
  ): Promise<ScreenDatasetDescriptor | undefined> {
    const port = this.callbacks.getPort();
    if (port === undefined) {
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.unavailable);
      return;
    }
    this.#describeAbort?.abort();
    const controller = new AbortController();
    this.#describeAbort = controller;
    const requestId = ++this.#describeRequestId;
    this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.describeLoading);
    let result: ScreenParseResult<ScreenDatasetDescriptor>;
    try {
      result = await port.describe({ resourceType, resourceId, signal: controller.signal });
    } catch {
      if (!controller.signal.aborted && requestId === this.#describeRequestId) {
        this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.describeFailed);
      }
      return;
    }
    if (controller.signal.aborted || requestId !== this.#describeRequestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.describeFailed);
      return;
    }
    const parsed = parseScreenDatasetDescriptor(result.value);
    if (!parsed.ok) {
      this.callbacks.report(parsed.diagnostics);
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.describeFailed);
      return;
    }
    return parsed.value;
  }

  clear(): void {
    this.#listAbort?.abort();
    this.#describeAbort?.abort();
    this.#query = '';
    this.#listedQuery = undefined;
    this.#cursor = undefined;
    this.#items = [];
    this.#requestId++;
    this.#describeRequestId++;
  }

  private async list(cursor: string | undefined): Promise<void> {
    const port = this.callbacks.getPort();
    if (port === undefined) {
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.unavailable);
      return;
    }
    this.#listAbort?.abort();
    const controller = new AbortController();
    this.#listAbort = controller;
    const requestId = ++this.#requestId;
    this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loading);
    let result: ScreenParseResult<ScreenDatasetPage>;
    try {
      result = await port.list({
        query: this.#query,
        ...(cursor === undefined ? {} : { cursor }),
        limit: 50,
        signal: controller.signal,
      });
    } catch {
      if (!controller.signal.aborted && requestId === this.#requestId) {
        this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
      }
      return;
    }
    if (controller.signal.aborted || requestId !== this.#requestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
      return;
    }
    const parsed = parseScreenDatasetPage(result.value);
    if (!parsed.ok) {
      this.callbacks.report(parsed.diagnostics);
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
      return;
    }
    this.#items =
      cursor === undefined ? parsed.value.items : [...this.#items, ...parsed.value.items];
    this.#cursor = parsed.value.nextCursor;
    this.#listedQuery = this.#query;
    this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.shown(this.#items.length));
    this.callbacks.render();
  }
}
