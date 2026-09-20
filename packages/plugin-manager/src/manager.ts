import type { ScreenDiagnostic, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenPluginBlueprintActionHandler,
  type BaseScreenPluginCatalogEntry,
  type BaseScreenPluginCommandHandler,
  type BaseScreenPluginContribution,
  type BaseScreenPluginContributionKind,
  type BaseScreenPluginDataProcessorHandler,
  contributionHandlerField,
  createBaseScreenMaterialCatalog,
  createBaseScreenPluginCatalog,
  createBaseScreenPluginInspectorControlCatalog,
  createBaseScreenPluginPanelCatalog,
  declaredContributionIds,
  listContributionHandlerKinds,
  parsePluginCommandRequest,
} from '@base-screen/plugin-core';
import { CONTRIBUTION_KIND_PLAN } from './contribution-kind-plan.js';
import { createRuntimeContributionIndex } from './contributions.js';
import { failure, sortDiagnostics } from './diagnostics.js';
import {
  type ActivationPlan,
  type ActivationSession,
  createActivationPlan,
  type PlannedPlugin,
} from './preflight.js';
import type {
  BaseScreenPluginActivationFailure,
  BaseScreenPluginManager,
  BaseScreenPluginManagerOptions,
  BaseScreenPluginManagerSnapshot,
  BaseScreenPluginManagerStatus,
} from './types.js';

export function createBaseScreenPluginManager(
  options: BaseScreenPluginManagerOptions,
): BaseScreenPluginManager {
  return new PluginManager(options);
}

class PluginManager implements BaseScreenPluginManager {
  #status: BaseScreenPluginManagerStatus = 'inactive';
  #snapshot: BaseScreenPluginManagerSnapshot | undefined;
  #active: ActivePluginEntry[] = [];
  #disposalOrder: PlannedPlugin[] = [];
  #handlers = new ContributionHandlerRegistry();
  #disposePromise: Promise<ScreenParseResult<null>> | undefined;
  #queue: Promise<void> = Promise.resolve();
  // 懒激活状态：activate() 只完成预检与目录发布；插件钩子推迟到首次使用。
  #plan: ActivationPlan | undefined;
  #lazy: boolean = false;
  #declaredHandlers: DeclaredHandlerOwners = createDeclaredHandlerOwners();
  #lazyFailures = new Map<string, BaseScreenPluginActivationFailure>();

  constructor(private readonly options: BaseScreenPluginManagerOptions) {}

  get status(): BaseScreenPluginManagerStatus {
    return this.#status;
  }

  get snapshot(): BaseScreenPluginManagerSnapshot | undefined {
    return this.#snapshot;
  }

  activate(): Promise<ScreenParseResult<BaseScreenPluginManagerSnapshot>> {
    return this.enqueue(() => this.performActivate());
  }

  deactivate(): Promise<ScreenParseResult<null>> {
    return this.enqueue(() => this.performDeactivate());
  }

  dispose(): Promise<ScreenParseResult<null>> {
    if (this.#disposePromise === undefined) {
      this.#disposePromise = this.enqueue(() => this.performDispose());
    }
    return this.#disposePromise;
  }

  ensureActive(pluginId: string): Promise<ScreenParseResult<null>> {
    return this.enqueue(() => this.performEnsureActive(pluginId));
  }

  executeContributionCommand(
    request: Parameters<BaseScreenPluginManager['executeContributionCommand']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    return this.enqueue(() => this.performExecuteContributionCommand(request));
  }

  executeBlueprintAction(
    request: Parameters<BaseScreenPluginManager['executeBlueprintAction']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    return this.enqueue(() => this.performExecuteBlueprintAction(request));
  }

  applyDataProcessor(
    request: Parameters<BaseScreenPluginManager['applyDataProcessor']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    return this.enqueue(() => this.performApplyDataProcessor(request));
  }

