import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ALARM_LEVEL_FILTERS,
  type AlarmLevelFilter,
  DATASET_DEFINITIONS,
  DATASET_GROUPS,
  type DatasetDefinition,
  type DatasetFieldDefinition,
  type DatasetGroupDefinition,
  type DatasetParameterDefinition,
  type DatasetParameterValue,
  findDatasetDefinition,
  groupRank,
  isAlarmLevelFilter,
  isLineId,
  LINE_IDS,
  type LineId,
} from './dataset-definitions';
import {
  type AlarmFixture,
  listAlarms,
  listCrew,
  listDevices,
  listPipelineStages,
  sliceByWindow,
  sortByTimeDesc,
} from './dataset-fixtures';

/** 目录条目：`GET /api/datasets` 的 `items[]`（PRD §6.1 形状）。 */
export interface DatasetCatalogEntry {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string;
  readonly groupId: string;
}

export interface DatasetCatalog {
  readonly groups: readonly DatasetGroupDefinition[];
  readonly items: readonly DatasetCatalogEntry[];
}

export interface DatasetDefinitionShape {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string;
  readonly groupId: string;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly parameters: readonly DatasetParameterDefinition[];
}

/** 单元格只允许标量与 null（`t` 是 ISO 字符串，`load` 是数字）。 */
export type DatasetCell = string | number | null;

export type DatasetRow = Readonly<Record<string, DatasetCell>>;

export interface DatasetTabular {
  readonly fields: readonly DatasetFieldDefinition[];
  readonly rows: readonly DatasetRow[];
  readonly totalRowCount: number;
}

/**
 * 查询参数：所有键都可缺省，缺省时回落 `parameters[].defaultValue`。
 * 显式允许 `undefined`（后端开启 `exactOptionalPropertyTypes`，端口可能传 undefined）。
 */
export interface DatasetQueryParameters {
  readonly line?: string | undefined;
  readonly window?: number | undefined;
  readonly level?: string | undefined;
  readonly limit?: number | undefined;
}

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 50;

/**
 * 参数名 → 错误码。未知参数名的兜底码 `INVALID_PARAMETER` 对当前 4 个数据集不可达
 * （它们的参数只有 line/window/level/limit），保留是为了新增参数时失败关闭而不是静默。
 */
const PARAMETER_ERROR_CODES: Readonly<Record<string, string>> = {
  line: 'UNKNOWN_LINE',
  window: 'INVALID_WINDOW',
  level: 'UNKNOWN_LEVEL',
  limit: 'INVALID_LIMIT',
};

const UNKNOWN_PARAMETER_CODE = 'INVALID_PARAMETER';

@Injectable()
export class DatasetsService {
  /** 分组目录：顺序由 `DATASET_GROUPS` 常量决定，不随请求漂移。 */
  groups(): readonly DatasetGroupDefinition[] {
    return DATASET_GROUPS;
  }

