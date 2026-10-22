import {
  parseScreenHostCatalogDescriptor,
  parseScreenHostCatalogPage,
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenHostCatalogDescriptor,
  type ScreenHostCatalogPort,
} from '@base-screen/contracts';
import type { DesignerVariableView } from '../../../common/operations/designer-variable-view.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerVariableCatalogView } from '../../dom/designer-variables-dom.js';

const PREVIEW_VALUE_BYTES = 1024 * 1024;
const PREVIEW_SUMMARY_BYTES = 8 * 1024;
const PREVIEW_TIMEOUT_MS = 15_000;

interface DesignerVariableCatalogCallbacks {
  readonly getHostCatalogPort: () => ScreenHostCatalogPort | undefined;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly render: () => void;
}

/**
 * 来源目录：分页 list、按 sourceId describe、按来源解析当前值。
 *
 * `host-catalog` 与 `url-query` 共用同一个端口，宿主拥有 `sourceId` 的命名空间，
 * 因此这里不再按旧的三桶枚举过滤目录项。
 */
export class DesignerVariableCatalogController {
  #listController: AbortController | undefined;
  #detailController: AbortController | undefined;
  #listGeneration = 0;
  #detailGeneration = 0;
  #listed = false;
  #view: DesignerVariableCatalogView = emptyView();
  readonly #descriptors = new Map<string, ScreenHostCatalogDescriptor>();

  constructor(private readonly callbacks: DesignerVariableCatalogCallbacks) {}

  get view(): DesignerVariableCatalogView {
    return this.#view;
  }

