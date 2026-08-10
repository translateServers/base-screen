import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintRuntimePort,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenResourceExecutionContext,
  ScreenResourceExecutionMode,
  ScreenResourceExecutionTrigger,
  ScreenResourceObserver,
} from '@base-screen/contracts';
import { parseScreenJsonValue, type ScreenDiagnostic } from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from './renderer.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);
const HOST_VARIABLE_TIMEOUT_MS = 15_000;

export interface BaseScreenViewerConfiguration {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly resourcePort?: ScreenHostResourcePort;
  readonly variablePort?: ScreenHostVariablePort;
  readonly runtimeContributions?: BaseScreenRuntimeContributionIndex;
  readonly blueprintRuntimePort?: ScreenBlueprintRuntimePort;
  readonly blueprintHostActionPort?: ScreenBlueprintHostActionPort;
  readonly resourceTimeoutMs?: number;
  readonly instanceId?: string;
  readonly mode?: ScreenResourceExecutionMode;
  readonly observer?: ScreenResourceObserver;
  /** 非持久化执行上下文附加信息（RB2）：提供时流入每次 resolve 与 observer 事件。 */
  readonly projectId?: string;
  readonly documentRevision?: string;
}

export type BaseScreenViewerRefreshOptions = {
  readonly componentId?: string;
  readonly trigger?: 'manual' | 'polling';
  readonly traceId?: string;
};

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #variablePort: ScreenHostVariablePort | undefined;
  #contributionIndex: BaseScreenRuntimeContributionIndex | undefined;
  #blueprintRuntimePort: ScreenBlueprintRuntimePort | undefined;
  #blueprintHostActionPort: ScreenBlueprintHostActionPort | undefined;
  #document: ScreenDocument | undefined;
  #blueprintPlan: ScreenBlueprintPlan | undefined;
  #blueprintVariables: ScreenJsonObject | undefined;
  #resourceTimeoutMs = 15_000;
  #instanceId = 'viewer';
  #mode: ScreenResourceExecutionMode = 'viewer';
  #observer: ScreenResourceObserver | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #mount: HTMLDivElement | undefined;
  #variableController: AbortController | undefined;
  #variableGeneration = 0;
  #variableRefresh: Promise<boolean> | undefined;
  #pendingRefreshAll = false;
  readonly #pendingRefreshComponents = new Set<string>();
  #nextTrigger: ScreenResourceExecutionTrigger = 'manual';
  #nextTraceId: string | undefined;
  #hasRenderedDocument = false;
  #projectId: string | undefined;
  #documentRevision: string | undefined;

  /**
   * 权威原子配置入口（DRH-R8）：先校验全部运行时依赖（catalog、resource/variable
   * 端口、runtime contributions、blueprint 端口、timeout），任何一项无效都不做
   * 任何字段变更、不创建 Renderer（validate before mutate）。配置后文档更新仍是
   * 显式操作（设置 document）。
   */
  configure(configuration: BaseScreenViewerConfiguration): ScreenParseResult<null> {
    if (this.#renderer !== undefined) {
      return lifecycleFailure('Viewer 已初始化，请先 unload 再重新配置。');
    }
    if (!isBaseScreenMaterialCatalog(configuration.catalog)) {
      return lifecycleFailure('Viewer catalog 必须是合法的物料目录。');
    }
    const timeout = configuration.resourceTimeoutMs ?? 15_000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) {
      return lifecycleFailure('resourceTimeoutMs 必须是 100..60000 的整数。');
    }
    if (
      configuration.resourcePort !== undefined &&
      !isScreenHostResourcePort(configuration.resourcePort)
    ) {
      return lifecycleFailure('Viewer resource port 必须是含 resolve 的对象。');
    }
    if (
      configuration.variablePort !== undefined &&
      !isScreenHostVariablePort(configuration.variablePort)
    ) {
      return lifecycleFailure('Viewer variable port 必须是含 resolve 的对象。');
    }
    if (
      configuration.runtimeContributions !== undefined &&
      !isBaseScreenRuntimeContributionIndex(configuration.runtimeContributions)
    ) {
      return lifecycleFailure('Viewer runtime contributions 必须是含 getResourceType 的对象。');
    }
    if (
      configuration.blueprintRuntimePort !== undefined &&
      !isScreenBlueprintRuntimePort(configuration.blueprintRuntimePort)
    ) {
      return lifecycleFailure('Viewer blueprint runtime port 必须是含 emit 的对象。');
    }
    if (
      configuration.blueprintHostActionPort !== undefined &&
      !isScreenBlueprintHostActionPort(configuration.blueprintHostActionPort)
    ) {
      return lifecycleFailure('Viewer blueprint host action port 必须是含 execute 的对象。');
    }
    this.#catalog = configuration.catalog;
    this.#resourcePort = configuration.resourcePort;
    this.#variablePort = configuration.variablePort;
    this.#contributionIndex = configuration.runtimeContributions;
    this.#blueprintRuntimePort = configuration.blueprintRuntimePort;
    this.#blueprintHostActionPort = configuration.blueprintHostActionPort;
    this.#resourceTimeoutMs = timeout;
    this.#instanceId = configuration.instanceId ?? 'viewer';
    this.#mode = configuration.mode ?? 'viewer';
    this.#observer = configuration.observer;
    this.#projectId = configuration.projectId;
    this.#documentRevision = configuration.documentRevision;
    this.initialize();
    this.startVariableRender(undefined, false, true);
    return { ok: true, value: null, diagnostics: [] };
  }

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  /**
   * 运行时依赖 setter 只保留值、不再独立初始化（RB3）：初始化由 configure /
   * document 赋值 / connect 控制。
   */
  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#renderer !== undefined && value !== this.#catalog) {
      this.emitLifecycleDiagnostic(
        'Catalog cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#catalog = value;
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  get variablePort(): ScreenHostVariablePort | undefined {
    return this.#variablePort;
  }

  get resourceTimeoutMs(): number {
    return this.#resourceTimeoutMs;
  }

  set resourceTimeoutMs(value: number) {
    if (this.#renderer !== undefined && value !== this.#resourceTimeoutMs) {
      this.emitLifecycleDiagnostic(
        'Resource timeout cannot change after initialization. Call unload first.',
      );
      return;
    }
    if (!Number.isInteger(value) || value < 100 || value > 60_000) {
      this.emitLifecycleDiagnostic('Resource timeout must be an integer between 100 and 60000.');
      return;
    }
    this.#resourceTimeoutMs = value;
  }

  set variablePort(value: ScreenHostVariablePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#variablePort) {
      this.emitLifecycleDiagnostic(
        'Variable port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#variablePort = value;
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    if (this.#renderer !== undefined && value !== this.#contributionIndex) {
      this.emitLifecycleDiagnostic(
        'Runtime contributions cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#contributionIndex = value;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#resourcePort) {
      this.emitLifecycleDiagnostic(
        'Resource port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#resourcePort = value;
  }

  get blueprintRuntimePort(): ScreenBlueprintRuntimePort | undefined {
    return this.#blueprintRuntimePort;
  }

  set blueprintRuntimePort(value: ScreenBlueprintRuntimePort | undefined) {
    this.#blueprintRuntimePort = value;
  }

  get blueprintHostActionPort(): ScreenBlueprintHostActionPort | undefined {
    return this.#blueprintHostActionPort;
  }

  set blueprintHostActionPort(value: ScreenBlueprintHostActionPort | undefined) {
    this.#blueprintHostActionPort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#document;
  }

  set document(value: ScreenDocument | undefined) {
    this.cancelVariableResolution();
    this.#document = value;
    this.compileBlueprint();
    this.initialize();
    this.startVariableRender(undefined, false, true);
  }

  connectedCallback(): void {
    this.initialize();
    this.startVariableRender(undefined, false, true);
  }

  disconnectedCallback(): void {
    this.cancelVariableResolution();
    this.#renderer?.clear();
  }

  unload(): void {
    this.cancelVariableResolution();
    this.disposeRenderer();
    this.#document = undefined;
    this.#hasRenderedDocument = false;
    this.compileBlueprint();
  }

  refreshData(componentId?: string): void;
  refreshData(options: BaseScreenViewerRefreshOptions): void;
  refreshData(componentIdOrOptions?: string | BaseScreenViewerRefreshOptions): void {
    const options =
      typeof componentIdOrOptions === 'string'
        ? { componentId: componentIdOrOptions }
        : (componentIdOrOptions ?? {});
    const componentId = options.componentId;
    // A targeted refresh of an unknown component id must not trigger any
    // variable, resource, or host call and must not degrade into a full
    // refresh of unrelated components.
    if (componentId !== undefined && !this.hasComponent(componentId)) {
      return;
    }
    this.#nextTrigger = options.trigger === 'polling' ? 'polling' : 'manual';
    this.#nextTraceId = options.traceId;
    if (this.#variableRefresh !== undefined) {
      if (componentId === undefined) this.#pendingRefreshAll = true;
      else if (!this.#pendingRefreshAll) this.#pendingRefreshComponents.add(componentId);
      return;
    }
    this.startVariableRender(componentId, true);
  }

  private hasComponent(componentId: string): boolean {
    return this.#document?.components.some((component) => component.id === componentId) ?? false;
  }

  private initialize(): void {
    if (!this.isConnected || this.#catalog === undefined || this.#renderer !== undefined) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#mount = this.ownerDocument.createElement('div');
    shadow.appendChild(this.#mount);
    this.#renderer = createBaseScreenRenderer({
      root: this.#mount,
      catalog: this.#catalog,
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: (event) => {
        this.handleMaterialEvent(event);
        this.dispatchEvent(
          new CustomEvent('base-screen-material-event', {
            bubbles: true,
            composed: true,
            detail: event,
          }),
        );
      },
      resourcePort: this.#resourcePort,
      resourceTimeoutMs: this.#resourceTimeoutMs,
      ...(this.#contributionIndex === undefined
        ? {}
        : { contributionIndex: this.#contributionIndex }),
      ...(this.#observer === undefined ? {} : { observer: this.#observer }),
      ...(this.#instanceId === undefined ? {} : { instanceId: this.#instanceId }),
      ...(this.#mode === undefined ? {} : { executionMode: this.#mode }),
      ...(this.#projectId === undefined ? {} : { projectId: this.#projectId }),
      ...(this.#documentRevision === undefined ? {} : { documentRevision: this.#documentRevision }),
    });
  }

  private disposeRenderer(): void {
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#mount?.remove();
    this.#mount = undefined;
  }

  private compileBlueprint(): void {
    if (this.#document === undefined) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      return;
    }
    const compiled = compileScreenBlueprint(
      this.#document,
      this.#contributionIndex ?? { hasBlueprintCapability: () => false },
    );
    if (!compiled.ok) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.dispatchEvent(
        new CustomEvent('base-screen-diagnostic', {
          detail: { diagnostics: compiled.diagnostics },
        }),
      );
      return;
    }
    this.#blueprintPlan = compiled.value;
    this.#blueprintVariables = compiled.value.initialVariables;
  }

  private startVariableRender(componentId?: string, forceRefresh = false, restart = false): void {
    if (this.#variableRefresh !== undefined) {
      if (!restart) return;
      this.cancelVariableResolution();
    }
    const task = this.resolveVariablesAndRender(componentId, forceRefresh);
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
      if (this.#pendingRefreshAll) this.#renderer?.refreshData(undefined, trigger, traceId);
      else {
        for (const id of this.#pendingRefreshComponents) {
          this.#renderer?.refreshData(id, trigger, traceId);
        }
      }
      this.#nextTrigger = 'manual';
      this.#nextTraceId = undefined;
      this.#pendingRefreshAll = false;
      this.#pendingRefreshComponents.clear();
    });
  }

  private async resolveVariablesAndRender(
    componentId: string | undefined,
    forceRefresh: boolean,
  ): Promise<boolean> {
    const renderer = this.#renderer;
    const document = this.#document;
    const plan = this.#blueprintPlan;
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
      ...this.#blueprintVariables,
    };
    for (const variable of document.variables) {
      if (variable.type !== 'host') continue;
      if (this.#variablePort === undefined) {
        this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
      try {
        const result = await resolveHostVariable(
          this.#variablePort,
          variable.variableId,
          controller,
        );
        if (result === undefined) {
          this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        if (!result.ok || controller.signal.aborted) {
          if (!controller.signal.aborted) this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        const parsed = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
        if (!parsed.ok) {
          this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        variables[variable.name] = parsed.value;
      } catch {
        if (!controller.signal.aborted) this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
    }
    if (
      controller.signal.aborted ||
      generation !== this.#variableGeneration ||
      this.#renderer !== renderer ||
      this.#document !== document
    ) {
      return false;
    }
    this.#blueprintVariables = variables;
    const applied = renderer.setVariables(variables);
    if (!applied.ok) {
      this.emitDiagnostics(applied.diagnostics);
      return false;
    }
    const rendered = renderer.render(document, { trigger, traceId: traceId ?? '' });
    if (!rendered.ok || rendered.diagnostics.length > 0) {
      this.emitDiagnostics(rendered.diagnostics);
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

  private handleMaterialEvent(event: {
    readonly componentId: string;
    readonly name: string;
    readonly payload: ScreenJsonValue;
  }): void {
    if (this.#blueprintPlan === undefined || this.#blueprintVariables === undefined) {
      return;
    }
    const result = dispatchScreenBlueprintEvent(this.#blueprintPlan, this.#blueprintVariables, {
      componentId: event.componentId,
      name: event.name,
      payload: event.payload,
    });
    if (!result.ok) {
      this.emitLifecycleDiagnostic('Blueprint event payload is invalid.');
      return;
    }
    this.#blueprintVariables = result.value.variables;
    const renderer = this.#renderer;
    const document = this.#document;
    if (renderer !== undefined && document !== undefined) {
      const variables = renderer.setVariables(result.value.variables);
      if (variables.ok) {
        const rendered = renderer.render(document, { trigger: 'variable' });
        if (!rendered.ok || rendered.diagnostics.length > 0)
          this.emitDiagnostics(rendered.diagnostics);
      } else {
        this.emitDiagnostics(variables.diagnostics);
      }
    }
    for (const hostEvent of result.value.hostEvents) {
      if (this.#blueprintRuntimePort === undefined) {
        this.dispatchEvent(new CustomEvent('base-screen-blueprint-event', { detail: hostEvent }));
      } else {
        void Promise.resolve(this.#blueprintRuntimePort.emit(hostEvent)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host event failed.');
        });
      }
    }
    for (const hostAction of result.value.hostActions) {
      if (this.#blueprintHostActionPort === undefined) {
        this.emitLifecycleDiagnostic('Blueprint host action is unavailable.');
      } else {
        void Promise.resolve(this.#blueprintHostActionPort.execute(hostAction)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host action failed.');
        });
      }
    }
  }

  private cancelVariableResolution(): void {
    this.#variableGeneration++;
    this.#variableController?.abort();
    this.#variableController = undefined;
    this.#pendingRefreshAll = false;
    this.#pendingRefreshComponents.clear();
  }

  private emitDiagnostic(code: ScreenDiagnostic['code']): void {
    this.emitDiagnostics([
      { severity: 'error', code, path: [], message: 'Host dataset state is unavailable.' },
    ]);
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    this.dispatchEvent(
      new CustomEvent('base-screen-diagnostic', {
        detail: { diagnostics },
      }),
    );
  }

  private emitLifecycleDiagnostic(message: string): void {
    this.emitDiagnostics([
      { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message },
    ]);
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

// ---------------------------------------------------------------------------
// RB3 原子配置：配置对象形状校验（validate before mutate）。这些校验只做
// 足够避免坏配置提交/运行时崩溃的形状检查，不发明兼容解析器。
// ---------------------------------------------------------------------------

function isBaseScreenMaterialCatalog(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).get === 'function' &&
    typeof (value as Record<string, unknown>).has === 'function' &&
    typeof (value as Record<string, unknown>).list === 'function'
  );
}

function isScreenHostResourcePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

function isScreenHostVariablePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

function isBaseScreenRuntimeContributionIndex(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).getResourceType === 'function' &&
    typeof (value as Record<string, unknown>).hasBlueprintCapability === 'function'
  );
}

function isScreenBlueprintRuntimePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).emit === 'function'
  );
}

function isScreenBlueprintHostActionPort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).execute === 'function'
  );
}

function lifecycleFailure(message: string): ScreenParseResult<null> {
  return {
    ok: false as const,
    diagnostics: [{ severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message }],
  };
}
