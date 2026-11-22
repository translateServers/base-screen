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
  type ScreenParseResult,
  type ScreenPushCursor,
  type ScreenPushRetainPolicy,
  type ScreenResourceExecutionContext,
  type ScreenSourceConnectionStatus,
  type ScreenSourceDelivery,
  type ScreenSourcePushEvent,
  type ScreenUpdatePolicy,
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
import {
  classifyPushCursor,
  isPushTabularValue,
  type PushTabularValue,
  pushRowsMatchFields,
  readPushCursor,
  trimPushRows,
  trimPushValueToBytes,
} from './push-window.js';
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
  /** 推送实例的连接状态（ADR-0104 §2.6）；非推送实例或未订阅时为 undefined。只在运行时存在。 */
  connection: ScreenSourceConnectionStatus | undefined;
}

/**
 * 一次推送会话（一个逻辑订阅）。会话对象本身就是代际：订阅被停掉或被新会话取代后，
 * 旧 sink 上的任何事件都因 `entry.push !== session` 被丢弃，不依赖宿主及时停推。
 */
type PushSession = {
  readonly id: number;
  /** `fallback-only`：来源不支持订阅、按 `fallbackIntervalSeconds` 轮询。 */
  readonly mode: 'subscribed' | 'fallback-only';
  readonly controller: AbortController | undefined;
  readonly retain: ScreenPushRetainPolicy | undefined;
  readonly append: boolean;
  readonly inactivityMs: number | undefined;
  readonly fallbackMs: number | undefined;
  cursor: ScreenPushCursor | undefined;
  snapshotReceived: boolean;
  resyncing: boolean;
  inactive: boolean;
  stopped: boolean;
  warnedTimeField: boolean;
  frameEvents: number;
  cancelFrame: (() => void) | undefined;
  cancelSnapshotTimer: (() => void) | undefined;
  cancelInactivityTimer: (() => void) | undefined;
  cancelFallbackTimer: (() => void) | undefined;
};

type InternalEntry = DataSourceRuntimeEntry & {
  params: ScreenJsonObject;
  requestId: string | undefined;
  executionContext: ScreenResourceExecutionContext | undefined;
  startedAt: number | undefined;
  /** 当前生效的 push 策略的规范串：策略切换（含 push ↔ 非 push）时重置实例。 */
  pushPolicyKey: string | undefined;
  pushPolicy: ScreenUpdatePolicy | undefined;
  push: PushSession | undefined;
};

/** 计时与合帧的注入点：测试可替换为手动时钟。 */
export interface DataSourceRuntimeClock {
  now(): number;
  setTimeout(task: () => void, delayMs: number): () => void;
  requestFrame(task: () => void): () => void;
}

export interface DataSourceRuntimePushOptions {
  /** 设计态不订阅（ADR-0104 §2.4.10）：false 时 push 实例按一次性拉取处理。 */
  readonly enabled: boolean;
  /** 来源的推送能力声明；undefined 表示该来源只支持拉取。 */
  readonly delivery: (source: ScreenDataSourceSource) => ScreenSourceDelivery['push'] | undefined;
  /** 订阅后等待首个快照的上限；缺省 15000 ms。 */
  readonly snapshotTimeoutMs?: number;
  /** 非致命诊断（例如降级为轮询）。 */
  readonly onWarning?: (diagnostic: ScreenDiagnostic) => void;
}

const PUSH_CONNECTION_STATUSES: ReadonlySet<string> = new Set([
  'connecting',
  'open',
  'reconnecting',
  'suspended',
  'failed',
]);

