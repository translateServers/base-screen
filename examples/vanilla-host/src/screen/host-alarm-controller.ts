import type { ScreenJsonObject } from 'base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenConditionalStyleRequest,
} from 'base-screen/plugin-core';

export type HostAlarmLevel = 'warning' | 'critical' | 'info';
export type HostAlarmStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface HostAlarmRecord {
  readonly id: string;
  readonly key: string;
  readonly level: HostAlarmLevel;
  readonly message: string;
  readonly raisedAt: string;
  readonly acknowledged: boolean;
  readonly suppressed: boolean;
}

export type HostAlarmEvent =
  | {
      readonly type: 'snapshot';
      readonly revision: number;
      readonly alarms: readonly HostAlarmRecord[];
    }
  | { readonly type: 'raise'; readonly revision: number; readonly alarm: HostAlarmRecord }
  | { readonly type: 'clear'; readonly revision: number; readonly alarmId: string }
  | { readonly type: 'ack'; readonly revision: number; readonly alarmId: string }
  | {
      readonly type: 'suppress';
      readonly revision: number;
      readonly alarmId: string;
      readonly suppressed: boolean;
    }
  | { readonly type: 'heartbeat' };

export type HostAlarmStyles = Readonly<Partial<Record<HostAlarmLevel, ScreenJsonObject>>>;
export type HostAlarmBindings = Readonly<Record<string, Readonly<Record<string, HostAlarmStyles>>>>;

export interface HostAlarmStatusSnapshot {
  readonly status: HostAlarmStatus;
  readonly revision: number;
  readonly activeCount: number;
}

export type HostAlarmConnect = (
  url: string,
  onEvent: (event: HostAlarmEvent) => void,
  onStatus: (status: HostAlarmStatus) => void,
) => () => void;

export type HostAlarmScheduler = (callback: () => void) => () => void;

export interface HostAlarmControllerOptions {
  readonly apiBase: string;
  readonly bindings: HostAlarmBindings;
  readonly onInvalidate: (componentIds: readonly string[]) => void;
  readonly connect?: HostAlarmConnect;
  readonly schedule?: HostAlarmScheduler;
  readonly readyTimeoutMs?: number;
}

export interface HostAlarmController {
  /** 配置给 Designer/Viewer 的稳定端口；读取当前告警快照，无 I/O。 */
  readonly port: BaseScreenConditionalStylePort;
  readonly status: () => HostAlarmStatusSnapshot;
  /** 首个 snapshot 已应用或超时；宿主在 configure 前等待，避免首屏闪烁。 */
  readonly ready: (timeoutMs?: number) => Promise<void>;
  /**
   * 页面里改完绑定后热更新：不重建 SSE 连接，只换映射并失效新旧两侧命中的组件。
   * 当前快照保持不变——绑定是展示映射，不是告警状态。
   */
  setBindings(bindings: HostAlarmBindings): void;
  readonly stop: () => void;
}

const LEVEL_PRIORITY: Readonly<Record<HostAlarmLevel, number>> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * 宿主告警适配层的最小参考实现。
 *
 * 告警系统 → SSE → 本地快照（revision 幂等、乱序丢弃、重连重同步）→
 * `conditionalStylePort` + 按帧合并的 `refreshConditionalStyles`。
 * 传输、凭证、阈值与告警生命周期都留在宿主；Base Screen 只消费样式覆盖。
 */
