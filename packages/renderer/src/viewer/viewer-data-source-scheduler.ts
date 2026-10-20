import {
  readScreenDocumentDataSources,
  type ScreenDataSource,
  type ScreenDocument,
} from '@base-screen/contracts';
import type { BaseScreenRenderer } from '../renderer/renderer.js';

export interface ViewerDataSourceSchedulerHost {
  readonly readRenderer: () => BaseScreenRenderer | undefined;
  readonly readDocument: () => ScreenDocument | undefined;
}

type ScheduledInstance = {
  readonly intervalSeconds: number;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * `updatePolicy.mode === 'auto'` 的唯一持有者。
 *
 * 定时刷新只在 Viewer 侧存在（设计器内不自动刷新）：每个 auto 实例一条 `setTimeout` 链，
 * 间隔取该实例的 `intervalSeconds`（契约已限定 1..86400 秒）。策略或间隔变化时重建，
 * 未变的实例沿用原定时器（避免每次 render 都重置、把 tick 饿死）。
 */
export class ViewerDataSourceScheduler {
  readonly #instances = new Map<string, ScheduledInstance>();
  #suspended = false;

  constructor(private readonly host: ViewerDataSourceSchedulerHost) {}

  /** 按当前文档同步定时器集合：只对 auto 生效，`once`/`manual` 不建。 */
  sync(document: ScreenDocument | undefined): void {
    const auto = new Map<string, number>();
    for (const instance of document === undefined ? [] : readScreenDocumentDataSources(document)) {
      const intervalSeconds = autoIntervalSeconds(instance);
      if (intervalSeconds !== undefined) auto.set(instance.id, intervalSeconds);
    }
    for (const [id, scheduled] of this.#instances) {
      if (auto.get(id) !== scheduled.intervalSeconds) {
        clearTimeout(scheduled.timer);
        this.#instances.delete(id);
      }
    }
    for (const [id, intervalSeconds] of auto) {
      if (!this.#instances.has(id)) this.#schedule(id, intervalSeconds);
    }
  }

  /** 暂停全部定时器（断开连接/挂起），保留策略以便 resume 重建。 */
  suspend(): void {
    this.#suspended = true;
    for (const scheduled of this.#instances.values()) clearTimeout(scheduled.timer);
    this.#instances.clear();
  }

  resume(): void {
    this.#suspended = false;
    this.sync(this.host.readDocument());
  }

  dispose(): void {
    this.#suspended = true;
    for (const scheduled of this.#instances.values()) clearTimeout(scheduled.timer);
    this.#instances.clear();
  }

  #schedule(dataSourceId: string, intervalSeconds: number): void {
    if (this.#suspended) return;
    const timer = setTimeout(() => {
      // 先摘除再触发：refresh 可能同步触发落定回调，重新入表要等下一轮。
      this.#instances.delete(dataSourceId);
      this.host.readRenderer()?.refreshDataSource(dataSourceId, { trigger: 'polling' });
      this.#schedule(dataSourceId, intervalSeconds);
    }, intervalSeconds * 1000);
    this.#instances.set(dataSourceId, { intervalSeconds, timer });
  }
}

function autoIntervalSeconds(instance: ScreenDataSource): number | undefined {
  return instance.updatePolicy?.mode === 'auto' ? instance.updatePolicy.intervalSeconds : undefined;
}
