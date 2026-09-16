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
  #active: Array<{ readonly plugin: PlannedPlugin; readonly session: ActivationSession }> = [];
  #disposalOrder: PlannedPlugin[] = [];
  #commands = new Map<string, ContributionHandlerEntry<BaseScreenPluginCommandHandler>>();
  #blueprintActions = new Map<
    string,
    ContributionHandlerEntry<BaseScreenPluginBlueprintActionHandler>
  >();
  #dataProcessors = new Map<
    string,
    ContributionHandlerEntry<BaseScreenPluginDataProcessorHandler>
  >();
  #disposePromise: Promise<ScreenParseResult<null>> | undefined;
  #queue: Promise<void> = Promise.resolve();
  // 懒激活状态：activate() 只完成预检与目录发布；插件钩子推迟到首次使用。
  #plan: ActivationPlan | undefined;
  #lazy: boolean = false;
  #declaredCommands = new Map<
    string,
    { readonly pluginId: string; readonly plugin: PlannedPlugin }
  >();
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
    const active: Array<{ readonly plugin: PlannedPlugin; readonly session: ActivationSession }> =
      [];
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
      let session: ActivationSession | undefined;
      try {
        session = plugin.createSession();
        await plugin.activate(session.context);
        active.push({ plugin, session });
        this.recordActivated(plugin);
      } catch {
        // 失败爆炸半径收敛：单插件激活失败只排除自身并失效其会话端口，
        // 已激活插件与核心目录不受影响，不再整体回滚。
        session?.invalidate();
        failures.push({
          index: plugin.index,
          pluginId: plugin.manifest.id,
          diagnostics: [
            diagnostic(
              'PLUGIN_CORE_LIFECYCLE_INVALID',
              ['plugins', plugin.index],
              'Plugin activation failed.',
            ),
          ],
        });
        failedIds.add(plugin.manifest.id);
      }
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
    this.#commands = collectContributionHandlerEntries<BaseScreenPluginCommandHandler>(
      active,
      'command',
    );
    this.#blueprintActions =
      collectContributionHandlerEntries<BaseScreenPluginBlueprintActionHandler>(
        active,
        'blueprintAction',
      );
    this.#dataProcessors = collectContributionHandlerEntries<BaseScreenPluginDataProcessorHandler>(
      active,
      'dataProcessor',
    );
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
    this.#commands = new Map();
    this.#blueprintActions = new Map();
    this.#dataProcessors = new Map();
    this.#plan = undefined;
    this.#lazy = false;
    this.#declaredCommands = new Map();
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
    this.#commands = new Map();
    this.#blueprintActions = new Map();
    this.#dataProcessors = new Map();
    this.#plan = undefined;
    this.#lazy = false;
    this.#declaredCommands = new Map();
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
    this.#commands = new Map();
    this.#blueprintActions = new Map();
    this.#dataProcessors = new Map();
    this.#plan = plan;
    this.#lazy = true;
    this.#lazyFailures = new Map();
    this.#declaredCommands = new Map();
    for (const plugin of plan.plugins) {
      for (const commandId of plugin.commands.keys()) {
        const contribution = plugin.manifest.contributions.find(
          (item) => item.kind === 'command' && item.id === commandId,
        );
        if (
          contribution !== undefined &&
          contribution.kind === 'command' &&
          plugin.grantedCapabilities.includes(contribution.requiredCapability)
        ) {
          this.#declaredCommands.set(commandId, { pluginId: plugin.manifest.id, plugin });
        }
      }
    }
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
    let session: ActivationSession | undefined;
    try {
      session = plugin.createSession();
      await plugin.activate(session.context);
      const entry = { plugin, session };
      this.#active.push(entry);
      this.recordActivated(plugin);
      // 既有行为：懒激活只合并命令 handler。blueprintAction / dataProcessor 在 lazy 模式下
      // 从不进入 #blueprintActions / #dataProcessors，因此这两类贡献在懒激活下会按"未声明"
      // 失败关闭。本批保持该行为不变，只做收敛。
      for (const [
        commandId,
        command,
      ] of collectContributionHandlerEntries<BaseScreenPluginCommandHandler>([entry], 'command')) {
        this.#commands.set(commandId, command);
      }
      return undefined;
    } catch {
      session?.invalidate();
      const failure: BaseScreenPluginActivationFailure = {
        index: plugin.index,
        pluginId: plugin.manifest.id,
        diagnostics: [
          diagnostic(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            ['plugins', plugin.index],
            'Plugin activation failed.',
          ),
        ],
      };
      this.#lazyFailures.set(plugin.manifest.id, failure);
      this.#appendFailure(failure);
      return failure;
    }
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
    const entry = this.#blueprintActions.get(request.actionId);
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
    const entry = this.#dataProcessors.get(request.processorId);
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
    let command = this.#commands.get(parsed.value.commandId);
    if (command === undefined && this.#lazy) {
      // 懒激活：首次使用贡献命令时才运行插件 activate 钩子（含依赖链前置）。
      const declared = this.#declaredCommands.get(parsed.value.commandId);
      if (declared !== undefined) {
        const ensured = await this.performEnsureActive(declared.pluginId);
        if (!ensured.ok) return ensured;
        command = this.#commands.get(parsed.value.commandId);
      }
    }
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

async function deactivateEntries(
  entries: readonly { readonly plugin: PlannedPlugin; readonly session: ActivationSession }[],
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

/**
 * 从已激活会话里收集一类贡献的 handler，构建可执行集合。
 *
 * 三种 handler 承载的 kind（command / blueprintAction / dataProcessor）规则一致，差别只有
 * 运行时的记录字段名与是否需要授权门，两者分别来自 plugin-core 的贡献类型描述符与 manager
 * 的计划表，因此只保留一份实现。
 */
function collectContributionHandlerEntries<H extends (...args: never[]) => unknown>(
  entries: readonly { readonly plugin: PlannedPlugin; readonly session: ActivationSession }[],
  kind: BaseScreenPluginContributionKind,
): Map<string, ContributionHandlerEntry<H>> {
  const field = contributionHandlerField(kind);
  if (field === undefined) return new Map();
  const requiresGrant = CONTRIBUTION_KIND_PLAN[kind].requiresGrant === true;
  const collected = new Map<string, ContributionHandlerEntry<H>>();
  for (const entry of entries) {
    const records = entry.plugin[field] as unknown as ReadonlyMap<string, H>;
    if (records.size === 0) continue;
    const declared = new Map<string, BaseScreenPluginContribution>();
    for (const contribution of entry.plugin.manifest.contributions) {
      if (contribution.kind !== kind) continue;
      const id = declaredContributionIds(kind, [contribution])[0];
      if (id !== undefined) declared.set(id, contribution);
    }
    for (const [id, handler] of records) {
      const contribution = declared.get(id);
      if (contribution === undefined) continue;
      // 与 command 同一门禁：声明的能力未获授权即不进入可执行集合。
      if (requiresGrant && !isContributionGranted(entry.plugin, contribution)) continue;
      collected.set(id, { handler, isValid: () => entry.session.isValid() });
    }
  }
  return collected;
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
