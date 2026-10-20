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
import type { DesignerHostLinkStatus } from '../../dom/dataset/designer-dataset-types.js';

/**
 * 搜索去抖：真实宿主的一次 list 可能打到数据库或远程接口，
 * 逐键请求既打爆宿主也会让结果乱序回包，输入期间只保留最后一次。
 */
export const DATASET_SEARCH_DEBOUNCE_MS = 180;

interface DesignerDatasetCatalogControllerCallbacks {
  readonly getPort: () => ScreenHostDatasetPort | undefined;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly setFeedback: (message: string) => void;
  /** 结构性重渲染（目录开关、分组、模式变化）。 */
  readonly render: () => void;
  /** 只换目录结果区；缺省时退化为结构性重渲染。 */
  readonly renderResults?: () => void;
}

/** Keeps host catalog requests, cursors, and cancellation separate from authoring state. */
export class DesignerDatasetCatalogController {
  #listAbort: AbortController | undefined;
  #describeAbort: AbortController | undefined;
  #queryTimer: ReturnType<typeof setTimeout> | undefined;
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
  #status: DesignerHostLinkStatus | undefined;
  #error: string | undefined;

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

  /** 目录通道的接洽状态：面板上的状态灯直接读它，不再靠「端口存在就给绿灯」。 */
  get status(): DesignerHostLinkStatus {
    // 还没发过请求时只报「端口在不在」，不要假装已经连上或已经失败。
    return this.#status ?? (this.callbacks.getPort() === undefined ? 'unavailable' : 'ready');
  }

  /** 失败时的诊断码（宿主返回的诊断或本地兜底文案），用于告诉作者到底哪一步没通。 */
  get error(): string | undefined {
    return this.#error;
  }

  /** 失败后重试：清掉错误标记，按当前查询重新取一页。 */
  retry(): void {
    this.#error = undefined;
    this.#status = this.callbacks.getPort() === undefined ? 'unavailable' : 'loading';
    void this.list(undefined);
  }

  ensureList(): void {
    // 结构化重渲染比待触发的搜索更权威：先取消防抖，按当前查询立即取一次。
    this.#cancelPendingQuery();
    if (!this.#groupsLoaded && this.#groupsAbort === undefined) void this.loadGroups();
    if (this.#items.length === 0 || this.#listedQuery !== this.#query) {
      void this.list(undefined);
    }
  }

  updateQuery(query: string): void {
    if (query === this.#query) return;
    this.#query = query;
    this.#cursor = undefined;
    this.#cancelPendingQuery();
    this.#queryTimer = setTimeout(() => {
      this.#queryTimer = undefined;
      void this.list(undefined);
    }, DATASET_SEARCH_DEBOUNCE_MS);
  }

  loadMore(): void {
    // 待触发的搜索会重置游标，此时追加下一页会和新查询的窗口错位。
    if (this.#queryTimer !== undefined) return;
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
    this.#cancelPendingQuery();
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
    this.#error = undefined;
    this.#status = undefined;
  }

  private async list(cursor: string | undefined): Promise<void> {
    const port = this.callbacks.getPort();
    if (port === undefined) {
      this.#setLinkState('unavailable', undefined);
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.unavailable);
      return;
    }
    this.#listAbort?.abort();
    const controller = new AbortController();
    this.#listAbort = controller;
    const requestId = ++this.#requestId;
    this.#setLinkState('loading', undefined);
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
        this.#setLinkState('error', DESIGNER_UI_TEXT.dataset.loadFailed);
        this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
      }
      return;
    }
    if (controller.signal.aborted || requestId !== this.#requestId) return;
    if (!result.ok) {
      this.callbacks.report(result.diagnostics);
      this.#setLinkState(
        'error',
        result.diagnostics[0]?.code ?? DESIGNER_UI_TEXT.dataset.loadFailed,
      );
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
      return;
    }
    const parsed = parseScreenDatasetEntries(result.value);
    if (!parsed.ok) {
      this.callbacks.report(parsed.diagnostics);
      this.#setLinkState(
        'error',
        parsed.diagnostics[0]?.code ?? DESIGNER_UI_TEXT.dataset.loadFailed,
      );
      this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.loadFailed);
      return;
    }
    this.#status = 'ready';
    this.#error = undefined;
    this.#items =
      cursor === undefined ? parsed.value.items : [...this.#items, ...parsed.value.items];
    this.#cursor = parsed.value.nextCursor;
    this.#listedQuery = this.#query;
    this.callbacks.setFeedback(DESIGNER_UI_TEXT.dataset.shown(this.#items.length));
    (this.callbacks.renderResults ?? this.callbacks.render)();
  }

  #setLinkState(status: DesignerHostLinkStatus, error: string | undefined): void {
    this.#status = status;
    this.#error = error;
    // 状态灯就挂在宿主连接段上：状态一变就地重画这两块，不惊动搜索框和已展开的弹层。
    this.callbacks.renderResults?.();
  }

  #cancelPendingQuery(): void {
    if (this.#queryTimer === undefined) return;
    clearTimeout(this.#queryTimer);
    this.#queryTimer = undefined;
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
