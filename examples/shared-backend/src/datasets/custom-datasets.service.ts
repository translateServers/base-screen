import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type DatasetFieldDefinition,
  type DatasetParameterDefinition,
} from '../datasets/dataset-definitions';
import { projectRows } from '../datasets/dataset-inference';
import { configParameters, readStoredConfig } from '../datasources/datasource.config';
import { parametersToDefinitions } from '../datasources/datasource.types';
import { datasourceFailureToHttp } from '../datasources/datasource-errors';
import { DatasourceRuntime, resolveParameterValues } from '../datasources/datasource-runtime';
import { CUSTOM_DATASET_ID_PREFIX } from '../datasources/datasource-slug';
import { parseFields } from '../datasources/datasources.service';
import type { DataSource as DataSourceRecord } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 自建数据源在**契约侧**（`/api/datasets`）的读视图（PRD §5 / §8.4 / A2–A4 / A24）。
 *
 * 三条铁律：
 * 1. **只有 `ready` 且有字段**的才进目录，否则 `describe`/`query` 一律 404
 *    `DATASET_NOT_READY`——空 `fields` 会被渲染器当成"0 列/无数据"，那是在骗值班员；
 * 2. **`fields` 来自落库**，`query` 用这份字段投影（A3/A24 的逐字段一致由构造保证）；
 * 3. **运行时失败不改写成 NOT_READY**：执行器的错误按原码返回，宿主自己映射
 *    `HOST_DATASET_UNAVAILABLE` 并保留上一帧。
 */

/** 自建条目在目录里的分组 id（三端按它渲染「自定义数据源」）。 */
export const CUSTOM_GROUP_ID = 'custom';

/** 分组名。契约只要求非空；A2 断言的是这一串。 */
export const CUSTOM_GROUP_NAME = '自定义数据源';

export interface CustomCatalogEntry {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly groupId: string;
}

export interface CustomDefinitionShape {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly groupId: string;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly parameters: readonly DatasetParameterDefinition[];
}

export interface CustomQueryShape {
  readonly fields: readonly DatasetFieldDefinition[];
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly totalRowCount: number;
}

@Injectable()
export class CustomDatasetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: DatasourceRuntime,
  ) {}

  /** 名字空间判断：只有 `custom.*` 才走本服务，`monitor.*` 仍归内置实现。 */
  owns(datasetId: string): boolean {
    return datasetId.startsWith(CUSTOM_DATASET_ID_PREFIX);
  }

  /**
   * 目录条目：`ready` 且字段非空的最近 N 条（`updatedAt` desc）。
   *
   * `limit` 由调用方按「目录总上限 50 - 内置条数」算（Q2：内置 4 + 最近 46 条）。
   */
  async listReady(limit: number): Promise<readonly CustomCatalogEntry[]> {
    if (limit <= 0) return [];
    const rows = await this.prisma.dataSource.findMany({
      where: { status: 'ready' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const entries: CustomCatalogEntry[] = [];
    for (const row of rows) {
      // 过滤在内存里做：`fields` 是 JSON 列，用 Prisma 判空要写原生 SQL，收益不值
      if (parseFields(row.fields).length === 0) continue;
      entries.push({
        datasetId: row.datasetId,
        name: row.name,
        description: row.description,
        groupId: CUSTOM_GROUP_ID,
      });
    }
    return entries;
  }

  async describe(datasetId: string): Promise<CustomDefinitionShape> {
    const row = await this.requireReady(datasetId);
    const type = readStoredType(row.type);
    const config = readStoredConfig(type, row.config);
    return {
      datasetId: row.datasetId,
      name: row.name,
      description: row.description,
      groupId: CUSTOM_GROUP_ID,
      fields: parseFields(row.fields),
      parameters: config === null ? [] : parametersToDefinitions(configParameters(config)),
    };
  }

  /**
   * 执行查询并按**落库字段**投影。
   *
   * 响应键集由调用方收口成 `{fields, rows, totalRowCount}`（契约严格三键，A24）；
   * 截断信息只走管理侧的预览接口。
   */
  async query(
    datasetId: string,
    rawParams: Readonly<Record<string, unknown>>,
  ): Promise<CustomQueryShape> {
    const row = await this.requireReady(datasetId);
    const fields = parseFields(row.fields);
    const type = readStoredType(row.type);
    const config = readStoredConfig(type, row.config);
    if (config === null) {
      throw datasourceFailureToHttp(
        'INVALID_SHAPE',
        '该数据源的配置无法解析，请在管理页重新保存。',
      );
    }
    // 未知参数 → UNDECLARED_PARAMETER（A4 只要求 400，这里给更具体的码）
    const resolved = resolveParameterValues(
      configParameters(config),
      rawParams,
      'UNDECLARED_PARAMETER',
    );
    if (resolved.ok === false) {
      throw datasourceFailureToHttp(resolved.code, resolved.message);
    }
    // requireRows=false：设计器侧 0 行是合法空结果（与内置数据集一致），
    // 「0 行不算成功」只属于保存/测试时的字段推断。
    const result = await this.runtime.execute({
      type,
      config,
      values: resolved.values,
      requireRows: false,
    });
    if (result.ok === false) {
      throw datasourceFailureToHttp(result.code, result.message);
    }
    const rows = projectRows(result.rows, fields);
    return { fields, rows, totalRowCount: rows.length };
  }

  private async requireReady(datasetId: string): Promise<DataSourceRecord> {
    const row = await this.prisma.dataSource.findUnique({ where: { datasetId } });
    if (row === null) {
      throw new NotFoundException({
        error: 'UNKNOWN_DATASET',
        message: `未知数据集：${datasetId}`,
      });
    }
    if (row.status !== 'ready' || parseFields(row.fields).length === 0) {
      throw new NotFoundException({
        error: 'DATASET_NOT_READY',
        message: '数据源尚未就绪，请先在数据源管理页测试连接。',
      });
    }
    return row;
  }
}

function readStoredType(value: string): 'sqlite' | 'rest' | 'static' {
  return value === 'sqlite' || value === 'rest' ? value : 'static';
}