  private enqueue<T>(
    operation: () => Promise<ScreenParseResult<T>>,
  ): Promise<ScreenParseResult<T>> {
    const pending = this.#queue.then(operation, operation);
    this.#queue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private async performActivate(): Promise<ScreenParseResult<BaseScreenPluginManagerSnapshot>> {
    if (this.#status !== 'inactive') {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Plugin manager cannot activate from its current state.',
      );
    }
    this.#status = 'activating';
    const plan = createActivationPlan(this.options);
    if (!plan.ok) {
      // 全局门失败：输入快照或宿主自营物料不可用，保持未激活。
      this.#status = 'inactive';
      return plan;
    }
    if (plan.value.activation === 'lazy') {
      return this.publishLazyActivation(plan.value);
    }
    const active: ActivePluginEntry[] = [];
    const failures: BaseScreenPluginActivationFailure[] = plan.value.failures.map((item) => ({
      ...item,
    }));
    const failedIds = new Set(
      failures.flatMap((item) => (item.pluginId === '' ? [] : [item.pluginId])),
    );
    for (const plugin of plan.value.plugins) {
      // 运行期级联：声明的依赖已失败时不再调用该插件的生命周期钩子。
      const failedDependency = plugin.manifest.dependencies.find((dep) => failedIds.has(dep.id));
      if (failedDependency !== undefined) {
        failures.push({
          index: plugin.index,
          pluginId: plugin.manifest.id,
          diagnostics: [
            diagnostic(
              'PLUGIN_CORE_DEPENDENCY_MISSING',
              ['plugins', plugin.index, 'manifest', 'dependencies'],
              'Plugin dependency failed to activate.',
            ),
          ],
        });
        failedIds.add(plugin.manifest.id);
        continue;
      }
      // 失败爆炸半径收敛：单插件激活失败只排除自身并失效其会话端口，
      // 已激活插件与核心目录不受影响，不再整体回滚。
      const attempt = await attemptActivation(plugin);
      if (!attempt.ok) {
        failures.push(attempt.failure);
        failedIds.add(plugin.manifest.id);
        continue;
      }
      active.push({ plugin, session: attempt.session });
      this.recordActivated(plugin);
    }
    failures.sort((first, second) => first.index - second.index);
    // 目录只发布成功激活的插件：运行期失败者连同其贡献一并排除。
    const pluginEntries: BaseScreenPluginCatalogEntry[] = active.map(({ plugin }) => ({
      manifest: plugin.manifest,
      grantedCapabilities: plugin.grantedCapabilities,
      contributions: plugin.manifest.contributions,
    }));
    const plugins = createBaseScreenPluginCatalog(pluginEntries);
    this.#active = active;
    this.#handlers.merge(active);
    this.#snapshot = {
      materials: createBaseScreenMaterialCatalog(plan.value.materials),
      panels: createBaseScreenPluginPanelCatalog(plan.value.panels),
      inspectorControls: createBaseScreenPluginInspectorControlCatalog(
        plan.value.inspectorControls,
      ),
      plugins,
      contributions: createRuntimeContributionIndex(plugins),
      failures: Object.freeze(failures.map((item) => Object.freeze({ ...item }))),
    };
    this.#status = 'active';
    return { ok: true, value: this.#snapshot, diagnostics: [] };
  }

  private async performDeactivate(): Promise<ScreenParseResult<null>> {
    if (this.#status !== 'active') {
      return failure('PLUGIN_CORE_LIFECYCLE_INVALID', [], 'Plugin manager is not active.');
    }
    this.#status = 'deactivating';
    this.#snapshot = undefined;
    this.#handlers.clear();
    this.#plan = undefined;
    this.#lazy = false;
    this.#declaredHandlers = createDeclaredHandlerOwners();
    this.#lazyFailures = new Map();
    const diagnostics = await deactivateEntries(this.#active);
    this.#active = [];
    this.#status = diagnostics.length === 0 ? 'inactive' : 'failed';
    return diagnostics.length === 0
      ? { ok: true, value: null, diagnostics: [] }
      : failureResult(diagnostics);
  }

  private async performDispose(): Promise<ScreenParseResult<null>> {
    if (this.#status === 'disposed') {
      return { ok: true, value: null, diagnostics: [] };
    }
    this.#status = 'disposing';
    this.#snapshot = undefined;
    this.#handlers.clear();
    this.#plan = undefined;
    this.#lazy = false;
    this.#declaredHandlers = createDeclaredHandlerOwners();
    this.#lazyFailures = new Map();
    const diagnostics = await deactivateEntries(this.#active);
    this.#active = [];
    for (const plugin of [...this.#disposalOrder].reverse()) {
      try {
        await plugin.dispose();
      } catch {
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            ['plugins', plugin.index],
            'Plugin disposal failed.',
          ),
        );
      }
    }
    this.#status = 'disposed';
    return diagnostics.length === 0
      ? { ok: true, value: null, diagnostics: [] }
      : failureResult(diagnostics);
  }

  /** 懒激活发布：预检与目录一次完成，插件钩子推迟到首次使用。 */
  private publishLazyActivation(
    plan: ActivationPlan,
  ): ScreenParseResult<BaseScreenPluginManagerSnapshot> {
    const pluginEntries: BaseScreenPluginCatalogEntry[] = plan.plugins.map((plugin) => ({
      manifest: plugin.manifest,
      grantedCapabilities: plugin.grantedCapabilities,
      contributions: plugin.manifest.contributions,
    }));
    const plugins = createBaseScreenPluginCatalog(pluginEntries);
    this.#active = [];
    this.#handlers.clear();
    this.#plan = plan;
    this.#lazy = true;
    this.#lazyFailures = new Map();
    this.#declaredHandlers = collectDeclaredHandlerOwners(plan.plugins);
    this.#snapshot = {
      materials: createBaseScreenMaterialCatalog(plan.materials),
      panels: createBaseScreenPluginPanelCatalog(plan.panels),
      inspectorControls: createBaseScreenPluginInspectorControlCatalog(plan.inspectorControls),
      plugins,
      contributions: createRuntimeContributionIndex(plugins),
      failures: Object.freeze(plan.failures.map((item) => Object.freeze({ ...item }))),
    };
    this.#status = 'active';
    return { ok: true, value: this.#snapshot, diagnostics: [] };
  }

  private async performEnsureActive(pluginId: string): Promise<ScreenParseResult<null>> {
    if (this.#status !== 'active') {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Plugin manager cannot ensure activation from its current state.',
      );
    }
    const plan = this.#plan;
    if (plan === undefined) {
      // eager 模式：所有插件已在 activate() 时运行，只校验身份。
      const known = this.#active.some((entry) => entry.plugin.manifest.id === pluginId);
      return known
        ? { ok: true, value: null, diagnostics: [] }
        : failure('PLUGIN_CORE_IDENTITY_INVALID', ['pluginId'], 'Plugin id is unknown.');
    }
    if (this.#active.some((entry) => entry.plugin.manifest.id === pluginId)) {
      return { ok: true, value: null, diagnostics: [] };
    }
    const recorded = this.#lazyFailures.get(pluginId);
    if (recorded !== undefined) {
      return failureResult([...recorded.diagnostics]);
    }
    const target = plan.plugins.find((plugin) => plugin.manifest.id === pluginId);
    if (target === undefined) {
      return failure('PLUGIN_CORE_IDENTITY_INVALID', ['pluginId'], 'Plugin id is unknown.');
    }
    // 目标及其传递依赖按拓扑序激活；依赖链上任一失败即停止并级联。
    const required = new Set<string>([pluginId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const plugin of plan.plugins) {
        if (!required.has(plugin.manifest.id)) continue;
        for (const dependency of plugin.manifest.dependencies) {
          if (plan.plugins.some((item) => item.manifest.id === dependency.id)) {
            if (!required.has(dependency.id)) {
              required.add(dependency.id);
              grew = true;
            }
          }
        }
      }
    }
    for (const plugin of plan.plugins) {
      if (!required.has(plugin.manifest.id)) continue;
      if (this.#active.some((entry) => entry.plugin === plugin)) continue;
      const failed = this.#lazyFailures.get(plugin.manifest.id);
      if (failed !== undefined) {
        return failureResult([...failed.diagnostics]);
      }
      const failedDependency = plugin.manifest.dependencies.find((dep) =>
        this.#lazyFailures.has(dep.id),
      );
      if (failedDependency !== undefined) {
        const cascade = {
          index: plugin.index,
          pluginId: plugin.manifest.id,
          diagnostics: [
            diagnostic(
              'PLUGIN_CORE_DEPENDENCY_MISSING',
              ['plugins', plugin.index, 'manifest', 'dependencies'],
              'Plugin dependency failed to activate.',
            ),
          ],
        };
        this.#lazyFailures.set(plugin.manifest.id, cascade);
        this.#appendFailure(cascade);
        return failureResult([...cascade.diagnostics]);
      }
      const failure = await this.#activatePending(plugin);
      if (failure !== undefined) {
        return failureResult([...failure.diagnostics]);
      }
    }
    return { ok: true, value: null, diagnostics: [] };
  }

  async #activatePending(
    plugin: PlannedPlugin,
  ): Promise<BaseScreenPluginActivationFailure | undefined> {
    const attempt = await attemptActivation(plugin);
    if (!attempt.ok) {
      this.#lazyFailures.set(plugin.manifest.id, attempt.failure);
      this.#appendFailure(attempt.failure);
      return attempt.failure;
    }
    const entry = { plugin, session: attempt.session };
    this.#active.push(entry);
    this.recordActivated(plugin);
    // 与 eager 激活同一份合并实现：三类 handler 一起进入可执行集合。只在懒激活里合并命令
    // 会让已声明、已授权的 blueprintAction / dataProcessor 在作者面可见却在执行面按
    // "未声明"失败关闭。
    this.#handlers.merge([entry]);
    return undefined;
  }

  #appendFailure(failure: BaseScreenPluginActivationFailure): void {
    if (this.#snapshot === undefined) return;
    this.#snapshot = {
      ...this.#snapshot,
      failures: Object.freeze(
        [...this.#snapshot.failures, Object.freeze({ ...failure })].sort(
          (first, second) => first.index - second.index,
        ),
      ),
    };
  }

  private recordActivated(plugin: PlannedPlugin): void {
    const existing = this.#disposalOrder.findIndex((item) => item.runtime === plugin.runtime);
    if (existing !== -1) this.#disposalOrder.splice(existing, 1);
    this.#disposalOrder.push(plugin);
  }

  /**
   * 懒激活：首次使用某贡献时先按依赖拓扑序激活声明它的插件。
   *
   * 返回失败表示激活（或依赖链）失败，调用方原样返回；undefined 表示无需激活——eager 模式、
   * 该插件已在运行、或该 id 未被任何插件声明（最后一种由调用方按"未声明"失败关闭）。
   * 三类 handler 共用这一条路径，因此懒激活的触发面与可执行集合一致。
   */
  async #ensureLazyOwner(
    kind: BaseScreenPluginContributionKind,
    id: string,
  ): Promise<ScreenParseResult<null> | undefined> {
    if (!this.#lazy) return undefined;
    const owner = this.#declaredHandlers.get(kind)?.get(id);
    if (owner === undefined) return undefined;
    const ensured = await this.performEnsureActive(owner.manifest.id);
    return ensured.ok ? undefined : ensured;
  }

  private async performExecuteBlueprintAction(
    request: Parameters<BaseScreenPluginManager['executeBlueprintAction']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    if (this.#status !== 'active') {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Plugin manager cannot execute blueprint actions from its current state.',
      );
    }
    const ensured = await this.#ensureLazyOwner('blueprintAction', request.actionId);
    if (ensured !== undefined) return ensured;
    const entry = this.#handlers.get<BaseScreenPluginBlueprintActionHandler>(
      'blueprintAction',
      request.actionId,
    );
    if (entry === undefined) {
      // ADR-0076：未声明的 actionId 失败关闭，不再落到宿主任意解释。
      return failure(
        'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
        ['actionId'],
        'Blueprint action is not declared by any active plugin.',
      );
    }
    if (!entry.isValid()) {
      return failure(
        'PLUGIN_CORE_SESSION_INVALID',
        [],
        'Plugin activation session is no longer valid.',
      );
    }
    try {
      const result = await entry.handler(request.payload);
      if (result === undefined) return { ok: true, value: null, diagnostics: [] };
      if (
        result === null ||
        typeof result !== 'object' ||
        typeof (result as { readonly ok?: unknown }).ok !== 'boolean'
      ) {
        return failure(
          'PLUGIN_CORE_COMMAND_RESULT_INVALID',
          [],
          'Plugin blueprint action returned an invalid result.',
        );
      }
      return result as ScreenParseResult<ScreenJsonValue>;
    } catch {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['actionId'],
        'Plugin blueprint action failed.',
      );
    }
  }

  private async performApplyDataProcessor(
    request: Parameters<BaseScreenPluginManager['applyDataProcessor']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    if (this.#status !== 'active') {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Plugin manager cannot apply data processors from its current state.',
      );
    }
    const ensured = await this.#ensureLazyOwner('dataProcessor', request.processorId);
    if (ensured !== undefined) return ensured;
    const entry = this.#handlers.get<BaseScreenPluginDataProcessorHandler>(
      'dataProcessor',
      request.processorId,
    );
    if (entry === undefined) {
      return failure(
        'PLUGIN_CORE_CONTRIBUTION_UNKNOWN',
        ['processorId'],
        'Data processor is not declared by any active plugin.',
      );
    }
    if (!entry.isValid()) {
      return failure(
        'PLUGIN_CORE_SESSION_INVALID',
        [],
        'Plugin activation session is no longer valid.',
      );
    }
    try {
      const result = await entry.handler(request.value, request.config);
      if (
        result === null ||
        typeof result !== 'object' ||
        typeof (result as { readonly ok?: unknown }).ok !== 'boolean'
      ) {
        return failure(
          'PLUGIN_CORE_COMMAND_RESULT_INVALID',
          [],
          'Plugin data processor returned an invalid result.',
        );
      }
      return result as ScreenParseResult<ScreenJsonValue>;
    } catch {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['processorId'],
        'Plugin data processor failed.',
      );
    }
  }

  private async performExecuteContributionCommand(
    request: Parameters<BaseScreenPluginManager['executeContributionCommand']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    const parsed = parsePluginCommandRequest(request);
    if (!parsed.ok) return parsed;
    if (this.#status !== 'active') {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        [],
        'Plugin manager cannot execute contribution commands from its current state.',
      );
    }
    const ensured = await this.#ensureLazyOwner('command', parsed.value.commandId);
    if (ensured !== undefined) return ensured;
    const command = this.#handlers.get<BaseScreenPluginCommandHandler>(
      'command',
      parsed.value.commandId,
    );
    if (command === undefined) {
      return failure(
        'PLUGIN_CORE_COMMAND_UNAUTHORIZED',
        ['commandId'],
        'Plugin contribution command is not available.',
      );
    }
    if (!command.isValid()) {
      return failure(
        'PLUGIN_CORE_SESSION_INVALID',
        [],
        'Plugin activation session is no longer valid.',
      );
    }
    try {
      const result = await command.handler(parsed.value.args);
      if (result === undefined) {
        return { ok: true, value: null, diagnostics: [] };
      }
      if (
        result === null ||
        typeof result !== 'object' ||
        typeof (result as { readonly ok?: unknown }).ok !== 'boolean'
      ) {
        return failure(
          'PLUGIN_CORE_COMMAND_RESULT_INVALID',
          [],
          'Plugin contribution command returned an invalid result.',
        );
      }
      return result as ScreenParseResult<ScreenJsonValue>;
    } catch {
      return failure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['commandId'],
        'Plugin contribution command failed.',
      );
    }
  }
}

