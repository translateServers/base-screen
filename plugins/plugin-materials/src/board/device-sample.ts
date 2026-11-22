import type { ScreenJsonValue } from '@base-screen/contracts';

/**
 * 设备五态物料（状态分布、状态灯阵）共用的一份示例数据。
 *
 * 两个物料读的是同一类表（设备 × 状态 × 读数），示例数据也必须是同一份：否则「设备状态卡」
 * 插入后，分布条上写着 3 台、灯阵里却画着 5 格，作者第一眼看到的就是一张自相矛盾的卡。
 *
 * 12 台的规模刻意取「正常为主、异常各一两台」：这是监控屏的常态，也是 ISA-101 灰底 + 异常
 * 高亮要验证的场景——异常设备必须在一屏正常设备里一眼跳出来。未知值 `MELTING` 不在五态内，
 * 用来演示「对不上的状态归未知、不丢弃」。
 */
export const BOARD_DEVICE_SAMPLE_DATA = {
  fields: [
    { id: 'name', label: '设备', valueType: 'string', nullable: false },
    { id: 'status', label: '状态', valueType: 'string', nullable: false },
    { id: 'load', label: '负载', valueType: 'number', unit: '%', nullable: false },
  ],
  rows: [
    { name: '1#冲压机', status: 'running', load: 72 },
    { name: '2#冲床', status: 'running', load: 64 },
    { name: '3#焊机', status: 'standby', load: 12 },
    { name: '4#焊机', status: 'running', load: 58 },
    { name: '5#折弯机', status: 'fault', load: 91 },
    { name: '6#激光切割', status: 'running', load: 77 },
    { name: '7#喷涂线', status: 'running', load: 69 },
    { name: '8#装配台', status: 'offline', load: 0 },
    { name: '9#装配台', status: 'running', load: 55 },
    { name: '10#检测台', status: 'running', load: 48 },
    { name: '11#包装机', status: 'standby', load: 8 },
    { name: '12#码垛机', status: 'MELTING', load: 0 },
  ],
} as const satisfies ScreenJsonValue;