  /**
   * 目录查询：`query` 对 datasetId/名称/说明做**不区分大小写的子串匹配**（中文同样适用，
   * 因为 `toLowerCase` 对汉字是恒等变换）；`groups` 由命中的条目反推，因此
   * `?query=告警` 只返回 1 个分组，而全量列表返回 2 个。
   */
  list(
    query: string | undefined,
    groupId: string | undefined,
    limit: number | undefined,
  ): DatasetCatalog {
    const resolvedLimit = limit ?? DEFAULT_LIST_LIMIT;
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > MAX_LIST_LIMIT) {
      throw new BadRequestException({
        error: 'INVALID_LIMIT',
        message: `limit must be within 1..${MAX_LIST_LIMIT}`,
      });
    }
    const needle = (query ?? '').trim().toLowerCase();
    const matched = DATASET_DEFINITIONS.filter((definition) => {
      if (groupId !== undefined && definition.groupId !== groupId) return false;
      if (needle === '') return true;
      return (
        definition.datasetId.toLowerCase().includes(needle) ||
        definition.name.toLowerCase().includes(needle) ||
        definition.description.toLowerCase().includes(needle)
      );
    });
    const presentGroups = new Set(matched.map((definition) => definition.groupId));
    return {
      groups: DATASET_GROUPS.filter((group) => presentGroups.has(group.id)).sort(
        (left, right) => groupRank(left.id) - groupRank(right.id),
      ),
      items: matched.slice(0, resolvedLimit).map(toCatalogEntry),
    };
  }

  describe(datasetId: string): DatasetDefinitionShape {
    const definition = requireDefinition(datasetId);
    return {
      datasetId: definition.datasetId,
      name: definition.name,
      description: definition.description,
      groupId: definition.groupId,
      // 字段顺序即绑定默认顺序；`query` 复用同一份数组，保证两处逐字段一致。
      fields: definition.fields,
      parameters: definition.parameters,
    };
  }

  /**
   * 数据集查询。非法参数一律 400（不 500、不返回空数组冒充成功）：
   * 空数组是「合法的空结果」，把失败伪装成空结果会让大屏显示「暂无数据」，
   * 掩盖真实故障。
   */
  query(datasetId: string, parameters: DatasetQueryParameters): DatasetTabular {
    const definition = requireDefinition(datasetId);
    const resolved = resolveParameters(definition, parameters);
    const { rows, totalRowCount } = projectRows(definition, resolved);
    return { fields: definition.fields, rows, totalRowCount };
  }
}

function requireDefinition(datasetId: string): DatasetDefinition {
  const definition = findDatasetDefinition(datasetId);
  if (definition === undefined) {
    throw new NotFoundException({
      error: 'UNKNOWN_DATASET',
      message: `Unknown dataset: ${datasetId}`,
    });
  }
  return definition;
}

function toCatalogEntry(definition: DatasetDefinition): DatasetCatalogEntry {
  return {
    datasetId: definition.datasetId,
    name: definition.name,
    description: definition.description,
    groupId: definition.groupId,
  };
}

/**
 * 参数校验与求值：白名单、区间、必填三类检查全部按 `dataset-definitions.ts` 的声明执行，
 * 因此「定义改了但校验没改」这种漂移不会发生。
 */
function resolveParameters(
  definition: DatasetDefinition,
  supplied: DatasetQueryParameters,
): Readonly<Record<string, DatasetParameterValue>> {
  const resolved: Record<string, DatasetParameterValue> = {};
  for (const parameter of definition.parameters) {
    const raw = readSupplied(supplied, parameter.name);
    const value = raw ?? parameter.defaultValue;
    if (value === undefined) {
      if (parameter.required) {
        throw new BadRequestException({
          error: 'MISSING_PARAMETER',
          message: `Missing required parameter: ${parameter.name}`,
        });
      }
      continue;
    }
    assertValue(parameter, value);
    resolved[parameter.name] = value;
  }
  return resolved;
}

function readSupplied(
  supplied: DatasetQueryParameters,
  name: string,
): DatasetParameterValue | undefined {
  switch (name) {
    case 'line':
      return supplied.line;
    case 'window':
      return supplied.window;
    case 'level':
      return supplied.level;
    case 'limit':
      return supplied.limit;
    default:
      // 未声明的参数名读不到值：DTO 的 whitelist 已挡在入口，这里只是失败关闭。
      return undefined;
  }
}

function assertValue(parameter: DatasetParameterDefinition, value: DatasetParameterValue): void {
  if (parameter.valueType === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw parameterError(parameter, `${parameter.name} must be a finite number`);
  }
  if (parameter.valueType === 'string' && typeof value !== 'string') {
    throw parameterError(parameter, `${parameter.name} must be a string`);
  }
  if (parameter.allowedValues !== undefined && !parameter.allowedValues.includes(value)) {
    throw parameterError(
      parameter,
      `${parameter.name} must be one of: ${parameter.allowedValues.join(', ')}`,
    );
  }
  if (typeof value === 'number') {
    if (parameter.minimum !== undefined && value < parameter.minimum) {
      throw parameterError(parameter, `${parameter.name} must be >= ${parameter.minimum}`);
    }
    if (parameter.maximum !== undefined && value > parameter.maximum) {
      throw parameterError(parameter, `${parameter.name} must be <= ${parameter.maximum}`);
    }
  }
}

