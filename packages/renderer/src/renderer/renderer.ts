import {
  parseScreenDocument,
  parseScreenJsonValue,
  readScreenComponentValueRef,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostCatalogPort,
  type ScreenHostDatasetPort,
  type ScreenHostResourcePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenResourceExecutionMode,
  type ScreenResourceExecutionTrigger,
  type ScreenResourceObserver,
  type ScreenValueRef,
} from '@base-screen/contracts';
import type { ScreenValueRefEvaluation } from '@base-screen/core';
import { getPainterOrder, type ScreenBlueprintVisibilityEffect } from '@base-screen/core';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenMaterialElement,
  BaseScreenMaterialMode,
  BaseScreenMaterialModel,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { applyCanvasBackground } from '../canvas-background.js';
import { createMountedProjectionState } from '../resource/resource-state.js';
import {
  type ComponentDataResolution,
  type ComponentFailurePolicy,
  prepareCandidates,
  readComponentData,
} from './renderer-candidates.js';
import { diagnostic, failure, renderFailure } from './renderer-diagnostics.js';
import { resolveEffectiveModel } from './renderer-effective-style.js';
import { applyMaterial } from './renderer-material-dom.js';
import {
  appliedModelKeyOf,
  applyMountedConditionalStyle,
  applyMountedModel,
  handleMaterialEvent,
  reconcileMountedMaterial,
} from './renderer-mounted-material.js';
import { createRendererState, type RendererState } from './renderer-state.js';
import type { MountedMaterial, RenderCandidate } from './renderer-types.js';

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
  readonly datasetPort?: ScreenHostDatasetPort;
  /** 来源目录端口（`host-catalog` / `url-query` 来源）。 */
  readonly hostCatalogPort?: ScreenHostCatalogPort;
  /** ADR-0059 宿主条件样式端口：缺省时与既有渲染路径逐字节一致。 */
  readonly conditionalStylePort?: BaseScreenConditionalStylePort;
  readonly resourceTimeoutMs?: number;
  /**
   * 候选校验失败策略：缺省 `fail`（设计器失败关闭）。
   * Viewer 传 `skip`：跳过坏组件、渲染其余内容，诊断随成功结果返回给宿主。
   */
  readonly componentFailurePolicy?: ComponentFailurePolicy;
  readonly contributionIndex?: BaseScreenRuntimeContributionIndex;
  readonly observer?: ScreenResourceObserver;
  readonly instanceId?: string;
  readonly executionMode?: ScreenResourceExecutionMode;
  /** 非持久化执行上下文附加信息（RB2）：提供时流入每次 resolve 与 observer 事件。 */
  readonly projectId?: string;
  readonly documentRevision?: string;
  /**
   * 数据源实例 settle（ready / error）后回调。
   *
   * Viewer 用它把「实例结果 → 派生变量」重算一次；重算完只推 `setVariables` + render，
   * 不重复发请求（实例缓存已在运行时里）。
   */
  readonly onDataSourceSettled?: (dataSourceId: string) => void;
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
   * 宿主条件样式状态变化后的样式-only 重算：不取数、不改文档、不进历史。
   *
   * 仅重写已挂载物料的 effective model；未提供端口时 no-op（文档规则不会脱离数据变化）。
   * `componentIds` 缺省时处理全部已挂载组件，否则只处理给定组件。
   */
  refreshConditionalStyles(componentIds?: readonly string[]): void;
  /**
   * 只确保数据源实例（启动请求），不挂载任何物料。
   *
   * Viewer 用它先拿到「派生变量依赖的实例」的结果，再一次渲染：避免先用 initialValue
   * 取一轮数、变量落定后再取一轮。
   */
  prepareDataSources(
    document: ScreenDocument,
    variables: ScreenJsonObject,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
    startOnly?: ReadonlySet<string>,
  ): void;
  /** 按数据源实例刷新（变量派生、定时刷新用；组件级刷新走 `refreshData(componentId)`）。 */
  refreshDataSource(
    dataSourceId: string,
    options?: {
      readonly trigger?: ScreenResourceExecutionTrigger;
      readonly traceId?: string;
    },
  ): void;
  /** 读实例已就绪的原始结果；未就绪/失败时返回 `undefined`。 */
  readDataSourceValue(dataSourceId: string): ScreenJsonValue | undefined;
  /** 实例是否已落定（ready / error）；未请求或在途时为 false。 */
  isDataSourceSettled(dataSourceId: string): boolean;
  /** 用实例运行时求值一个取值引用（派生变量用；`path` 与体积上限由 core 统一处理）。 */
  evaluateValueRef(ref: ScreenValueRef): ScreenValueRefEvaluation;
  /**
   * 切换实例级 interactive 状态：已渲染过文档时原地重渲染（复用已挂载物料与数据源请求状态），
   * 未渲染时只记录状态供下一次 render 使用。Viewer 与 Designer 共用该入口。
   */
  setInteractive(enabled: boolean): ScreenParseResult<null>;
  applyBlueprintVisibilityEffects(
    effects: readonly ScreenBlueprintVisibilityEffect[],
  ): ScreenParseResult<null>;
  resetBlueprintVisibility(): void;
  clear(): void;
  dispose(): void;
}

