import {
  parseScreenDatasetDefinition,
  parseScreenDatasetEntries,
  parseScreenDatasetGroups,
  type ScreenDatasetDefinition,
  type ScreenDatasetEntries,
  type ScreenDatasetEntry,
  type ScreenDatasetGroup,
  type ScreenDiagnostic,
  type ScreenHostDatasetPort,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

interface DesignerDatasetCatalogControllerCallbacks {
  readonly getPort: () => ScreenHostDatasetPort | undefined;
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
  #items: readonly ScreenDatasetEntry[] = [];
  #groups: readonly ScreenDatasetGroup[] = [];
  #groupId: string | undefined;
  #groupsAbort: AbortController | undefined;
  #groupsLoaded = false;

  constructor(private readonly callbacks: DesignerDatasetCatalogControllerCallbacks) {}

  get query(): string {
    return this.#query;
  }

  get groups(): readonly ScreenDatasetGroup[] {
    return this.#groups;
  }
  get groupId(): string | undefined {
    return this.#groupId;
  }

  updateGroup(groupId: string | undefined): void {
    if (
      groupId === this.#groupId ||
      (groupId !== undefined && !this.#groups.some((group) => group.id === groupId))
    )
      return;
    this.#groupId = groupId;
    this.#items = [];
    this.#cursor = undefined;
    this.#listedQuery = undefined;
    void this.list(undefined);
  }

  get cursor(): string | undefined {
    return this.#cursor;
  }

  get items(): readonly ScreenDatasetEntry[] {
    return this.#items;
  }

  ensureList(): void {
    if (!this.#groupsLoaded && this.#groupsAbort === undefined) void this.loadGroups();
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

  async describe(datasetId: string): Promise<ScreenDatasetDefinition | undefined> {
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
    let result: ScreenParseResult<ScreenDatasetDefinition>;
    try {
      result = await port.describe({ datasetId, signal: controller.signal });
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
    const parsed = parseScreenDatasetDefinition(result.value);
    if (!parsed.ok) {
      this.callbacks.report(parsed.diagnostics);
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.describeFailed);
      return;
    }
    if (parsed.value.datasetId !== datasetId) {
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.describeFailed);
      return;
    }
    return parsed.value;
  }

  clear(): void {
    this.#groupsAbort?.abort();
    this.#groupsAbort = undefined;
    this.#groups = [];
    this.#groupId = undefined;
    this.#groupsLoaded = false;
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
    let result: ScreenParseResult<ScreenDatasetEntries>;
    try {
      result = await port.list({
        query: this.#query,
        ...(this.#groupId === undefined ? {} : { groupId: this.#groupId }),
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
    const parsed = parseScreenDatasetEntries(result.value);
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

  private async loadGroups(): Promise<void> {
    const port = this.callbacks.getPort();
    if (port?.groups === undefined) {
      this.#groupsLoaded = true;
      return;
    }
    const controller = new AbortController();
    this.#groupsAbort = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await port.groups({ signal: controller.signal });
      if (controller.signal.aborted || this.#groupsAbort !== controller) return;
      if (!response.ok) {
        this.callbacks.report(response.diagnostics);
        return;
      }
      const parsed = parseScreenDatasetGroups(response.value);
      if (!parsed.ok) {
        this.callbacks.report(parsed.diagnostics);
        return;
      }
      this.#groups = parsed.value;
      this.#groupsLoaded = true;
      this.callbacks.render();
    } catch {
      if (!controller.signal.aborted)
        this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
    } finally {
      clearTimeout(timer);
      if (this.#groupsAbort === controller) this.#groupsAbort = undefined;
    }
  }
}
