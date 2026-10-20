import {
  MAX_DATA_SOURCE_VALUE_BYTES,
  normalizeScreenMaterialError,
  parseScreenJsonValue,
  readScreenComponentValueRef,
  readScreenDocumentDataSources,
  type ScreenDataSource,
  type ScreenDataSourceSource,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenResourceExecutionContext,
  type ScreenValueRef,
  screenDataSourceOrder,
} from '@base-screen/contracts';
import {
  evaluateScreenValueRef,
  type ScreenValueRefEnvironment,
  type ScreenValueRefEvaluation,
} from '@base-screen/core';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import { canonicalJsonString } from '../canonical-json.js';
import type { ResourceRequestCoordinator } from './request-coordinator.js';
import {
  type SourceQueryPort,
  type SourceQueryRequest,
  shareScopeOf,
} from './source-query-port.js';

/** 数据源实例的运行期状态（一实例一条，与「谁在读它」无关）。 */
export interface DataSourceRuntimeEntry {
  readonly dataSourceId: string;
  /** 实例来源；读它的组件需要据此做物料能力门控（随文档更新）。 */
  source: ScreenDataSourceSource | undefined;
  /**
   * `ds:<dataSourceId>:<canonicalJsonString(source)>:<canonicalJsonString(params)>`；
   * 参数未求值时为 undefined。`path`/`dataBinding` 不进键。
   */
  requestKey: string | undefined;
  /** 实例级状态：ready 时 `rawValue` 是整份宿主结果（尚未按组件字段映射投影）。 */
  dataState: BaseScreenMaterialDataState;
  rawValue: ScreenJsonValue | undefined;
  generation: number;
  /** 不透明请求槽位：由协调器按次签发，未发起或无进行中请求时为 undefined。 */
  requestSlotId: string | undefined;
  /** 最近一次失败的宿主诊断（已归一化前的原始诊断）。 */
  rawError: ScreenDiagnostic | undefined;
}

type InternalEntry = DataSourceRuntimeEntry & {
  params: ScreenJsonObject;
  requestId: string | undefined;
  executionContext: ScreenResourceExecutionContext | undefined;
  startedAt: number | undefined;
};

export interface DataSourceRuntimeObserverEvent {
  readonly type: 'started' | 'succeeded' | 'failed' | 'aborted' | 'timed-out' | 'adapted';
  readonly dataSourceId: string;
  /** 首个读该实例的组件（观察者定位用）；没有组件读时为实例 id。 */
  readonly componentId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string | undefined;
  readonly context: ScreenResourceExecutionContext;
  readonly startedAt: number | undefined;
  readonly fieldCount?: number | undefined;
  readonly rowCount?: number | undefined;
  readonly code?: string | undefined;
}

export interface DataSourceRuntimeOptions {
  readonly sourcePort: SourceQueryPort;
  readonly coordinator: ResourceRequestCoordinator<SourceQueryRequest> | undefined;
  readonly isSuspended: () => boolean;
  /** 宿主实例范围：resolve 与 observer 事件共享同一份按操作派生的上下文（RB2）。 */
  readonly createExecutionContext: (
    context: { readonly trigger: string; readonly traceId: string },
    dataSourceId: string,
  ) => ScreenResourceExecutionContext;
  readonly emit: (event: DataSourceRuntimeObserverEvent) => void;
  /** 实例状态变化（settle / 取消 / 重新加载）后通知渲染器重投影读它的组件。 */
  readonly onChanged: (dataSourceId: string) => void;
  /** 参数级门控：宿主资源类型的 configSchema 校验失败时直接在实例上失败，不发请求。 */
  readonly validateParams?:
    | ((source: ScreenDataSourceSource, params: ScreenJsonObject) => ScreenDiagnostic | undefined)
    | undefined;
  readonly timeoutMs?: number;
}

/**
 * 数据源实例运行时：一实例一请求，状态与缓存都挂在实例上。
 *
 * 三条不变式：
 * 1. **请求身份是实例**，不是组件。两个组件引用同一实例、同一参数时共用一条 entry，
 *    宿主只被调用一次；`path` 与 `dataBinding` 只影响投影，不进请求键。
 * 2. **同键复用**：请求键未变且已有结果就不再发请求（`updatePolicy.mode:'once'` 的实现，
 *    也是「A 卸载后 B 仍能读」的依据）。显式 `refresh()` 才会重发。
 * 3. **代际作废**：每次发起前 `generation++`；回包落地前比对代际与请求键，晚到的旧结果
 *    直接丢弃，不会改写新结果。
 */
