import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintRuntimePort,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenResourceExecutionMode,
  ScreenResourceObserver,
  ScreenVariableHandle,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '../renderer/renderer.js';
import { applyBlueprintDispatchToRenderer } from './viewer-blueprint-runtime.js';
import {
  type BaseScreenViewerConfiguration,
  type BaseScreenViewerRefreshOptions,
  parseBaseScreenViewerConfiguration,
} from './viewer-configuration.js';
import { isBaseScreenMaterialCatalog } from './viewer-configuration-guards.js';
import { ViewerDataSourceScheduler } from './viewer-data-source-scheduler.js';
import { lifecycleFailure } from './viewer-lifecycle.js';
import { createViewerSkeleton, createViewerSkeletonStyle } from './viewer-skeleton.js';
import { ViewerVariableController } from './viewer-variable-controller.js';
import {
  applyVariableWriteGuard,
  checkViewerVariableWritable,
  ViewerVariableHandles,
  viewerVariableValuesEqual,
} from './viewer-variable-handles.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export type {
  BaseScreenViewerConfiguration,
  BaseScreenViewerRefreshOptions,
} from './viewer-configuration.js';

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #datasetPort: ScreenHostDatasetPort | undefined;
  #hostCatalogPort: ScreenHostCatalogPort | undefined;
  #conditionalStylePort: BaseScreenConditionalStylePort | undefined;
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
  #skeleton: HTMLDivElement | undefined;
  #skeletonStyle: HTMLStyleElement | undefined;
  #rendered = false;
  #projectId: string | undefined;
  #documentRevision: string | undefined;
  readonly #variableHandles = new ViewerVariableHandles({
    readDocument: () => this.#document,
    readVariables: () => this.#blueprintVariables,
    setValue: (id, value) => this.setVariableValue(id, value),
    reportListenerFailure: () => this.emitLifecycleDiagnostic('Variable change listener failed.'),
  });
  readonly #variableRuntime = new ViewerVariableController({
    readRenderer: () => this.#renderer,
    readDocument: () => this.#document,
    readBlueprintPlan: () => this.#blueprintPlan,
    readBlueprintVariables: () => this.#blueprintVariables,
    writeBlueprintVariables: (variables) => {
      this.writeBlueprintVariables(variables, true);
    },
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
    onRenderSettled: () => this.markRendered(),
  });
  readonly #scheduler = new ViewerDataSourceScheduler({
    readRenderer: () => this.#renderer,
    readDocument: () => this.#document,
  });

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
    const parsed = parseBaseScreenViewerConfiguration(configuration);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    this.#catalog = value.catalog;
    this.#resourcePort = value.resourcePort;
    this.#datasetPort = value.datasetPort;
    this.#hostCatalogPort = value.hostCatalogPort;
    this.#conditionalStylePort = value.conditionalStylePort;
    this.#contributionIndex = value.runtimeContributions;
    this.#blueprintRuntimePort = value.blueprintRuntimePort;
    this.#blueprintHostActionPort = value.blueprintHostActionPort;
    this.#resourceTimeoutMs = value.resourceTimeoutMs;
    this.#instanceId = value.instanceId ?? 'viewer';
    this.#mode = value.mode ?? 'viewer';
    this.#observer = value.observer;
    this.#projectId = value.projectId;
    this.#documentRevision = value.documentRevision;
    this.initialize();
    this.#variableRuntime.start(undefined, false, true);
    this.#scheduler.sync(this.#document);
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

  /** 热刷新物料目录，保留文档、变量与当前实例；失败恢复此前目录。 */
  refreshCatalog(catalog: BaseScreenMaterialCatalog): ScreenParseResult<null> {
    const previous = this.#catalog;
    if (previous === undefined || !isBaseScreenMaterialCatalog(catalog)) {
      return lifecycleFailure(
        'Viewer must have a configured catalog before refreshing a valid catalog.',
      );
    }
    if (previous === catalog) return { ok: true, value: null, diagnostics: [] };
    const renderer = this.#renderer;
    const document = this.#document;
    if (renderer === undefined) {
      if (document !== undefined)
        return lifecycleFailure(
          'Catalog refresh requires an initialized renderer while a document is loaded.',
        );
      this.#catalog = catalog;
      return { ok: true, value: null, diagnostics: [] };
    }
    if (document !== undefined) {
      const validated = renderer.validateCatalog(document, catalog);
      if (!validated.ok) return validated;
    }
    // 沿用变量运行时已排队的渲染，避免派生值落定前用旧变量启动组件请求。
    const deferred = this.#variableRuntime.hasDeferredDocument;
    try {
      const updated = renderer.setCatalog(catalog);
      if (!updated.ok) return updated;
      const rendered =
        document === undefined || deferred
          ? { ok: true as const, value: null, diagnostics: [] }
          : renderer.render(document);
      if (rendered.ok && !rendered.diagnostics.some((item) => item.severity === 'error')) {
        this.#catalog = catalog;
        return rendered;
      }
      const restored = renderer.setCatalog(previous);
      const rerendered =
        restored.ok && document !== undefined && !deferred ? renderer.render(document) : restored;
      return { ok: false, diagnostics: [...rendered.diagnostics, ...rerendered.diagnostics] };
    } catch {
      const failed = lifecycleFailure('Viewer catalog refresh failed.');
      try {
        const restored = renderer.setCatalog(previous);
        const rendered =
          restored.ok && document !== undefined && !deferred ? renderer.render(document) : restored;
        return { ok: false, diagnostics: [...failed.diagnostics, ...rendered.diagnostics] };
      } catch {
        return {
          ok: false,
          diagnostics: [
            ...failed.diagnostics,
            ...lifecycleFailure('Viewer catalog rollback failed.').diagnostics,
          ],
        };
      }
    }
  }

  get datasetPort(): ScreenHostDatasetPort | undefined {
    return this.#datasetPort;
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  get hostCatalogPort(): ScreenHostCatalogPort | undefined {
    return this.#hostCatalogPort;
  }

  /** ADR-0059：只读回读；配置入口是 configure 或初始化前的守卫 setter。 */
  get conditionalStylePort(): BaseScreenConditionalStylePort | undefined {
    return this.#conditionalStylePort;
  }

  set conditionalStylePort(value: BaseScreenConditionalStylePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#conditionalStylePort) {
      this.emitLifecycleDiagnostic(
        'Conditional style port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#conditionalStylePort = value;
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

  set hostCatalogPort(value: ScreenHostCatalogPort | undefined) {
    if (this.#renderer !== undefined && value !== this.#hostCatalogPort) {
      this.emitLifecycleDiagnostic(
        'Host catalog port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#hostCatalogPort = value;
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
    this.#variableRuntime.cancel();
    this.#scheduler.suspend();
    this.#renderer?.resetBlueprintVisibility();
    this.#document = value;
    this.compileBlueprint();
    if (value !== undefined) this.ensureSkeleton();
    this.initialize();
    this.#variableRuntime.start(undefined, false, true);
    // 新文档的策略集合：resume 会清掉挂起标记并按当前文档重建定时器。
    this.#scheduler.resume();
    if (value === undefined) {
      this.clearSkeleton();
    } else if (this.#blueprintPlan === undefined) {
      // 蓝图编译失败时不会再有渲染，骨架不能永久停在加载态。
      this.markRendered();
    }
  }

  connectedCallback(): void {
    this.ensureSkeleton();
    this.initialize();
    this.#variableRuntime.start(undefined, false, true);
    this.#scheduler.resume();
  }

  disconnectedCallback(): void {
    this.#scheduler.suspend();
    this.#variableRuntime.cancel();
    this.#renderer?.clear();
  }

  unload(): void {
    this.#scheduler.dispose();
    this.#variableRuntime.reset();
    this.#variableHandles.clear();
    this.disposeRenderer();
    this.#document = undefined;
    this.compileBlueprint();
    this.#rendered = false;
  }

  refreshData(componentId?: string): void;
  refreshData(options: BaseScreenViewerRefreshOptions): void;
  refreshData(componentIdOrOptions?: string | BaseScreenViewerRefreshOptions): void {
    this.#variableRuntime.refreshData(componentIdOrOptions);
  }

  refreshVariables(options?: ScreenVariableRefreshOptions): void {
    this.#variableRuntime.refreshVariables(options);
  }

  /** 宿主告警/视觉状态变化后只重算条件样式，不重新取数、不改文档。 */
  refreshConditionalStyles(componentIds?: readonly string[]): void {
    this.#renderer?.refreshConditionalStyles(componentIds);
  }

  getVariable(id: string): ScreenVariableHandle | undefined {
    return this.#variableHandles.get(id);
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
      // 查看器是最终展示面：单个组件的 schema/binding 错误不应让整屏空白。
      // 坏组件被跳过，诊断随 render 结果返回并经 base-screen-diagnostic 交给宿主。
      componentFailurePolicy: 'skip',
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
      ...(this.#datasetPort === undefined ? {} : { datasetPort: this.#datasetPort }),
      ...(this.#hostCatalogPort === undefined ? {} : { hostCatalogPort: this.#hostCatalogPort }),
      onDataSourceSettled: (dataSourceId) =>
        this.#variableRuntime.handleDataSourceSettled(dataSourceId),
      ...(this.#conditionalStylePort === undefined
        ? {}
        : { conditionalStylePort: this.#conditionalStylePort }),
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

  /**
   * 首帧骨架：元素已上屏但 catalog/文档还没到时先铺满查看区，避免白屏。
   * 已经渲染过文档（例如热更新后重连）不再重置为加载态。
   */
  private ensureSkeleton(): void {
    if (this.#rendered || this.#skeleton !== undefined) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (this.#skeletonStyle === undefined) {
      this.#skeletonStyle = createViewerSkeletonStyle(this.ownerDocument);
      shadow.appendChild(this.#skeletonStyle);
    }
    this.#skeleton = createViewerSkeleton(this.ownerDocument);
    shadow.appendChild(this.#skeleton);
    this.setAttribute('data-viewer-state', 'loading');
    this.setAttribute('aria-busy', 'true');
  }

  /** 首次渲染落定（成功或失败）后撤掉骨架，之后的重渲染不再回到加载态。 */
  private markRendered(): void {
    this.#rendered = true;
    this.clearSkeleton();
    if (!this.isConnected) return;
    this.setAttribute('data-viewer-state', 'ready');
    this.removeAttribute('aria-busy');
  }

  private clearSkeleton(): void {
    this.#skeleton?.remove();
    this.#skeleton = undefined;
  }

  private disposeRenderer(): void {
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#mount?.remove();
    this.#mount = undefined;
    // 骨架挂在 Shadow Root 上，与挂载根相互独立，重连时由 ensureSkeleton 重建。
    this.clearSkeleton();
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

  private handleMaterialEvent(event: {
    readonly componentId: string;
    readonly name: string;
    readonly payload: ScreenJsonValue;
  }): void {
    this.handleBlueprintEvent({
      type: 'material-event',
      componentId: event.componentId,
      name: event.name,
      payload: event.payload,
    });
  }

  private handleBlueprintEvent(event: ScreenBlueprintEvent, depth = 0): void {
    if (this.#blueprintPlan === undefined || this.#blueprintVariables === undefined) return;
    if (depth > 32) {
      this.emitLifecycleDiagnostic('Blueprint variable event cycle exceeded its limit.');
      return;
    }
    const previousVariables = this.#blueprintVariables;
    const result = dispatchScreenBlueprintEvent(this.#blueprintPlan, previousVariables, event);
    if (!result.ok) {
      this.emitLifecycleDiagnostic('Blueprint event payload is invalid.');
      return;
    }
    const renderer = this.#renderer;
    const document = this.#document;
    // 派生变量的写入在这里统一回滚：蓝图分发不做权限判断（它不知道文档），
    // 落地前把不可写变量的改动还原，避免「先写进去、下次刷新再丢掉」。
    const guarded = {
      ...result.value,
      variables: applyVariableWriteGuard(document, previousVariables, result.value.variables),
    };
    const changedVariables = this.writeBlueprintVariables(guarded.variables, false);
    if (renderer !== undefined && document !== undefined) {
      const diagnostics = applyBlueprintDispatchToRenderer(
        renderer,
        document,
        previousVariables,
        guarded,
      );
      if (diagnostics.length > 0) this.emitDiagnostics(diagnostics);
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
    for (const componentId of result.value.componentDataRequests) {
      renderer?.refreshData(componentId);
    }
    if (result.value.variableRequests.length > 0) {
      this.#variableRuntime.refreshVariables({
        variableIds: [...new Set(result.value.variableRequests)],
      });
    }
    for (const variableId of changedVariables) {
      this.handleBlueprintEvent(
        {
          type: 'variable-event',
          variableId,
          name: 'data-updated',
          payload: result.value.variables[variableId] ?? null,
        },
        depth + 1,
      );
    }
  }

  private setVariableValue(id: string, value: ScreenJsonValue): ScreenParseResult<null> {
    const parsed = parseScreenJsonValue(value);
    if (!parsed.ok) return parsed;
    const renderer = this.#renderer;
    const document = this.#document;
    const previous = this.#blueprintVariables;
    const entry = document?.variables.find((variable) => variable.id === id);
    if (
      renderer === undefined ||
      document === undefined ||
      previous === undefined ||
      entry === undefined
    ) {
      return lifecycleFailure('Viewer variable is unavailable.');
    }
    // 与 `handle.set` 同一道校验：受控变量不接受外部写入，蓝图动作也不例外。
    const forbidden = checkViewerVariableWritable(entry);
    if (forbidden !== undefined) return forbidden;
    if (viewerVariableValuesEqual(previous[id], parsed.value)) {
      return { ok: true, value: null, diagnostics: [] };
    }
    const variables = { ...previous, [id]: parsed.value };
    const applied = renderer.setVariables(variables);
    if (!applied.ok) return applied;
    const rendered = renderer.render(document, { trigger: 'variable' });
    if (!rendered.ok) {
      renderer.setVariables(previous);
      return rendered;
    }
    this.writeBlueprintVariables(variables, false);
    this.handleBlueprintEvent({
      type: 'variable-event',
      variableId: id,
      name: 'data-updated',
      payload: parsed.value,
    });
    return { ok: true, value: null, diagnostics: rendered.diagnostics };
  }

  private writeBlueprintVariables(
    variables: ScreenJsonObject,
    emitEvents = false,
  ): readonly string[] {
    const previous = this.#blueprintVariables;
    this.#blueprintVariables = variables;
    if (previous === undefined) return [];
    const changed = this.#variableHandles.notify(previous, variables);
    if (emitEvents) {
      for (const variableId of changed) {
        this.handleBlueprintEvent({
          type: 'variable-event',
          variableId,
          name: 'data-updated',
          payload: variables[variableId] ?? null,
        });
      }
    }
    return changed;
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
