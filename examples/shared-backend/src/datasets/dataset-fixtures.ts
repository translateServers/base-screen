/**
 * `monitor.*` 的确定性固定表。
 *
 * 纪律（PRD §6.4）：不出现 `Date.now()` / `Math.random()`；一切取值由常量表与纯函数
 * 推导，因此同一请求两次响应字节级一致，冒烟与单测可以对绝对值断言。
 *
 * 硬指标（不可随手改）：
 * - `LINE-A` 48 台设备、其中 `fault` 3 台；`LINE-B` 36 台、`fault` 1 台；`LINE-C` 0 台。
 * - `LINE-A` 工序 6 道（下料→冲压→焊装→涂装→总装→检测），第 3 道 `fault`。
 * - `LINE-A` 近 60 分钟告警 14 条，其中 `critical` 2 条。
 */

import type { AlarmLevel, DeviceStatus, LineId } from './dataset-definitions';

/** 固定基准时间：所有时间型取值的锚点（与 metrics 的序列基准同一天）。 */
export const FIXTURE_BASE_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

const MINUTE_MS = 60_000;

export interface DeviceFixture {
  readonly id: string;
  readonly name: string;
  readonly line: LineId;
  readonly stageName: string;
  readonly status: DeviceStatus;
  readonly load: number;
}

export interface PipelineStageFixture {
  readonly id: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly throughput: number;
}

export interface AlarmFixture {
  readonly id: string;
  readonly t: string;
  readonly level: AlarmLevel;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly stageName: string;
  readonly code: string;
  readonly message: string;
}

export interface CrewFixture {
  readonly crew: string;
  readonly output: number;
  readonly defect_rate: number;
  readonly oee: number;
}

/** 工序名固定六道，设备名按「工序-序号」派生，告警的工序名也据此对齐。 */
const STAGE_NAMES: readonly string[] = ['下料', '冲压', '焊装', '涂装', '总装', '检测'];

const DEVICE_COUNTS: Readonly<Record<LineId, number>> = {
  'LINE-A': 48,
  'LINE-B': 36,
  'LINE-C': 0,
};

/** 故障设备的固定下标（0 基）：A 线 3 台、B 线 1 台、C 线 0 台。 */
const FAULT_DEVICE_INDEXES: Readonly<Record<LineId, readonly number[]>> = {
  'LINE-A': [2, 17, 33],
  'LINE-B': [5],
  'LINE-C': [],
};

const OFFLINE_MODULUS = 23;
const STANDBY_MODULUS = 11;

function deviceStatus(line: LineId, index: number): DeviceStatus {
  if (FAULT_DEVICE_INDEXES[line].includes(index)) return 'fault';
  if (index % OFFLINE_MODULUS === 0) return 'offline';
  if (index % STANDBY_MODULUS === 0) return 'standby';
  return 'running';
}

