/**
 * 生产监控数据集的契约元数据。
 *
 * 这里是 `monitor.*` 所有字段与参数的**唯一来源**：`describe` 直接返回它，
 * `query` 也从它派生 `fields`（渲染器会把 `describe().fields` 与 `query().fields`
 * 做规范化比对，不一致直接判 `HOST_DATASET_INVALID`）。因此任何字段改动只允许发生在
 * 本文件，fixtures 只负责按定义产出取值。
 *
 * 字段顺序即绑定的默认顺序（设计器数据面板按此顺序列出，`binding.fields` 缺省也取它）。
 * 字段上**不写枚举**：契约里没有 enum 类型，`status` / `level` 的枚举语义只放在
 * `parameters[].allowedValues` 与文档层的展示约定里，字段一律用 `string`。
 */

/** 数据集字段/参数的取值类型（与 ScreenDatasetValueType 同集）。 */
export type DatasetValueType = 'string' | 'number' | 'boolean' | 'date';

/** 参数值：与契约的 `ScreenDatasetParameterValue` 同集（标量，不含对象）。 */
export type DatasetParameterValue = string | number | boolean;

export interface DatasetFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly valueType: DatasetValueType;
  /** 展示单位（`%`、`件/分`）。单位不参与取值校验，只用于表头与读数拼接。 */
  readonly unit?: string;
  readonly nullable: boolean;
}

export interface DatasetParameterDefinition {
  readonly name: string;
  readonly label: string;
  readonly valueType: DatasetValueType;
  readonly required: boolean;
  readonly defaultValue?: DatasetParameterValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly allowedValues?: readonly DatasetParameterValue[];
}

export interface DatasetDefinition {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string;
  readonly groupId: string;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly parameters: readonly DatasetParameterDefinition[];
}

export interface DatasetGroupDefinition {
  readonly id: string;
  readonly name: string;
}

/** 产线取值域：参数 `allowedValues`、文档变量取值域与冒烟断言三处共用本常量。 */
export const LINE_IDS = ['LINE-A', 'LINE-B', 'LINE-C'] as const;

export type LineId = (typeof LINE_IDS)[number];

export const LINE_LABELS: Readonly<Record<LineId, string>> = {
  'LINE-A': 'A 线',
  'LINE-B': 'B 线',
  'LINE-C': 'C 线',
};

export function isLineId(value: unknown): value is LineId {
  return typeof value === 'string' && (LINE_IDS as readonly string[]).includes(value);
}

/** 告警真实等级（不含「不过滤」）。 */
export const ALARM_LEVELS = ['critical', 'warning', 'info'] as const;

export type AlarmLevel = (typeof ALARM_LEVELS)[number];

/**
 * 告警筛选取值域。`all` 是显式的「不过滤」值（PRD Q5）：空串与「变量缺失」不可区分，
 * 因此不允许用空串表达不过滤。`allowedValues` 必须含 `all`，否则 `level ← severity`
 * 在 `severity='all'` 时会被基座的参数求值拒绝。
 */
export const ALARM_LEVEL_FILTERS = ['all', ...ALARM_LEVELS] as const;

export type AlarmLevelFilter = (typeof ALARM_LEVEL_FILTERS)[number];

export function isAlarmLevelFilter(value: unknown): value is AlarmLevelFilter {
  return typeof value === 'string' && (ALARM_LEVEL_FILTERS as readonly string[]).includes(value);
}

/** 设备/工序的五态里本数据集实际出现的四态（`unknown` 由物料侧兜底，不来自后端）。 */
export const DEVICE_STATUSES = ['running', 'standby', 'fault', 'offline'] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** 数据集分组：产线目录/设备/工序/班组归「生产运行」，告警事件单列。 */
export const DATASET_GROUPS: readonly DatasetGroupDefinition[] = [
  { id: 'production', name: '生产运行' },
  { id: 'alarm', name: '告警事件' },
];

/** 分组顺序的权威：列表响应里的 `groups` 按本数组顺序过滤后返回。 */
const GROUP_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  DATASET_GROUPS.map((group, index) => [group.id, index]),
);

export function groupRank(groupId: string): number {
  return GROUP_ORDER[groupId] ?? DATASET_GROUPS.length;
}

const DEVICE_FIELDS: readonly DatasetFieldDefinition[] = [
  { id: 'id', label: '设备编号', valueType: 'string', nullable: false },
  { id: 'name', label: '设备名称', valueType: 'string', nullable: false },
  { id: 'line', label: '所属产线', valueType: 'string', nullable: false },
  { id: 'status', label: '运行状态', valueType: 'string', nullable: false },
  { id: 'load', label: '负载', valueType: 'number', unit: '%', nullable: false },
];

