/**
 * 蓝图定时器调度（实例内有界调度）：按「去重后的间隔秒数」各挂一个 interval，
 * tick 事件携带间隔值，因此 5s 与 10s 的规则互不串扰。
 *
 * 只做实例内调度：不排队、不持久化、不补跑；文档变更（重编译）时按新间隔集合增删，
 * 实例卸载时全部清除。计时函数可注入，便于用假计时器测试。
 */
export interface DesignerBlueprintTimerSchedulerOptions {
  readonly dispatch: (intervalSeconds: number) => void;
  readonly setIntervalFn?: (handler: () => void, ms: number) => unknown;
  readonly clearIntervalFn?: (handle: unknown) => void;
}

export class DesignerBlueprintTimerScheduler {
  readonly #handles = new Map<number, unknown>();

  constructor(private readonly options: DesignerBlueprintTimerSchedulerOptions) {}

  /** 与当前计划对齐：新增缺失间隔、清除多余间隔，已有间隔不动（不重置相位）。 */
  sync(intervals: readonly number[]): void {
    const next = new Set(
      intervals.filter((value) => Number.isInteger(value) && value >= 1 && value <= 86_400),
    );
    for (const [interval, handle] of this.#handles) {
      if (next.has(interval)) continue;
      this.#clear(handle);
      this.#handles.delete(interval);
    }
    const start = this.options.setIntervalFn ?? ((handler, ms) => setInterval(handler, ms));
    for (const interval of next) {
      if (this.#handles.has(interval)) continue;
      this.#handles.set(
        interval,
        start(() => this.options.dispatch(interval), interval * 1000),
      );
    }
  }

  stop(): void {
    for (const handle of this.#handles.values()) this.#clear(handle);
    this.#handles.clear();
  }

  #clear(handle: unknown): void {
    const clear =
      this.options.clearIntervalFn ??
      ((value: unknown) => clearInterval(value as ReturnType<typeof setInterval>));
    clear(handle);
  }
}
