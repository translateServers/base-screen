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

/** 一个告警 key 的当前汇总：最高等级（没有告警为 null）与生效条数。 */
export interface HostAlarmSummary {
  readonly level: HostAlarmLevel | null;
  readonly count: number;
}

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

export interface HostAlarmControllerOptions {
  readonly apiBase: string;
  readonly connect?: HostAlarmConnect;
  readonly readyTimeoutMs?: number;
}

export interface HostAlarmController {
  /** 某个告警 key 的汇总（宿主分级规则的结果）；本地快照读取，无 I/O。 */
  summary(key: string): HostAlarmSummary;
  /** 快照变化后回调受影响的 key；返回取消订阅。 */
  onChange(listener: (keys: readonly string[]) => void): () => void;
  readonly status: () => HostAlarmStatusSnapshot;
  /** 首个 snapshot 已应用或超时。 */
  readonly ready: (timeoutMs?: number) => Promise<void>;
  readonly revision: () => number;
  readonly stop: () => void;
}

const LEVEL_PRIORITY: Readonly<Record<HostAlarmLevel, number>> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * 宿主告警源的最小参考实现（ADR-0110 §2.6）。
 *
 * 告警系统 → SSE → 本地快照（revision 幂等、乱序丢弃、重连重同步）→ 按 key 汇总成「最高等级 + 条数」。
 * 宿主只给分级，不给样式：资源端口把汇总作为推送数据源（`alarm` 资源类型）交给大屏，
 * 组件用「组件状态」的判定把等级映射成外观。传输、阈值与告警生命周期都留在宿主。
 */
export function createHostAlarmController(
  options: HostAlarmControllerOptions,
): HostAlarmController {
  const connect = options.connect ?? defaultConnect;
  const records = new Map<string, HostAlarmRecord>();
  const listeners = new Set<(keys: readonly string[]) => void>();
  let revision = -1;
  let status: HostAlarmStatus = 'connecting';
  let stopped = false;
  let closeStream: (() => void) | undefined;
  let snapshotApplied = false;
  let reconnecting = false;

  let resolveReady!: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let readyTimer: ReturnType<typeof setTimeout> | undefined;

  function summary(key: string): HostAlarmSummary {
    let level: HostAlarmLevel | null = null;
    let count = 0;
    for (const record of records.values()) {
      if (record.key !== key || record.acknowledged || record.suppressed) continue;
      count += 1;
      if (level === null || LEVEL_PRIORITY[record.level] > LEVEL_PRIORITY[level]) {
        level = record.level;
      }
    }
    return { level, count };
  }

  function notify(keys: Iterable<string>): void {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return;
    for (const listener of listeners) {
      try {
        listener(unique);
      } catch {
        // 单个读者失败不能中断告警流。
      }
    }
  }

  function applySnapshot(event: Extract<HostAlarmEvent, { type: 'snapshot' }>): void {
    const keys = new Set<string>([...records.values()].map((record) => record.key));
    records.clear();
    for (const alarm of event.alarms) {
      records.set(alarm.id, alarm);
      keys.add(alarm.key);
    }
    revision = event.revision;
    snapshotApplied = true;
    reconnecting = false;
    status = 'live';
    resolveReadyNow();
    notify(keys);
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

  function update(
    alarmId: string,
    next: (current: HostAlarmRecord) => HostAlarmRecord | undefined,
  ): void {
    const current = records.get(alarmId);
    if (current === undefined) return;
    const updated = next(current);
    if (updated === undefined) records.delete(alarmId);
    else records.set(alarmId, updated);
    notify([current.key]);
  }

  function handleEvent(event: HostAlarmEvent): void {
    if (stopped) return;
    switch (event.type) {
      case 'heartbeat':
        status = 'live';
        return;
      case 'snapshot':
        applySnapshot(event);
        return;
      case 'raise':
        if (!acceptRevision(event.revision)) return;
        records.set(event.alarm.id, event.alarm);
        notify([event.alarm.key]);
        return;
      case 'clear':
        if (!acceptRevision(event.revision)) return;
        update(event.alarmId, () => undefined);
        return;
      case 'ack':
        if (!acceptRevision(event.revision)) return;
        update(event.alarmId, (current) => ({ ...current, acknowledged: true }));
        return;
      case 'suppress':
        if (!acceptRevision(event.revision)) return;
        update(event.alarmId, (current) => ({ ...current, suppressed: event.suppressed }));
        return;
    }
  }

  function resync(): void {
    if (stopped || reconnecting) return;
    reconnecting = true;
    status = 'reconnecting';
    closeStream?.();
    closeStream = undefined;
    openStream();
  }

  function openStream(): void {
    if (stopped) return;
    const base = options.apiBase.replace(/\/+$/, '');
    closeStream = connect(`${base}/demo/alarms/stream`, handleEvent, (next) => {
      if (stopped) return;
      status = next;
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
    listeners.clear();
    resolveReadyNow();
  }

  openStream();

  return {
    summary,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => ({
      status,
      revision,
      activeCount: [...records.values()].filter(
        (record) => !record.acknowledged && !record.suppressed,
      ).length,
    }),
    ready,
    revision: () => revision,
    stop,
  };
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