export function createHostAlarmController(
  options: HostAlarmControllerOptions,
): HostAlarmController {
  const connect = options.connect ?? defaultConnect;
  const schedule = options.schedule ?? defaultSchedule;
  let bindings = options.bindings;
  const records = new Map<string, HostAlarmRecord>();
  let revision = -1;
  let status: HostAlarmStatus = 'connecting';
  let stopped = false;
  let closeStream: (() => void) | undefined;
  let pending = new Set<string>();
  let cancelFlush: (() => void) | undefined;
  let snapshotApplied = false;
  let reconnecting = false;

  let resolveReady!: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let readyTimer: ReturnType<typeof setTimeout> | undefined;

  const port: BaseScreenConditionalStylePort = {
    resolve: (request: BaseScreenConditionalStyleRequest) => resolveStyle(request.componentId),
  };

  function setStatus(next: HostAlarmStatus): void {
    status = next;
  }

  function resolveStyle(componentId: string): ScreenJsonObject | undefined {
    let best:
      | { readonly level: HostAlarmLevel; readonly id: string; readonly style: ScreenJsonObject }
      | undefined;
    for (const record of records.values()) {
      if (record.acknowledged || record.suppressed) continue;
      const style = bindings[record.key]?.[componentId]?.[record.level];
      if (style === undefined) continue;
      if (
        best === undefined ||
        LEVEL_PRIORITY[record.level] > LEVEL_PRIORITY[best.level] ||
        (LEVEL_PRIORITY[record.level] === LEVEL_PRIORITY[best.level] && record.id < best.id)
      ) {
        best = { level: record.level, id: record.id, style };
      }
    }
    return best?.style;
  }

  function componentsForKey(key: string): readonly string[] {
    return componentsFor(bindings, key);
  }

  function componentsFor(source: HostAlarmBindings, key: string): readonly string[] {
    const components = source[key];
    return components === undefined ? [] : Object.keys(components);
  }

  function setBindings(next: HostAlarmBindings): void {
    const affected = new Set<string>();
    for (const record of records.values()) {
      for (const componentId of componentsFor(bindings, record.key)) affected.add(componentId);
      for (const componentId of componentsFor(next, record.key)) affected.add(componentId);
    }
    bindings = next;
    markComponents([...affected]);
  }

  function scheduleFlush(): void {
    if (stopped || pending.size === 0 || cancelFlush !== undefined) return;
    cancelFlush = schedule(() => {
      cancelFlush = undefined;
      if (stopped) return;
      const ids = [...pending];
      pending = new Set();
      if (ids.length === 0) return;
      try {
        options.onInvalidate(ids);
      } catch {
        // 宿主回调失败不能中断告警流；下一批事件会再次尝试。
      }
      if (pending.size > 0) scheduleFlush();
    });
  }

  function markComponents(componentIds: readonly string[]): void {
    if (componentIds.length === 0) return;
    for (const componentId of componentIds) pending.add(componentId);
    scheduleFlush();
  }

  function applySnapshot(event: Extract<HostAlarmEvent, { type: 'snapshot' }>): void {
    const affected = new Set<string>();
    for (const record of records.values()) {
      for (const componentId of componentsForKey(record.key)) affected.add(componentId);
    }
    records.clear();
    for (const alarm of event.alarms) records.set(alarm.id, alarm);
    for (const alarm of event.alarms) {
      for (const componentId of componentsForKey(alarm.key)) affected.add(componentId);
    }
    revision = event.revision;
    snapshotApplied = true;
    reconnecting = false;
    setStatus('live');
    resolveReadyNow();
    if (affected.size > 0) markComponents([...affected]);
  }

  function acceptRevision(next: number): boolean {
    if (next <= revision) return false;
    if (revision >= 0 && next > revision + 1) {
      resync();
      return false;
    }
    revision = next;
    return true;
  }

  function handleEvent(event: HostAlarmEvent): void {
    if (stopped) return;
    switch (event.type) {
      case 'heartbeat':
        setStatus('live');
        return;
      case 'snapshot':
        applySnapshot(event);
        return;
      case 'raise': {
        if (!acceptRevision(event.revision)) return;
        records.set(event.alarm.id, event.alarm);
        markComponents(componentsForKey(event.alarm.key));
        return;
      }
      case 'clear': {
        const current = records.get(event.alarmId);
        if (!acceptRevision(event.revision)) return;
        if (current === undefined) return;
        records.delete(event.alarmId);
        markComponents(componentsForKey(current.key));
        return;
      }
      case 'ack': {
        const current = records.get(event.alarmId);
        if (!acceptRevision(event.revision)) return;
        if (current === undefined) return;
        records.set(event.alarmId, { ...current, acknowledged: true });
        markComponents(componentsForKey(current.key));
        return;
      }
      case 'suppress': {
        const current = records.get(event.alarmId);
        if (!acceptRevision(event.revision)) return;
        if (current === undefined) return;
        records.set(event.alarmId, { ...current, suppressed: event.suppressed });
        markComponents(componentsForKey(current.key));
        return;
      }
    }
  }

  function resync(): void {
    if (stopped || reconnecting) return;
    reconnecting = true;
    setStatus('reconnecting');
    closeStream?.();
    closeStream = undefined;
    openStream();
  }

  function openStream(): void {
    if (stopped) return;
    const base = options.apiBase.replace(/\/+$/, '');
    closeStream = connect(`${base}/demo/alarms/stream`, handleEvent, (next) => {
      if (stopped) return;
      setStatus(next);
      if (next === 'live' && reconnecting) reconnecting = false;
    });
  }

  function resolveReadyNow(): void {
    if (readyTimer !== undefined) {
      clearTimeout(readyTimer);
      readyTimer = undefined;
    }
    resolveReady();
  }

  function ready(timeoutMs = options.readyTimeoutMs ?? 800): Promise<void> {
    if (snapshotApplied || stopped || readyTimer !== undefined) return readyPromise;
    readyTimer = setTimeout(() => {
      readyTimer = undefined;
      resolveReady();
    }, timeoutMs);
    return readyPromise;
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    closeStream?.();
    closeStream = undefined;
    cancelFlush?.();
    cancelFlush = undefined;
    pending.clear();
    resolveReadyNow();
  }

  openStream();

  return {
    port,
    status: () => ({
      status,
      revision,
      activeCount: [...records.values()].filter(
        (record) => !record.acknowledged && !record.suppressed,
      ).length,
    }),
    ready,
    setBindings,
    stop,
  };
}