/** 负载：运行 46–92%，待机 5–16%，故障与离线为 0（不编造「故障设备还在出力」）。 */
function deviceLoad(status: DeviceStatus, index: number): number {
  if (status === 'fault' || status === 'offline') return 0;
  if (status === 'standby') return 5 + ((index * 3) % 12);
  return 46 + ((index * 7) % 47);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function buildDevices(line: LineId): readonly DeviceFixture[] {
  const devices: DeviceFixture[] = [];
  for (let index = 0; index < DEVICE_COUNTS[line]; index += 1) {
    const stageName = STAGE_NAMES[index % STAGE_NAMES.length] ?? '下料';
    const status = deviceStatus(line, index);
    devices.push({
      id: `${line}-${pad2(index + 1)}`,
      name: `${stageName}-${pad2(Math.floor(index / STAGE_NAMES.length) + 1)}`,
      line,
      stageName,
      status,
      load: deviceLoad(status, index),
    });
  }
  return devices;
}

const DEVICES: Readonly<Record<LineId, readonly DeviceFixture[]>> = {
  'LINE-A': buildDevices('LINE-A'),
  'LINE-B': buildDevices('LINE-B'),
  'LINE-C': buildDevices('LINE-C'),
};

const PIPELINE_STAGES: Readonly<Record<LineId, readonly Omit<PipelineStageFixture, 'id'>[]>> = {
  'LINE-A': [
    { name: '下料', status: 'running', throughput: 120 },
    { name: '冲压', status: 'running', throughput: 96 },
    // 第 3 道故障：工序链的「哪道卡住」断言依赖这个固定位置。
    { name: '焊装', status: 'fault', throughput: 0 },
    { name: '涂装', status: 'running', throughput: 88 },
    { name: '总装', status: 'running', throughput: 72 },
    { name: '检测', status: 'running', throughput: 64 },
  ],
  'LINE-B': [
    { name: '下料', status: 'running', throughput: 78 },
    { name: '冲压', status: 'standby', throughput: 42 },
    { name: '总装', status: 'running', throughput: 66 },
    { name: '检测', status: 'running', throughput: 61 },
  ],
  'LINE-C': [],
};

interface AlarmSeed {
  /** 距基准时间的分钟数（越大越早）。 */
  readonly offsetMinutes: number;
  readonly level: AlarmLevel;
  /** 关联设备在 `listDevices(line)` 里的下标：设备名/工序名由设备固定表反查，避免两份真相。 */
  readonly deviceIndex: number;
  readonly code: string;
  readonly message: string;
}

/**
 * LINE-A：60 分钟内 14 条（critical 2 / warning 5 / info 7），另有 5 条在 60–1440 分钟之间，
 * 用于验证「时间窗切窗」而不是「过滤掉所有早期事件」。
 */
const ALARM_SEEDS: Readonly<Record<LineId, readonly AlarmSeed[]>> = {
  'LINE-A': [
    {
      offsetMinutes: 3,
      level: 'warning',
      deviceIndex: 11,
      code: 'LOAD_HIGH',
      message: '负载持续高于 85%，请关注',
    },
    {
      offsetMinutes: 7,
      level: 'info',
      deviceIndex: 22,
      code: 'TOOL_CHANGE',
      message: '刀具寿命到期，已自动换刀',
    },
    {
      offsetMinutes: 9,
      level: 'critical',
      deviceIndex: 2,
      code: 'TEMP_OVER',
      message: '主轴温度超过阈值 92 ℃，已停机',
    },
    {
      offsetMinutes: 12,
      level: 'info',
      deviceIndex: 40,
      code: 'MATERIAL_LOW',
      message: '料仓余量低于 20%，请补料',
    },
    {
      offsetMinutes: 16,
      level: 'warning',
      deviceIndex: 27,
      code: 'LOAD_HIGH',
      message: '负载持续高于 85%，请关注',
    },
    {
      offsetMinutes: 20,
      level: 'info',
      deviceIndex: 14,
      code: 'QC_PASS',
      message: '抽检合格率 99.2%',
    },
    {
      offsetMinutes: 24,
      level: 'info',
      deviceIndex: 35,
      code: 'TOOL_CHANGE',
      message: '刀具寿命到期，已自动换刀',
    },
    {
      offsetMinutes: 28,
      level: 'warning',
      deviceIndex: 5,
      code: 'VIBRATION',
      message: '振动幅值接近告警线',
    },
    {
      offsetMinutes: 33,
      level: 'critical',
      deviceIndex: 17,
      code: 'SENSOR_LOST',
      message: '检测工位传感器失联，工序已暂停',
    },
    {
      offsetMinutes: 37,
      level: 'info',
      deviceIndex: 46,
      code: 'MATERIAL_LOW',
      message: '料仓余量低于 20%，请补料',
    },
    {
      offsetMinutes: 41,
      level: 'warning',
      deviceIndex: 30,
      code: 'LOAD_HIGH',
      message: '负载持续高于 85%，请关注',
    },
    {
      offsetMinutes: 46,
      level: 'info',
      deviceIndex: 8,
      code: 'QC_PASS',
      message: '抽检合格率 98.7%',
    },
    {
      offsetMinutes: 51,
      level: 'warning',
      deviceIndex: 19,
      code: 'VIBRATION',
      message: '振动幅值接近告警线',
    },
    {
      offsetMinutes: 57,
      level: 'info',
      deviceIndex: 44,
      code: 'TOOL_CHANGE',
      message: '刀具寿命到期，已自动换刀',
    },
    {
      offsetMinutes: 75,
      level: 'warning',
      deviceIndex: 9,
      code: 'LOAD_HIGH',
      message: '负载持续高于 85%，请关注',
    },
    {
      offsetMinutes: 105,
      level: 'info',
      deviceIndex: 26,
      code: 'QC_PASS',
      message: '抽检合格率 99.0%',
    },
    {
      offsetMinutes: 180,
      level: 'info',
      deviceIndex: 12,
      code: 'MATERIAL_LOW',
      message: '料仓余量低于 20%，请补料',
    },
    {
      offsetMinutes: 420,
      level: 'warning',
      deviceIndex: 38,
      code: 'VIBRATION',
      message: '振动幅值接近告警线',
    },
    {
      offsetMinutes: 900,
      level: 'info',
      deviceIndex: 21,
      code: 'MATERIAL_LOW',
      message: '料仓余量低于 20%，请补料',
    },
  ],
  'LINE-B': [
    {
      offsetMinutes: 2,
      level: 'warning',
      deviceIndex: 8,
      code: 'LOAD_HIGH',
      message: '负载持续高于 85%，请关注',
    },
    {
      offsetMinutes: 6,
      level: 'info',
      deviceIndex: 3,
      code: 'TOOL_CHANGE',
      message: '刀具寿命到期，已自动换刀',
    },
    {
      offsetMinutes: 11,
      level: 'critical',
      deviceIndex: 5,
      code: 'TEMP_OVER',
      message: '主轴温度超过阈值 92 ℃，已停机',
    },
    {
      offsetMinutes: 15,
      level: 'info',
      deviceIndex: 20,
      code: 'QC_PASS',
      message: '抽检合格率 98.9%',
    },
    {
      offsetMinutes: 19,
      level: 'info',
      deviceIndex: 30,
      code: 'MATERIAL_LOW',
      message: '料仓余量低于 20%，请补料',
    },
    {
      offsetMinutes: 26,
      level: 'warning',
      deviceIndex: 14,
      code: 'VIBRATION',
      message: '振动幅值接近告警线',
    },
    {
      offsetMinutes: 31,
      level: 'info',
      deviceIndex: 26,
      code: 'TOOL_CHANGE',
      message: '刀具寿命到期，已自动换刀',
    },
    {
      offsetMinutes: 44,
      level: 'warning',
      deviceIndex: 33,
      code: 'LOAD_HIGH',
      message: '负载持续高于 85%，请关注',
    },
    {
      offsetMinutes: 52,
      level: 'info',
      deviceIndex: 11,
      code: 'QC_PASS',
      message: '抽检合格率 99.1%',
    },
    {
      offsetMinutes: 240,
      level: 'info',
      deviceIndex: 2,
      code: 'MATERIAL_LOW',
      message: '料仓余量低于 20%，请补料',
    },
  ],
  'LINE-C': [],
};

const CREW_SEEDS: Readonly<Record<LineId, readonly CrewFixture[]>> = {
  'LINE-A': [
    { crew: '甲班', output: 4120, defect_rate: 0.8, oee: 86.4 },
    { crew: '乙班', output: 3980, defect_rate: 1.1, oee: 83.2 },
    { crew: '丙班', output: 3640, defect_rate: 1.4, oee: 79.5 },
    { crew: '丁班', output: 3410, defect_rate: 1.9, oee: 76.8 },
    { crew: '戊班', output: 3180, defect_rate: 2.2, oee: 74.1 },
    { crew: '己班', output: 2950, defect_rate: 2.6, oee: 71.3 },
  ],
  'LINE-B': [
    { crew: '甲班', output: 2960, defect_rate: 1.0, oee: 82.7 },
    { crew: '乙班', output: 2810, defect_rate: 1.3, oee: 80.4 },
    { crew: '丙班', output: 2540, defect_rate: 1.7, oee: 77.9 },
    { crew: '丁班', output: 2380, defect_rate: 2.0, oee: 74.6 },
  ],
  'LINE-C': [],
};

/** 设备固定表（按产线缓存，内容纯函数可复算）。 */
export function listDevices(line: LineId): readonly DeviceFixture[] {
  return DEVICES[line];
}

export function listPipelineStages(line: LineId): readonly PipelineStageFixture[] {
  return PIPELINE_STAGES[line].map((stage, index) => ({
    id: `${line}-stage-${index + 1}`,
    name: stage.name,
    status: stage.status,
    throughput: stage.throughput,
  }));
}

export function listCrew(line: LineId): readonly CrewFixture[] {
  // 固定表本身即按产量降序，排序在同值兜底时仍显式执行，避免依赖书写顺序。
  return [...CREW_SEEDS[line]].sort(
    (left, right) => right.output - left.output || compareText(left.crew, right.crew),
  );
}

/** 告警固定表：时间由基准时间倒推，因此与「真实当前时间」无关。 */
export function listAlarms(line: LineId): readonly AlarmFixture[] {
  const devices = listDevices(line);
  return ALARM_SEEDS[line].map((seed, index) => {
    const device = devices[seed.deviceIndex];
    return {
      id: `${line}-alarm-${pad2(index + 1)}`,
      t: new Date(FIXTURE_BASE_EPOCH_MS - seed.offsetMinutes * MINUTE_MS).toISOString(),
      level: seed.level,
      deviceId: device?.id ?? `${line}-unknown`,
      deviceName: device?.name ?? '未知设备',
      stageName: device?.stageName ?? '未知工序',
      code: seed.code,
      message: seed.message,
    };
  });
}

/** 时间窗切窗：只保留「基准时间往前 windowMinutes 分钟」之内的事件。 */
export function sliceByWindow(
  alarms: readonly AlarmFixture[],
  windowMinutes: number,
): readonly AlarmFixture[] {
  const threshold = FIXTURE_BASE_EPOCH_MS - windowMinutes * MINUTE_MS;
  return alarms.filter((alarm) => Date.parse(alarm.t) >= threshold);
}

/** 服务端保证的排序：时间倒序，同值按 id 升序兜底（稳定、可断言）。 */
export function sortByTimeDesc(alarms: readonly AlarmFixture[]): readonly AlarmFixture[] {
  return [...alarms].sort(
    (left, right) => Date.parse(right.t) - Date.parse(left.t) || compareText(left.id, right.id),
  );
}

/**
 * 与 locale 无关的字符串比较（`localeCompare` 的结果随 ICU 版本与 locale 变化，
 * 不能用于「确定性数据」的兜底排序）。
 */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