function parameterError(
  parameter: DatasetParameterDefinition,
  message: string,
): BadRequestException {
  return new BadRequestException({
    error: PARAMETER_ERROR_CODES[parameter.name] ?? UNKNOWN_PARAMETER_CODE,
    message,
  });
}

function projectRows(
  definition: DatasetDefinition,
  resolved: Readonly<Record<string, DatasetParameterValue>>,
): { readonly rows: readonly DatasetRow[]; readonly totalRowCount: number } {
  switch (definition.datasetId) {
    case 'monitor.devices': {
      const devices = listDevices(requireLine(resolved));
      const limit = requireLimit(resolved, 48);
      return {
        rows: devices.slice(0, limit).map((device) => ({
          id: device.id,
          name: device.name,
          line: device.line,
          status: device.status,
          load: device.load,
        })),
        totalRowCount: devices.length,
      };
    }
    case 'monitor.alarms': {
      const line = requireLine(resolved);
      const window = requireNumber(resolved, 'window', 60);
      const level = requireLevel(resolved);
      const limit = requireLimit(resolved, 20);
      let alarms: readonly AlarmFixture[] = sliceByWindow(listAlarms(line), window);
      if (level !== 'all') {
        const filter = level;
        alarms = alarms.filter((alarm) => alarm.level === filter);
      }
      const sorted = sortByTimeDesc(alarms);
      return {
        rows: sorted.slice(0, limit).map((alarm) => ({
          id: alarm.id,
          t: alarm.t,
          level: alarm.level,
          deviceId: alarm.deviceId,
          deviceName: alarm.deviceName,
          stageName: alarm.stageName,
          code: alarm.code,
          message: alarm.message,
        })),
        totalRowCount: sorted.length,
      };
    }
    case 'monitor.pipeline': {
      const stages = listPipelineStages(requireLine(resolved));
      return {
        // 数组顺序即工序顺序：服务端保序，物料不排序。
        rows: stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          status: stage.status,
          throughput: stage.throughput,
        })),
        totalRowCount: stages.length,
      };
    }
    case 'monitor.crew': {
      const crews = listCrew(requireLine(resolved));
      const limit = requireLimit(resolved, 6);
      return {
        rows: crews.slice(0, limit).map((crew) => ({
          crew: crew.crew,
          output: crew.output,
          defect_rate: crew.defect_rate,
          oee: crew.oee,
        })),
        totalRowCount: crews.length,
      };
    }
    default:
      // 定义表里有、投影分支里没有 = 实现遗漏：失败关闭而不是返回空结果。
      throw new NotFoundException({
        error: 'UNKNOWN_DATASET',
        message: `Dataset has no query implementation: ${definition.datasetId}`,
      });
  }
}

/** 校验已在 `resolveParameters` 完成，这里的守卫只用于把联合类型收窄，不重复报错。 */
function requireLine(resolved: Readonly<Record<string, DatasetParameterValue>>): LineId {
  const value = resolved.line;
  if (!isLineId(value)) {
    throw new BadRequestException({
      error: 'UNKNOWN_LINE',
      message: `line must be one of: ${LINE_IDS.join(', ')}`,
    });
  }
  return value;
}

function requireLevel(resolved: Readonly<Record<string, DatasetParameterValue>>): AlarmLevelFilter {
  const value = resolved.level;
  if (!isAlarmLevelFilter(value)) {
    throw new BadRequestException({
      error: 'UNKNOWN_LEVEL',
      message: `level must be one of: ${ALARM_LEVEL_FILTERS.join(', ')}`,
    });
  }
  return value;
}

function requireNumber(
  resolved: Readonly<Record<string, DatasetParameterValue>>,
  name: string,
  fallback: number,
): number {
  const value = resolved[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function requireLimit(
  resolved: Readonly<Record<string, DatasetParameterValue>>,
  fallback: number,
): number {
  return Math.max(0, Math.trunc(requireNumber(resolved, 'limit', fallback)));
}
