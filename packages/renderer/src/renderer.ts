import {
  normalizeScreenMaterialError,
  parseScreenDocument,
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenCanvas,
  type ScreenCanvasBackground,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourcePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenResourceExecutionContext,
  type ScreenResourceExecutionMode,
  type ScreenResourceExecutionTrigger,
  type ScreenResourceObserver,
} from '@base-screen/contracts';
import {
  evaluateScreenHostResourceParameters,
  getPainterOrder,
  isScreenComponentEffectivelyHidden,
  validateScreenHostResourceBinding,
} from '@base-screen/core';
import {
  type BaseScreenConditionalStylePort,
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialDataState,
  type BaseScreenMaterialElement,
  type BaseScreenMaterialMode,
  type BaseScreenMaterialModel,
  type BaseScreenRuntimeContributionIndex,
  parseBaseScreenMaterialEventDetail,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { ResourceRequestCoordinator } from './request-coordinator.js';
import {
  cancelResourceState,
  createMountedResourceState,
  getHostResourceKey,
  getProjectionKey,
  type MountedResourceState,
} from './resource-state.js';
import { evaluateScreenComponentStyleRules } from './style-rules.js';

export interface BaseScreenMaterialEvent {
  readonly componentId: string;
  readonly type: string;
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface CreateBaseScreenRendererOptions {
  readonly root: HTMLElement;
  readonly catalog: BaseScreenMaterialCatalog;
  readonly mode: BaseScreenMaterialMode;
  readonly interactive: boolean;
  readonly onMaterialEvent: ((event: BaseScreenMaterialEvent) => void) | undefined;
  readonly onDiagnostic?: (diagnostic: ScreenDiagnostic) => void;
  readonly resourcePort: ScreenHostResourcePort | undefined;
  /** ADR-0059 宿主条件样式端口：缺省时与既有渲染路径逐字节一致。 */
  readonly conditionalStylePort?: BaseScreenConditionalStylePort;
  readonly resourceTimeoutMs?: number;
  readonly contributionIndex?: BaseScreenRuntimeContributionIndex;
  readonly observer?: ScreenResourceObserver;
  readonly instanceId?: string;
  readonly executionMode?: ScreenResourceExecutionMode;
  /** 非持久化执行上下文附加信息（RB2）：提供时流入每次 resolve 与 observer 事件。 */
  readonly projectId?: string;
  readonly documentRevision?: string;
}

/** 单次解析的执行上下文（trigger/traceId 由调用方按操作派生，不复用可变全局状态）。 */
export type ResolveContext = {
  readonly trigger: ScreenResourceExecutionTrigger;
  readonly traceId: string;
};

export interface BaseScreenRenderer {
  render(
    document: ScreenDocument,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
  ): ScreenParseResult<null>;
  suspendData(): void;
  setVariables(variables: ScreenJsonObject): ScreenParseResult<null>;
  refreshData(componentId?: string, trigger?: 'manual' | 'polling', traceId?: string): void;
  /**
   * 切换实例级 interactive 状态：已渲染过文档时原地重渲染（复用已挂载物料与资源请求状态），
   * 未渲染时只记录状态供下一次 render 使用。Viewer 与 Designer 共用该入口。
   */
  setInteractive(enabled: boolean): ScreenParseResult<null>;
  clear(): void;
  dispose(): void;
}

export function createBaseScreenRenderer(
  options: CreateBaseScreenRendererOptions,
): BaseScreenRenderer {
  return new Renderer(options);
}

type RenderCandidate = {
  readonly component: ScreenComponentNode;
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly model: BaseScreenMaterialModel;
  readonly resource: ResolvedHostResource | undefined;
};

type ResolvedHostResource = {
  readonly key: string;
  readonly projectionKey: string;
  readonly params: ScreenJsonObject;
};

type MountedMaterial = {
  readonly type: string;
  readonly element: BaseScreenMaterialElement;
  readonly onEvent: (event: Event) => void;
  readonly resource: MountedResourceState;
};

// 组件级校验缓存：同一组件引用 + 同一 catalog entry 表示 props/style/styleRules
// 的 schema 校验结果可复用（文档不可变 + 结构共享，未变更组件跨 render 引用相同）。
// 每次渲染按当前文档重建缓存表，条目数以当前组件数为上界。
type CachedComponentValidation = {
  readonly entry: BaseScreenMaterialCatalogEntry;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
};

type ComponentValidationCache = { entries: Map<ScreenComponentNode, CachedComponentValidation> };

class Renderer implements BaseScreenRenderer {
  #mounted = new Map<string, MountedMaterial>();
  #candidates = new Map<string, RenderCandidate>();
  #document: ScreenDocument | undefined;
  // 上一次成功渲染的输入引用：作为增量 parse 的 base（P0-3 契约），
  // 相同引用直接复用上次解析输出，跳过整文档重解析。
  #lastValidatedInput: ScreenDocument | undefined;
  #validationCache: ComponentValidationCache = { entries: new Map() };
  #variables: ScreenJsonObject = {};
  #dataSuspended = false;
  #disposed = false;
  #interactive: boolean;
  #coordinator: ResourceRequestCoordinator | undefined;

  constructor(private readonly options: CreateBaseScreenRendererOptions) {
    this.#interactive = options.interactive;
    if (!isResourceTimeoutValid(options.resourceTimeoutMs ?? 15_000)) {
      throw new RangeError('resourceTimeoutMs must be an integer between 100 and 60000.');
    }
    if (options.resourcePort !== undefined) {
      this.#coordinator = new ResourceRequestCoordinator(
        options.resourcePort,
        (resourceType) =>
          options.contributionIndex?.getResourceType(resourceType)?.queryScope === 'resource',
        options.resourceTimeoutMs ?? 15_000,
        (key, componentId, context) =>
          this.emitObserver(
            'shared',
            key,
            componentId,
            undefined,
            context ?? this.defaultExecutionContext(),
            { startedAt: undefined },
          ),
      );
    }
  }

  render(
    document: ScreenDocument,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
  ): ScreenParseResult<null> {
    if (this.#disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    const parsedDocument =
      document === this.#lastValidatedInput && this.#document !== undefined
        ? ({ ok: true, value: this.#document, diagnostics: [] } as const)
        : parseScreenDocument(document, this.#lastValidatedInput);
    if (!parsedDocument.ok) {
      return parsedDocument;
    }
    const prepared = prepareCandidates(
      parsedDocument.value,
      this.options.catalog,
      this.options.mode,
      this.#interactive,
      this.options.contributionIndex,
      this.#variables,
      this.#dataSuspended,
      this.#validationCache,
    );
    if (!prepared.ok) {
      return prepared;
    }
    const painterIndex = new Map(
      getPainterOrder(parsedDocument.value).map((componentId, index) => [componentId, index]),
    );
    const candidates = [...prepared.value].sort(
      (left, right) => painterIndex.get(left.component.id)! - painterIndex.get(right.component.id)!,
    );
    const next = new Map<string, MountedMaterial>();
    const runtimeDiagnostics: ScreenDiagnostic[] = [];
    // First resolves for newly mounted components (and for existing mounts that
    // change raw identity) are deferred until #mounted/#candidates/#document are
    // committed below. Starting them earlier would let a synchronous terminal
    // path (missing resource port or a synchronously throwing resolve) be
    // rejected by applyResourceResult's mount-identity guard, leaving the
    // material stuck in loading with a live timer until timeout.
    const pendingResolves: {
      readonly candidate: RenderCandidate;
      readonly mounted: MountedMaterial;
    }[] = [];
    for (const candidate of candidates) {
      const stackOrder = painterIndex.get(candidate.component.id)!;
      const existing = this.#mounted.get(candidate.component.id);
      if (existing !== undefined && existing.type === candidate.component.type) {
        try {
          const toResolve = this.reconcileMountedMaterial(
            candidate,
            existing,
            parsedDocument.value,
            stackOrder,
          );
          if (toResolve !== undefined) {
            pendingResolves.push({ candidate: toResolve, mounted: existing });
          }
        } catch {
          runtimeDiagnostics.push(
            renderFailure(candidate, 'Material model update raised an exception.'),
          );
        }
        next.set(candidate.component.id, existing);
        continue;
      }
      if (existing !== undefined) {
        // Material type replacement on the same component id: tear down the
        // previous mount exactly once (cancel, detach listener, remove element)
        // so no resource or DOM for the old type leaks behind the new one.
        this.cancelHostResource(existing, candidate.component.id);
        existing.element.removeEventListener('base-screen-material-event', existing.onEvent);
        existing.element.remove();
      }
      let element: BaseScreenMaterialElement;
      try {
        element = new candidate.entry.constructor() as BaseScreenMaterialElement;
      } catch {
        runtimeDiagnostics.push(
          renderFailure(candidate, 'Material constructor raised an exception.'),
        );
        continue;
      }
      const onEvent = (event: Event): void => this.handleMaterialEvent(candidate, event);
      element.addEventListener('base-screen-material-event', onEvent);
      try {
        applyMaterial(
          element,
          candidate.component,
          parsedDocument.value,
          this.#resolveEffectiveModel(candidate, candidate.model.dataState),
          isScreenComponentEffectivelyHidden(parsedDocument.value, candidate.component.id),
          stackOrder,
        );
      } catch {
        runtimeDiagnostics.push(renderFailure(candidate, 'Material render raised an exception.'));
        continue;
      }
      this.options.root.appendChild(element);
      element.style.display = isScreenComponentEffectivelyHidden(
        parsedDocument.value,
        candidate.component.id,
      )
        ? 'none'
        : 'block';
      const mounted: MountedMaterial = {
        type: candidate.component.type,
        element,
        onEvent,
        resource: createMountedResourceState(),
      };
      mounted.resource.dataState = candidate.model.dataState;
      next.set(candidate.component.id, mounted);
      if (candidate.resource !== undefined) {
        pendingResolves.push({ candidate, mounted });
      }
    }
    for (const [componentId, mounted] of this.#mounted) {
      if (!next.has(componentId)) {
        this.cancelHostResource(mounted, componentId);
        mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
        mounted.element.remove();
      }
    }
    this.options.root.style.position = 'relative';
    this.options.root.style.width = `${parsedDocument.value.canvas.width}px`;
    this.options.root.style.height = `${parsedDocument.value.canvas.height}px`;
    applyCanvasBackground(this.options.root, parsedDocument.value.canvas);
    this.#mounted = next;
    this.#candidates = new Map(candidates.map((candidate) => [candidate.component.id, candidate]));
    this.#document = parsedDocument.value;
    // 整次 render 共享同一份按操作派生的上下文（RB2）：resolve 与它的全部
    // observer 事件使用同一 context 对象数据，且不被其他组件消费/重置。
    const renderContext: ResolveContext = {
      trigger: context?.trigger ?? 'manual',
      traceId: context?.traceId ?? '',
    };
    for (const { candidate, mounted } of pendingResolves) {
      void this.resolveHostResource(candidate, mounted, renderContext);
    }
    if (runtimeDiagnostics.length > 0) {
      for (const diagnostic of runtimeDiagnostics) {
        this.options.onDiagnostic?.(diagnostic);
      }
    }
    return { ok: true, value: null, diagnostics: runtimeDiagnostics };
  }

  setVariables(variables: ScreenJsonObject): ScreenParseResult<null> {
    const parsed = parseScreenJsonValue(variables, { maxBytes: 2 * 1024 * 1024 });
    if (
      !parsed.ok ||
      parsed.value === null ||
      Array.isArray(parsed.value) ||
      typeof parsed.value !== 'object'
    ) {
      return failure('HOST_DATASET_VARIABLE_INVALID', [], 'Runtime variables are invalid.');
    }
    this.#variables = parsed.value as ScreenJsonObject;
    this.#dataSuspended = false;
    return { ok: true, value: null, diagnostics: [] };
  }

  setInteractive(enabled: boolean): ScreenParseResult<null> {
    if (this.#disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    if (this.#interactive === enabled) {
      return { ok: true, value: null, diagnostics: [] };
    }
    this.#interactive = enabled;
    if (this.#document === undefined) {
      return { ok: true, value: null, diagnostics: [] };
    }
    // 原地重渲染：同 type 同 id 的挂载按 reconcile 路径复用元素与资源请求状态，
    // 仅更新模型（interactive 字段），不重挂载、不重取数、不闪烁。
    return this.render(this.#document);
  }

  /**
   * Tears down a mounted component's host request: bumps its generation, removes
   * the shared-coordinator subscription by its opaque slot id (last consumer
   * leaving aborts the host request) and clears any in-flight marker.
   */
  private cancelHostResource(mounted: MountedMaterial, componentId: string): void {
    const key = mounted.resource.resourceKey;
    const slotId = mounted.resource.requestSlotId;
    const context = mounted.resource.executionContext ?? this.defaultExecutionContext();
    cancelResourceState(mounted.resource);
    if (key !== undefined) {
      if (slotId !== undefined) this.#coordinator?.release(slotId, componentId);
      this.emitObserver('aborted', key, componentId, undefined, context, {
        startedAt: undefined,
      });
    }
  }

  /** 观察事件只携带身份/上下文/耗时/可选计数与稳定码；观察者异常被隔离。 */
  private emitObserver(
    type: 'started' | 'shared' | 'succeeded' | 'failed' | 'aborted' | 'timed-out' | 'adapted',
    key: string,
    componentId: string,
    requestId: string | undefined,
    context: ScreenResourceExecutionContext,
    meta: {
      readonly startedAt: number | undefined;
      readonly fieldCount?: number | undefined;
      readonly rowCount?: number | undefined;
      readonly code?: string | undefined;
    },
  ): void {
    const observer = this.options.observer;
    if (observer === undefined) return;
    const [resourceType, resourceId] = key.split('\u0000');
    try {
      observer({
        type,
        requestId: requestId ?? `${componentId}:${key}:cancel`,
        componentId,
        resourceType: resourceType ?? key,
        resourceId: resourceId ?? '',
        context,
        durationMs: meta.startedAt === undefined ? 0 : Date.now() - meta.startedAt,
        ...(meta.fieldCount === undefined ? {} : { fieldCount: meta.fieldCount }),
        ...(meta.rowCount === undefined ? {} : { rowCount: meta.rowCount }),
        ...(meta.code === undefined ? {} : { code: meta.code }),
      });
    } catch {
      // 观察者异常被隔离，不得中断解析。
    }
  }

  /** 无上下文可追溯时的稳定默认执行上下文。 */
  private defaultExecutionContext(): ScreenResourceExecutionContext {
    return {
      instanceId: this.options.instanceId ?? 'renderer',
      mode: this.options.executionMode ?? 'viewer',
      trigger: 'manual',
      traceId: '',
    };
  }

  suspendData(): void {
    this.#dataSuspended = true;
    this.#coordinator?.abortAll();
    for (const [componentId, mounted] of this.#mounted) {
      const resource = mounted.resource;
      cancelResourceState(resource);
      resource.resourceKey = undefined;
      resource.projectionKey = undefined;
      resource.rawValue = undefined;
      resource.requestSlotId = undefined;
      resource.dataState = { status: 'loading' };
      const candidate = this.#candidates.get(componentId);
      if (candidate !== undefined && candidate.resource !== undefined) {
        mounted.element.model = { ...candidate.model, dataState: { status: 'loading' } };
      }
    }
  }

  refreshData(componentId?: string, trigger?: 'manual' | 'polling', traceId?: string): void {
    // 每次 refresh 操作派生一份上下文，逐组件传给 resolve（RB2）：全量刷新中
    // 任一组件都不会消费/重置其他组件的 trigger 或 trace。
    const refreshContext: ResolveContext = {
      trigger: trigger === 'polling' ? 'polling' : 'manual',
      traceId: traceId ?? '',
    };
    for (const [id, candidate] of this.#candidates) {
      if (componentId !== undefined && componentId !== id) continue;
      const mounted = this.#mounted.get(id);
      if (mounted !== undefined && candidate.resource !== undefined) {
        void this.resolveHostResource(candidate, mounted, refreshContext, true);
      }
    }
  }

  clear(): void {
    this.#coordinator?.abortAll();
    for (const mounted of this.#mounted.values()) {
      cancelResourceState(mounted.resource);
      mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
      mounted.element.remove();
    }
    this.#mounted.clear();
    this.#candidates.clear();
    this.#document = undefined;
    this.#lastValidatedInput = undefined;
    this.#validationCache.entries.clear();
  }

  dispose(): void {
    if (!this.#disposed) {
      this.clear();
      this.#disposed = true;
    }
  }

  /**
   * Reconciles an already-mounted material. Returns the candidate whose first
   * resolve must be started after the render commit (new raw identity), or
   * undefined when no resolve should start. Starting the resolve here would run
   * before `#mounted`/`#candidates` are committed, so a synchronous terminal
   * path could never apply to the current mount.
   */
  private reconcileMountedMaterial(
    candidate: RenderCandidate,
    mounted: MountedMaterial,
    document: ScreenDocument,
    stackOrder: number,
  ): RenderCandidate | undefined {
    const resource = candidate.resource;
    const resourceState = mounted.resource;
    if (resource === undefined) {
      // Data source removed (or parameters became unevaluable): cancel the old
      // generation exactly once, clear the raw/projection keys and retained raw
      // value, and let the candidate dataState (idle/static/error) win.
      this.cancelHostResource(mounted, candidate.component.id);
      resourceState.resourceKey = undefined;
      resourceState.projectionKey = undefined;
      resourceState.rawValue = undefined;
      resourceState.requestSlotId = undefined;
      resourceState.dataState = candidate.model.dataState;
      this.applyMountedModel(candidate, mounted, document, stackOrder);
      return undefined;
    }
    if (resourceState.resourceKey !== resource.key) {
      // New raw identity: the render loop starts the resolve after the commit.
      resourceState.rawValue = undefined;
      resourceState.dataState = { status: 'loading' };
      this.applyMountedModel(candidate, mounted, document, stackOrder);
      return candidate;
    }
    // Same raw identity: preserve the in-flight request, controller, timer,
    // generation, retained raw value and current dataState. Unrelated edits must
    // neither abort nor re-fetch. A projection/binding-only change re-validates
    // and re-adapts locally from the retained raw value with zero host resolves.
    if (resourceState.projectionKey !== resource.projectionKey) {
      if (resourceState.rawValue !== undefined) {
        resourceState.dataState = this.adaptResourceResult(candidate, resourceState.rawValue);
      }
      resourceState.projectionKey = resource.projectionKey;
    }
    this.applyMountedModel(candidate, mounted, document, stackOrder);
    return undefined;
  }

  private applyMountedModel(
    candidate: RenderCandidate,
    mounted: MountedMaterial,
    document: ScreenDocument,
    stackOrder: number,
  ): void {
    applyMaterial(
      mounted.element,
      candidate.component,
      document,
      this.#resolveEffectiveModel(candidate, mounted.resource.dataState),
      isScreenComponentEffectivelyHidden(document, candidate.component.id),
      stackOrder,
    );
  }

  private handleMaterialEvent(candidate: RenderCandidate, event: Event): void {
    if (
      event.bubbles !== true ||
      event.composed !== true ||
      event.type !== 'base-screen-material-event'
    ) {
      return;
    }
    // 闭包捕获的 candidate 只用于定位组件；interactive/manifest 校验必须读取最近一次
    // render 的候选，否则 setInteractive 重渲染后事件仍按旧模型裁决（可能被错误门控）。
    const current = this.#candidates.get(candidate.component.id) ?? candidate;
    if (current.model.interactive !== true) {
      return;
    }
    const parsed = parseBaseScreenMaterialEventDetail((event as CustomEvent<unknown>).detail);
    if (!parsed.ok || !current.entry.manifest.events.includes(parsed.value.name)) {
      return;
    }
    event.stopPropagation();
    try {
      this.options.onMaterialEvent?.({
        componentId: current.component.id,
        type: current.component.type,
        name: parsed.value.name,
        payload: parsed.value.payload,
      });
    } catch {
      this.options.onDiagnostic?.({
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', current.component.id],
        message: 'Host material event callback raised an exception.',
      });
    }
  }

  private async resolveHostResource(
    candidate: RenderCandidate,
    mounted: MountedMaterial,
    context: ResolveContext,
    refresh = false,
  ): Promise<void> {
    const source = candidate.component.dataSource;
    const resource = candidate.resource;
    if (source === null || source.type !== 'host-resource' || resource === undefined) {
      return;
    }
    const resourceState = mounted.resource;
    if (
      refresh &&
      this.#coordinator !== undefined &&
      resourceState.requestSlotId !== undefined &&
      this.#coordinator.isPending(resourceState.requestSlotId)
    ) {
      // 同一组件同一 raw identity 已在该组件的槽位上 in-flight：合并，不取消后
      // 重启。槽位按组件独立（未声明共享时），因此不会把不同组件的相同 raw
      // key 请求错误合并。
      return;
    }
    // Raw identity 变化（或上次请求已结束）时离开旧槽位：按不透明槽位 ID 释放，
    // 最后一个消费者离开会 abort 旧宿主请求。
    if (resourceState.requestSlotId !== undefined) {
      this.#coordinator?.release(resourceState.requestSlotId, candidate.component.id);
    }
    cancelResourceState(resourceState);
    const generation = resourceState.resourceGeneration;
    resourceState.resourceKey = resource.key;
    resourceState.projectionKey = resource.projectionKey;
    // 按次解析的执行上下文：resolve、宿主端口与它的全部 observer 事件共享同一
    // 对象数据，且为本次操作独立派生（RB2）。
    const executionContext: ScreenResourceExecutionContext = {
      instanceId: this.options.instanceId ?? 'renderer',
      mode: this.options.executionMode ?? 'viewer',
      trigger: context.trigger,
      traceId: context.traceId,
      ...(this.options.projectId === undefined ? {} : { projectId: this.options.projectId }),
      ...(this.options.documentRevision === undefined
        ? {}
        : { documentRevision: this.options.documentRevision }),
    };
    resourceState.executionContext = executionContext;
    const requestId = `${candidate.component.id}:${resource.key}:${generation}`;
    const startedAt = Date.now();
    if (this.options.resourcePort === undefined) {
      this.emitObserver(
        'started',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
        },
      );
      resourceState.rawValue = undefined;
      this.applyResourceResult(candidate.component.id, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_UNAVAILABLE',
        message: 'Host resource port is unavailable.',
      });
      this.emitObserver(
        'failed',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          code: 'HOST_RESOURCE_UNAVAILABLE',
        },
      );
      return;
    }
    try {
      const { resolution, shared, slotId } = this.#coordinator!.request(
        resource.key,
        source.resourceType,
        candidate.component.id,
        {
          componentId: candidate.component.id,
          resourceType: source.resourceType,
          resourceId: source.resourceId,
          params: resource.params,
        },
        executionContext,
      );
      resourceState.requestSlotId = slotId;
      if (!shared) {
        // 共享请求在首个消费者处发 started；后续消费者只发 shared（coordinator 回调）。
        this.emitObserver(
          'started',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
          },
        );
      }
      const resolutionValue = await resolution;
      if (resolutionValue.kind === 'timeout') {
        resourceState.rawValue = undefined;
        this.applyResourceResult(candidate.component.id, mounted, generation, {
          status: 'error',
          code: 'HOST_RESOURCE_TIMEOUT',
          message: 'Host resource request timed out.',
        });
        this.emitObserver(
          'timed-out',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
            code: 'HOST_RESOURCE_TIMEOUT',
          },
        );
        return;
      }
      if (resolutionValue.kind === 'failure') {
        resourceState.rawValue = undefined;
        // The host safe-failure diagnostic is normalized at the material state
        // boundary: frozen codes (access-denied/unavailable/valid dataset codes)
        // survive, unknown or internal codes collapse to HOST_RESOURCE_FAILED,
        // and the host path or raw message never reaches the material - for a
        // non-frozen code its message is discarded along with the code.
        const hostError = normalizeScreenMaterialError(resolutionValue.diagnostics.diagnostics[0]);
        this.applyResourceResult(candidate.component.id, mounted, generation, {
          status: 'error',
          code: hostError.code,
          message: hostError.message,
        });
        this.emitObserver(
          'failed',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
            code: hostError.code,
          },
        );
        return;
      }
      const value = parseScreenJsonValue(resolutionValue.value, { maxBytes: 1024 * 1024 });
      if (!value.ok) {
        resourceState.rawValue = undefined;
        this.applyResourceResult(candidate.component.id, mounted, generation, {
          status: 'error',
          code: 'HOST_RESOURCE_INVALID',
          message: 'Host resource returned invalid JSON.',
        });
        this.emitObserver(
          'failed',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
            code: 'HOST_RESOURCE_INVALID',
          },
        );
        return;
      }
      if (
        this.#disposed ||
        this.#mounted.get(candidate.component.id) !== mounted ||
        resourceState.resourceGeneration !== generation
      ) {
        return;
      }
      resourceState.rawValue = value.value;
      const current = this.#candidates.get(candidate.component.id) ?? candidate;
      const adapted = this.adaptResourceResult(current, value.value);
      this.applyResourceResult(candidate.component.id, mounted, generation, adapted);
      if (adapted.status === 'ready') {
        const tabular = isTabularValue(adapted.value)
          ? (adapted.value as {
              readonly fields: readonly unknown[];
              readonly rows: readonly unknown[];
            })
          : undefined;
        this.emitObserver(
          'succeeded',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
            fieldCount: tabular?.fields.length,
            rowCount: tabular?.rows.length,
          },
        );
        this.emitObserver(
          'adapted',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
            fieldCount: tabular?.fields.length,
            rowCount: tabular?.rows.length,
          },
        );
      } else {
        this.emitObserver(
          'failed',
          resource.key,
          candidate.component.id,
          requestId,
          executionContext,
          {
            startedAt,
            ...('code' in adapted ? { code: adapted.code } : {}),
          },
        );
      }
    } catch {
      this.applyResourceResult(candidate.component.id, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_FAILED',
        message: 'Host resource request failed.',
      });
      this.emitObserver(
        'failed',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          code: 'HOST_RESOURCE_FAILED',
        },
      );
    }
  }

  private adaptResourceResult(
    candidate: RenderCandidate,
    value: ScreenJsonValue,
  ): BaseScreenMaterialDataState {
    const source = candidate.component.dataSource;
    if (source === null || source.type !== 'host-resource' || source.binding === null) {
      return { status: 'ready', value };
    }
    const dataset = parseScreenTabularDataset(value);
    if (!dataset.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: 'Host dataset is invalid.',
      };
    }
    const declaration = candidate.entry.manifest.dataBinding;
    const adapter = candidate.entry.tabularDataAdapter;
    if (declaration === undefined || adapter === undefined) {
      return {
        status: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        message: 'Host dataset binding is invalid.',
      };
    }
    const binding = validateScreenHostResourceBinding(
      source.binding,
      dataset.value.fields,
      declaration.roles,
    );
    if (!binding.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        message: 'Host dataset binding is invalid.',
      };
    }
    try {
      const adapted = adapter.adapt({ dataset: dataset.value, fields: binding.value.fields });
      if (!adapted.ok) {
        return {
          status: 'error',
          code: 'HOST_DATASET_ADAPTER_FAILED',
          message: 'Host dataset adapter failed.',
        };
      }
      const parsed = parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
      if (!parsed.ok) {
        return {
          status: 'error',
          code: 'HOST_DATASET_ADAPTER_FAILED',
          message: 'Host dataset adapter failed.',
        };
      }
      return { status: 'ready', value: parsed.value };
    } catch {
      this.options.onDiagnostic?.(
        diagnostic(
          'PLUGIN_CORE_RENDER_FAILED',
          ['components', candidate.component.id, 'dataSource', 'binding'],
          'Material dataset adapter raised an exception.',
        ),
      );
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: 'Host dataset adapter failed.',
      };
    }
  }

  private applyResourceResult(
    componentId: string,
    mounted: MountedMaterial,
    generation: number,
    dataState: BaseScreenMaterialDataState,
  ): void {
    const resourceState = mounted.resource;
    if (
      this.#disposed ||
      this.#mounted.get(componentId) !== mounted ||
      resourceState.resourceGeneration !== generation
    ) {
      return;
    }
    resourceState.dataState = dataState;
    const current = this.#candidates.get(componentId);
    if (current !== undefined) {
      mounted.element.model = this.#resolveEffectiveModel(current, dataState);
    }
  }

  /**
   * ADR-0058/0059：candidate.model.style 始终为 canonical 基础样式；effective style 按当前
   * dataState 求值派生，合并顺序固定 base → 命中 styleRules → conditionalStylePort 覆盖
   * （同键后写覆盖先写），不回写文档。端口覆盖 fail-closed：非法覆盖（styleSchema 校验
   * 不过）与 resolve 抛异常都忽略端口覆盖、保留 base+规则结果并上报诊断，不中断渲染。
   */
  #resolveEffectiveModel(
    candidate: RenderCandidate,
    dataState: BaseScreenMaterialDataState,
  ): BaseScreenMaterialModel {
    const ruleOverrides = evaluateScreenComponentStyleRules(
      candidate.component.styleRules,
      dataState,
    );
    let style =
      ruleOverrides === undefined
        ? candidate.model.style
        : { ...candidate.model.style, ...ruleOverrides };
    const port = this.options.conditionalStylePort;
    if (port !== undefined) {
      const overrides = this.#callConditionalStylePort(port, candidate.component.id, dataState);
      if (overrides !== undefined) {
        const validated = validateBaseScreenMaterialStyle(
          { ...style, ...overrides },
          candidate.entry.manifest.styleSchema,
        );
        if (validated.ok) {
          style = validated.value;
        } else {
          for (const item of prefixDiagnostics(validated.diagnostics, [
            'components',
            candidate.component.id,
            'conditionalStyle',
          ])) {
            this.options.onDiagnostic?.(item);
          }
        }
      }
    }
    return { ...candidate.model, dataState, style };
  }

  /** 端口异常隔离（ADR-0059）：忽略本次覆盖并上报诊断，不影响其他组件与整次渲染。 */
  #callConditionalStylePort(
    port: BaseScreenConditionalStylePort,
    componentId: string,
    dataState: BaseScreenMaterialDataState,
  ): ScreenJsonObject | undefined {
    try {
      return port.resolve({ componentId, dataState });
    } catch {
      this.options.onDiagnostic?.(
        diagnostic(
          'PLUGIN_CORE_RENDER_FAILED',
          ['components', componentId, 'conditionalStyle'],
          'Conditional style port resolve raised an exception.',
        ),
      );
      return undefined;
    }
  }
}

