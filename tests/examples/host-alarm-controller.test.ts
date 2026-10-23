import type { BaseScreenConditionalStyleRequest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  createHostAlarmController,
  type HostAlarmConnect,
  type HostAlarmEvent,
  type HostAlarmRecord,
  type HostAlarmScheduler,
  type HostAlarmStatus,
} from '../../examples/vanilla-host/src/screen/host-alarm-controller';

const READY: BaseScreenConditionalStyleRequest['dataState'] = { status: 'ready', value: 1 };

function request(componentId: string): BaseScreenConditionalStyleRequest {
  return { componentId, dataState: READY };
}

const BINDINGS = {
  'alarm.open': {
    'kpi-alarm-value': {
      warning: { color: '#fa8c16' },
      critical: { color: '#f5222d' },
    },
    'top-notice': {
      warning: { color: '#fa8c16', fontWeight: '700' },
      critical: { color: '#f5222d', fontWeight: '700' },
    },
  },
  'alarm.temperature': {
    'kpi-alarm-value': { warning: { color: '#e6a23c' } },
  },
} as const;

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

function createHarness(): {
  readonly controller: ReturnType<typeof createHostAlarmController>;
  readonly invalidations: (readonly string[])[];
  readonly urls: string[];
  readonly closed: () => number;
  readonly emit: (event: HostAlarmEvent) => void;
  readonly emitStatus: (status: HostAlarmStatus) => void;
  readonly flush: () => void;
  readonly pending: () => number;
} {
  const invalidations: (readonly string[])[] = [];
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
  const scheduled: (() => void)[] = [];
  const schedule: HostAlarmScheduler = (callback) => {
    scheduled.push(callback);
    return () => {
      const index = scheduled.indexOf(callback);
      if (index >= 0) scheduled.splice(index, 1);
    };
  };
  const controller = createHostAlarmController({
    apiBase: '/api',
    bindings: BINDINGS,
    onInvalidate: (componentIds) => invalidations.push([...componentIds]),
    connect,
    schedule,
  });
  return {
    controller,
    invalidations,
    urls,
    closed: () => closed,
    emit: (event) => listener?.(event),
    emitStatus: (status) => statusListener?.(status),
    flush: () => {
      for (const callback of scheduled.splice(0)) callback();
    },
    pending: () => scheduled.length,
  };
}

describe('host alarm controller', () => {
  it('CSR-H01 applies the initial snapshot and exposes the bound style through the port', async () => {
    const harness = createHarness();
    harness.emit(snapshot(1, [record('alarm.open')]));
    await harness.controller.ready(10);
    harness.flush();

    expect(harness.urls).toEqual(['/api/demo/alarms/stream']);
    expect(harness.controller.status()).toEqual({ status: 'live', revision: 1, activeCount: 1 });
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toEqual({
      color: '#fa8c16',
    });
    expect(harness.controller.port.resolve(request('top-notice'))).toEqual({
      color: '#fa8c16',
      fontWeight: '700',
    });
    expect(harness.controller.port.resolve(request('unbound'))).toBeUndefined();
    expect(harness.invalidations).toEqual([['kpi-alarm-value', 'top-notice']]);
    harness.controller.stop();
  });

  it('CSR-H02 applies raise and clear events and invalidates only the bound components', () => {
    const harness = createHarness();
    harness.emit(snapshot(1, []));
    harness.flush();
    harness.invalidations.length = 0;

    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open', 'critical') });
    harness.flush();
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toEqual({
      color: '#f5222d',
    });
    expect(harness.invalidations).toEqual([['kpi-alarm-value', 'top-notice']]);

    harness.invalidations.length = 0;
    harness.emit({ type: 'clear', revision: 3, alarmId: 'alarm-alarm.open' });
    harness.flush();
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toBeUndefined();
    expect(harness.invalidations).toEqual([['kpi-alarm-value', 'top-notice']]);
    harness.controller.stop();
  });

  it('CSR-H03 drops duplicate and out-of-order revisions and reconnects on a gap', async () => {
    const harness = createHarness();
    harness.emit(snapshot(4, []));
    harness.flush();
    harness.invalidations.length = 0;

    harness.emit({ type: 'raise', revision: 4, alarm: record('alarm.open') });
    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open') });
    harness.flush();
    expect(harness.invalidations).toEqual([]);
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toBeUndefined();

    harness.emit({ type: 'raise', revision: 9, alarm: record('alarm.open') });
    expect(harness.closed()).toBe(1);
    expect(harness.urls).toHaveLength(2);
    expect(harness.controller.status().status).toBe('reconnecting');

    harness.emit(snapshot(9, [record('alarm.open', 'critical')]));
    await harness.controller.ready(10);
    harness.flush();
    expect(harness.controller.status()).toEqual({ status: 'live', revision: 9, activeCount: 1 });
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toEqual({
      color: '#f5222d',
    });
    harness.controller.stop();
  });

  it('CSR-H04 coalesces multiple events into one invalidation per frame', () => {
    const harness = createHarness();
    harness.emit(snapshot(1, []));
    harness.flush();
    harness.invalidations.length = 0;

    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open') });
    harness.emit({ type: 'raise', revision: 3, alarm: record('alarm.temperature') });
    expect(harness.pending()).toBe(1);
    harness.flush();

    expect(harness.invalidations).toHaveLength(1);
    expect([...harness.invalidations[0]!].sort()).toEqual(['kpi-alarm-value', 'top-notice']);
    harness.controller.stop();
  });

  it('CSR-H05 picks the highest active alarm and ignores acknowledged or suppressed ones', () => {
    const harness = createHarness();
    harness.emit(
      snapshot(1, [record('alarm.open', 'warning'), record('alarm.temperature', 'warning')]),
    );
    harness.flush();
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toEqual({
      color: '#fa8c16',
    });

    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open', 'critical') });
    harness.flush();
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toEqual({
      color: '#f5222d',
    });

    harness.emit({ type: 'ack', revision: 3, alarmId: 'alarm-alarm.open' });
    harness.flush();
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toEqual({
      color: '#e6a23c',
    });

    harness.emit({
      type: 'suppress',
      revision: 4,
      alarmId: 'alarm-alarm.temperature',
      suppressed: true,
    });
    harness.flush();
    expect(harness.controller.port.resolve(request('kpi-alarm-value'))).toBeUndefined();
    expect(harness.controller.status().activeCount).toBe(0);
    harness.controller.stop();
  });

  it('CSR-H06 stops the stream and ignores later events', async () => {
    const harness = createHarness();
    harness.emit(snapshot(1, [record('alarm.open')]));
    harness.flush();
    harness.invalidations.length = 0;

    harness.controller.stop();
    expect(harness.closed()).toBe(1);
    harness.emit({ type: 'raise', revision: 2, alarm: record('alarm.open', 'critical') });
    harness.flush();
    expect(harness.invalidations).toEqual([]);
    await expect(harness.controller.ready(5)).resolves.toBeUndefined();
  });
});