export interface DataSourceRuntimeObserverEvent {
  readonly type:
    | 'started'
    | 'succeeded'
    | 'failed'
    | 'aborted'
    | 'timed-out'
    | 'adapted'
    | 'subscribed'
    | 'unsubscribed'
    | 'pushed'
    | 'connection'
    | 'resync';
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
  readonly cursor?: ScreenPushCursor | undefined;
  readonly connection?: ScreenSourceConnectionStatus | undefined;
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
  /** 推送（ADR-0104）；缺省视为未启用，push 实例按一次性拉取处理。 */
  readonly push?: DataSourceRuntimePushOptions;
  readonly clock?: DataSourceRuntimeClock;
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
  readonly #clock: DataSourceRuntimeClock;
  #pushSessionSeed = 0;
  #document: ScreenDocument | undefined;
  #variables: ScreenJsonObject = {};
  #variablesKey = canonicalJsonString({});

  constructor(private readonly options: DataSourceRuntimeOptions) {
    this.#clock = options.clock ?? defaultClock();
  }

  /**
   * 变量对象的规范化键：结构相等即同键。渲染守卫用它判定「非实例取值
   * （variable/inline 参数求值）的数据输入是否与上次相同」。
   */
  get variablesKey(): string {
    return this.#variablesKey;
  }

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
    if (variables !== this.#variables) {
      this.#variables = variables;
      this.#variablesKey = canonicalJsonString(variables);
    }
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
      // 推送实例：退订后重新订阅拿新快照，不额外 resolve；当前值保留到新快照落地（ADR-0104 §2.4.7）。
      if (entry.pushPolicy !== undefined) {
        if (entry.push === undefined && entry.dataState.status === 'loading') continue;
        this.#cancel(entry);
        if (entry.dataState.status === 'error') entry.dataState = { status: 'loading' };
        this.#startPush(entry, entry.pushPolicy, context ?? { trigger: 'manual', traceId: '' });
        restarted.push(id);
        continue;
      }
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
    this.#variablesKey = canonicalJsonString({});
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
      connection: undefined,
      pushPolicyKey: undefined,
      pushPolicy: undefined,
      push: undefined,
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
    const pushPolicy = this.#pushPolicyOf(instance);
    const pushPolicyKey =
      pushPolicy === undefined
        ? undefined
        : canonicalJsonString(pushPolicy as unknown as ScreenJsonValue);
    if (entry.pushPolicyKey !== pushPolicyKey) {
      // 策略切换（含 push ↔ 非 push、窗口或回退间隔变化）：旧订阅与旧值一律作废。
      this.#cancel(entry);
      entry.pushPolicyKey = pushPolicyKey;
      entry.pushPolicy = pushPolicy;
      entry.dataState = { status: 'loading' };
      entry.rawValue = undefined;
      entry.rawError = undefined;
    }
    if (pushPolicy !== undefined) {
      this.#ensurePush(entry, pushPolicy, environment, context, startOnly);
      return;
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
      if (settled.kind !== 'ok' && this.#keepPushValueOnPullFailure(entry)) {
        this.#emit(entry, settled.kind === 'timeout' ? 'timed-out' : 'failed', {
          startedAt,
          code:
            settled.kind === 'timeout'
              ? 'HOST_RESOURCE_TIMEOUT'
              : normalizeScreenMaterialError(
                  settled.diagnostics.diagnostics[0] ?? genericFailure(),
                ).code,
        });
        return;
      }
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
      if (entry.push !== undefined) {
        // 推送实例的拉取（invalidate / 回退轮询）：结果即新的快照基准。
        this.#acceptResolvedSnapshot(entry, entry.push, parsed.value);
      } else {
        entry.dataState = { status: 'ready', value: parsed.value };
        entry.rawValue = parsed.value;
        entry.rawError = undefined;
      }
      const tabular = readTabularCounts(entry.rawValue);
      this.#emit(entry, 'succeeded', { startedAt, ...tabular });
      this.options.onChanged(entry.dataSourceId);
    });
  }

  /**
   * 推送实例的补拉（回退轮询 / `invalidate`）失败：已有值时保留它并标过期，不清成 error
   * （ADR-0104 §2.6）。后端整体不可用时，suspended 期间的每次回退轮询都会失败——若按普通
   * 拉取处理，第一次回退就会把画面清空，正好违背「离线保留旧值并提示过期」。
   * 订阅仍在；下一个推送事件清除这里置的静默标记，过期与否回到按连接状态推导。
   */
  #keepPushValueOnPullFailure(entry: InternalEntry): boolean {
    const session = entry.push;
    if (session === undefined || session.mode !== 'subscribed') return false;
    if (entry.dataState.status !== 'ready' || entry.rawValue === undefined) return false;
    session.inactive = true;
    this.#syncStale(entry);
    return true;
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
    this.#stopPush(entry);
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
      readonly cursor?: ScreenPushCursor | undefined;
      readonly connection?: ScreenSourceConnectionStatus | undefined;
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
      ...(meta.cursor === undefined ? {} : { cursor: meta.cursor }),
      ...(meta.connection === undefined ? {} : { connection: meta.connection }),
    });
  }

  // ---------------------------------------------------------------------------
  // 推送（ADR-0104）
  // ---------------------------------------------------------------------------

  /** 生效的 push 策略：设计态、未启用推送或 `url-query` 来源时为 undefined（按拉取处理）。 */
  #pushPolicyOf(instance: ScreenDataSource): ScreenUpdatePolicy | undefined {
    const policy = instance.updatePolicy;
    if (policy?.mode !== 'push') return undefined;
    if (this.options.push?.enabled !== true) return undefined;
    if (instance.source.kind === 'url-query') return undefined;
    return policy;
  }

  #ensurePush(
    entry: InternalEntry,
    policy: ScreenUpdatePolicy,
    environment: MutableEnvironment,
    context: { readonly trigger: string; readonly traceId: string },
    startOnly: ReadonlySet<string> | undefined,
  ): void {
    // 已有会话（含失败后仍在重试的订阅）或在途拉取：只导出当前状态，不重复订阅。
    const active = entry.push !== undefined || entry.requestSlotId !== undefined;
    if (!active && entry.dataState.status === 'loading') {
      if (startOnly !== undefined && !startOnly.has(entry.dataSourceId)) return;
      this.#startPush(entry, policy, context);
    }
    if (entry.dataState.status === 'ready' && entry.rawValue !== undefined) {
      environment.dataSourceValues.set(entry.dataSourceId, entry.rawValue);
    } else if (entry.dataState.status === 'error') {
      environment.dataSourceErrors.set(
        entry.dataSourceId,
        entry.rawError ?? genericFailure('Host data source failed.'),
      );
    }
  }

  #startPush(
    entry: InternalEntry,
    policy: ScreenUpdatePolicy,
    context: { readonly trigger: string; readonly traceId: string },
  ): void {
    const source = entry.source;
    const push = this.options.push;
    if (source === undefined || entry.requestKey === undefined || push === undefined) return;
    if (this.options.isSuspended()) return;
    const delivery = push.delivery(source);
    const fallbackMs =
      policy.fallbackIntervalSeconds === undefined
        ? undefined
        : policy.fallbackIntervalSeconds * 1000;
    const canSubscribe = delivery !== undefined && this.options.sourcePort.acceptsPush(source);
    if (!canSubscribe) {
      if (fallbackMs === undefined) {
        this.#fail(entry, unavailable('Host data source does not support push.'), {
          emitStarted: true,
        });
        this.options.onChanged(entry.dataSourceId);
        return;
      }
      // 门控降级（ADR-0104 §2.3）：有回退间隔就按间隔轮询，并报一条 warning。
      push.onWarning?.({
        severity: 'warning',
        code: 'HOST_RESOURCE_UNAVAILABLE',
        path: [],
        message: 'Host data source does not support push; falling back to polling.',
      });
      const session = this.#createSession('fallback-only', policy, undefined, fallbackMs);
      entry.push = session;
      this.#startRequest(entry, context);
      this.#scheduleFallback(entry, session);
      return;
    }
    const paramDiagnostic = this.options.validateParams?.(source, entry.params);
    if (paramDiagnostic !== undefined) {
      this.#fail(entry, paramDiagnostic, { emitStarted: false });
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    const controller = new AbortController();
    const session = this.#createSession('subscribed', policy, delivery, fallbackMs, controller);
    entry.push = session;
    entry.connection = 'connecting';
    const startedAt = this.#clock.now();
    const executionContext = this.options.createExecutionContext(context, entry.dataSourceId);
    entry.executionContext = executionContext;
    entry.startedAt = startedAt;
    entry.requestId = `${entry.dataSourceId}:${entry.requestKey}:push:${session.id}`;
    let result: ScreenParseResult<null>;
    try {
      result = this.options.sourcePort.subscribe(
        { dataSourceId: entry.dataSourceId, source, params: entry.params },
        { push: (event) => this.#onPushEvent(entry, session, event) },
        {
          signal: controller.signal,
          context: executionContext,
          ...(policy.retain === undefined ? {} : { retain: policy.retain }),
        },
      );
    } catch {
      result = { ok: false, diagnostics: [genericFailure('Host subscription failed.')] };
    }
    if (entry.push !== session) return; // 宿主在 subscribe 内同步报了 failed
    if (!result.ok) {
      this.#stopPush(entry, false);
      this.#fail(entry, result.diagnostics[0] ?? genericFailure('Host subscription failed.'), {
        emitStarted: true,
      });
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    this.#emit(entry, 'subscribed', { startedAt });
    if (!session.snapshotReceived) {
      session.cancelSnapshotTimer = this.#clock.setTimeout(
        () => this.#onSnapshotTimeout(entry, session),
        push.snapshotTimeoutMs ?? 15_000,
      );
    }
    this.#armInactivity(entry, session);
  }

  #createSession(
    mode: PushSession['mode'],
    policy: ScreenUpdatePolicy,
    delivery: ScreenSourceDelivery['push'] | undefined,
    fallbackMs: number | undefined,
    controller?: AbortController,
  ): PushSession {
    const inactivitySeconds = delivery?.inactivityTimeoutSeconds;
    return {
      id: ++this.#pushSessionSeed,
      mode,
      controller,
      retain: policy.retain,
      append: delivery?.append === true,
      inactivityMs: inactivitySeconds === undefined ? undefined : inactivitySeconds * 1000,
      fallbackMs,
      cursor: undefined,
      snapshotReceived: false,
      resyncing: false,
      inactive: false,
      stopped: false,
      warnedTimeField: false,
      frameEvents: 0,
      cancelFrame: undefined,
      cancelSnapshotTimer: undefined,
      cancelInactivityTimer: undefined,
      cancelFallbackTimer: undefined,
    };
  }

  #onPushEvent(entry: InternalEntry, session: PushSession, event: ScreenSourcePushEvent): void {
    if (session.stopped || entry.push !== session) return;
    if (this.#entries.get(entry.dataSourceId) !== entry) return;
    if (event === null || typeof event !== 'object') return;
    // 任何事件（含心跳）都刷新静默计时。
    session.inactive = false;
    this.#armInactivity(entry, session);
    switch (event.type) {
      case 'heartbeat':
        break;
      case 'status':
        this.#onPushStatus(entry, session, event.status, event.diagnostic);
        if (entry.push !== session) return;
        break;
      case 'snapshot':
        this.#onPushSnapshot(entry, session, event.value, event.cursor);
        if (entry.push !== session) return;
        break;
      case 'append':
        this.#onPushAppend(entry, session, event.rows, event.cursor);
        if (entry.push !== session) return;
        break;
      case 'invalidate':
        // 请重新获取快照：同键 resolve，期间保留当前值；已有在途拉取就合并。
        if (
          entry.requestSlotId === undefined ||
          this.options.coordinator?.isPending(entry.requestSlotId) !== true
        ) {
          this.#startRequest(entry, { trigger: 'push', traceId: '' });
        }
        break;
      default:
        return;
    }
    this.#syncStale(entry);
  }

  #onPushStatus(
    entry: InternalEntry,
    session: PushSession,
    status: unknown,
    diagnostic: ScreenDiagnostic | undefined,
  ): void {
    if (typeof status !== 'string' || !PUSH_CONNECTION_STATUSES.has(status)) return;
    const next = status as ScreenSourceConnectionStatus;
    if (next === entry.connection) return;
    entry.connection = next;
    this.#emit(entry, 'connection', { startedAt: entry.startedAt, connection: next });
    if (next === 'failed') {
      // 不可恢复：停订阅、进 error，不保留旧值（ADR-0104 §2.6）。
      this.#stopPush(entry);
      this.#fail(entry, diagnostic ?? unavailable('Host data source connection failed.'));
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    if (next === 'suspended') {
      if (session.fallbackMs !== undefined) this.#scheduleFallback(entry, session);
      if (entry.dataState.status !== 'ready') {
        this.#setError(entry, unavailable('Host data source is offline.'));
      }
    } else if (next === 'open') {
      session.cancelFallbackTimer?.();
      session.cancelFallbackTimer = undefined;
    }
    this.#markChanged(entry);
  }

  #onPushSnapshot(
    entry: InternalEntry,
    session: PushSession,
    value: unknown,
    rawCursor: unknown,
  ): void {
    const cursor = readPushCursor(rawCursor);
    if (classifyPushCursor(session.cursor, cursor, 'snapshot') === 'duplicate') return;
    const parsed = parseScreenJsonValue(value, { maxBytes: MAX_DATA_SOURCE_VALUE_BYTES });
    if (!parsed.ok) {
      this.#pushViolation(entry, 'Host push snapshot is invalid JSON.');
      return;
    }
    session.cursor = cursor;
    session.snapshotReceived = true;
    session.cancelSnapshotTimer?.();
    session.cancelSnapshotTimer = undefined;
    if (session.resyncing) session.resyncing = false;
    this.#setReady(entry, this.#windowed(entry, session, parsed.value));
    this.#markChanged(entry);
  }

  #onPushAppend(
    entry: InternalEntry,
    session: PushSession,
    rows: unknown,
    rawCursor: unknown,
  ): void {
    // 首个快照前、重同步中：增量没有基准，丢弃，等新快照。
    if (!session.snapshotReceived || session.resyncing) return;
    if (!session.append) {
      this.#pushViolation(entry, 'Host pushed append without declaring append delivery.');
      return;
    }
    const current = entry.rawValue;
    if (!isPushTabularValue(current)) {
      this.#pushViolation(entry, 'Host pushed append for a non-tabular value.');
      return;
    }
    const cursor = readPushCursor(rawCursor);
    const verdict = classifyPushCursor(session.cursor, cursor, 'append');
    if (verdict === 'duplicate') return;
    if (verdict === 'gap') {
      session.resyncing = true;
      this.#emit(entry, 'resync', {
        startedAt: entry.startedAt,
        ...(session.cursor === undefined ? {} : { cursor: session.cursor }),
      });
      this.#markChanged(entry);
      return;
    }
    const parsed = parseScreenJsonValue(rows, { maxBytes: MAX_DATA_SOURCE_VALUE_BYTES });
    if (!parsed.ok || !pushRowsMatchFields(parsed.value, current)) {
      this.#pushViolation(entry, 'Host pushed rows that do not match the dataset fields.');
      return;
    }
    if (cursor !== undefined) session.cursor = cursor;
    const merged: PushTabularValue = { ...current, rows: [...current.rows, ...parsed.value] };
    this.#setReady(entry, this.#windowed(entry, session, merged));
    this.#markChanged(entry);
  }

  /** 推送实例经 resolve（invalidate / 回退轮询）拿到的结果：作为新快照基准，游标清空。 */
  #acceptResolvedSnapshot(
    entry: InternalEntry,
    session: PushSession,
    value: ScreenJsonValue,
  ): void {
    session.cursor = undefined;
    session.snapshotReceived = true;
    session.resyncing = false;
    session.cancelSnapshotTimer?.();
    session.cancelSnapshotTimer = undefined;
    this.#setReady(entry, this.#windowed(entry, session, value));
  }

  /** 表格值按保留窗口裁剪；只有声明了 `append` 或 `retain` 的会话才裁行。 */
  #windowed(entry: InternalEntry, session: PushSession, value: ScreenJsonValue): ScreenJsonValue {
    if (!isPushTabularValue(value)) return value;
    if (!session.append && session.retain === undefined) return value;
    const trimmed = trimPushRows(value.rows, session.retain);
    if (trimmed.unparseableTime && !session.warnedTimeField) {
      session.warnedTimeField = true;
      this.options.push?.onWarning?.({
        severity: 'warning',
        code: 'HOST_RESOURCE_INVALID',
        path: ['dataSources', entry.dataSourceId, 'updatePolicy', 'retain', 'timeField'],
        message:
          'Push retain timeField is missing or unparseable on some rows; trimming by rows only.',
      });
    }
    return trimmed.rows === value.rows ? value : { ...value, rows: trimmed.rows };
  }

  /** 宿主违约（形状错误、未声明的增量）：停订阅、实例进 error。 */
  #pushViolation(entry: InternalEntry, message: string): void {
    this.#stopPush(entry);
    this.#fail(entry, { severity: 'error', code: 'HOST_RESOURCE_INVALID', path: [], message });
    this.options.onChanged(entry.dataSourceId);
  }

  #onSnapshotTimeout(entry: InternalEntry, session: PushSession): void {
    session.cancelSnapshotTimer = undefined;
    if (session.stopped || entry.push !== session || session.snapshotReceived) return;
    if (entry.dataState.status === 'ready') {
      // 重新订阅后迟迟没有新快照：保留旧值并标为过期，而不是清掉。
      session.inactive = true;
      this.#syncStale(entry);
      return;
    }
    this.#stopPush(entry);
    this.#fail(entry, {
      severity: 'error',
      code: 'HOST_RESOURCE_TIMEOUT',
      path: [],
      message: 'Host data source did not deliver a snapshot in time.',
    });
    this.#emit(entry, 'timed-out', { startedAt: entry.startedAt, code: 'HOST_RESOURCE_TIMEOUT' });
    this.options.onChanged(entry.dataSourceId);
  }

  #armInactivity(entry: InternalEntry, session: PushSession): void {
    if (session.inactivityMs === undefined || session.stopped) return;
    session.cancelInactivityTimer?.();
    session.cancelInactivityTimer = this.#clock.setTimeout(() => {
      session.cancelInactivityTimer = undefined;
      if (session.stopped || entry.push !== session) return;
      session.inactive = true;
      this.#syncStale(entry);
    }, session.inactivityMs);
  }

  /** 回退轮询：fallback-only 会话一直轮询；订阅会话只在连接 `suspended` 期间轮询。 */
  #scheduleFallback(entry: InternalEntry, session: PushSession): void {
    if (session.fallbackMs === undefined || session.cancelFallbackTimer !== undefined) return;
    session.cancelFallbackTimer = this.#clock.setTimeout(() => {
      session.cancelFallbackTimer = undefined;
      if (session.stopped || entry.push !== session) return;
      if (session.mode === 'subscribed' && entry.connection !== 'suspended') return;
      if (
        entry.requestSlotId === undefined ||
        this.options.coordinator?.isPending(entry.requestSlotId) !== true
      ) {
        this.#startRequest(entry, { trigger: 'polling', traceId: '' });
      }
      this.#scheduleFallback(entry, session);
    }, session.fallbackMs);
  }

  #stopPush(entry: InternalEntry, emit = true): void {
    const session = entry.push;
    if (session === undefined) return;
    session.stopped = true;
    session.controller?.abort();
    session.cancelFrame?.();
    session.cancelSnapshotTimer?.();
    session.cancelInactivityTimer?.();
    session.cancelFallbackTimer?.();
    entry.push = undefined;
    entry.connection = undefined;
    if (emit && session.mode === 'subscribed') {
      this.#emit(entry, 'unsubscribed', { startedAt: entry.startedAt });
    }
  }

  /** 过期（ADR-0104 §2.6）：连接短暂断开或长期无连接、重同步中、超过静默超时。 */
  #isStale(entry: InternalEntry): boolean {
    const session = entry.push;
    if (session === undefined || session.mode !== 'subscribed') return false;
    return (
      entry.connection === 'reconnecting' ||
      entry.connection === 'suspended' ||
      session.resyncing ||
      session.inactive
    );
  }

  #setReady(entry: InternalEntry, value: ScreenJsonValue): void {
    entry.rawValue = value;
    entry.rawError = undefined;
    entry.dataState = this.#isStale(entry)
      ? { status: 'ready', value, stale: true }
      : { status: 'ready', value };
  }

  /** 不停订阅的错误态：连接 suspended 且从未有值时用，之后的快照仍能恢复。 */
  #setError(entry: InternalEntry, diagnostic: ScreenDiagnostic): void {
    entry.rawValue = undefined;
    entry.rawError = diagnostic;
    const normalized = normalizeScreenMaterialError(diagnostic);
    entry.dataState = { status: 'error', code: normalized.code, message: normalized.message };
  }

  #syncStale(entry: InternalEntry): void {
    if (entry.dataState.status !== 'ready' || entry.rawValue === undefined) return;
    const stale = this.#isStale(entry);
    if ((entry.dataState.stale === true) === stale) return;
    this.#setReady(entry, entry.rawValue);
    this.#markChanged(entry);
  }

  /** 按帧合并通知（ADR-0104 §2.4.6）：每个实例每帧最多一次 `onChanged`。 */
  #markChanged(entry: InternalEntry): void {
    const session = entry.push;
    if (session === undefined) {
      this.options.onChanged(entry.dataSourceId);
      return;
    }
    session.frameEvents++;
    if (session.cancelFrame !== undefined) return;
    session.cancelFrame = this.#clock.requestFrame(() => {
      session.cancelFrame = undefined;
      if (session.stopped || entry.push !== session) return;
      if (this.#entries.get(entry.dataSourceId) !== entry) return;
      const value = entry.rawValue;
      if (entry.dataState.status === 'ready' && isPushTabularValue(value)) {
        const bounded = trimPushValueToBytes(value, MAX_DATA_SOURCE_VALUE_BYTES);
        if (bounded !== value) this.#setReady(entry, bounded);
      }
      // 观察事件按帧聚合（DRH-R8）：只带行数与游标，不带载荷。
      session.frameEvents = 0;
      this.#emit(entry, 'pushed', {
        startedAt: entry.startedAt,
        ...readTabularCounts(entry.rawValue),
        ...(session.cursor === undefined ? {} : { cursor: session.cursor }),
      });
      this.options.onChanged(entry.dataSourceId);
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

function unavailable(message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'HOST_RESOURCE_UNAVAILABLE', path: [], message };
}

/** 默认时钟：有 `requestAnimationFrame` 就按帧合并，否则退化为 16 ms 定时器。 */
function defaultClock(): DataSourceRuntimeClock {
  return {
    now: () => Date.now(),
    setTimeout: (task, delayMs) => {
      const handle = globalThis.setTimeout(task, delayMs);
      return () => globalThis.clearTimeout(handle);
    },
    requestFrame: (task) => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        const handle = globalThis.requestAnimationFrame(() => task());
        return () => globalThis.cancelAnimationFrame(handle);
      }
      const handle = globalThis.setTimeout(task, 16);
      return () => globalThis.clearTimeout(handle);
    },
  };
}
