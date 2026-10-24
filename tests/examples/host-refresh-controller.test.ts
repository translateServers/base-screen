import { describe, expect, it } from 'vitest';
import {
  createHostRefreshController,
  DEFAULT_REFRESH_INTERVALS,
  intervalKeyOf,
  type RefreshableElement,
} from '../../examples/react-host/src/screen/host-refresh-controller';
import { BOARD_MONITOR_DOCUMENT } from '../../examples/shared-backend/src/screens/board-monitor-document';

/**
 * 轮询节拍表是「屏上数据新不新鲜」的唯一口径，但它此前零覆盖：三端 smoke 只验证
 * 「tickNow 会刷新」和「hidden 不刷新」，验证不到「到点刷新用的是哪个间隔」。
 *
 * 这里用可注入的 `now` + `schedule` 把 250ms 心跳拨快：不用等 15s / 60s，也不依赖
 * 真实定时器，因此断言的是**真实的 DEFAULT_REFRESH_INTERVALS 表**，而不是测试自带的表。
 *
 * 直接守两条历史问题：
 * 1. `metric.line_load` / `metric.energy_ratio` 曾经是「声明了但屏上没有组件消费」的死键
 *    （第一轮 B2）。这里从种子文档反推组件，断言这两个键真的会驱动刷新。
 * 2. README 声明 `variable` 组件参与 30s 节拍；这条断言把它固定下来。
 */

const components = (BOARD_MONITOR_DOCUMENT as unknown as { components: readonly never[] })
  .components;

interface RefreshRecord {
  readonly at: number;
  readonly componentId: string;
}

/** 手动时钟 + 手动排期：按 `now` 推进，按到期时间顺序执行。 */
function createHarness() {
  let clock = 0;
  const pending: { at: number; run: () => void; cancelled: boolean }[] = [];
  const records: RefreshRecord[] = [];

  const schedule = (task: () => void, delayMs: number): (() => void) => {
    const entry = { at: clock + delayMs, run: task, cancelled: false };
    pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  const element: RefreshableElement = {
    document: { components } as RefreshableElement['document'],
    // 无参调用是「全量刷新」（hidden → visible 的补一次），用 `*` 标记以便区分。
    refreshData: (options?: { readonly componentId: string }) => {
      records.push({ at: clock, componentId: options?.componentId ?? '*' });
    },
    getVariable: () => undefined,
  };

  const advanceTo = (target: number): void => {
    for (;;) {
      const due = pending
        .filter((entry) => !entry.cancelled && entry.at <= target)
        .sort((left, right) => left.at - right.at)[0];
      if (due === undefined) break;
      clock = due.at;
      due.cancelled = true;
      due.run();
    }
    clock = target;
  };

  return { element, schedule, records, advanceTo, now: () => clock };
}

describe('host refresh controller · 节拍表真的驱动种子组件', () => {
  it('按 DEFAULT_REFRESH_INTERVALS 在各自的到点时刻刷新对应组件', () => {
    const harness = createHarness();
    const controller = createHostRefreshController({
      element: harness.element,
      schedule: harness.schedule,
      now: harness.now,
    });

    controller.start();
    harness.advanceTo(60_000);
    controller.dispose();

    const firstAt = (componentId: string): number | undefined =>
      harness.records.find((record) => record.componentId === componentId)?.at;

    // 3s：告警流水
    expect(firstAt('alarm-stream')).toBe(DEFAULT_REFRESH_INTERVALS['dataset.monitor.alarms']);
    // 5s：设备灯阵 + 5s 档的 KPI（翻牌卡组件 id 是 `<card>-value`）
    expect(firstAt('grid-devices')).toBe(DEFAULT_REFRESH_INTERVALS['dataset.monitor.devices']);
    expect(firstAt('kpi-oee-value')).toBe(DEFAULT_REFRESH_INTERVALS['metric.oee']);
    // 15s：工序链 + 主轴负载水位（B2 补的 C16）
    expect(firstAt('stage-pipeline')).toBe(DEFAULT_REFRESH_INTERVALS['dataset.monitor.pipeline']);
    expect(firstAt('load-water')).toBe(DEFAULT_REFRESH_INTERVALS['metric.line_load']);
    // 30s：variable 数据源组件（README 明示参与 30s 节拍）
    expect(firstAt('top-window')).toBe(DEFAULT_REFRESH_INTERVALS['variable.*']);
    // 60s：能耗达成（B2 补的 C17）
    expect(firstAt('energy-capsule')).toBe(DEFAULT_REFRESH_INTERVALS['metric.energy_ratio']);
  });

  it('种子消费了每一个非通配的 dataset / metric 节拍键（防「声明了却没人用」）', () => {
    const keys = new Set(
      components.map((component) => intervalKeyOf(component)).filter((key) => key !== undefined),
    );

    for (const key of [
      'dataset.monitor.devices',
      'dataset.monitor.alarms',
      'dataset.monitor.pipeline',
      'metric.line_load',
      'metric.energy_ratio',
    ]) {
      expect(keys.has(key), `${key} 应有组件消费`).toBe(true);
    }
    // 这两条正是第一轮 B2 的连带问题：表里有、屏上没人用。
    expect(DEFAULT_REFRESH_INTERVALS['metric.line_load']).toBe(15_000);
    expect(DEFAULT_REFRESH_INTERVALS['metric.energy_ratio']).toBe(60_000);
  });

  it('static 组件不进入到期表（不产生无意义刷新）', () => {
    const harness = createHarness();
    const controller = createHostRefreshController({
      element: harness.element,
      schedule: harness.schedule,
      now: harness.now,
    });

    controller.start();
    harness.advanceTo(60_000);
    controller.dispose();

    // 标题/标签/选择器都是 static，intervalKeyOf 应为 undefined，因此永不刷新。
    const refreshedIds = new Set(harness.records.map((record) => record.componentId));
    expect(refreshedIds.has('grid-title')).toBe(false);
    expect(refreshedIds.has('sel-line')).toBe(false);
    expect(refreshedIds.has('footer-note')).toBe(false);
    expect(harness.records.length).toBeGreaterThan(0);
  });

  it('hidden 期间到点也不刷新；恢复 visible 后立刻全量补一次', () => {
    const harness = createHarness();
    let visibility: 'visible' | 'hidden' = 'visible';
    const controller = createHostRefreshController({
      element: harness.element,
      schedule: harness.schedule,
      now: harness.now,
      visibility: () => visibility,
    });

    controller.start();
    harness.advanceTo(1_000);
    visibility = 'hidden';
    // 心跳由 visibility() 兜底感知（无 visibilitychange 事件也能暂停）
    harness.advanceTo(30_000);
    const whileHidden = harness.records.filter((record) => record.at > 1_000);
    expect(whileHidden).toEqual([]);

    const beforeResume = harness.records.length;
    visibility = 'visible';
    harness.advanceTo(30_500);
    // 恢复时先全量一次（refreshData() 无参 → 记为 `*`），因此记录会显著增加
    expect(harness.records.length).toBeGreaterThan(beforeResume);
    expect(harness.records.some((record) => record.componentId === '*' && record.at > 30_000)).toBe(
      true,
    );
    controller.dispose();
  });
});