export class DataSourceRuntime {
  readonly #entries = new Map<string, InternalEntry>();
  #document: ScreenDocument | undefined;
  #variables: ScreenJsonObject = {};

  constructor(private readonly options: DataSourceRuntimeOptions) {}

  /**
   * 按拓扑序确保所有实例的状态与请求。
   *
   * 参数用 core 的 `evaluateScreenValueRef` 求值；参数 pending 的实例本轮跳过（下一轮
   * 依赖 settle 后再来），failed 的实例记错误状态。
   */
  ensure(
    document: ScreenDocument,
    variables: ScreenJsonObject,
    context: { readonly trigger: string; readonly traceId: string },
    options: { readonly startOnly?: ReadonlySet<string> } = {},
  ): void {
    this.#document = document;
    this.#variables = variables;
    const environment: MutableEnvironment = {
      variableValues: variables,
      dataSourceValues: new Map(),
      dataSourceErrors: new Map(),
    };
    const instances = orderDataSources(document);
    for (const instance of instances) {
      const entry = this.#entry(instance.id);
      entry.source = instance.source;
      this.#ensureInstance(entry, instance, environment, context, options.startOnly);
    }
    // 文档里已经不存在的实例：取消在途请求并丢弃条目（文档是唯一真相）。
    const live = new Set(instances.map((instance) => instance.id));
    for (const [id, entry] of this.#entries) {
      if (live.has(id)) continue;
      this.#cancel(entry);
      this.#entries.delete(id);
    }
  }

