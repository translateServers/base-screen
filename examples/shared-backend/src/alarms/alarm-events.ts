export type DemoAlarmLevel = 'warning' | 'critical' | 'info';

export interface DemoAlarmRecord {
  readonly id: string;
  readonly key: string;
  readonly level: DemoAlarmLevel;
  readonly message: string;
  readonly raisedAt: string;
  readonly acknowledged: boolean;
  readonly suppressed: boolean;
}

export interface DemoAlarmSnapshot {
  readonly revision: number;
  readonly alarms: readonly DemoAlarmRecord[];
}

export type DemoAlarmDelta =
  | {
      readonly type: 'snapshot';
      readonly revision: number;
      readonly alarms: readonly DemoAlarmRecord[];
    }
  | { readonly type: 'raise'; readonly revision: number; readonly alarm: DemoAlarmRecord }
  | { readonly type: 'clear'; readonly revision: number; readonly alarmId: string }
  | { readonly type: 'ack'; readonly revision: number; readonly alarmId: string }
  | {
      readonly type: 'suppress';
      readonly revision: number;
      readonly alarmId: string;
      readonly suppressed: boolean;
    };

export type DemoAlarmEvent = DemoAlarmDelta | { readonly type: 'heartbeat' };