function isResourceTimeoutValid(value: number): boolean {
  return Number.isInteger(value) && value >= 100 && value <= 60_000;
}

function isTabularValue(value: ScreenJsonValue): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'fields' in value &&
    Array.isArray((value as { readonly fields: unknown }).fields) &&
    'rows' in value &&
    Array.isArray((value as { readonly rows: unknown }).rows)
  );
}

function prepareCandidates(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog,
  mode: BaseScreenMaterialMode,
  interactive: boolean,
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  variables: ScreenJsonObject,
  dataSuspended: boolean,
  validationCache: ComponentValidationCache,
): ScreenParseResult<readonly RenderCandidate[]> {
  const candidates: RenderCandidate[] = [];
  const diagnostics: ScreenDiagnostic[] = [];
  // 按当前文档重建缓存表（copy-over）：命中沿用，未命中校验后写入，
  // 使缓存条目数始终以当前文档组件数为上界，不滞留已删除组件。
  const nextEntries = new Map<ScreenComponentNode, CachedComponentValidation>();
  for (let index = 0; index < document.components.length; index++) {
    const component = document.components[index]!;
    const entry = catalog.get(component.type);
    if (entry === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_IDENTITY_INVALID',
          ['components', index, 'type'],
          'Component material is not enabled in this catalog.',
        ),
      );
      continue;
    }
    const cached = validationCache.entries.get(component);
    let props: ScreenJsonObject;
    let style: ScreenJsonObject;
    if (cached !== undefined && cached.entry === entry) {
      // 同一组件引用 + 同一 catalog entry：props/style/styleRules 已在先前
      // 渲染完整通过 schema 校验（缓存只写入全量成功项），直接复用结果。
      props = cached.props;
      style = cached.style;
      nextEntries.set(component, cached);
    } else {
      const validatedProps = validateBaseScreenMaterialProps(
        component.props,
        entry.manifest.propsSchema,
      );
      if (!validatedProps.ok) {
        diagnostics.push(
          ...prefixDiagnostics(validatedProps.diagnostics, ['components', index, 'props']),
        );
        continue;
      }
      const validatedStyle = validateBaseScreenMaterialStyle(
        component.style,
        entry.manifest.styleSchema,
      );
      if (!validatedStyle.ok) {
        diagnostics.push(
          ...prefixDiagnostics(validatedStyle.diagnostics, ['components', index, 'style']),
        );
        continue;
      }
      // 条件样式规则（ADR-0058）：每条规则的 style 与基础样式合并后必须满足该物料
      // styleSchema（静态、与数据无关），非法规则样式与非法 style 同路径失败关闭。
      const styleRules = component.styleRules ?? [];
      let styleRulesValid = true;
      for (let ruleIndex = 0; ruleIndex < styleRules.length; ruleIndex++) {
        const ruleStyle = validateBaseScreenMaterialStyle(
          { ...validatedStyle.value, ...styleRules[ruleIndex]!.style },
          entry.manifest.styleSchema,
        );
        if (!ruleStyle.ok) {
          diagnostics.push(
            ...prefixDiagnostics(ruleStyle.diagnostics, [
              'components',
              index,
              'styleRules',
              ruleIndex,
              'style',
            ]),
          );
          styleRulesValid = false;
          break;
        }
      }
      if (!styleRulesValid) {
        continue;
      }
      props = validatedProps.value;
      style = validatedStyle.value;
      nextEntries.set(component, { entry, props, style });
    }
    const data = getDataState(
      component,
      entry,
      index,
      diagnostics,
      contributionIndex,
      variables,
      dataSuspended,
    );
    if (data === undefined) {
      continue;
    }
    candidates.push({
      component,
      entry,
      model: {
        componentId: component.id,
        mode,
        interactive,
        props,
        style,
        size: { width: component.size.width, height: component.size.height },
        dataState: data.dataState,
      },
      resource: data.resource,
    });
  }
  validationCache.entries = nextEntries;
  return diagnostics.length === 0
    ? { ok: true, value: candidates, diagnostics: [] }
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