  /**
   * 上报一次组件投影完成（`adapted` 观察者事件）。
   *
   * 投影是逐组件的，请求是逐实例的：所以「适配完成」这个事件挂在组件上，
   * 而请求身份（requestId/context）仍取该实例最近一次请求的。
   */
  reportProjection(
    dataSourceId: string,
    componentId: string,
    value: ScreenJsonValue | undefined,
  ): void {
    const entry = this.#entries.get(dataSourceId);
    if (entry === undefined) return;
    const counts = readTabularCounts(value);
    this.#emit(
      entry,
      'adapted',
      {
        startedAt: entry.startedAt,
        ...counts,
      },
      componentId,
    );
  }

  read(dataSourceId: string): DataSourceRuntimeEntry | undefined {
    return this.#entries.get(dataSourceId);
  }

  entryIds(): readonly string[] {
    return [...this.#entries.keys()];
  }

  /**
   * 求值一个取值引用：实例状态从这里读，`path` 下钻与体积上限交给 core 的同一实现。
   *
   * 只有该引用指向的实例会进环境；其它实例与本组件无关，不参与求值。
   */
  evaluate(ref: ScreenValueRef): ScreenValueRefEvaluation {
    const values = new Map<string, ScreenJsonValue>();
    const errors = new Map<string, ScreenDiagnostic>();
    if (ref.kind === 'data-source-field') {
      const entry = this.#entries.get(ref.dataSourceId);
      if (entry?.dataState.status === 'ready' && entry.rawValue !== undefined) {
        values.set(ref.dataSourceId, entry.rawValue);
      } else if (entry?.dataState.status === 'error') {
        errors.set(ref.dataSourceId, entry.rawError ?? genericFailure('Host data source failed.'));
      }
    }
    const environment: ScreenValueRefEnvironment = {
      variableValues: this.#variables,
      dataSourceValues: values,
      dataSourceErrors: errors,
    };
    return evaluateScreenValueRef(ref, environment);
  }

  /**
   * 显式刷新：作废当前结果并按同一请求键重发。
   *
   * 不传 `dataSourceId` 表示全部实例。返回被重新发起的实例 id。
   */
  refresh(
    dataSourceId?: string,
    context?: { readonly trigger: string; readonly traceId: string },
  ): readonly string[] {
    const ids =
      dataSourceId === undefined
        ? [...this.#entries.keys()]
        : this.#entries.has(dataSourceId)
          ? [dataSourceId]
          : [];
    const restarted: string[] = [];
    for (const id of ids) {
      const entry = this.#entries.get(id)!;
      if (entry.requestKey === undefined) continue;
      // 已有同键在途请求：刷新合并进去，不取消、不重发（重复刷新不放大请求）。
      // 判据用协调器的槽位状态：回包已 settle（槽位释放）但本地回调还没跑完时，
      // 这一轮刷新应当照常重发，而不是被自己的延迟收尾挡掉。
      if (
        entry.requestSlotId !== undefined &&
        this.options.coordinator?.isPending(entry.requestSlotId) === true
      ) {
        continue;
      }
      this.#cancel(entry);
      // 刷新保留上一轮结果：不把材料打回 loading（无闪断），新结果落地后覆盖。
      this.#startRequest(entry, context ?? { trigger: 'manual', traceId: '' });
      restarted.push(id);
    }
    return restarted;
  }

  /** 数据挂起：中止全部在途请求并把实例置为 loading（等待变量解析后再 ensure）。 */
  suspend(): void {
    for (const entry of this.#entries.values()) {
      this.#cancel(entry);
      entry.dataState = { status: 'loading' };
      entry.rawValue = undefined;
      entry.rawError = undefined;
      this.options.onChanged(entry.dataSourceId);
    }
  }

  clear(): void {
    for (const entry of this.#entries.values()) {
      this.#cancel(entry);
    }
    this.#entries.clear();
    this.#document = undefined;
    this.#variables = {};
  }

  #entry(dataSourceId: string): InternalEntry {
    const existing = this.#entries.get(dataSourceId);
    if (existing !== undefined) return existing;
    const created: InternalEntry = {
      dataSourceId,
      requestKey: undefined,
      dataState: { status: 'loading' },
      rawValue: undefined,
      generation: 0,
      requestSlotId: undefined,
      rawError: undefined,
      source: undefined,
      params: {},
      requestId: undefined,
      executionContext: undefined,
      startedAt: undefined,
    };
    this.#entries.set(dataSourceId, created);
    return created;
  }

  #ensureInstance(
    entry: InternalEntry,
    instance: ScreenDataSource,
    environment: MutableEnvironment,
    context: { readonly trigger: string; readonly traceId: string },
    startOnly: ReadonlySet<string> | undefined,
  ): void {
    const params = this.#evaluateParams(instance.params, environment);
    if (params.kind === 'pending') {
      // 参数还没就绪：本轮不决策请求键，也不发请求（在途请求按自己的代际继续）。
      entry.dataState = { status: 'loading' };
      return;
    }
    if (params.kind === 'failed') {
      this.#fail(entry, params.diagnostic);
      environment.dataSourceErrors.set(entry.dataSourceId, params.diagnostic);
      return;
    }
    const requestKey = requestKeyOf(entry.dataSourceId, instance.source, params.params);
    if (entry.requestKey !== requestKey) {
      this.#cancel(entry);
      entry.requestKey = requestKey;
      entry.params = params.params;
      entry.dataState = { status: 'loading' };
      entry.rawValue = undefined;
      entry.rawError = undefined;
    }
    if (entry.requestSlotId !== undefined) {
      // 在途：本轮没有结果也没有错误。
      return;
    }
    if (entry.dataState.status === 'ready') {
      if (entry.rawValue !== undefined) {
        environment.dataSourceValues.set(entry.dataSourceId, entry.rawValue);
      }
      return;
    }
    if (entry.dataState.status === 'error') {
      environment.dataSourceErrors.set(
        entry.dataSourceId,
        entry.rawError ?? genericFailure('Host data source failed.'),
      );
      return;
    }
    if (startOnly !== undefined && !startOnly.has(entry.dataSourceId)) return;
    this.#startRequest(entry, context);
  }

  #evaluateParams(
    params: Readonly<Record<string, ScreenValueRef>>,
    environment: MutableEnvironment,
  ):
    | { readonly kind: 'ok'; readonly params: ScreenJsonObject }
    | { readonly kind: 'pending' }
    | { readonly kind: 'failed'; readonly diagnostic: ScreenDiagnostic } {
    const values: Record<string, ScreenJsonValue> = {};
    let pending = false;
    for (const [name, ref] of Object.entries(params)) {
      const evaluated = evaluateScreenValueRef(ref, environment);
      if (evaluated.kind === 'pending') {
        pending = true;
        continue;
      }
      if (evaluated.kind === 'failed') {
        return {
          kind: 'failed',
          diagnostic: genericFailure(
            evaluated.reason === 'variable-missing'
              ? 'Data source parameter references a variable without a value.'
              : 'Data source parameter is invalid.',
          ),
        };
      }
      // 参数必须是可序列化的 JSON：字段缺失（undefined）不能作为参数值。
      if (evaluated.value === undefined) {
        return {
          kind: 'failed',
          diagnostic: genericFailure('Data source parameter resolved to no value.'),
        };
      }
      values[name] = evaluated.value;
    }
    if (pending) return { kind: 'pending' };
    return { kind: 'ok', params: values };
  }

  #startRequest(
    entry: InternalEntry,
    context: { readonly trigger: string; readonly traceId: string },
  ): void {
    const source = entry.source;
    if (source === undefined || entry.requestKey === undefined) return;
    if (this.options.isSuspended()) return;
    if (!this.options.sourcePort.accepts(source)) {
      this.#fail(
        entry,
        {
          severity: 'error',
          code: 'HOST_RESOURCE_UNAVAILABLE',
          path: [],
          message: 'Host resource port is unavailable.',
        },
        { emitStarted: true },
      );
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    const paramDiagnostic = this.options.validateParams?.(source, entry.params);
    if (paramDiagnostic !== undefined) {
      this.#fail(entry, paramDiagnostic, { emitStarted: false });
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    const coordinator = this.options.coordinator;
    if (coordinator === undefined) {
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    const generation = ++entry.generation;
    const executionContext = this.options.createExecutionContext(context, entry.dataSourceId);
    const startedAt = Date.now();
    const requestId = `${entry.dataSourceId}:${entry.requestKey}:${generation}`;
    entry.executionContext = executionContext;
    entry.startedAt = startedAt;
    entry.requestId = requestId;
    const { resolution, slotId } = coordinator.request(
      entry.requestKey,
      shareScopeOf(source),
      entry.dataSourceId,
      { dataSourceId: entry.dataSourceId, source, params: entry.params },
      executionContext,
    );
    entry.requestSlotId = slotId;
    this.#emit(entry, 'started', { startedAt });
    void resolution.then((settled) => {
      if (this.#entries.get(entry.dataSourceId) !== entry) return;
      if (entry.generation !== generation || entry.requestSlotId !== slotId) return;
      entry.requestSlotId = undefined;
      if (settled.kind === 'timeout') {
        this.#fail(
          entry,
          {
            severity: 'error',
            code: 'HOST_RESOURCE_TIMEOUT',
            path: [],
            message: 'Host data source request timed out.',
          },
          { emitStarted: false },
        );
        this.#emit(entry, 'timed-out', { startedAt, code: 'HOST_RESOURCE_TIMEOUT' });
        this.options.onChanged(entry.dataSourceId);
        return;
      }
      if (settled.kind === 'failure') {
        const diagnostic = settled.diagnostics.diagnostics[0];
        const failure = diagnostic === undefined ? genericFailure() : diagnostic;
        this.#fail(entry, failure, { emitStarted: false });
        this.#emit(entry, 'failed', {
          startedAt,
          code: normalizeScreenMaterialError(failure).code,
        });
        this.options.onChanged(entry.dataSourceId);
        return;
      }
      const parsed = parseScreenJsonValue(settled.value, {
        maxBytes: MAX_DATA_SOURCE_VALUE_BYTES,
      });
      if (!parsed.ok) {
        const invalid: ScreenDiagnostic = {
          severity: 'error',
          code: 'HOST_RESOURCE_INVALID',
          path: [],
          message: 'Host data source returned invalid JSON.',
        };
        this.#fail(entry, invalid, { emitStarted: false });
        this.#emit(entry, 'failed', { startedAt, code: invalid.code });
        this.options.onChanged(entry.dataSourceId);
        return;
      }
      entry.dataState = { status: 'ready', value: parsed.value };
      entry.rawValue = parsed.value;
      entry.rawError = undefined;
      const tabular = readTabularCounts(parsed.value);
      this.#emit(entry, 'succeeded', { startedAt, ...tabular });
      this.options.onChanged(entry.dataSourceId);
    });
  }

  #fail(
    entry: InternalEntry,
    diagnostic: ScreenDiagnostic,
    options: { readonly emitStarted: boolean } = { emitStarted: false },
  ): void {
    entry.generation++;
    entry.requestSlotId = undefined;
    entry.rawValue = undefined;
    entry.rawError = diagnostic;
    const normalized = normalizeScreenMaterialError(diagnostic);
    entry.dataState = { status: 'error', code: normalized.code, message: normalized.message };
    if (options.emitStarted) this.#emit(entry, 'started', { startedAt: undefined });
    this.#emit(entry, 'failed', { startedAt: undefined, code: normalized.code });
  }

  #cancel(entry: InternalEntry): void {
    const slotId = entry.requestSlotId;
    entry.generation++;
    entry.requestSlotId = undefined;
    if (slotId !== undefined) {
      this.options.coordinator?.release(slotId, entry.dataSourceId);
      // 只有「正在途的请求被取消」才算 aborted；已 settle 的结果被丢弃不报事件。
      this.#emit(entry, 'aborted', { startedAt: undefined });
    }
    entry.requestId = undefined;
  }

  #emit(
    entry: InternalEntry,
    type: DataSourceRuntimeObserverEvent['type'],
    meta: {
      readonly startedAt: number | undefined;
      readonly fieldCount?: number | undefined;
      readonly rowCount?: number | undefined;
      readonly code?: string | undefined;
    },
    componentId?: string,
  ): void {
    const source = entry.source;
    if (source === undefined) return;
    const identity = sourceIdentity(source);
    const executionContext =
      entry.executionContext ??
      this.options.createExecutionContext({ trigger: 'manual', traceId: '' }, entry.dataSourceId);
    this.options.emit({
      type,
      dataSourceId: entry.dataSourceId,
      componentId: componentId ?? this.#consumerOf(entry.dataSourceId),
      resourceType: identity.resourceType,
      resourceId: identity.resourceId,
      requestId: entry.requestId,
      context: executionContext,
      startedAt: meta.startedAt,
      ...(meta.fieldCount === undefined ? {} : { fieldCount: meta.fieldCount }),
      ...(meta.rowCount === undefined ? {} : { rowCount: meta.rowCount }),
      ...(meta.code === undefined ? {} : { code: meta.code }),
    });
  }

  #consumerOf(dataSourceId: string): string {
    const components = this.#document?.components ?? [];
    for (const component of components) {
      const ref = readScreenComponentValueRef(component);
      if (ref?.kind === 'data-source-field' && ref.dataSourceId === dataSourceId) {
        return component.id;
      }
    }
    return dataSourceId;
  }
}

