import {
  readScreenComponentValueRef,
  type ScreenComponentNode,
  type ScreenDataSource,
  type ScreenDataSourceSource,
  type ScreenJsonValue,
} from 'base-screen/contracts';
import type { Logger } from '../lib/logger';

/** 控制器只要求元素提供这三样能力（便于用假元素做手动 tick 测试）。 */
export interface RefreshableElement {
  readonly document:
    | {
        readonly components: readonly ScreenComponentNode[];
        readonly dataSources?: readonly ScreenDataSource[];
      }
    | undefined;
  refreshData(): void;
  refreshData(options: { readonly componentId: string; readonly trigger: 'polling' }): void;
  getVariable(id: string):
    | {
        onChange(listener: (value: ScreenJsonValue) => void): () => void;
      }
    | undefined;
}

export interface RefreshController {
  start(): void;
  stop(): void;
  /** 文档变化后重建到期表（同时重新订阅 static 变量）。 */
  rebuild(): void;
  /** 忽略到期时间，立刻刷新一轮（`?smoke=1` 的 tick）。 */
  tickNow(): void;
  dispose(): void;
}

export interface RefreshStatus {
  readonly polling: boolean;
  readonly visible: boolean;
  /** 当前登记的可轮询组件数。 */
  readonly tracked: number;
}

export interface RefreshControllerOptions {
  readonly element: RefreshableElement;
  /** 节拍覆盖（键见 `DEFAULT_REFRESH_INTERVALS`），用于测试与 `?poll=`。 */
  readonly intervals?: Readonly<Record<string, number>>;
  /** 全局覆盖间隔：`?poll=<ms>` 时所有组件用同一个节拍。 */
  readonly overrideIntervalMs?: number;
  /** 排期函数：返回取消函数。默认 `setTimeout`，测试可注入手动时钟。 */
  readonly schedule?: (task: () => void, delayMs: number) => () => void;
  readonly now?: () => number;
  readonly visibility?: () => 'visible' | 'hidden';
  /**
   * 该组件是否还有在飞行的请求：由 observer 维护的 pending 集合。
   * 到期但未清空的组件跳过（不叠加请求）。缺省视为"没有在飞行"。
   */
  readonly isPending?: (componentId: string) => boolean;
  readonly onStatus?: (status: RefreshStatus) => void;
  /** 提供时用来监听 `visibilitychange`（没有它也能靠心跳里的 visibility() 兜底）。 */
  readonly document?: Document;
  readonly heartbeatMs?: number;
  readonly staticVariableIds?: readonly string[];
  readonly logger?: Logger;
}

/**
 * 轮询节拍表：按**数据源身份**而不是物料 type 决定间隔。
 *
 * 同一份设备数据既可能画成灯阵、也可能画成表格，刷新频率应该由"数据有多快变"决定，
 * 而不是"用哪个组件画"。键：
 * - `dataset.<datasetId>`
 * - `metric.<metricId>`（`demo_metric` 的 resourceId 就是指标名）
 * - `resource.<resourceType>`
 */
export const DEFAULT_REFRESH_INTERVALS: Readonly<Record<string, number>> = {
  'dataset.monitor.devices': 5_000,
  'dataset.monitor.alarms': 3_000,
  'dataset.monitor.pipeline': 15_000,
  'metric.oee': 5_000,
  'metric.device_online_rate': 5_000,
  'metric.output_count': 5_000,
  'metric.alarm_open': 5_000,
  'metric.line_load': 15_000,
  'metric.energy_ratio': 60_000,
  'metric.*': 30_000,
  'resource.demo_series': 60_000,
  'resource.demo_ranking': 60_000,
  'resource.*': 30_000,
  'variable.*': 30_000,
  '*': 30_000,
};

const DEFAULT_HEARTBEAT_MS = 250;
const DEFAULT_STATIC_VARIABLE_IDS = ['line', 'window', 'severity'] as const;

/**
 * 心跳 + 每组件 `nextDue` 的轮询控制器。
 *
 * 为什么不是"每组件一个 setInterval"：几十个组件就会变成几十个定时器，visibility 切换与
 * 变量变更时无法原子地重置节奏（同一帧里会有一半组件按旧节拍、一半按新节拍）。一个
 * 250 ms 心跳扫一遍到期表则只有一处状态，暂停/恢复/重新排期都是纯数据操作。
 *
 * 三条硬约束：
 * 1. **hidden 时不累积欠账**：隐藏期间不排期、不补发；恢复时只补一次全量。
 * 2. **在飞行中的组件不叠加**：到期但 pending 未清就跳过，下一拍再看。
 * 3. **变量刚变过就先别刷**：把该组件的 nextDue 推后一个 interval（它已经被变量的
 *    onChange 触发过一轮刷新）。
 */