/**
 * 运行一次插件激活尝试：先装配会话，再调用插件 `activate` 钩子。
 *
 * eager 与懒激活共用这一份实现，失败按发生阶段归因：会话装配只可能因宿主注入的端口工厂
 * 或管理器的端口校验抛错，此时插件代码尚未运行；钩子失败则必然发生在插件自己的 `activate`
 * 内。输出走同一条最小披露归一化路径——稳定 code/path 与固定文案，被捕获 error 的
 * message、name、stack 一律不回显（诊断最小披露：plugin-manager-runtime R10）。
 */
async function attemptActivation(plugin: PlannedPlugin): Promise<ActivationAttempt> {
  let session: ActivationSession;
  try {
    session = plugin.createSession();
  } catch {
    return { ok: false, failure: activationFailure(plugin, 'session') };
  }
  try {
    await plugin.activate(session.context);
  } catch {
    session.invalidate();
    return { ok: false, failure: activationFailure(plugin, 'hook') };
  }
  return { ok: true, session };
}

/** 激活失败的归一化记录：两类阶段文案固定，被捕获 error 不作任何投影。 */
function activationFailure(
  plugin: PlannedPlugin,
  phase: 'session' | 'hook',
): BaseScreenPluginActivationFailure {
  return {
    index: plugin.index,
    pluginId: plugin.manifest.id,
    diagnostics: [
      diagnostic(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        ['plugins', plugin.index],
        phase === 'session'
          ? 'Plugin activation session setup failed.'
          : 'Plugin activation hook failed.',
      ),
    ],
  };
}