type MutableEnvironment = {
  readonly variableValues: ScreenJsonObject;
  readonly dataSourceValues: Map<string, ScreenJsonValue>;
  readonly dataSourceErrors: Map<string, ScreenDiagnostic>;
};

/**
 * 实例的执行顺序：已声明的实例按 contracts 的拓扑序，旧形态合成的实例追加在后。
 *
 * 合成实例的参数只可能是 `inline`/`variable`（没有 `data-source-field`），因此不参与
 * 实例间依赖，追加不会破坏拓扑序。
 */
function orderDataSources(document: ScreenDocument): readonly ScreenDataSource[] {
  const instances = readScreenDocumentDataSources(document);
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const ordered: ScreenDataSource[] = [];
  for (const id of screenDataSourceOrder(document)) {
    const instance = byId.get(id);
    if (instance === undefined) continue;
    ordered.push(instance);
    byId.delete(id);
  }
  for (const instance of instances) {
    if (byId.has(instance.id)) ordered.push(instance);
  }
  return ordered;
}

/**
 * 请求键：实例 id + 来源 + 求值后的参数。
 *
 * `path` 与 `dataBinding` 只影响投影，绝不进键；来源必须进键——同一实例的来源可以在编辑中
 * 被改写（换数据集/换资源/换目录项），那时实例 id 不变但请求必须重发。
 */