  ensureList(): void {
    this.#listed = true;
    if (this.#view.items.length === 0) void this.#list(undefined);
  }

  updateQuery(query: string): void {
    if (query === this.#view.query) return;
    this.#view = { ...emptyView(), query };
    if (this.#listed) void this.#list(undefined);
  }

  loadMore(): void {
    if (this.#view.nextCursor !== undefined) void this.#list(this.#view.nextCursor);
  }

  async select(sourceId: string): Promise<ScreenHostCatalogDescriptor | undefined> {
    const descriptor = await this.#describe(sourceId);
    if (descriptor === undefined) return undefined;
    this.#view = { ...this.#view, selected: descriptor };
    this.callbacks.render();
    return descriptor;
  }

  async preview(variable: DesignerVariableView): Promise<void> {
    if (variable.type === 'static') return;
    const variableId = variable.id;
    const descriptor =
      this.#descriptors.get(variable.sourceId) ?? (await this.#describe(variable.sourceId));
    if (descriptor === undefined) return;
    if (!descriptor.previewable) {
      this.#view = {
        ...this.#view,
        previewVariableId: variableId,
        previewStatus: 'unavailable',
        previewSummary: undefined,
      };
      this.callbacks.render();
      return;
    }
    const port = this.callbacks.getHostCatalogPort();
    if (port === undefined) {
      this.#setPreviewFailure(variableId);
      return;
    }
    this.#detailController?.abort();
    const controller = new AbortController();
    const generation = ++this.#detailGeneration;
    this.#detailController = controller;
    this.#view = {
      ...this.#view,
      previewVariableId: variableId,
      previewStatus: 'loading',
      previewSummary: undefined,
    };
    this.callbacks.render();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, PREVIEW_TIMEOUT_MS);
      });
      const settled = await Promise.race([
        port.resolve({
          sourceId: variable.sourceId,
          params: {},
          purpose: 'authoring-preview',
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (controller.signal.aborted || generation !== this.#detailGeneration) return;
      this.#detailController = undefined;
      if (settled === undefined || !settled.ok) {
        this.#setPreviewFailure(variableId);
        return;
      }
      const parsed = parseScreenJsonValue(settled.value, { maxBytes: PREVIEW_VALUE_BYTES });
      if (!parsed.ok) {
        this.callbacks.report(parsed.diagnostics);
        this.#setPreviewFailure(variableId);
        return;
      }
      this.#view = {
        ...this.#view,
        previewVariableId: variableId,
        previewStatus: 'ready',
        previewSummary: formatPreviewSummary(parsed.value),
      };
      this.callbacks.render();
    } catch {
      if (!controller.signal.aborted && generation === this.#detailGeneration) {
        this.#detailController = undefined;
        this.#setPreviewFailure(variableId);
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  clear(): void {
    this.#listController?.abort();
    this.#detailController?.abort();
    this.#listController = undefined;
    this.#detailController = undefined;
    this.#listGeneration++;
    this.#detailGeneration++;
    this.#descriptors.clear();
    this.#listed = false;
    this.#view = emptyView();
  }

  #setPreviewFailure(variableId: string): void {
    this.#view = {
      ...this.#view,
      previewVariableId: variableId,
      previewStatus: 'error',
      previewSummary: undefined,
    };
    this.callbacks.render();
  }

  async #list(cursor: string | undefined): Promise<void> {
    const port = this.callbacks.getHostCatalogPort();
    if (port === undefined || !this.#listed) {
      this.#view = { ...this.#view, feedback: DESIGNER_UI_TEXT.variables.catalogUnavailable };
      this.callbacks.render();
      return;
    }
    this.#listController?.abort();
    const controller = new AbortController();
    const generation = ++this.#listGeneration;
    this.#listController = controller;
    this.#view = { ...this.#view, feedback: DESIGNER_UI_TEXT.variables.catalogLoading };
    this.callbacks.render();
    try {
      const result = await port.list({
        query: this.#view.query,
        ...(cursor === undefined ? {} : { cursor }),
        limit: 50,
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== this.#listGeneration) return;
      this.#listController = undefined;
      if (!result.ok) {
        this.callbacks.report(result.diagnostics);
        this.#view = { ...this.#view, feedback: DESIGNER_UI_TEXT.variables.catalogFailed };
        this.callbacks.render();
        return;
      }
      const parsed = parseScreenHostCatalogPage(result.value);
      if (!parsed.ok) {
        this.callbacks.report(parsed.diagnostics);
        this.#view = { ...this.#view, feedback: DESIGNER_UI_TEXT.variables.catalogFailed };
        this.callbacks.render();
        return;
      }
      const items =
        cursor === undefined ? parsed.value.items : [...this.#view.items, ...parsed.value.items];
      if (new Set(items.map(({ sourceId }) => sourceId)).size !== items.length) {
        this.callbacks.report([catalogDiagnostic('Host catalog page repeats an existing id.')]);
        this.#view = { ...this.#view, feedback: DESIGNER_UI_TEXT.variables.catalogFailed };
        this.callbacks.render();
        return;
      }
      this.#view = {
        ...this.#view,
        items,
        nextCursor: parsed.value.nextCursor,
        feedback:
          items.length === 0
            ? DESIGNER_UI_TEXT.variables.catalogEmpty
            : DESIGNER_UI_TEXT.variables.catalogShown(items.length),
      };
      this.callbacks.render();
    } catch {
      if (!controller.signal.aborted && generation === this.#listGeneration) {
        this.#listController = undefined;
        this.#view = { ...this.#view, feedback: DESIGNER_UI_TEXT.variables.catalogFailed };
        this.callbacks.render();
      }
    }
  }

  async #describe(sourceId: string): Promise<ScreenHostCatalogDescriptor | undefined> {
    const cached = this.#descriptors.get(sourceId);
    if (cached !== undefined) return cached;
    const port = this.callbacks.getHostCatalogPort();
    if (port === undefined) return undefined;
    this.#detailController?.abort();
    const controller = new AbortController();
    const generation = ++this.#detailGeneration;
    this.#detailController = controller;
    try {
      const result = await port.describe({ sourceId, signal: controller.signal });
      if (controller.signal.aborted || generation !== this.#detailGeneration) return undefined;
      this.#detailController = undefined;
      if (!result.ok) {
        this.callbacks.report(result.diagnostics);
        return undefined;
      }
      const parsed = parseScreenHostCatalogDescriptor(result.value);
      if (!parsed.ok || parsed.value.sourceId !== sourceId) {
        this.callbacks.report(
          parsed.ok
            ? [catalogDiagnostic('Host catalog descriptor id does not match the request.')]
            : parsed.diagnostics,
        );
        return undefined;
      }
      this.#descriptors.set(sourceId, parsed.value);
      return parsed.value;
    } catch {
      return undefined;
    }
  }
}

function emptyView(): DesignerVariableCatalogView {
  return {
    query: '',
    items: [],
    nextCursor: undefined,
    feedback: '',
    selected: undefined,
    previewVariableId: undefined,
    previewStatus: 'idle',
    previewSummary: undefined,
  };
}

function catalogDiagnostic(message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'HOST_VARIABLE_DESCRIPTOR_INVALID',
    path: [],
    message,
  };
}

function formatPreviewSummary(value: unknown): string {
  const formatted = JSON.stringify(value, null, 2);
  if (utf8Length(formatted) <= PREVIEW_SUMMARY_BYTES) return formatted;
  let summary = '';
  for (const character of formatted) {
    if (utf8Length(`${summary}${character}…`) > PREVIEW_SUMMARY_BYTES) break;
    summary += character;
  }
  return `${summary}…`;
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}
