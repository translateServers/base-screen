import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type Observable, Subject } from 'rxjs';
import type {
  DemoAlarmDelta,
  DemoAlarmEvent,
  DemoAlarmLevel,
  DemoAlarmRecord,
  DemoAlarmSnapshot,
} from './alarm-events';

const SEED_ALARM: DemoAlarmRecord = {
  id: 'alarm-alarm.open',
  key: 'alarm.open',
  level: 'warning',
  message: '未处理告警数量超过警戒线',
  raisedAt: '2026-01-01T00:00:00.000Z',
  acknowledged: false,
  suppressed: false,
};

/**
 * 演示用告警状态：内存、单调 revision、无持久化。
 *
 * 这是宿主适配层的最小参考实现——真实告警平台应由宿主在服务端接入，这里只提供
 * 可确定性断言的 snapshot / raise / clear / ack / suppress / reset 语义。
 */
@Injectable()
export class AlarmsService implements OnModuleDestroy {
  #revision = 1;
  #alarms = new Map<string, DemoAlarmRecord>([[SEED_ALARM.id, SEED_ALARM]]);
  readonly #events = new Subject<DemoAlarmEvent>();

  get events(): Observable<DemoAlarmEvent> {
    return this.#events.asObservable();
  }

  snapshot(): DemoAlarmSnapshot {
    return { revision: this.#revision, alarms: [...this.#alarms.values()] };
  }

  snapshotEvent(): DemoAlarmEvent {
    return { type: 'snapshot', ...this.snapshot() };
  }

  raise(input: {
    readonly key: string;
    readonly level?: DemoAlarmLevel;
    readonly message?: string;
  }): DemoAlarmRecord {
    const id = alarmId(input.key);
    const current = this.#alarms.get(id);
    const next: DemoAlarmRecord = {
      id,
      key: input.key,
      level: input.level ?? current?.level ?? 'warning',
      message: input.message ?? current?.message ?? `告警 ${input.key} 已触发`,
      raisedAt: current?.raisedAt ?? new Date().toISOString(),
      acknowledged: current?.acknowledged ?? false,
      suppressed: current?.suppressed ?? false,
    };
    if (current !== undefined && sameAlarm(current, next)) return current;
    this.#alarms.set(id, next);
    this.#commit({ type: 'raise', revision: this.#revision, alarm: next });
    return next;
  }

  clear(key: string): boolean {
    const id = alarmId(key);
    if (!this.#alarms.delete(id)) return false;
    this.#commit({ type: 'clear', revision: this.#revision, alarmId: id });
    return true;
  }

  acknowledge(key: string): boolean {
    const id = alarmId(key);
    const current = this.#alarms.get(id);
    if (current === undefined || current.acknowledged) return false;
    this.#alarms.set(id, { ...current, acknowledged: true });
    this.#commit({ type: 'ack', revision: this.#revision, alarmId: id });
    return true;
  }

  suppress(key: string, suppressed: boolean): boolean {
    const id = alarmId(key);
    const current = this.#alarms.get(id);
    if (current === undefined || current.suppressed === suppressed) return false;
    this.#alarms.set(id, { ...current, suppressed });
    this.#commit({
      type: 'suppress',
      revision: this.#revision,
      alarmId: id,
      suppressed,
    });
    return true;
  }

  reset(): DemoAlarmSnapshot {
    this.#alarms = new Map([[SEED_ALARM.id, SEED_ALARM]]);
    this.#revision += 1;
    this.#events.next(this.snapshotEvent());
    return this.snapshot();
  }

  onModuleDestroy(): void {
    this.#events.complete();
  }

  #commit(event: DemoAlarmDelta): void {
    this.#revision += 1;
    this.#events.next({ ...event, revision: this.#revision });
  }
}

function alarmId(key: string): string {
  return `alarm-${key}`;
}

function sameAlarm(left: DemoAlarmRecord, right: DemoAlarmRecord): boolean {
  return (
    left.level === right.level &&
    left.message === right.message &&
    left.acknowledged === right.acknowledged &&
    left.suppressed === right.suppressed
  );
}
