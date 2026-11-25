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
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '../renderer/renderer.js';
import type { BaseScreenComponentStateChange } from '../renderer/renderer-component-states.js';
import type { BaseScreenCanvasChange } from '../sub-canvas-layer.js';
import { applyBlueprintDispatchToRenderer } from './viewer-blueprint-runtime.js';
import { ViewerBlueprintTimerScheduler } from './viewer-blueprint-timer-scheduler.js';
import {
  type BaseScreenViewerConfiguration,
  type BaseScreenViewerRefreshOptions,
  parseBaseScreenViewerConfiguration,
} from './viewer-configuration.js';
import { isBaseScreenMaterialCatalog } from './viewer-configuration-guards.js';
import { ViewerDataSourceScheduler } from './viewer-data-source-scheduler.js';
import { lifecycleFailure } from './viewer-lifecycle.js';
import { createViewerSkeleton, createViewerSkeletonStyle } from './viewer-skeleton.js';
import { createViewerStaleStyle } from './viewer-stale-style.js';
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
  /** 推送过期角标样式；排在挂载根之后，Shadow Root 的首个元素仍是挂载根。 */
  #staleStyle: HTMLStyleElement | undefined;
  #rendered = false;
  /** 当前文档是否已发射过 `lifecycle:ready`；装载/替换时重新武装，变量刷新不重复。 */
  #lifecycleReadyFired = false;
  /** 正在分发的蓝图事件深度；分发期间产生的从画布事件排队，结束后按深度 +1 再分发。 */
  #dispatchDepth: number | undefined;
  #pendingCanvasEvents: BaseScreenCanvasChange[] = [];
  /** 分发期间产生的组件状态改变（ADR-0110）同样排队，结束后按深度 +1 再分发。 */
  #pendingStateEvents: ScreenBlueprintEvent[] = [];
  /** 宿主指定的起始页（ADR-0109 §2.3）。 */
  #initialPageId: string | undefined;
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
    onDocumentRendered: () => this.fireLifecycleReady(),
  });
  readonly #scheduler = new ViewerDataSourceScheduler({
    readRenderer: () => this.#renderer,
    readDocument: () => this.#document,
  });
  readonly #blueprintTimers = new ViewerBlueprintTimerScheduler({
    dispatch: (intervalSeconds) =>
      this.handleBlueprintEvent({ type: 'timer', name: 'tick', intervalSeconds, payload: null }),
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
    this.#contributionIndex = value.runtimeContributions;
    this.#blueprintRuntimePort = value.blueprintRuntimePort;
    this.#blueprintHostActionPort = value.blueprintHostActionPort;
    this.#resourceTimeoutMs = value.resourceTimeoutMs;
    this.#instanceId = value.instanceId ?? 'viewer';
    this.#mode = value.mode ?? 'viewer';
    this.#observer = value.observer;
    this.#projectId = value.projectId;
    this.#documentRevision = value.documentRevision;
    this.#initialPageId = value.initialPageId;
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
    this.#renderer?.resetComponentStates();
    this.#document = value;
    // 装载/替换重新武装 ready：新文档首个成功渲染再发一次；同一文档的变量刷新不重置。
    this.#lifecycleReadyFired = false;
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
    // 断开期间定时器全部停止，重连按当前计划重新挂载（相位从头开始，不补跑）。
    this.syncBlueprintTimers();
  }

  disconnectedCallback(): void {
    this.#scheduler.suspend();
    this.#variableRuntime.cancel();
    this.#renderer?.clear();
    this.#blueprintTimers.stop();
  }

  unload(): void {
    this.#scheduler.dispose();
    this.#variableRuntime.reset();
    this.#variableHandles.clear();
    this.disposeRenderer();
    this.#document = undefined;
    this.#lifecycleReadyFired = false;
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

  /** 组件当前生效的状态 id（ADR-0110，`default` 为默认）；未挂载返回 undefined。 */
  readComponentState(componentId: string): string | undefined {
    return this.#renderer?.readComponentState(componentId)?.stateId;
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
    this.#staleStyle = createViewerStaleStyle(this.ownerDocument);
    shadow.appendChild(this.#staleStyle);
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
      ...(this.#initialPageId === undefined ? {} : { initialPageId: this.#initialPageId }),
      onCanvasChange: (change) => {
        this.dispatchEvent(
          new CustomEvent('base-screen-canvas-change', {
            bubbles: true,
            composed: true,
            detail: change,
          }),
        );
        // 从画布事件（ADR-0109）：蓝图动作引起的变化排到本次分发之后，其余（遮罩、Esc、宿主）直接分发。
        if (this.#dispatchDepth === undefined) {
          this.handleBlueprintEvent(canvasBlueprintEvent(change));
        } else {
          this.#pendingCanvasEvents.push(change);
        }
      },
      onComponentStateChange: (change) => {
        this.dispatchEvent(
          new CustomEvent('base-screen-component-state-change', {
            bubbles: true,
            composed: true,
            detail: change,
          }),
        );
        const event = componentStateBlueprintEvent(change);
        if (this.#dispatchDepth === undefined) this.handleBlueprintEvent(event);
        else this.#pendingStateEvents.push(event);
      },
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
    // 样式节点一并撤掉：骨架消失后 Shadow Root 的第一个元素必须是渲染挂载根，
    // 否则宿主/验证脚本按 firstElementChild 取挂载根会拿到骨架样式。
    this.#skeletonStyle?.remove();
    this.#skeletonStyle = undefined;
  }

  private disposeRenderer(): void {
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#mount?.remove();
    this.#mount = undefined;
    this.#staleStyle?.remove();
    this.#staleStyle = undefined;
    // 骨架挂在 Shadow Root 上，与挂载根相互独立，重连时由 ensureSkeleton 重建。
    this.clearSkeleton();
  }

  private compileBlueprint(): void {
    if (this.#document === undefined) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.#blueprintTimers.stop();
      return;
    }
    const compiled = compileScreenBlueprint(
      this.#document,
      this.#contributionIndex ?? { hasBlueprintCapability: () => false },
    );
    if (!compiled.ok) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.#blueprintTimers.stop();
      this.dispatchEvent(
        new CustomEvent('base-screen-diagnostic', {
          detail: { diagnostics: compiled.diagnostics },
        }),
      );
      return;
    }
    this.#blueprintPlan = compiled.value;
    this.#blueprintVariables = compiled.value.initialVariables;
    this.syncBlueprintTimers();
  }

  /** 按当前计划的 timer 触发间隔增删间隔计时器；无 timer 规则时不创建任何计时器。 */
  private syncBlueprintTimers(): void {
    const plan = this.#blueprintPlan;
    if (plan === undefined) {
      this.#blueprintTimers.stop();
      return;
    }
    this.#blueprintTimers.sync(
      plan.rules.flatMap((rule) =>
        rule.trigger.type === 'timer' ? [rule.trigger.intervalSeconds] : [],
      ),
    );
  }

  /**
   * 文档就绪：每个文档装载/替换后的首个成功渲染发射一次 `lifecycle:ready`。
   * 与 Designer 的口径一致——编辑/变量导致的重渲染不重复发射，装载/替换在
   * document setter 里重新武装；蓝图编译失败（无计划）时不发射。
   */
  private fireLifecycleReady(): void {
    if (this.#blueprintPlan === undefined || this.#lifecycleReadyFired) return;
    this.#lifecycleReadyFired = true;
    this.handleBlueprintEvent({ type: 'lifecycle', name: 'ready', payload: null });
    // 先发实例就绪，再发起始页的「已打开」与「页面已切换」（ADR-0109 §2.3）。
    this.#renderer?.announceStartPage();
  }

  /** 当前页（ADR-0109）；文档没有页面或尚未渲染时为 null。 */
  get currentPage(): string | null {
    return this.#renderer?.currentPage ?? null;
  }

  /** 宿主打开从画布：页面 = 切页（先关全部弹框），弹框 = 打开浮层；返回是否发生了变化。 */
  openCanvas(canvasId: string, payload?: ScreenJsonValue): boolean {
    if (payload !== undefined && !parseScreenJsonValue(payload).ok) return false;
    return this.#renderer?.openCanvas(canvasId, payload, 'host') ?? false;
  }

  /** 宿主关闭从画布：弹框 = 关闭浮层，当前页 = 返回上一页。 */
  closeCanvas(canvasId: string): boolean {
    return this.#renderer?.closeCanvas(canvasId, 'host') ?? false;
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
    const outerDepth = this.#dispatchDepth;
    this.#dispatchDepth = depth;
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
    this.#dispatchDepth = outerDepth;
    const canvasEvents = this.#pendingCanvasEvents;
    this.#pendingCanvasEvents = [];
    const stateEvents = this.#pendingStateEvents;
    this.#pendingStateEvents = [];
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
    for (const change of canvasEvents) {
      this.handleBlueprintEvent(canvasBlueprintEvent(change), depth + 1);
    }
    for (const stateEvent of stateEvents) {
      this.handleBlueprintEvent(stateEvent, depth + 1);
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

/**
 * 从画布事件的负载：「已打开」带打开参数（未写参数时为 null），「已关闭」恒为 null；
 * 「页面已切换」带 `{ from, to }`。
 */
function canvasBlueprintEvent(change: BaseScreenCanvasChange): ScreenBlueprintEvent {
  if (change.type === 'page-changed') {
    return {
      type: 'page-changed',
      name: 'page-changed',
      payload: { from: change.from, to: change.to },
    };
  }
  return {
    type: 'canvas-event',
    canvasId: change.canvasId,
    name: change.open ? 'opened' : 'closed',
    payload: change.open ? (change.payload ?? null) : null,
  };
}

/** 组件状态改变的蓝图事件（ADR-0110 §2.3）：负载 `{ from, to, cause }`。 */
function componentStateBlueprintEvent(
  change: BaseScreenComponentStateChange,
): ScreenBlueprintEvent {
  return {
    type: 'component-state-changed',
    componentId: change.componentId,
    name: 'state-changed',
    payload: { from: change.from, to: change.to, cause: change.cause },
  };
}
