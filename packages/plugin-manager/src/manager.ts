import type { ScreenDiagnostic, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenPluginCatalogEntry,
  type BaseScreenPluginCommandHandler,
  createBaseScreenMaterialCatalog,
  createBaseScreenPluginCatalog,
  createBaseScreenPluginInspectorControlCatalog,
  createBaseScreenPluginPanelCatalog,
  parsePluginCommandRequest,
} from '@base-screen/plugin-core';
import { createRuntimeContributionIndex } from './contributions.js';
import { failure, sortDiagnostics } from './diagnostics.js';
import { type ActivationSession, createActivationPlan, type PlannedPlugin } from './preflight.js';
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
  #commands = new Map<string, ContributionCommand>();
  #disposePromise: Promise<ScreenParseResult<null>> | undefined;
  #queue: Promise<void> = Promise.resolve();

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

  executeContributionCommand(
    request: Parameters<BaseScreenPluginManager['executeContributionCommand']>[0],
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    return this.enqueue(() => this.performExecuteContributionCommand(request));
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
    this.#commands = collectContributionCommands(active);
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

  private recordActivated(plugin: PlannedPlugin): void {
    const existing = this.#disposalOrder.findIndex((item) => item.runtime === plugin.runtime);
    if (existing !== -1) this.#disposalOrder.splice(existing, 1);
    this.#disposalOrder.push(plugin);
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
    const command = this.#commands.get(parsed.value.commandId);
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

type ContributionCommand = {
  readonly handler: BaseScreenPluginCommandHandler;
  readonly isValid: () => boolean;
};

function collectContributionCommands(
  entries: readonly { readonly plugin: PlannedPlugin; readonly session: ActivationSession }[],
): Map<string, ContributionCommand> {
  const commands = new Map<string, ContributionCommand>();
  for (const entry of entries) {
    for (const [commandId, handler] of entry.plugin.commands) {
      const contribution = entry.plugin.manifest.contributions.find(
        (item) => item.kind === 'command' && item.id === commandId,
      );
      if (contribution === undefined || contribution.kind !== 'command') continue;
      if (!entry.plugin.grantedCapabilities.includes(contribution.requiredCapability)) continue;
      commands.set(commandId, {
        handler,
        isValid: () => entry.session.isValid(),
      });
    }
  }
  return commands;
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
