import type { DemoAlarmEvent } from '../src/alarms/alarm-events';
import { AlarmsService } from '../src/alarms/alarms.service';

describe('AlarmsService', () => {
  it('starts from a deterministic warning snapshot', () => {
    const service = new AlarmsService();

    expect(service.snapshot()).toEqual({
      revision: 1,
      alarms: [
        {
          id: 'alarm-alarm.open',
          key: 'alarm.open',
          level: 'warning',
          message: '未处理告警数量超过警戒线',
          raisedAt: '2026-01-01T00:00:00.000Z',
          acknowledged: false,
          suppressed: false,
        },
      ],
    });
  });

  it('raises, acknowledges, suppresses, clears, and resets with monotonic revisions', () => {
    const service = new AlarmsService();
    const events: DemoAlarmEvent[] = [];
    service.events.subscribe((event) => events.push(event));

    const raised = service.raise({ key: 'alarm.open', level: 'critical', message: '超限' });
    expect(raised).toMatchObject({ level: 'critical', message: '超限', acknowledged: false });
    expect(service.snapshot().revision).toBe(2);

    expect(service.acknowledge('alarm.open')).toBe(true);
    expect(service.snapshot().alarms[0]?.acknowledged).toBe(true);
    expect(service.snapshot().revision).toBe(3);

    expect(service.suppress('alarm.open', true)).toBe(true);
    expect(service.snapshot().alarms[0]?.suppressed).toBe(true);
    expect(service.snapshot().revision).toBe(4);

    expect(service.clear('alarm.open')).toBe(true);
    expect(service.snapshot().alarms).toEqual([]);
    expect(service.snapshot().revision).toBe(5);

    const reset = service.reset();
    expect(reset).toMatchObject({ revision: 6, alarms: [{ key: 'alarm.open', level: 'warning' }] });
    expect(events.map((event) => event.type)).toEqual([
      'raise',
      'ack',
      'suppress',
      'clear',
      'snapshot',
    ]);
    expect(events.map((event) => ('revision' in event ? event.revision : 0))).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });

  it('is idempotent for an unchanged raise and missing targets', () => {
    const service = new AlarmsService();
    const events: DemoAlarmEvent[] = [];
    service.events.subscribe((event) => events.push(event));

    service.raise({ key: 'alarm.open' });
    expect(service.snapshot().revision).toBe(1);
    expect(events).toEqual([]);

    expect(service.clear('alarm.missing')).toBe(false);
    expect(service.acknowledge('alarm.missing')).toBe(false);
    expect(service.suppress('alarm.missing', true)).toBe(false);
    expect(service.snapshot().revision).toBe(1);
  });
});
