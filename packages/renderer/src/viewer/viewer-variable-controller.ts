import type {
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenResourceExecutionTrigger,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import type { ScreenBlueprintPlan } from '@base-screen/core';
import { canonicalJsonString } from '../canonical-json.js';
import type { BaseScreenRenderer } from '../renderer/renderer.js';
import type { BaseScreenViewerRefreshOptions } from './viewer-configuration.js';
import { resolveHostVariableBatch } from './viewer-host-variable-resolution.js';
import { hostResolvedVariables } from './viewer-variable-request.js';

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
  #pendingVariableRefreshAll = false;
  readonly #pendingVariableIds = new Set<string>();
  #pendingVariableTraceId: string | undefined;
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

  refreshVariables(options: ScreenVariableRefreshOptions = {}): void {
    const document = this.#host.readDocument();
    if (document === undefined) return;
    const availableIds = new Set(hostResolvedVariables(document).map((entry) => entry.id));
    const requested =
      options.variableIds === undefined
        ? undefined
        : [...new Set(options.variableIds)].filter((variableId) => availableIds.has(variableId));
    if ((requested?.length ?? availableIds.size) === 0) return;
    if (this.#variableRefresh !== undefined) {
      this.#queueVariableRefresh(requested, options.traceId);
      return;
    }
    this.#startVariableRefresh(requested, options.traceId);
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
        this.#drainVariableRefresh();
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
      this.#drainVariableRefresh();
    });
  }

  #startVariableRefresh(requestedIds: readonly string[] | undefined, traceId?: string): void {
    const task = this.#resolveVariablesOnly(requestedIds, traceId);
    this.#variableRefresh = task;
    void task.then(() => {
      if (this.#variableRefresh !== task) return;
      this.#variableRefresh = undefined;
      if (this.#pendingRefreshAll || this.#pendingRefreshComponents.size > 0) {
        const componentId =
          !this.#pendingRefreshAll && this.#pendingRefreshComponents.size === 1
            ? [...this.#pendingRefreshComponents][0]
            : undefined;
        this.#pendingRefreshAll = false;
        this.#pendingRefreshComponents.clear();
        this.start(componentId, true);
        return;
      }
      this.#drainVariableRefresh();
    });
  }

  #queueVariableRefresh(requestedIds: readonly string[] | undefined, traceId?: string): void {
    if (requestedIds === undefined) {
      this.#pendingVariableRefreshAll = true;
      this.#pendingVariableIds.clear();
    } else if (!this.#pendingVariableRefreshAll) {
      for (const variableId of requestedIds) this.#pendingVariableIds.add(variableId);
    }
    this.#pendingVariableTraceId = traceId;
  }

  #drainVariableRefresh(): void {
    if (
      this.#variableRefresh !== undefined ||
      (!this.#pendingVariableRefreshAll && this.#pendingVariableIds.size === 0)
    ) {
      return;
    }
    const requestedIds = this.#pendingVariableRefreshAll
      ? undefined
      : [...this.#pendingVariableIds];
    const traceId = this.#pendingVariableTraceId;
    this.#pendingVariableRefreshAll = false;
    this.#pendingVariableIds.clear();
    this.#pendingVariableTraceId = undefined;
    this.#startVariableRefresh(requestedIds, traceId);
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
    const dynamicVariables = hostResolvedVariables(document);
    if (dynamicVariables.length > 0) {
      const variablePort = this.#host.readVariablePort();
      if (variablePort === undefined) {
        this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
      const values = await resolveHostVariableBatch(document, variablePort, controller);
      if (values === undefined) {
        if (!controller.signal.aborted) this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
      for (const variable of dynamicVariables) {
        const value = values.get(variable.id);
        if (value !== undefined) variables[variable.id] = value;
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
    this.#host.writeBlueprintVariables(variables);
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

  async #resolveVariablesOnly(
    requestedIds: readonly string[] | undefined,
    traceId: string | undefined,
  ): Promise<boolean> {
    const renderer = this.#host.readRenderer();
    const document = this.#host.readDocument();
    const previous = this.#host.readBlueprintVariables();
    if (renderer === undefined || document === undefined || previous === undefined) return false;
    const dynamicVariables = hostResolvedVariables(document).filter(
      (variable) => requestedIds === undefined || requestedIds.includes(variable.id),
    );
    if (dynamicVariables.length === 0) return true;
    const port = this.#host.readVariablePort();
    if (port === undefined) {
      this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
      return false;
    }
    const generation = ++this.#variableGeneration;
    const controller = new AbortController();
    this.#variableController = controller;
    const values = await resolveHostVariableBatch(document, port, controller, requestedIds);
    if (values === undefined) {
      if (!controller.signal.aborted) this.#host.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
      return false;
    }
    if (
      controller.signal.aborted ||
      generation !== this.#variableGeneration ||
      this.#host.readRenderer() !== renderer ||
      this.#host.readDocument() !== document ||
      this.#host.readBlueprintVariables() !== previous
    ) {
      return false;
    }
    const variables: Record<string, ScreenJsonValue> = { ...previous };
    let changed = false;
    for (const variable of dynamicVariables) {
      const value = values.get(variable.id);
      if (value === undefined) continue;
      const previousValue = variables[variable.id];
      if (
        previousValue === undefined ||
        canonicalJsonString(previousValue) !== canonicalJsonString(value)
      ) {
        changed = true;
      }
      variables[variable.id] = value;
    }
    if (!changed) return true;
    const applied = renderer.setVariables(variables);
    if (!applied.ok) {
      this.#host.emitDiagnostics(applied.diagnostics);
      return false;
    }
    const rendered = renderer.render(document, { trigger: 'variable', traceId: traceId ?? '' });
    if (!rendered.ok || rendered.diagnostics.length > 0) {
      renderer.setVariables(previous);
      this.#host.emitDiagnostics(rendered.diagnostics);
      return false;
    }
    this.#host.writeBlueprintVariables(variables);
    return true;
  }

  cancel(): void {
    this.#variableGeneration++;
    this.#variableController?.abort();
    this.#variableController = undefined;
    this.#variableRefresh = undefined;
    this.#pendingRefreshAll = false;
    this.#pendingRefreshComponents.clear();
    this.#pendingVariableRefreshAll = false;
    this.#pendingVariableIds.clear();
    this.#pendingVariableTraceId = undefined;
  }

  reset(): void {
    this.cancel();
    this.#hasRenderedDocument = false;
    this.#nextTrigger = 'manual';
    this.#nextTraceId = undefined;
  }
}