function getDataState(
  component: ScreenComponentNode,
  entry: BaseScreenMaterialCatalogEntry,
  index: number,
  diagnostics: ScreenDiagnostic[],
  contributionIndex: BaseScreenRuntimeContributionIndex | undefined,
  variables: ScreenJsonObject,
  dataSuspended: boolean,
):
  | {
      readonly dataState: BaseScreenMaterialDataState;
      readonly resource: ResolvedHostResource | undefined;
    }
  | undefined {
  if (component.dataSource === null) {
    if (entry.manifest.defaultData === undefined) {
      return { dataState: { status: 'idle' }, resource: undefined };
    }
    return {
      dataState: adaptStaticData(
        entry,
        entry.manifest.defaultData,
        entry.manifest.staticData?.kind === 'tabular'
          ? entry.manifest.staticData.defaultBinding
          : undefined,
      ),
      resource: undefined,
    };
  }
  if (
    !entry.manifest.dataCapabilities.includes(
      component.dataSource.type === 'static' ? 'static' : 'host-resource',
    )
  ) {
    diagnostics.push(
      diagnostic(
        'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
        ['components', index, 'dataSource'],
        'Material does not accept static data.',
      ),
    );
    return undefined;
  }
  if (component.dataSource.type === 'host-resource') {
    if (dataSuspended) {
      return { dataState: { status: 'loading' }, resource: undefined };
    }
    const evaluated = evaluateScreenHostResourceParameters(component.dataSource.params, variables);
    if (!evaluated.ok) {
      return {
        dataState: {
          status: 'error',
          code: 'HOST_RESOURCE_FAILED',
          message: 'Host resource request failed.',
        },
        resource: undefined,
      };
    }
    const resourceType = contributionIndex?.getResourceType(component.dataSource.resourceType);
    if (contributionIndex !== undefined && resourceType === undefined) {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
          ['components', index, 'dataSource', 'resourceType'],
          'Host resource type is not enabled by an active plugin contribution.',
        ),
      );
      return undefined;
    }
    if (resourceType !== undefined) {
      const params = validateBaseScreenMaterialProps(
        evaluated.value.params,
        resourceType.configSchema,
      );
      if (!params.ok) {
        return {
          dataState: {
            status: 'error',
            code: 'HOST_RESOURCE_FAILED',
            message: 'Host resource request failed.',
          },
          resource: undefined,
        };
      }
    }
    if (
      component.dataSource.binding !== null &&
      (entry.manifest.dataBinding === undefined || entry.tabularDataAdapter === undefined)
    ) {
      return {
        dataState: {
          status: 'error',
          code: 'HOST_DATASET_BINDING_INVALID',
          message: 'Host dataset binding is invalid.',
        },
        resource: undefined,
      };
    }
    return {
      dataState: { status: 'loading' },
      resource: {
        params: evaluated.value.params,
        key: getHostResourceKey(component, evaluated.value.params),
        projectionKey: getProjectionKey(component.dataSource),
      },
    };
  }
  const parsed = parseScreenJsonValue(component.dataSource.value, { maxBytes: 1024 * 1024 });
  if (!parsed.ok) {
    diagnostics.push(
      ...prefixDiagnostics(parsed.diagnostics, ['components', index, 'dataSource', 'value']),
    );
    return undefined;
  }
  return {
    dataState: adaptStaticData(entry, parsed.value, component.dataSource.binding),
    resource: undefined,
  };
}