export function createBaseScreenRenderer(
  options: CreateBaseScreenRendererOptions,
): BaseScreenRenderer {
  return new Renderer(options);
}

class Renderer implements BaseScreenRenderer {
  readonly #state: RendererState;
  /** 实例 → 读它的组件（文档顺序）：结果落地时只重投影这些组件。 */
  #readers = new Map<string, readonly string[]>();

  constructor(options: CreateBaseScreenRendererOptions) {
    this.#state = createRendererState(options);
    this.#state.onDataSourceChanged = (dataSourceId) => this.#handleDataSourceChanged(dataSourceId);
  }

  render(
    document: ScreenDocument,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
  ): ScreenParseResult<null> {
    if (this.#state.disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    const parsedDocument =
      document === this.#state.lastValidatedInput && this.#state.document !== undefined
        ? ({ ok: true, value: this.#state.document, diagnostics: [] } as const)
        : parseScreenDocument(document, this.#state.lastValidatedInput);
    if (!parsedDocument.ok) {
      return parsedDocument;
    }
    const renderContext: ResolveContext = {
      trigger: context?.trigger ?? 'manual',
      traceId: context?.traceId ?? '',
    };
    // 先确保实例状态与请求：候选投影要从实例运行时读结果，所以这一步必须在
    // prepareCandidates 之前。请求本身是异步的，首帧材料先落 loading。
    this.#state.dataSources.ensure(parsedDocument.value, this.#state.variables, renderContext);
    this.#readers = collectReaders(parsedDocument.value);
    const prepared = prepareCandidates(
      parsedDocument.value,
      this.#state.options.catalog,
      this.#state.options.mode,
      this.#state.interactive,
      this.#state.options.contributionIndex,
      this.#state.dataSources,
      this.#state.validationCache,
      this.#state.options.componentFailurePolicy ?? 'fail',
    );
    if (!prepared.ok) {
      return prepared;
    }
    const painterIndex = new Map(
      getPainterOrder(parsedDocument.value).map((componentId, index) => [componentId, index]),
    );
    this.#state.visibility.prepare(parsedDocument.value);
    const candidates = [...prepared.value].sort(
      (left, right) => painterIndex.get(left.component.id)! - painterIndex.get(right.component.id)!,
    );
    const next = new Map<string, MountedMaterial>();
    const runtimeDiagnostics: ScreenDiagnostic[] = [];
    for (const candidate of candidates) {
      const stackOrder = painterIndex.get(candidate.component.id)!;
      const existing = this.#state.mounted.get(candidate.component.id);
      if (existing !== undefined && existing.type === candidate.component.type) {
        try {
          reconcileMountedMaterial(this.#state, candidate, existing, stackOrder);
        } catch {
          runtimeDiagnostics.push(
            renderFailure(candidate, 'Material model update raised an exception.'),
          );
        }
        next.set(candidate.component.id, existing);
        continue;
      }
      if (existing !== undefined) {
        // 同 id 换物料类型：先拆掉旧挂载（解绑事件、移除元素），不残留旧类型的 DOM。
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
      const onEvent = (event: Event): void => handleMaterialEvent(this.#state, candidate, event);
      element.addEventListener('base-screen-material-event', onEvent);
      let mountedModel: BaseScreenMaterialModel;
      try {
        mountedModel = resolveEffectiveModel(this.#state, candidate, candidate.model.dataState);
        applyMaterial(
          element,
          candidate.component,
          mountedModel,
          this.#state.visibility.isHidden(candidate.component.id),
          stackOrder,
        );
      } catch {
        runtimeDiagnostics.push(renderFailure(candidate, 'Material render raised an exception.'));
        continue;
      }
      this.#state.options.root.appendChild(element);
      const mounted: MountedMaterial = {
        type: candidate.component.type,
        element,
        onEvent,
        projection: createMountedProjectionState(),
        stackOrder,
        applied: appliedModelKeyOf(this.#state, candidate, stackOrder),
        appliedModel: mountedModel,
      };
      mounted.projection.dataState = candidate.model.dataState;
      mounted.projection.projectionKey = candidate.dataSource?.projectionKey;
      next.set(candidate.component.id, mounted);
    }
    for (const [componentId, mounted] of this.#state.mounted) {
      if (!next.has(componentId)) {
        mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
        mounted.element.remove();
      }
    }
    this.#state.options.root.style.position = 'relative';
    this.#state.options.root.style.width = `${parsedDocument.value.canvas.width}px`;
    this.#state.options.root.style.height = `${parsedDocument.value.canvas.height}px`;
    // preview/viewer 是最终展示表面，canonical 画布同时定义其可见与命中边界。
    // design 模式不改写宿主 overflow，由 Designer 的独立内容层裁剪并保留作者覆盖层。
    if (
      this.#state.options.mode !== 'design' &&
      this.#state.options.root.style.overflow !== 'hidden'
    ) {
      this.#state.options.root.style.overflow = 'hidden';
    }
    applyCanvasBackground(this.#state.options.root, parsedDocument.value.canvas);
    this.#state.mounted = next;
    this.#state.candidates = new Map(
      candidates.map((candidate) => [candidate.component.id, candidate]),
    );
    this.#state.document = parsedDocument.value;
    this.#state.lastValidatedInput = document;
    if (runtimeDiagnostics.length > 0) {
      for (const diagnostic of runtimeDiagnostics) {
        this.#state.options.onDiagnostic?.(diagnostic);
      }
    }
    return {
      ok: true,
      value: null,
      diagnostics: [...prepared.diagnostics, ...runtimeDiagnostics],
    };
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
    this.#state.variables = parsed.value as ScreenJsonObject;
    this.#state.dataSuspended = false;
    return { ok: true, value: null, diagnostics: [] };
  }

  setInteractive(enabled: boolean): ScreenParseResult<null> {
    if (this.#state.disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    if (this.#state.interactive === enabled) {
      return { ok: true, value: null, diagnostics: [] };
    }
    this.#state.interactive = enabled;
    if (this.#state.document === undefined) {
      return { ok: true, value: null, diagnostics: [] };
    }
    // 原地重渲染：同 type 同 id 的挂载按 reconcile 路径复用元素；数据源按实例复用
    // 已就绪的结果，因此不会重取数、不闪烁。
    return this.render(this.#state.document);
  }

  applyBlueprintVisibilityEffects(
    effects: readonly ScreenBlueprintVisibilityEffect[],
  ): ScreenParseResult<null> {
    if (this.#state.disposed) {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Renderer has been disposed.');
    }
    return this.#state.visibility.apply(effects, this.#state.document, this.#state.mounted);
  }

  resetBlueprintVisibility(): void {
    this.#state.visibility.reset();
  }

  suspendData(): void {
    this.#state.dataSuspended = true;
    this.#state.coordinator?.abortAll();
    this.#state.dataSources.suspend();
    for (const [componentId, mounted] of this.#state.mounted) {
      mounted.projection.projectionKey = undefined;
      mounted.projection.dataState = { status: 'loading' };
      const candidate = this.#state.candidates.get(componentId);
      if (candidate !== undefined && candidate.dataSource !== undefined) {
        const model: BaseScreenMaterialModel = {
          ...candidate.model,
          dataState: { status: 'loading' },
        };
        mounted.element.model = model;
        mounted.appliedModel = model;
      }
    }
  }

  refreshData(componentId?: string, trigger?: 'manual' | 'polling', traceId?: string): void {
    // 每次 refresh 操作派生一份上下文，逐实例传下去（RB2）：全量刷新中任一实例都
    // 不会消费/重置其他实例的 trigger 或 trace。
    const refreshContext: ResolveContext = {
      trigger: trigger === 'polling' ? 'polling' : 'manual',
      traceId: traceId ?? '',
    };
    if (componentId === undefined) {
      this.#state.dataSources.refresh(undefined, refreshContext);
      return;
    }
    const candidate = this.#state.candidates.get(componentId);
    if (candidate === undefined) return;
    const ref = readScreenComponentValueRef(candidate.component);
    if (ref?.kind !== 'data-source-field') return;
    this.#state.dataSources.refresh(ref.dataSourceId, refreshContext);
  }

  refreshConditionalStyles(componentIds?: readonly string[]): void {
    if (this.#state.disposed || this.#state.options.conditionalStylePort === undefined) return;
    const ids =
      componentIds === undefined ? [...this.#state.mounted.keys()] : [...new Set(componentIds)];
    for (const componentId of ids) {
      const candidate = this.#state.candidates.get(componentId);
      const mounted = this.#state.mounted.get(componentId);
      if (candidate === undefined || mounted === undefined) continue;
      try {
        applyMountedConditionalStyle(this.#state, candidate, mounted);
      } catch {
        this.#state.options.onDiagnostic?.(
          diagnostic(
            'PLUGIN_CORE_RENDER_FAILED',
            ['components', componentId, 'conditionalStyle'],
            'Conditional style refresh failed for material.',
          ),
        );
      }
    }
  }

  prepareDataSources(
    document: ScreenDocument,
    variables: ScreenJsonObject,
    context?: { readonly trigger?: ScreenResourceExecutionTrigger; readonly traceId?: string },
    startOnly?: ReadonlySet<string>,
  ): void {
    if (this.#state.disposed) return;
    const parsed = parseScreenDocument(document, this.#state.lastValidatedInput);
    if (!parsed.ok) return;
    this.#state.dataSources.ensure(
      parsed.value,
      variables,
      { trigger: context?.trigger ?? 'manual', traceId: context?.traceId ?? '' },
      startOnly === undefined ? {} : { startOnly },
    );
    this.#readers = collectReaders(parsed.value);
  }

  refreshDataSource(
    dataSourceId: string,
    options?: {
      readonly trigger?: ScreenResourceExecutionTrigger;
      readonly traceId?: string;
    },
  ): void {
    this.#state.dataSources.refresh(dataSourceId, {
      trigger: options?.trigger ?? 'manual',
      traceId: options?.traceId ?? '',
    });
  }

  readDataSourceValue(dataSourceId: string): ScreenJsonValue | undefined {
    const entry = this.#state.dataSources.read(dataSourceId);
    if (entry === undefined || entry.dataState.status !== 'ready') return undefined;
    return entry.rawValue;
  }

  isDataSourceSettled(dataSourceId: string): boolean {
    const entry = this.#state.dataSources.read(dataSourceId);
    return entry !== undefined && entry.dataState.status !== 'loading';
  }

  evaluateValueRef(ref: ScreenValueRef): ScreenValueRefEvaluation {
    return this.#state.dataSources.evaluate(ref);
  }

  clear(): void {
    this.resetBlueprintVisibility();
    this.#state.coordinator?.abortAll();
    this.#state.sourceQueries.clear();
    this.#state.dataSources.clear();
    this.#readers = new Map();
    for (const mounted of this.#state.mounted.values()) {
      mounted.element.removeEventListener('base-screen-material-event', mounted.onEvent);
      mounted.element.remove();
    }
    this.#state.mounted.clear();
    this.#state.candidates.clear();
    this.#state.document = undefined;
    this.#state.lastValidatedInput = undefined;
    this.#state.validationCache.entries.clear();
  }

  dispose(): void {
    if (!this.#state.disposed) {
      this.clear();
      this.#state.disposed = true;
    }
  }

  /**
   * 实例结果变化（settle/失败/取消）后就地重投影读它的组件。
   *
   * 只碰组件投影，不重挂载、不发请求：值在实例上，投影在组件上，两件事分开。
   */
  #handleDataSourceChanged(dataSourceId: string): void {
    const document = this.#state.document;
    if (!this.#state.disposed && document !== undefined) {
      this.#reprojectReaders(dataSourceId, document);
    }
    // 结果落定（ready / error）后通知宿主：Viewer 用它重算派生变量 / 触发首次渲染。
    const entry = this.#state.dataSources.read(dataSourceId);
    if (entry !== undefined && entry.dataState.status !== 'loading') {
      this.#state.options.onDataSourceSettled?.(dataSourceId);
    }
  }

  #reprojectReaders(dataSourceId: string, document: ScreenDocument): void {
    const componentsById = new Map(document.components.map((item) => [item.id, item]));
    for (const componentId of this.#readers.get(dataSourceId) ?? []) {
      const component = componentsById.get(componentId);
      const candidate = this.#state.candidates.get(componentId);
      const mounted = this.#state.mounted.get(componentId);
      if (component === undefined || candidate === undefined || mounted === undefined) continue;
      const resolved: ComponentDataResolution = readComponentData(
        this.#state.dataSources,
        component,
        candidate.entry,
        this.#state.options.contributionIndex,
        ['components', componentId],
        (item) => this.#state.options.onDiagnostic?.(item),
      );
      if ('diagnostic' in resolved) continue;
      const nextCandidate: RenderCandidate = {
        ...candidate,
        model: { ...candidate.model, dataState: resolved.dataState },
        dataSource: resolved.dataSource,
        dataEpoch: resolved.epoch,
      };
      this.#state.candidates.set(componentId, nextCandidate);
      if (resolved.dataState.status === 'ready') {
        this.#state.dataSources.reportProjection(
          dataSourceId,
          componentId,
          resolved.dataState.value,
        );
      }
      mounted.projection.dataState = resolved.dataState;
      mounted.projection.projectionKey = resolved.dataSource?.projectionKey;
      applyMountedModel(this.#state, nextCandidate, mounted, mounted.stackOrder);
    }
  }
}

/** 实例 → 读它的组件 id（文档顺序）。只经取值引用读取，不碰旧 `dataSource` 形态。 */
function collectReaders(document: ScreenDocument): Map<string, readonly string[]> {
  const readers = new Map<string, string[]>();
  for (const component of document.components) {
    const ref = readScreenComponentValueRef(component);
    if (ref?.kind !== 'data-source-field') continue;
    const list = readers.get(ref.dataSourceId);
    if (list === undefined) readers.set(ref.dataSourceId, [component.id]);
    else list.push(component.id);
  }
  return readers;
}