const ALARM_FIELDS: readonly DatasetFieldDefinition[] = [
  { id: 'id', label: '告警编号', valueType: 'string', nullable: false },
  { id: 't', label: '发生时间', valueType: 'date', nullable: false },
  { id: 'level', label: '等级', valueType: 'string', nullable: false },
  { id: 'deviceId', label: '设备编号', valueType: 'string', nullable: false },
  { id: 'deviceName', label: '设备名称', valueType: 'string', nullable: false },
  { id: 'stageName', label: '工序', valueType: 'string', nullable: false },
  { id: 'code', label: '告警码', valueType: 'string', nullable: false },
  { id: 'message', label: '告警内容', valueType: 'string', nullable: false },
];

const PIPELINE_FIELDS: readonly DatasetFieldDefinition[] = [
  { id: 'id', label: '工序编号', valueType: 'string', nullable: false },
  { id: 'name', label: '工序名称', valueType: 'string', nullable: false },
  { id: 'status', label: '工序状态', valueType: 'string', nullable: false },
  { id: 'throughput', label: '吞吐', valueType: 'number', unit: '件/分', nullable: false },
];

const CREW_FIELDS: readonly DatasetFieldDefinition[] = [
  { id: 'crew', label: '班组', valueType: 'string', nullable: false },
  { id: 'output', label: '产量', valueType: 'number', unit: '件', nullable: false },
  { id: 'defect_rate', label: '不良率', valueType: 'number', unit: '%', nullable: false },
  { id: 'oee', label: 'OEE', valueType: 'number', unit: '%', nullable: false },
];

const LINE_PARAMETER: DatasetParameterDefinition = {
  name: 'line',
  label: '产线',
  valueType: 'string',
  required: true,
  allowedValues: [...LINE_IDS],
};

/** 设备清单的产线参数带默认值：单独试接口时不传 `line` 也能得到稳定结果。 */
const DEVICE_LINE_PARAMETER: DatasetParameterDefinition = {
  ...LINE_PARAMETER,
  defaultValue: 'LINE-A',
};

const DEVICE_LIMIT_PARAMETER: DatasetParameterDefinition = {
  name: 'limit',
  label: '返回条数',
  valueType: 'number',
  required: false,
  defaultValue: 48,
  minimum: 1,
  maximum: 48,
};

/** 三个 P0 数据集 + 一个 P1 定义（`monitor.crew` 本轮只定义不接线）。 */
export const DATASET_DEFINITIONS: readonly DatasetDefinition[] = [
  {
    datasetId: 'monitor.devices',
    name: '设备清单',
    description: '按产线返回设备编号、名称、运行状态与负载百分比。',
    groupId: 'production',
    fields: DEVICE_FIELDS,
    parameters: [DEVICE_LINE_PARAMETER, DEVICE_LIMIT_PARAMETER],
  },
  {
    datasetId: 'monitor.alarms',
    name: '告警事件',
    description: '所选产线与时间窗内的告警明细，按发生时间倒序，可按等级过滤。',
    groupId: 'alarm',
    fields: ALARM_FIELDS,
    parameters: [
      LINE_PARAMETER,
      {
        name: 'window',
        label: '时间窗(分钟)',
        valueType: 'number',
        required: false,
        defaultValue: 60,
        minimum: 1,
        maximum: 1440,
      },
      {
        name: 'level',
        label: '等级过滤',
        valueType: 'string',
        required: false,
        defaultValue: 'all',
        allowedValues: [...ALARM_LEVEL_FILTERS],
      },
      {
        name: 'limit',
        label: '返回条数',
        valueType: 'number',
        required: false,
        defaultValue: 20,
        minimum: 1,
        maximum: 50,
      },
    ],
  },
  {
    datasetId: 'monitor.pipeline',
    name: '产线工序链',
    description: '按产线返回有向工序序列，数组顺序即工序顺序。',
    groupId: 'production',
    fields: PIPELINE_FIELDS,
    parameters: [LINE_PARAMETER],
  },
  {
    datasetId: 'monitor.crew',
    name: '班组绩效',
    description: '按产线与时间窗返回班组产量、不良率与 OEE，按产量倒序。',
    groupId: 'production',
    fields: CREW_FIELDS,
    parameters: [
      LINE_PARAMETER,
      {
        name: 'window',
        label: '时间窗(分钟)',
        valueType: 'number',
        required: false,
        defaultValue: 60,
        minimum: 1,
        maximum: 1440,
      },
      {
        name: 'limit',
        label: '返回条数',
        valueType: 'number',
        required: false,
        defaultValue: 6,
        minimum: 1,
        maximum: 12,
      },
    ],
  },
];

const DEFINITION_BY_ID: ReadonlyMap<string, DatasetDefinition> = new Map(
  DATASET_DEFINITIONS.map((definition) => [definition.datasetId, definition]),
);

export function findDatasetDefinition(datasetId: string): DatasetDefinition | undefined {
  return DEFINITION_BY_ID.get(datasetId);
}