function adaptStaticData(
  entry: BaseScreenMaterialCatalogEntry,
  value: ScreenJsonValue,
  binding: import('@base-screen/contracts').ScreenDataBinding | undefined,
): BaseScreenMaterialDataState {
  if (entry.manifest.staticData?.kind !== 'tabular') {
    return { status: 'ready', value };
  }
  const dataset = parseScreenTabularDataset(value);
  if (!dataset.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_INVALID',
      message: 'Static dataset is invalid.',
    };
  }
  const declaration = entry.manifest.dataBinding;
  const adapter = entry.tabularDataAdapter;
  if (binding === undefined || declaration === undefined || adapter === undefined) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Static dataset binding is invalid.',
    };
  }
  const validated = validateScreenHostResourceBinding(
    binding,
    dataset.value.fields,
    declaration.roles,
  );
  if (!validated.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Static dataset binding is invalid.',
    };
  }
  try {
    const adapted = adapter.adapt({ dataset: dataset.value, fields: validated.value.fields });
    if (!adapted.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: 'Static dataset adapter failed.',
      };
    }
    const parsed = parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
    return parsed.ok
      ? { status: 'ready', value: parsed.value }
      : {
          status: 'error',
          code: 'HOST_DATASET_ADAPTER_FAILED',
          message: 'Static dataset adapter failed.',
        };
  } catch {
    return {
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: 'Static dataset adapter failed.',
    };
  }
}

