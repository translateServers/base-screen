import type { HostAlarmBindings } from './host-alarm-controller';

/**
 * 演示绑定：告警系统按 key 管理规则，宿主把它映射到具体组件。
 * 样式键必须落在对应物料的 Manifest styleSchema 内：
 * - `kpi-alarm-value`（datav.digital-flop）只支持 color；
 * - `top-notice`（base.text）额外支持 fontWeight。
 */
export const DEMO_ALARM_BINDINGS: HostAlarmBindings = {
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
};
