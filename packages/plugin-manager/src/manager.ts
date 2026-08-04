import type { ScreenDiagnostic, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenPluginCatalogEntry,
  createBaseScreenMaterialCatalog,
  createBaseScreenPluginCatalog,
} from '@base-screen/plugin-core';
import { createRuntimeContributionIndex } from './contributions.js';
import { failure, sortDiagnostics } from './diagnostics.js';
import { type ActivationSession, createActivationPlan, type PlannedPlugin } from './preflight.js';
import type {
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
      this.#status = 'inactive';
      return plan;
    }
    const active: Array<{ readonly plugin: PlannedPlugin; readonly session: ActivationSession }> =
      [];
    const diagnostics: ScreenDiagnostic[] = [];
    for (const plugin of plan.value.plugins) {
      let session: ActivationSession | undefined;
      try {
        session = plugin.createSession();
        await plugin.activate(session.context);
        active.push({ plugin, session });
        this.recordActivated(plugin);
      } catch {
        session?.invalidate();
        diagnostics.push(
          diagnostic(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            ['plugins', plugin.index],
            'Plugin activation failed.',
          ),
        );
        break;
      }
    }
    if (diagnostics.length > 0) {
      const rollbackDiagnostics = await deactivateEntries(active);
      this.#active = [];
      this.#snapshot = undefined;
      this.#status = rollbackDiagnostics.length === 0 ? 'inactive' : 'failed';
      return failureResult([...diagnostics, ...rollbackDiagnostics]);
    }
    const pluginEntries: BaseScreenPluginCatalogEntry[] = plan.value.plugins.map((plugin) => ({
      manifest: plugin.manifest,
      grantedCapabilities: plugin.grantedCapabilities,
      contributions: plugin.manifest.contributions,
    }));
    const plugins = createBaseScreenPluginCatalog(pluginEntries);
    this.#active = active;
    this.#snapshot = {
      materials: createBaseScreenMaterialCatalog(plan.value.materials),
      plugins,
      contributions: createRuntimeContributionIndex(plugins),
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