function defaultSchedule(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}

function defaultConnect(
  url: string,
  onEvent: (event: HostAlarmEvent) => void,
  onStatus: (status: HostAlarmStatus) => void,
): () => void {
  if (typeof EventSource === 'undefined') {
    onStatus('offline');
    return () => {};
  }
  const source = new EventSource(url);
  source.onopen = () => onStatus('live');
  source.onerror = () => onStatus('reconnecting');
  source.onmessage = (message) => {
    if (typeof message.data !== 'string') return;
    const event = parseHostAlarmEvent(message.data);
    if (event !== undefined) onEvent(event);
  };
  return () => source.close();
}

function parseHostAlarmEvent(raw: string): HostAlarmEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const event = value as { readonly type?: unknown };
  if (event.type === 'heartbeat') return { type: 'heartbeat' };
  if (!('revision' in event) || typeof event.revision !== 'number') return undefined;
  const revision = event.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) return undefined;
  switch (event.type) {
    case 'snapshot': {
      const alarms = (event as { readonly alarms?: unknown }).alarms;
      if (!Array.isArray(alarms)) return undefined;
      const parsed = alarms.map(parseAlarmRecord);
      if (parsed.some((alarm) => alarm === undefined)) return undefined;
      return {
        type: 'snapshot',
        revision,
        alarms: parsed as readonly HostAlarmRecord[],
      };
    }
    case 'raise': {
      const alarm = parseAlarmRecord((event as { readonly alarm?: unknown }).alarm);
      return alarm === undefined ? undefined : { type: 'raise', revision, alarm };
    }
    case 'clear':
    case 'ack': {
      const alarmId = (event as { readonly alarmId?: unknown }).alarmId;
      return typeof alarmId === 'string' ? { type: event.type, revision, alarmId } : undefined;
    }
    case 'suppress': {
      const alarmId = (event as { readonly alarmId?: unknown }).alarmId;
      const suppressed = (event as { readonly suppressed?: unknown }).suppressed;
      return typeof alarmId === 'string' && typeof suppressed === 'boolean'
        ? { type: 'suppress', revision, alarmId, suppressed }
        : undefined;
    }
    default:
      return undefined;
  }
}

function parseAlarmRecord(value: unknown): HostAlarmRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as {
    readonly id?: unknown;
    readonly key?: unknown;
    readonly level?: unknown;
    readonly message?: unknown;
    readonly raisedAt?: unknown;
    readonly acknowledged?: unknown;
    readonly suppressed?: unknown;
  };
  if (
    typeof record.id !== 'string' ||
    typeof record.key !== 'string' ||
    (record.level !== 'warning' && record.level !== 'critical' && record.level !== 'info') ||
    typeof record.message !== 'string' ||
    typeof record.raisedAt !== 'string' ||
    typeof record.acknowledged !== 'boolean' ||
    typeof record.suppressed !== 'boolean'
  ) {
    return undefined;
  }
  return {
    id: record.id,
    key: record.key,
    level: record.level,
    message: record.message,
    raisedAt: record.raisedAt,
    acknowledged: record.acknowledged,
    suppressed: record.suppressed,
  };
}