export function createHostRefreshController(options: RefreshControllerOptions): RefreshController {
  const now = options.now ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((task: () => void, delayMs: number) => {
      const handle = globalThis.setTimeout(task, delayMs);
      return () => globalThis.clearTimeout(handle);
    });
  const visibility =
    options.visibility ??
    (() => (options.document?.visibilityState === 'hidden' ? 'hidden' : 'visible'));
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const staticVariableIds = options.staticVariableIds ?? DEFAULT_STATIC_VARIABLE_IDS;
  const intervals: Readonly<Record<string, number>> = {
    ...DEFAULT_REFRESH_INTERVALS,
    ...options.intervals,
  };

  let nextDue = new Map<string, number>();
  let cancelHeartbeat: (() => void) | undefined;
  let running = false;
  let lastVisibility: 'visible' | 'hidden' = visibility();
  let unsubscribeVariables: Array<() => void> = [];
  let detachVisibility: (() => void) | undefined;

  const components = (): readonly ScreenComponentNode[] =>
    options.element.document?.components ?? [];
  const dataSources = (): readonly ScreenDataSource[] =>
    options.element.document?.dataSources ?? [];
  const groups = (): readonly RefreshGroup[] => collectRefreshGroups(components(), dataSources());

  const intervalOf = (group: RefreshGroup): number => {
    if (options.overrideIntervalMs !== undefined) return options.overrideIntervalMs;
    const key = group.intervalKey;
    const direct = intervals[key];
    if (direct !== undefined) return direct;
    const namespace = `${key.split('.')[0] ?? ''}.*`;
    return intervals[namespace] ?? intervals['*'] ?? 30_000;
  };

  const emit = (): void => {
    options.onStatus?.({
      polling: running && lastVisibility === 'visible',
      visible: lastVisibility === 'visible',
      tracked: nextDue.size,
    });
  };

  const refreshOne = (componentId: string): void => {
    try {
      options.element.refreshData({ componentId, trigger: 'polling' });
    } catch (error: unknown) {
      // 单个组件刷新失败不得中断整轮：渲染器内部已有四态兜底。
      options.logger?.warn('refreshData failed', { componentId, error });
    }
  };

  const resetDue = (from: number): void => {
    const next = new Map<string, number>();
    for (const group of groups()) {
      next.set(group.key, from + intervalOf(group));
    }
    nextDue = next;
  };

  const scheduleHeartbeat = (): void => {
    cancelHeartbeat?.();
    cancelHeartbeat = schedule(beat, heartbeatMs);
  };

  const pause = (): void => {
    cancelHeartbeat?.();
    cancelHeartbeat = undefined;
    emit();
  };

  /** 从 hidden 恢复：立刻全量一次，然后把所有到期时间推后一个 interval，再恢复心跳。 */
  const resume = (): void => {
    lastVisibility = 'visible';
    try {
      options.element.refreshData();
    } catch (error: unknown) {
      options.logger?.warn('refreshData on resume failed', error);
    }
    resetDue(now());
    emit();
    scheduleHeartbeat();
  };

  const beat = (): void => {
    cancelHeartbeat = undefined;
    if (!running) return;
    const current = visibility();
    if (current === 'hidden') {
      // 事件丢失时的兜底：不产生请求、也不记欠账。
      if (lastVisibility !== 'hidden') {
        lastVisibility = 'hidden';
        emit();
      }
      scheduleHeartbeat();
      return;
    }
    if (lastVisibility === 'hidden') {
      resume();
      return;
    }
    const timestamp = now();
    for (const group of groups()) {
      const due = nextDue.get(group.key);
      if (due === undefined) {
        nextDue.set(group.key, timestamp + intervalOf(group));
        continue;
      }
      if (due > timestamp) continue;
      if (options.isPending?.(group.componentId) === true) continue;
      refreshOne(group.componentId);
      nextDue.set(group.key, timestamp + intervalOf(group));
    }
    scheduleHeartbeat();
  };

  const subscribeVariables = (): void => {
    for (const unsubscribe of unsubscribeVariables) unsubscribe();
    unsubscribeVariables = [];
    for (const variableId of staticVariableIds) {
      const handle = options.element.getVariable(variableId);
      if (handle === undefined) continue;
      unsubscribeVariables.push(
        handle.onChange(() => {
          // 变量变化已经触发过一轮刷新，把到期时间整体推后，避免紧接着又刷一次。
          const timestamp = now();
          for (const group of groups()) {
            nextDue.set(group.key, timestamp + intervalOf(group));
          }
        }),
      );
    }
  };

  const trackVisibility = (): void => {
    detachVisibility?.();
    detachVisibility = undefined;
    const doc = options.document;
    if (doc === undefined) return;
    const onChange = (): void => {
      const current = visibility();
      if (current === lastVisibility) return;
      if (current === 'hidden') {
        lastVisibility = 'hidden';
        pause();
        return;
      }
      resume();
    };
    doc.addEventListener('visibilitychange', onChange);
    detachVisibility = () => doc.removeEventListener('visibilitychange', onChange);
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastVisibility = visibility();
      resetDue(now());
      trackVisibility();
      subscribeVariables();
      emit();
      if (lastVisibility === 'visible') scheduleHeartbeat();
    },

    stop() {
      running = false;
      cancelHeartbeat?.();
      cancelHeartbeat = undefined;
      emit();
    },

    rebuild() {
      resetDue(now());
      subscribeVariables();
      emit();
    },

    tickNow() {
      // 与心跳同一条语义：隐藏期间"到点"不算数——否则 tick 会绕过暂停发出请求，
      // 后台标签页的静默承诺就被调试入口破坏了。
      if (visibility() === 'hidden') {
        emit();
        return;
      }
      const timestamp = now();
      const seen = new Set<string>();
      for (const group of groups()) {
        seen.add(group.key);
        if (options.isPending?.(group.componentId) === true) continue;
        refreshOne(group.componentId);
        nextDue.set(group.key, timestamp + intervalOf(group));
      }
      // 文档里已删除的组件 / 实例不再占用到期表。
      for (const id of [...nextDue.keys()]) {
        if (!seen.has(id)) nextDue.delete(id);
      }
      emit();
    },

    dispose() {
      running = false;
      cancelHeartbeat?.();
      cancelHeartbeat = undefined;
      detachVisibility?.();
      detachVisibility = undefined;
      for (const unsubscribe of unsubscribeVariables) unsubscribe();
      unsubscribeVariables = [];
      nextDue = new Map();
    },
  };
}