async function deactivateEntries(
  entries: readonly ActivePluginEntry[],
): Promise<ScreenDiagnostic[]> {
  for (const entry of entries) {
    entry.session.invalidate();
  }
  const diagnostics: ScreenDiagnostic[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      await entry.plugin.deactivate();
    } catch {
      diagnostics.push(
        diagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          ['plugins', entry.plugin.index],
          'Plugin deactivation failed.',
        ),
      );
    }
  }
  return diagnostics;
}

type ContributionHandlerEntry<H extends (...args: never[]) => unknown> = {
  readonly handler: H;
  readonly isValid: () => boolean;
};

type ActivePluginEntry = {
  readonly plugin: PlannedPlugin;
  readonly session: ActivationSession;
};

type ActivationAttempt =
  | { readonly ok: true; readonly session: ActivationSession }
  | { readonly ok: false; readonly failure: BaseScreenPluginActivationFailure };

type AnyContributionHandler = (...args: never[]) => unknown;

/** 懒激活索引：按 kind 分桶的"贡献 id → 声明插件"。 */
type DeclaredHandlerOwners = Map<BaseScreenPluginContributionKind, Map<string, PlannedPlugin>>;

/**
 * 三类 handler 的运行时注册表。
 *
 * command / blueprintAction / dataProcessor 的收集规则完全一致（声明存在 + 计划表授权门），
 * 差别只有描述符里的记录字段名与消费方。把三个 Map 收进一处后，eager 激活与懒激活共用同一份
 * 合并实现——"懒激活只合并命令"这一历史缺口正是三份平行代码的产物。
 */
