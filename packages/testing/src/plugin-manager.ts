export interface PluginManagerConformanceSession {
  readonly status: string;
  readonly snapshot: unknown | undefined;
  activate(): Promise<{ readonly ok: boolean }>;
  deactivate(): Promise<{ readonly ok: boolean }>;
  dispose(): Promise<{ readonly ok: boolean }>;
}

export interface PluginManagerConformanceHarness {
  createManager(): PluginManagerConformanceSession;
}

export interface PluginManagerConformanceResult {
  readonly scenarios: readonly string[];
}

export async function runPluginManagerConformance(
  harness: PluginManagerConformanceHarness,
): Promise<PluginManagerConformanceResult> {
  const manager = harness.createManager();
  if (manager.status !== 'inactive' || manager.snapshot !== undefined) {
    throw new Error('Plugin manager must start inactive without a snapshot.');
  }
  const activated = await manager.activate();
  if (!activated.ok || statusOf(manager) !== 'active' || manager.snapshot === undefined) {
    throw new Error('Plugin manager did not atomically activate its catalog snapshot.');
  }
  const deactivated = await manager.deactivate();
  if (!deactivated.ok || statusOf(manager) !== 'inactive' || manager.snapshot !== undefined) {
    throw new Error('Plugin manager did not revoke its active snapshot.');
  }
  const disposed = await manager.dispose();
  if (!disposed.ok || statusOf(manager) !== 'disposed' || manager.snapshot !== undefined) {
    throw new Error('Plugin manager did not permanently dispose its session.');
  }
  const repeatedDispose = await manager.dispose();
  if (!repeatedDispose.ok) throw new Error('Plugin manager dispose must be idempotent.');
  return { scenarios: ['activate', 'deactivate', 'dispose', 'repeat-dispose'] };
}

function statusOf(manager: PluginManagerConformanceSession): string {
  return manager.status;
}
