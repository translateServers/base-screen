import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostVariablePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenResourceExecutionTrigger,
} from '@base-screen/contracts';
import type { ScreenBlueprintPlan } from '@base-screen/core';
import type { BaseScreenRenderer } from './renderer.js';
import type { BaseScreenViewerRefreshOptions } from './viewer.js';

const HOST_VARIABLE_TIMEOUT_MS = 15_000;

export interface ViewerVariableControllerHost {
  readonly readRenderer: () => BaseScreenRenderer | undefined;
  readonly readDocument: () => ScreenDocument | undefined;
  readonly readBlueprintPlan: () => ScreenBlueprintPlan | undefined;
  readonly readBlueprintVariables: () => ScreenJsonObject | undefined;
  readonly writeBlueprintVariables: (variables: ScreenJsonObject) => void;
  readonly readVariablePort: () => ScreenHostVariablePort | undefined;
  readonly emitDiagnostic: (code: ScreenDiagnostic['code']) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class ViewerVariableController {
  readonly #host: ViewerVariableControllerHost;
  #variableController: AbortController | undefined;
  #variableGeneration = 0;
  #variableRefresh: Promise<boolean> | undefined;
  #pendingRefreshAll = false;
  readonly #pendingRefreshComponents = new Set<string>();
  #nextTrigger: ScreenResourceExecutionTrigger = 'manual';
  #nextTraceId: string | undefined;
  #hasRenderedDocument = false;

  constructor(host: ViewerVariableControllerHost) {
    this.#host = host;
  }

  refreshData(componentIdOrOptions?: string | BaseScreenViewerRefreshOptions): void {
    const options =
      typeof componentIdOrOptions === 'string'
        ? { componentId: componentIdOrOptions }
        : (componentIdOrOptions ?? {});
    const componentId = options.componentId;
    if (componentId !== undefined && !this.#hasComponent(componentId)) return;
    this.#nextTrigger = options.trigger === 'polling' ? 'polling' : 'manual';
    this.#nextTraceId = options.traceId;
    if (this.#variableRefresh !== undefined) {
      if (componentId === undefined) this.#pendingRefreshAll = true;
      else if (!this.#pendingRefreshAll) this.#pendingRefreshComponents.add(componentId);
      return;
    }
    this.start(componentId, true);
  }

  #hasComponent(componentId: string): boolean {
    return (
      this.#host.readDocument()?.components.some((component) => component.id === componentId) ??
      false
    );
  }

  start(componentId?: string, forceRefresh = false, restart = false): void {
    if (this.#variableRefresh !== undefined) {
      if (!restart) return;
      this.cancel();
    }
    const task = this.#resolveVariablesAndRender(componentId, forceRefresh);
    this.#variableRefresh = task;
    void task.then((ready) => {
      if (this.#variableRefresh !== task) return;
      this.#variableRefresh = undefined;
      if (!ready) {
        this.#pendingRefreshAll = false;
        this.#pendingRefreshComponents.clear();
        this.#nextTrigger = 'manual';
        this.#nextTraceId = undefined;
        return;
      }
      // 进行中 refresh 队列完成后补发刷新：携带排队期间记录的 trigger/trace
      // intent（RB2），避免 polling/trace 在全量刷新中被吞掉。排队意图必须
      // 在此处消费后才复位，否则 resolveVariablesAndRender 的完成路径会先
      // 重置它们，导致队列中的 trigger/trace 丢失。
      const trigger = this.#nextTrigger === 'polling' ? 'polling' : 'manual';
      const traceId = this.#nextTraceId;
      if (this.#pendingRefreshAll)
        this.#host.readRenderer()?.refreshData(undefined, trigger, traceId);
      else {
        for (const id of this.#pendingRefreshComponents) {
          this.#host.readRenderer()?.refreshData(id, trigger, traceId);
        }
      }
      this.#nextTrigger = 'manual';
      this.#nextTraceId = undefined;
      this.#pendingRefreshAll = false;
      this.#pendingRefreshComponents.clear();
    });
  }

  async #resolveVariablesAndRender(
    componentId: string | undefined,
    forceRefresh: boolean,
  ): Promise<boolean> {
    const renderer = this.#host.readRenderer();
    const document = this.#host.readDocument();
    const plan = this.#host.readBlueprintPlan();
    if (renderer === undefined || document === undefined || plan === undefined) return false;
    // 按本次操作派生执行上下文（RB2）：显式刷新使用 manual/polling 与提供的
    // traceId；初始加载使用 initial；文档替换使用 document-change。每次派生
    // 独立传入，任何组件都不会消费/重置其他组件的 trigger/trace。
    const trigger: ScreenResourceExecutionTrigger = forceRefresh
      ? this.#nextTrigger
      : this.#hasRenderedDocument
        ? 'document-change'
        : 'initial';
    const traceId = forceRefresh ? this.#nextTraceId : undefined;
    const generation = ++this.#variableGeneration;
    const controller = new AbortController();
    this.#variableController = controller;
    // Initial/document-change runs (no component target, no manual force) must
    // cancel and clear the previously mounted resource work before resolving
    // the new document's host variables; otherwise the old resources stay
    // active and could resolve stale data under the new document. Manual
    // refreshData() / refreshData(componentId) must never suspend globally:
    // a full or targeted refresh must keep unrelated material state intact.
    if (componentId === undefined && !forceRefresh) {
      renderer.suspendData();
    }
    const variables: Record<string, ScreenJsonValue> = {
      ...plan.initialVariables,
      ...this.#host.readBlueprintVariables(),
    };
    for (const variable of document.variables) {
      if (variable.type !== 'host') continue;
      const variablePort = this.#host.readVariablePort();
      if (variablePort === undefined) {
        this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
      try {
        const result = await resolveHostVariable(variablePort, variable.variableId, controller);
        if (result === undefined) {
          this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        if (!result.ok || controller.signal.aborted) {
          if (!controller.signal.aborted)
            this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        const parsed = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
        if (!parsed.ok) {
          this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        variables[variable.name] = parsed.value;
      } catch {
        if (!controller.signal.aborted) this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
    }
    if (
      controller.signal.aborted ||
      generation !== this.#variableGeneration ||
      this.#host.readRenderer() !== renderer ||
      this.#host.readDocument() !== document
    ) {
      return false;
    }
    this.#host.writeBlueprintVariables(variables);
    const applied = renderer.setVariables(variables);
    if (!applied.ok) {
      this.#host.emitDiagnostics(applied.diagnostics);
      return false;
    }
    const rendered = renderer.render(document, { trigger, traceId: traceId ?? '' });
    if (!rendered.ok || rendered.diagnostics.length > 0) {
      this.#host.emitDiagnostics(rendered.diagnostics);
      return false;
    }
    if (!forceRefresh) {
      // 首次成功渲染标记完成，后续文档替换使用 document-change 触发。
      this.#hasRenderedDocument = true;
    }
    // `render()` already starts the first resolve for every newly mounted or
    // identity-changed resource once variables are ready, so a variable change
    // only re-queries the components whose evaluated params depend on it. The
    // explicit refresh below guarantees that all current resources start
    // exactly once on the initial/document load (it coalesces with those first
    // resolves) and drives the manual full or targeted refresh. The derived
    // traceId is forwarded for both polling and manual refreshes so a manual
    // refresh with a trace never loses it. `#nextTrigger`/`#nextTraceId` are
    // intentionally NOT reset here: a refresh queued while this run was
    // in-flight already stored its own intent, and the completion callback
    // consumes (and then resets) it after this run settles.
    renderer.refreshData(
      forceRefresh ? componentId : undefined,
      trigger === 'polling' ? 'polling' : 'manual',
      traceId,
    );
    return true;
  }

  cancel(): void {
    this.#variableGeneration++;
    this.#variableController?.abort();
    this.#variableController = undefined;
    this.#pendingRefreshAll = false;
    this.#pendingRefreshComponents.clear();
  }

  reset(): void {
    this.cancel();
    this.#hasRenderedDocument = false;
    this.#nextTrigger = 'manual';
    this.#nextTraceId = undefined;
  }
}

async function resolveHostVariable(
  port: ScreenHostVariablePort,
  variableId: string,
  controller: AbortController,
): Promise<ScreenParseResult<ScreenJsonValue> | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, HOST_VARIABLE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([port.resolve({ variableId, signal: controller.signal }), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