class ContributionHandlerRegistry {
  readonly #maps = new Map<
    BaseScreenPluginContributionKind,
    Map<string, ContributionHandlerEntry<AnyContributionHandler>>
  >();

  constructor() {
    for (const kind of listContributionHandlerKinds()) {
      this.#maps.set(kind, new Map());
    }
  }

  clear(): void {
    for (const map of this.#maps.values()) map.clear();
  }

  /** 合并一批已激活插件的 handler；id 冲突已在预检按 first-wins 裁决，此处不再判定。 */
  merge(entries: readonly ActivePluginEntry[]): void {
    for (const kind of listContributionHandlerKinds()) {
      const target = this.#maps.get(kind)!;
      for (const [id, entry] of collectContributionHandlerEntries(entries, kind)) {
        target.set(id, entry);
      }
    }
  }

  get<H extends AnyContributionHandler>(
    kind: BaseScreenPluginContributionKind,
    id: string,
  ): ContributionHandlerEntry<H> | undefined {
    return this.#maps.get(kind)?.get(id) as ContributionHandlerEntry<H> | undefined;
  }
}

/**
 * 该插件在某 kind 下**可执行**的 handler：清单里声明了、且过了计划表授权门的那些。
 *
 * 可执行集合与懒激活索引（`collectDeclaredHandlerOwners`）读同一份判定，因此"是否会为它
 * 触发懒激活"与"激活后是否真的能执行"不会给出两个答案。
 */
function executableHandlers<H extends (...args: never[]) => unknown>(
  plugin: PlannedPlugin,
  kind: BaseScreenPluginContributionKind,
): ReadonlyMap<string, H> {
  const field = contributionHandlerField(kind);
  if (field === undefined) return new Map();
  const records = plugin[field] as unknown as ReadonlyMap<string, H>;
  if (records.size === 0) return new Map();
  const requiresGrant = CONTRIBUTION_KIND_PLAN[kind].requiresGrant === true;
  const declared = new Map<string, BaseScreenPluginContribution>();
  for (const contribution of plugin.manifest.contributions) {
    if (contribution.kind !== kind) continue;
    const id = declaredContributionIds(kind, [contribution])[0];
    if (id !== undefined) declared.set(id, contribution);
  }
  const executable = new Map<string, H>();
  for (const [id, handler] of records) {
    // 未声明的 handler 不进入可执行集合：声明与 handler 一一对应由预检保证，
    // 这里再挡一次是为了让"声明是唯一入口"在执行面也成立。
    const contribution = declared.get(id);
    if (contribution === undefined) continue;
    // 与 command 同一门禁：声明的能力未获授权即不进入可执行集合。
    if (requiresGrant && !isContributionGranted(plugin, contribution)) continue;
    executable.set(id, handler);
  }
  return executable;
}

/**
 * 从已激活会话里收集一类贡献的 handler，构建可执行集合。
 *
 * 三种 handler 承载的 kind（command / blueprintAction / dataProcessor）规则一致，差别只有
 * 运行时的记录字段名与是否需要授权门，两者分别来自 plugin-core 的贡献类型描述符与 manager
 * 的计划表，因此只保留一份实现。
 */
function collectContributionHandlerEntries<H extends (...args: never[]) => unknown>(
  entries: readonly ActivePluginEntry[],
  kind: BaseScreenPluginContributionKind,
): Map<string, ContributionHandlerEntry<H>> {
  const collected = new Map<string, ContributionHandlerEntry<H>>();
  for (const entry of entries) {
    for (const [id, handler] of executableHandlers<H>(entry.plugin, kind)) {
      collected.set(id, { handler, isValid: () => entry.session.isValid() });
    }
  }
  return collected;
}

/**
 * 懒激活索引：某 kind 下可执行的 handler id → 声明它的插件。
 *
 * 插件钩子尚未运行时也要能回答"这个 id 该由谁提供"，否则懒激活只能在目录层面延迟、
 * 无法在执行面按需唤醒。
 */
function collectDeclaredHandlerOwners(plugins: readonly PlannedPlugin[]): DeclaredHandlerOwners {
  const owners = createDeclaredHandlerOwners();
  for (const kind of listContributionHandlerKinds()) {
    const byId = owners.get(kind)!;
    for (const plugin of plugins) {
      for (const id of executableHandlers(plugin, kind).keys()) {
        byId.set(id, plugin);
      }
    }
  }
  return owners;
}

function createDeclaredHandlerOwners(): DeclaredHandlerOwners {
  return new Map(
    listContributionHandlerKinds().map((kind) => [kind, new Map<string, PlannedPlugin>()]),
  );
}

function isContributionGranted(
  plugin: PlannedPlugin,
  contribution: BaseScreenPluginContribution,
): boolean {
  const required = (contribution as { readonly requiredCapability?: unknown }).requiredCapability;
  const capability =
    typeof required === 'string'
      ? required
      : ((contribution as { readonly id?: unknown }).id as string | undefined);
  return capability !== undefined && plugin.grantedCapabilities.includes(capability);
}

function diagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

function failureResult<T>(diagnostics: readonly ScreenDiagnostic[]): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: sortDiagnostics(diagnostics),
  };
}
