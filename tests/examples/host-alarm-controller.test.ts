import { describe, expect, it } from 'vitest';
import {
  createHostAlarmController,
  type HostAlarmConnect,
  type HostAlarmEvent,
  type HostAlarmRecord,
  type HostAlarmStatus,
} from '../../examples/vanilla-host/src/screen/host-alarm-controller';

/**
 * 宿主告警源（ADR-0110 §2.6）：只做「告警快照 → 按 key 汇总等级」，不带任何样式。
 * 外观由组件状态决定，这里只验证分级与快照语义。
 */
function record(
  key: string,
  level: HostAlarmRecord['level'] = 'warning',
  overrides: Partial<HostAlarmRecord> = {},
): HostAlarmRecord {
  return {
    id: `alarm-${key}`,
    key,
    level,
    message: `${key} triggered`,
    raisedAt: '2026-01-01T00:00:00.000Z',
    acknowledged: false,
    suppressed: false,
    ...overrides,
  };
}

function snapshot(revision: number, alarms: readonly HostAlarmRecord[]): HostAlarmEvent {
  return { type: 'snapshot', revision, alarms };
}

function createHarness() {
  const changes: (readonly string[])[] = [];
  const urls: string[] = [];
  let closed = 0;
  let listener: ((event: HostAlarmEvent) => void) | undefined;
  let statusListener: ((status: HostAlarmStatus) => void) | undefined;
  const connect: HostAlarmConnect = (url, onEvent, onStatus) => {
    urls.push(url);
    listener = onEvent;
    statusListener = onStatus;
    return () => {
      closed += 1;
    };
  };
  const controller = createHostAlarmController({ apiBase: '/api/', connect });
  controller.onChange((keys) => changes.push([...keys].sort()));
  return {
    controller,
    changes,
    urls,
    closed: () => closed,
    emit: (event: HostAlarmEvent) => listener?.(event),
    emitStatus: (status: HostAlarmStatus) => statusListener?.(status),
  };
}

describe('host alarm controller', () => {
  it('summarises the initial snapshot per key', async () => {
    const harness = createHarness();
    harness.emit(snapshot(1, [record('alarm.open'), record('alarm.temperature', 'critical')]));
    await harness.controller.ready(10);

    expect(harness.urls).toEqual(['/api/demo/alarms/stream']);
    expect(harness.controller.status()).toEqual({ status: 'live', revision: 1, activeCount: 2 });
    expect(harness.controller.summary('alarm.open')).toEqual({ level: 'warning', count: 1 });
    expect(harness.controller.summary('alarm.temperature')).toEqual({
      level: 'critical',
      count: 1,
    });
    expect(harness.controller.summary('unknown')).toEqual({ level: null, count: 0 });
    expect(harness.changes).toEqual([['alarm.open', 'alarm.temperature']]);
    harness.controller.stop();
  });

  it('applies raise and clear events and reports only the affected key', () => {
    const harness = createHarness();
    harness.emit(snapshot(1, []));
    harness.changes.length = 0;

    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open', 'critical') });
    expect(harness.controller.summary('alarm.open')).toEqual({ level: 'critical', count: 1 });
    harness.emit({ type: 'clear', revision: 3, alarmId: 'alarm-alarm.open' });
    expect(harness.controller.summary('alarm.open')).toEqual({ level: null, count: 0 });
    expect(harness.changes).toEqual([['alarm.open'], ['alarm.open']]);
    harness.controller.stop();
  });

  it('drops duplicate and out-of-order revisions and reconnects on a gap', async () => {
    const harness = createHarness();
    harness.emit(snapshot(4, []));
    harness.changes.length = 0;

    harness.emit({ type: 'raise', revision: 4, alarm: record('alarm.open') });
    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open') });
    expect(harness.changes).toEqual([]);
    expect(harness.controller.summary('alarm.open').count).toBe(0);

    harness.emit({ type: 'raise', revision: 9, alarm: record('alarm.open') });
    expect(harness.closed()).toBe(1);
    expect(harness.urls).toHaveLength(2);
    expect(harness.controller.status().status).toBe('reconnecting');

    harness.emit(snapshot(9, [record('alarm.open', 'critical')]));
    await harness.controller.ready(10);
    expect(harness.controller.status()).toEqual({ status: 'live', revision: 9, activeCount: 1 });
    expect(harness.controller.summary('alarm.open').level).toBe('critical');
    harness.controller.stop();
  });

  it('takes the highest active level and ignores acknowledged or suppressed alarms', () => {
    const harness = createHarness();
    harness.emit(
      snapshot(1, [
        record('alarm.open', 'warning', { id: 'a' }),
        record('alarm.open', 'info', { id: 'b' }),
      ]),
    );
    expect(harness.controller.summary('alarm.open')).toEqual({ level: 'warning', count: 2 });

    harness.emit({
      type: 'raise',
      revision: 2,
      alarm: record('alarm.open', 'critical', { id: 'c' }),
    });
    expect(harness.controller.summary('alarm.open')).toEqual({ level: 'critical', count: 3 });

    harness.emit({ type: 'ack', revision: 3, alarmId: 'c' });
    expect(harness.controller.summary('alarm.open')).toEqual({ level: 'warning', count: 2 });

    harness.emit({ type: 'suppress', revision: 4, alarmId: 'a', suppressed: true });
    expect(harness.controller.summary('alarm.open')).toEqual({ level: 'info', count: 1 });
    harness.controller.stop();
  });

  it('stops the stream and ignores later events', async () => {
    const harness = createHarness();
    harness.emit(snapshot(1, [record('alarm.open')]));
    harness.changes.length = 0;

    harness.controller.stop();
    expect(harness.closed()).toBe(1);
    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open', 'critical') });
    expect(harness.changes).toEqual([]);
    await expect(harness.controller.ready(5)).resolves.toBeUndefined();
  });
});
