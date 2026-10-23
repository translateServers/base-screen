import {
  readScreenVariableRecord,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenResourceExecutionTrigger,
  type ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import { collectScreenValueRefDependencies, type ScreenBlueprintPlan } from '@base-screen/core';
import { canonicalJsonString } from '../canonical-json.js';
import type { BaseScreenRenderer } from '../renderer/renderer.js';
import type { BaseScreenViewerRefreshOptions } from './viewer-configuration.js';

export interface ViewerVariableControllerHost {
  readonly readRenderer: () => BaseScreenRenderer | undefined;
  readonly readDocument: () => ScreenDocument | undefined;
  readonly readBlueprintPlan: () => ScreenBlueprintPlan | undefined;
  readonly readBlueprintVariables: () => ScreenJsonObject | undefined;
  readonly writeBlueprintVariables: (variables: ScreenJsonObject) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

/**
 * 变量值 = 文档里的取值引用在当前实例结果上的求值。
 *
 * 变量不再向宿主「批量解析」：`data-source-field` 的值来自 `DataSourceRuntime` 里该实例
 * 已落定的结果（`renderer.evaluateValueRef` 复用 core 的同一套 `path`/体积语义），实例
 * 未落定时沿用 `initialValue`——绝不把「未就绪」写成 `undefined`，否则下游会把空值当真。
 *
 * 值只在这里算一次并推给 `renderer.setVariables`；实例落定后只重算**依赖该实例**的变量，
 * 且只有值真的变了才再次 `setVariables` + render（代际保护，避免 render 风暴）。
 */
export class ViewerVariableController {
  readonly #host: ViewerVariableControllerHost;
  /** 实例 → 派生它的变量 id（每次渲染按文档重建）。 */
  #instanceVariables = new Map<string, readonly string[]>();
  #generation = 0;
  #rendering = false;
  #pendingRecompute = false;
  /** 等待「派生变量依赖的实例」落定后要执行的首次/替换渲染。 */
  #deferred:
    | {
        readonly document: ScreenDocument;
        readonly componentId: string | undefined;
        readonly trigger: ScreenResourceExecutionTrigger;
        readonly traceId: string | undefined;
      }
    | undefined;
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
    const renderer = this.#host.readRenderer();
    if (renderer === undefined) return;
    if (options.componentId !== undefined && !this.#hasComponent(options.componentId)) return;
    const trigger = options.trigger === 'polling' ? 'polling' : 'manual';
    const traceId = options.traceId;
    if (options.componentId !== undefined) {
      // 组件刷新同样要刷新「它依赖的变量」的实例：变量值可能来自上游数据源，
      // 只刷组件会让参数停在旧值上。
      this.refreshVariables(traceId === undefined ? {} : { traceId });
      renderer.refreshData(options.componentId, trigger, traceId);
      return;
    }
    renderer.refreshData(undefined, trigger, traceId);
  }

  /**
   * 刷新被派生变量依赖的数据源实例。
   *
   * `variableIds` 缺省 ⇒ 刷新全部派生变量依赖的实例；指定 ids ⇒ 只刷新这些变量依赖的实例；
   * 纯 `inline` 变量没有任何实例依赖，因此是 no-op（不会产生宿主调用）。
   */
  refreshVariables(options: ScreenVariableRefreshOptions = {}): void {
    const document = this.#host.readDocument();
    const renderer = this.#host.readRenderer();
    if (document === undefined || renderer === undefined) return;
    const requested = options.variableIds === undefined ? undefined : new Set(options.variableIds);
    const instanceIds = new Set<string>();
    for (const entry of document.variables) {
      const record = readScreenVariableRecord(entry);
      if (requested !== undefined && !requested.has(record.id)) continue;
      for (const dataSourceId of collectScreenValueRefDependencies(record.value).dataSourceIds) {
        instanceIds.add(dataSourceId);
      }
    }
    for (const dataSourceId of instanceIds) {
      renderer.refreshDataSource(dataSourceId, {
        trigger: 'variable',
        ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
      });
    }
  }

  /** 实例落定：若有等待中的渲染且变量已就绪则补渲染；否则只重算依赖它的变量。 */
  handleDataSourceSettled(dataSourceId: string): void {
    const deferred = this.#deferred;
    if (deferred !== undefined) {
      const plan = this.#host.readBlueprintPlan();
      const renderer = this.#host.readRenderer();
      if (
        plan !== undefined &&
        renderer !== undefined &&
        this.#variablesReady(deferred.document, renderer)
      ) {
        this.#deferred = undefined;
        this.#renderDocument(
          deferred.document,
          deferred.componentId,
          deferred.trigger,
          deferred.traceId,
          plan,
        );
        return;
      }
    }
    if (!this.#instanceVariables.has(dataSourceId)) return;
    if (this.#rendering) {
      // 本轮 render 期间落定的实例：等本轮结束后补算一次（合并）。
      this.#pendingRecompute = true;
      return;
    }
    this.#recomputeIfChanged('variable');
  }

  /**
   * 渲染当前文档（重新计算变量 → setVariables → render）。
   *
   * @param componentId 组件级刷新目标（仅用于把 trigger/trace 透传给该组件的数据源）。
   * @param forceRefresh 显式刷新（manual/polling）而非初次/文档替换。
   * @param restart 取消当前进行中的渲染再开始（文档替换/configure）。
   */
  start(componentId?: string, forceRefresh = false, restart = false): void {
    if (this.#rendering) {
      // 渲染中又收到落定回调：合并成一次，等本轮结束后补算。
      this.#pendingRecompute = true;
      return;
    }
    if (restart) this.#generation++;
    const trigger: ScreenResourceExecutionTrigger = forceRefresh
      ? this.#nextTrigger
      : this.#hasRenderedDocument
        ? 'document-change'
        : 'initial';
    const traceId = forceRefresh ? this.#nextTraceId : undefined;
    this.#applyDocument(componentId, forceRefresh, trigger, traceId);
  }

  cancel(): void {
    this.#generation++;
    this.#rendering = false;
    this.#pendingRecompute = false;
    this.#instanceVariables.clear();
    this.#deferred = undefined;
  }

  reset(): void {
    this.cancel();
    this.#hasRenderedDocument = false;
    this.#nextTrigger = 'manual';
    this.#nextTraceId = undefined;
  }

  #applyDocument(
    componentId: string | undefined,
    forceRefresh: boolean,
    trigger: ScreenResourceExecutionTrigger,
    traceId: string | undefined,
  ): void {
    const renderer = this.#host.readRenderer();
    const document = this.#host.readDocument();
    const plan = this.#host.readBlueprintPlan();
    if (renderer === undefined || document === undefined || plan === undefined) return;
    if (!forceRefresh && componentId === undefined) {
      // 初次/文档替换：先让实例层接管（旧文档的实例会在 ensure 时被剪掉并取消请求）。
      const current = this.#host.readBlueprintVariables() ?? plan.initialVariables;
      // 只先启动「变量依赖的实例」：组件自己的取数必须等变量就绪后再发，否则会先用
      // initialValue 打一轮请求。
      const startOnly = new Set<string>();
      for (const entry of document.variables) {
        const record = readScreenVariableRecord(entry);
        for (const id of collectScreenValueRefDependencies(record.value).dataSourceIds) {
          startOnly.add(id);
        }
      }
      renderer.prepareDataSources(
        document,
        current,
        { trigger, traceId: traceId ?? '' },
        startOnly,
      );
      if (!this.#variablesReady(document, renderer)) {
        // 派生变量还没就绪：等实例落定后再渲染，避免先用 initialValue 取一整轮数据。
        this.#deferred = { document, componentId, trigger, traceId };
        return;
      }
    }
    this.#deferred = undefined;
    this.#renderDocument(document, componentId, trigger, traceId, plan, forceRefresh);
  }

  /**
   * 变量依赖的实例是否都已落定。
   *
   * ready 与 error 都算落定（失败回落 `initialValue`，由材料侧进入错误态区分）；
   * 只有仍在途的实例才需要等。
   */
  #variablesReady(document: ScreenDocument, renderer: BaseScreenRenderer): boolean {
    for (const entry of document.variables) {
      const record = readScreenVariableRecord(entry);
      if (record.value.kind !== 'data-source-field') continue;
      // 就绪判据只在运行时：实例已 ready/error 即算落定（error 回落 initialValue）。
      if (!renderer.isDataSourceSettled(record.value.dataSourceId)) return false;
    }
    return true;
  }

  #renderDocument(
    document: ScreenDocument,
    componentId: string | undefined,
    trigger: ScreenResourceExecutionTrigger,
    traceId: string | undefined,
    plan: ScreenBlueprintPlan,
    forceRefresh = false,
  ): void {
    const renderer = this.#host.readRenderer();
    if (renderer === undefined) return;
    const generation = ++this.#generation;
    const variables = this.#computeVariables(document, plan, renderer);
    if (generation !== this.#generation) return;
    this.#rendering = true;
    try {
      const applied = renderer.setVariables(variables);
      if (!applied.ok) {
        this.#host.emitDiagnostics(applied.diagnostics);
        return;
      }
      const rendered = renderer.render(document, { trigger, traceId: traceId ?? '' });
      if (!rendered.ok) {
        this.#host.emitDiagnostics(rendered.diagnostics);
        return;
      }
      if (rendered.diagnostics.length > 0) this.#host.emitDiagnostics(rendered.diagnostics);
      this.#host.writeBlueprintVariables(variables);
      if (!forceRefresh) this.#hasRenderedDocument = true;
      if (forceRefresh) {
        renderer.refreshData(componentId, trigger === 'polling' ? 'polling' : 'manual', traceId);
      }
    } finally {
      this.#rendering = false;
    }
    if (this.#pendingRecompute) {
      this.#pendingRecompute = false;
      this.#recomputeIfChanged('variable');
    }
  }

  /** 实例落定后的补算：只重算变量，值有变化才推。 */
  #recomputeIfChanged(trigger: ScreenResourceExecutionTrigger): void {
    const renderer = this.#host.readRenderer();
    const document = this.#host.readDocument();
    const plan = this.#host.readBlueprintPlan();
    if (renderer === undefined || document === undefined || plan === undefined) return;
    const variables = this.#computeVariables(document, plan, renderer);
    const previous = this.#host.readBlueprintVariables();
    if (
      previous !== undefined &&
      canonicalJsonString(previous as ScreenJsonValue) ===
        canonicalJsonString(variables as ScreenJsonValue)
    ) {
      return;
    }
    const generation = ++this.#generation;
    this.#rendering = true;
    try {
      const applied = renderer.setVariables(variables);
      if (!applied.ok) {
        this.#host.emitDiagnostics(applied.diagnostics);
        return;
      }
      const rendered = renderer.render(document, { trigger, traceId: '' });
      if (!rendered.ok) {
        this.#host.emitDiagnostics(rendered.diagnostics);
        return;
      }
      if (rendered.diagnostics.length > 0) this.#host.emitDiagnostics(rendered.diagnostics);
      if (generation !== this.#generation) return;
      this.#host.writeBlueprintVariables(variables);
    } finally {
      this.#rendering = false;
    }
  }

  /**
   * 计算全部变量值并重建「实例 → 变量」索引。
   *
   * - `inline`：文档值，除非运行期已有值（可写变量写入后不得被文档值覆盖）。
   * - `data-source-field`：实例已就绪取实例结果（经 `path` 下钻），否则回落 `initialValue`。
   * - 其它（变量别名等非法形态）：`initialValue`。
   */
  #computeVariables(
    document: ScreenDocument,
    plan: ScreenBlueprintPlan,
    renderer: BaseScreenRenderer,
  ): ScreenJsonObject {
    const current = this.#host.readBlueprintVariables() ?? plan.initialVariables;
    const values: Record<string, ScreenJsonValue> = {};
    const instanceVariables = new Map<string, string[]>();
    for (const entry of document.variables) {
      const record = readScreenVariableRecord(entry);
      const ref = record.value;
      if (ref.kind === 'inline') {
        values[record.id] = current[record.id] ?? ref.value;
        continue;
      }
      if (ref.kind !== 'data-source-field') {
        values[record.id] = record.initialValue;
        continue;
      }
      const evaluated = renderer.evaluateValueRef(ref);
      values[record.id] =
        evaluated.kind === 'value' && evaluated.value !== undefined
          ? evaluated.value
          : // 未就绪的种子值：`controlled` 只在这里起作用——受控变量的初始值让位给外部，
            // 等待期间先种 null；非受控变量用文档声明的 initialValue（与旧 runtime-compile 一致）。
            record.controlled
            ? null
            : record.initialValue;
      const list = instanceVariables.get(ref.dataSourceId);
      if (list === undefined) instanceVariables.set(ref.dataSourceId, [record.id]);
      else list.push(record.id);
    }
    this.#instanceVariables = instanceVariables;
    return values;
  }

  #hasComponent(componentId: string): boolean {
    return (
      this.#host.readDocument()?.components.some((component) => component.id === componentId) ??
      false
    );
  }
}