export function requestKeyOf(
  dataSourceId: string,
  source: ScreenDataSourceSource,
  params: ScreenJsonObject,
): string {
  return `ds:${dataSourceId}:${canonicalJsonString(source as unknown as ScreenJsonValue)}:${canonicalJsonString(params)}`;
}

function sourceIdentity(source: ScreenDataSourceSource): {
  readonly resourceType: string;
  readonly resourceId: string;
} {
  switch (source.kind) {
    case 'dataset':
      return { resourceType: 'dataset', resourceId: source.datasetId };
    case 'host-resource':
      return { resourceType: source.resourceType, resourceId: source.resourceId };
    default:
      return { resourceType: source.kind, resourceId: source.sourceId };
  }
}

function readTabularCounts(value: ScreenJsonValue | undefined): {
  readonly fieldCount?: number;
  readonly rowCount?: number;
} {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const fields = (value as { readonly fields?: unknown }).fields;
  const rows = (value as { readonly rows?: unknown }).rows;
  return {
    ...(Array.isArray(fields) ? { fieldCount: fields.length } : {}),
    ...(Array.isArray(rows) ? { rowCount: rows.length } : {}),
  };
}

function genericFailure(message: string = 'Host resource request failed.'): ScreenDiagnostic {
  return { severity: 'error', code: 'HOST_RESOURCE_FAILED', path: [], message };
}