interface RefreshGroup {
  /** 文档级实例 id；legacy 组件使用组件 id（一组件一实例）。 */
  readonly key: string;
  /** 刷新动作的代表组件：文档顺序里第一个读该实例的组件。 */
  readonly componentId: string;
  readonly intervalKey: string;
}

/**
 * 按数据源实例分组：14 个组件共享 live 实例时只排一次期、只调一次 refreshData。
 * 代表组件与运行时 `DataSourceRuntime.#consumerOf` 一致（文档顺序第一个读者）。
 */
function collectRefreshGroups(
  components: readonly ScreenComponentNode[],
  dataSources: readonly ScreenDataSource[],
): readonly RefreshGroup[] {
  const groups = new Map<string, RefreshGroup>();
  for (const component of components) {
    // 旧形态优先：readScreenComponentValueRef 会为 legacy dataset 合成一个派生 ref，
    // 先按 component.dataSource 分组，才不会把它误当成文档级实例。
    if (component.dataSource !== null) {
      const intervalKey = intervalKeyOf(component);
      if (intervalKey === undefined) continue;
      groups.set(component.id, {
        key: component.id,
        componentId: component.id,
        intervalKey,
      });
      continue;
    }
    const ref = readScreenComponentValueRef(component);
    if (ref?.kind !== 'data-source-field') continue;
    const instance = dataSources.find((candidate) => candidate.id === ref.dataSourceId);
    if (instance === undefined) continue;
    const intervalKey = intervalKeyOfSource(instance.source);
    if (intervalKey === undefined) continue;
    if (!groups.has(instance.id)) {
      groups.set(instance.id, {
        key: instance.id,
        componentId: component.id,
        intervalKey,
      });
    }
  }
  return [...groups.values()];
}

function intervalKeyOfSource(source: ScreenDataSourceSource): string | undefined {
  if (source.kind === 'dataset') return `dataset.${source.datasetId}`;
  if (source.kind === 'host-resource') {
    return source.resourceType === 'demo_metric'
      ? `metric.${source.resourceId}`
      : `resource.${source.resourceType}`;
  }
  if (source.kind === 'host-catalog' || source.kind === 'url-query') return 'variable.*';
  return undefined;
}

/** 组件 → 节拍键；`static`/`null` 数据源不需要轮询。 */
export function intervalKeyOf(component: ScreenComponentNode): string | undefined {
  const dataSource = component.dataSource;
  if (dataSource === null) return undefined;
  switch (dataSource.type) {
    case 'dataset':
      return `dataset.${dataSource.datasetId}`;
    case 'host-resource':
      return dataSource.resourceType === 'demo_metric'
        ? `metric.${dataSource.resourceId}`
        : `resource.${dataSource.resourceType}`;
    case 'variable':
      return 'variable.*';
    default:
      return undefined;
  }
}