function applyMaterial(
  element: BaseScreenMaterialElement,
  component: ScreenComponentNode,
  document: ScreenDocument,
  model: BaseScreenMaterialModel,
  effectivelyHidden: boolean,
  stackOrder: number,
): void {
  const position = component.position;
  // 同值守卫：reconcile 路径每次 render 都会重写全部几何样式；先读后写把
  // 未变更属性的写次数降为 0，避免无关变更（如选区变化）触发全量 CSSOM 写入。
  const style = element.style;
  if (style.position !== 'absolute') style.position = 'absolute';
  const left = `${position.x}px`;
  if (style.left !== left) style.left = left;
  const top = `${position.y}px`;
  if (style.top !== top) style.top = top;
  const width = `${component.size.width}px`;
  if (style.width !== width) style.width = width;
  const height = `${component.size.height}px`;
  if (style.height !== height) style.height = height;
  // Core painter order makes root subtrees indivisible spans. A unique order avoids child zIndex
  // values escaping their root subtree while Material elements remain mounted on the canvas root.
  const zIndex = String(stackOrder);
  if (style.zIndex !== zIndex) style.zIndex = zIndex;
  if (element.dataset.baseScreenComponentId !== component.id) {
    element.dataset.baseScreenComponentId = component.id;
  }
  if (style.transformOrigin !== 'center') style.transformOrigin = 'center';
  const rotate = `rotate(${component.rotation}deg)`;
  const scaleX = model.style.flipX === true ? -1 : 1;
  const scaleY = model.style.flipY === true ? -1 : 1;
  const transform = scaleX === 1 && scaleY === 1 ? rotate : `${rotate} scale(${scaleX}, ${scaleY})`;
  if (style.transform !== transform) style.transform = transform;
  const opacity =
    typeof model.style.opacity === 'number' && Number.isFinite(model.style.opacity)
      ? String(Math.min(1, Math.max(0, model.style.opacity)))
      : '';
  if (style.opacity !== opacity) style.opacity = opacity;
  element.model = model;
  const display = effectivelyHidden ? 'none' : 'block';
  if (style.display !== display) style.display = display;
}

function prefixDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: readonly (string | number)[],
): readonly ScreenDiagnostic[] {
  return diagnostics.map((item) => ({ ...item, path: [...prefix, ...item.path] }));
}

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [diagnostic(code, path, message)] };
}

function renderFailure(candidate: RenderCandidate, message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'PLUGIN_CORE_RENDER_FAILED',
    path: ['components', candidate.component.id],
    message,
  };
}

function sortDiagnostics(diagnostics: readonly ScreenDiagnostic[]): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftPath = left.path.join('/');
    const rightPath = right.path.join('/');
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : left.code < right.code ? -1 : 1;
  });
}

function applyCanvasBackground(root: HTMLElement, canvas: ScreenCanvas): void {
  const background = canvas.background;
  root.style.backgroundColor =
    background?.type === 'solid' ? background.color : canvas.backgroundColor;

  const imageLayers: string[] = [];
  const sizes: string[] = [];
  if (canvas.backgroundImage !== undefined) {
    imageLayers.push(`url("${escapeCssString(canvas.backgroundImage)}")`);
    sizes.push(canvas.backgroundImageFit === 'contain' ? 'contain' : 'cover');
  }
  const gradient = background === undefined ? undefined : canvasGradient(background);
  if (gradient !== undefined) {
    imageLayers.push(gradient);
    sizes.push('100% 100%');
  }

  if (imageLayers.length === 0) {
    root.style.backgroundImage = '';
    root.style.backgroundSize = '';
    root.style.backgroundPosition = '';
    root.style.backgroundRepeat = '';
    return;
  }
  root.style.backgroundImage = imageLayers.join(', ');
  root.style.backgroundSize = sizes.join(', ');
  root.style.backgroundPosition = imageLayers.map(() => 'center').join(', ');
  root.style.backgroundRepeat = imageLayers.map(() => 'no-repeat').join(', ');
}

function canvasGradient(background: ScreenCanvasBackground): string | undefined {
  if (background.type === 'solid') return undefined;
  const stops = background.stops.map((stop) => `${stop.color} ${stop.position}%`).join(', ');
  if (background.type === 'linear-gradient') {
    return `linear-gradient(${background.angle}deg, ${stops})`;
  }
  return `radial-gradient(circle at ${background.position.x}% ${background.position.y}%, ${stops})`;
}

/** CSS 字符串转义（用于 url("...") 值；校验已拒绝空白/控制字符/反斜杠，此处防御性转义 `\` 与 `"`）。 */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
