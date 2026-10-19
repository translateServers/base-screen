import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DATASET_DEFINITIONS,
  type DatasetDefinition,
  type DatasetFieldDefinition,
  type DatasetParameterDefinition,
} from '../datasets/dataset-definitions';
import { fieldsFromTableColumns } from '../datasets/dataset-inference';
import type { DataSource as DataSourceRecord } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { inspectSql } from '../sqlite/sqlite-sql-guard';
import {
  configParameters,
  configSummary,
  isSameConfig,
  type MaskedStoredConfig,
  maskConfig,
  mergeRestHeaders,
  readConfig,
  readRecord,
  readStoredConfig,
} from './datasource.config';
import {
  type DataSourceStatus,
  type DataSourceStatusView,
  type DataSourceType,
  type DatasourceRow,
  isStoredDataSourceType,
  type LastTestResult,
  MAX_PREVIEW_ROWS,
  parametersToDefinitions,
  type SqliteConfig,
  type StoredDataSourceConfig,
  type StoredDataSourceType,
} from './datasource.types';
import { datasourceFailureToHttp } from './datasource-errors';
import { DatasourceFilesService } from './datasource-files.service';
import { DatasourceReferenceService, type ScreenReference } from './datasource-reference.service';
import {
  DatasourceRuntime,
  type RuntimeResult,
  resolveParameterValues,
} from './datasource-runtime';
import { buildCustomDatasetId, suggestDatasetId } from './datasource-slug';
import type { DraftDatasourceDto, SaveDatasourceDto } from './dto/datasource.dto';

/**
 * 数据源管理侧服务（PRD §9.1 #1–#10、§8.4 状态语义、架构 §3.4）。
 *
 * 四件事在这里收口：
 * 1. **CRUD 与唯一性**：`datasetId` 生成、409 冲突 + 建议名（不自动加后缀）；
 * 2. **保存即取数**：`POST`/`PUT` 同步跑一次测试，成功且字段非空才 `ready`；失败落 `error`
 *    但**不阻塞保存**（R1：接口临时不可达时草稿必须能存下来）；
 * 3. **凭据只出不进**：响应里的 header 值恒为掩码；`PUT` 传空串/掩码 = 保留原值；
 *    `POST /:id/test` 用库里的原值执行（前端不需要拿到明文也能测）；
 * 4. **内置是虚拟投影**：4 个内置数据集来自代码常量，不入表、不可写，`PUT`/`DELETE` 一律 403。
 *
 * 所有异常都带 `{error, message}` 形状；`AllExceptionsFilter` 会把额外字段
 * （`refScreens` / `suggestedId`）一并透传。
 */

/** 内置条目的固定时间戳：虚拟投影没有真实创建时间，固定值让列表稳定可比。 */
const BUILTIN_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** 设计器目录里自建条目的名额：契约 items 上限 50 - 内置 4（PRD Q2）。 */
const CATALOG_CUSTOM_LIMIT = 46;

export interface DatasourceRefScreenShape {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

export interface DatasourceItemShape {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: DataSourceType;
  readonly status: DataSourceStatusView;
  readonly configSummary: string;
  readonly refCount: number;
  readonly refScreens: readonly DatasourceRefScreenShape[];
  readonly lastTest: LastTestResult | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DatasourceDetailShape extends DatasourceItemShape {
  /** 脱敏后的配置；内置为 `null`。 */
  readonly config: MaskedStoredConfig | null;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly parameters: readonly DatasetParameterDefinition[];
}

export interface DatasourceListShape {
  readonly items: readonly DatasourceItemShape[];
  readonly total: number;
  /**
   * 进设计器目录的自建条数（上限 46 = 契约 items 上限 50 - 内置 4）。
   *
   * 管理页要用它判断「是否发生了目录截断」并提示「设计器面板仅显示最近 46 个自建数据源」。
   * 不能拿 `total` 猜：`total` 包含内置与未就绪的草稿，两回事。
   */
  readonly catalogVisibleCount: number;
}

export interface DatasourceTestShape {
  readonly ok: boolean;
  readonly code?: string;
  readonly message: string;
  readonly durationMs: number;
  readonly rowCount?: number;
  readonly truncated?: boolean;
  readonly fields?: readonly DatasetFieldDefinition[];
}

export interface DatasourcePreviewShape {
  readonly ok: boolean;
  readonly code?: string;
  readonly message: string;
  readonly durationMs: number;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly rows: readonly DatasourceRow[];
  readonly rowCount: number;
  readonly truncated: boolean;
}

export interface CreateExampleInput {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: StoredDataSourceType;
  readonly config: StoredDataSourceConfig;
  /**
   * 是否在播种时执行一次取数（决定 `status`）。
   *
   * REST 示例必须是 `false`：`onModuleInit` 早于 `listen`，后端还没起监听就去连自己的
   * HTTP 端口必然失败，落成 `error` 是**假状态**（用户会以为示例坏了）。`false` → `draft`，
   * 点一次「测试连接」就转正，这也正好演示"测试是必经步骤"。
   */
  readonly evaluate: boolean;
}

interface Evaluation {
  readonly status: DataSourceStatus;
  readonly lastTest: LastTestResult | null;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly result: RuntimeResult;
}

@Injectable()
export class DatasourcesService {
  private readonly logger = new Logger(DatasourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: DatasourceRuntime,
    private readonly files: DatasourceFilesService,
    private readonly references: DatasourceReferenceService,
  ) {}

  // -------------------------------------------------------------------------
  // 列表与详情（#1 / #2）
  // -------------------------------------------------------------------------

  /**
   * `GET /api/datasources`：内置 + 自建。
   *
   * 排序：**自建在前（`updatedAt` desc）+ 内置在后（代码常量的固定序）**。管理页要能
   * 一眼看到刚改过的那条，而内置是"背景资产"，放最后不抢视线。
   */
  async list(
    type: string | undefined,
    query: string | undefined,
    limit: number | undefined,
    offset: number | undefined,
  ): Promise<DatasourceListShape> {
    const resolvedLimit = limit ?? 100;
    const resolvedOffset = offset ?? 0;
    const needle = (query ?? '').trim().toLowerCase();
    const typeFilter = type === undefined || type === 'all' ? null : type;
    const index = await this.references.collect();

    const customRows =
      typeFilter === 'builtin'
        ? []
        : isStoredDataSourceType(typeFilter)
          ? await this.prisma.dataSource.findMany({
              where: { type: typeFilter },
              orderBy: { updatedAt: 'desc' },
            })
          : await this.prisma.dataSource.findMany({ orderBy: { updatedAt: 'desc' } });

    const customItems = customRows.map((row) => this.toItem(row, index.get(row.datasetId) ?? []));
    const builtinItems =
      typeFilter === null || typeFilter === 'builtin'
        ? DATASET_DEFINITIONS.map((definition) =>
            toBuiltinItem(definition, index.get(definition.datasetId) ?? []),
          )
        : [];

    const matched = [...customItems, ...builtinItems].filter(
      (item) =>
        needle === '' ||
        item.name.toLowerCase().includes(needle) ||
        item.datasetId.toLowerCase().includes(needle),
    );
    return {
      items: matched.slice(resolvedOffset, resolvedOffset + resolvedLimit),
      total: matched.length,
      catalogVisibleCount: await this.countCatalogVisible(),
    };
  }

  /** 目录可见的自建条数：ready + 字段非空，封顶 46（Q2：内置 4 条占掉名额）。 */
  private async countCatalogVisible(): Promise<number> {
    const rows = await this.prisma.dataSource.findMany({
      where: { status: 'ready' },
      orderBy: { updatedAt: 'desc' },
      select: { fields: true },
      take: CATALOG_CUSTOM_LIMIT + 1,
    });
    let count = 0;
    for (const row of rows) {
      if (count >= CATALOG_CUSTOM_LIMIT) break;
      if (parseFields(row.fields).length === 0) continue;
      count += 1;
    }
    return count;
  }

  async detail(datasetId: string): Promise<DatasourceDetailShape> {
    const builtin = findBuiltin(datasetId);
    const refs = await this.references.find(datasetId);
    if (builtin !== undefined) return toBuiltinDetail(builtin, refs);
    const row = await this.requireRow(datasetId);
    return this.toDetail(row, refs);
  }

  // -------------------------------------------------------------------------
  // 新建 / 编辑 / 删除（#3 / #4 / #5）
  // -------------------------------------------------------------------------

  async create(dto: SaveDatasourceDto): Promise<DatasourceDetailShape> {
    const type = requireStoredType(dto.type);
    const name = normalizeName(dto.name);
    const description = normalizeDescription(dto.description);
    const config = await this.prepareConfig(type, dto.config);
    const datasetId = await this.createDatasetId(name);

    const evaluation = await this.evaluateWithDefaults(type, config);
    const row = await this.prisma.dataSource.create({
      data: {
        datasetId,
        name,
        description,
        type,
        config: JSON.stringify(config),
        status: evaluation.status,
        lastTest: evaluation.lastTest === null ? null : JSON.stringify(evaluation.lastTest),
        fields: JSON.stringify(evaluation.fields),
      },
    });
    return this.toDetail(row, []);
  }

  async update(datasetId: string, dto: SaveDatasourceDto): Promise<DatasourceDetailShape> {
    if (findBuiltin(datasetId) !== undefined) throw builtinReadonly();
    const row = await this.requireRow(datasetId);
    const type = requireStoredType(dto.type);
    if (type !== row.type) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        message: '数据源类型不可修改；如需换类型请新建一个数据源。',
      });
    }
    const name = normalizeName(dto.name);
    const description = normalizeDescription(dto.description);
    const prepared = await this.prepareConfig(type, dto.config);
    const config =
      type === 'rest' && 'url' in prepared ? this.mergeHeaders(prepared, row) : prepared;

    // 只改名称/说明时跳过取数：保存应当是毫秒级的（架构 §3.4 的保存耗时约束）
    const previousConfig = readStoredConfig(type, row.config);
    const skip =
      row.status === 'ready' && previousConfig !== null && isSameConfig(config, previousConfig);

    const updated = await this.prisma.dataSource.update({
      where: { datasetId },
      data:
        skip === false
          ? await this.buildUpdateData(type, config, name, description)
          : { name, description, config: JSON.stringify(config) },
    });
    return this.toDetail(updated, await this.references.find(datasetId));
  }

  /** 删除：被引用 → 409 + `refScreens`（不级联、不改别人的文档）。 */
  async remove(datasetId: string): Promise<{ readonly deleted: true; readonly datasetId: string }> {
    if (findBuiltin(datasetId) !== undefined) throw builtinReadonly();
    await this.requireRow(datasetId);
    const refScreens = await this.references.find(datasetId);
    if (refScreens.length > 0) {
      throw new ConflictException({
        error: 'DATASOURCE_IN_USE',
        message: `仍有 ${refScreens.length} 张大屏在使用它，请先到这些大屏里解绑。`,
        refScreens,
      });
    }
    await this.prisma.dataSource.delete({ where: { datasetId } });
    return { deleted: true, datasetId };
  }

  // -------------------------------------------------------------------------
  // 测试与预览（#6 / #7 / #8）
  // -------------------------------------------------------------------------

  /** `POST /api/datasources/test`：草稿配置，不落库；**失败也 200**。 */
  async testDraft(dto: DraftDatasourceDto): Promise<DatasourceTestShape> {
    if (dto.type === 'builtin') return builtinNoConnection();
    const type = requireStoredType(dto.type);
    const config = readParsedConfig(type, dto.config);
    return toTestShape(await this.evaluateDraft(type, config, dto.values));
  }

  /** `POST /api/datasources/preview`：草稿配置，前 20 行（`rowCount` 仍是真实行数）。 */
  async previewDraft(dto: DraftDatasourceDto): Promise<DatasourcePreviewShape> {
    if (dto.type === 'builtin') {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        message: '内置数据集无需预览，请在设计器的数据源面板直接查看字段。',
      });
    }
    const type = requireStoredType(dto.type);
    const config = readParsedConfig(type, dto.config);
    const result = await this.evaluateDraft(type, config, dto.values);
    if (result.ok === false) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        durationMs: result.durationMs,
        fields: [],
        rows: [],
        rowCount: 0,
        truncated: false,
      };
    }
    return {
      ok: true,
      message: `查询成功（${result.rowCount} 行${result.truncated ? '，已截断至 500 行' : ''}）。`,
      durationMs: result.durationMs,
      fields: result.fields,
      rows: result.rows.slice(0, MAX_PREVIEW_ROWS),
      rowCount: result.rowCount,
      truncated: result.truncated,
    };
  }

  /**
   * `POST /api/datasources/:datasetId/test`：用**库里的配置**（含真实 header 原值）测试。
   *
   * 这条不可省：列表页拿到的 header 是掩码，把掩码回传会把 token 覆盖掉（A13）。
   * 成功即落 `ready + fields`，失败落 `error`——与保存路径同一套状态语义。
   */
  async testStored(datasetId: string): Promise<DatasourceTestShape> {
    if (findBuiltin(datasetId) !== undefined) return builtinNoConnection();
    const row = await this.requireRow(datasetId);
    const type = readStoredType(row.type);
    const config = readStoredConfig(type, row.config);
    if (config === null) {
      throw new BadRequestException({
        error: 'INVALID_REQUEST',
        message: '该数据源的配置无法解析，请重新编辑保存。',
      });
    }
    const evaluation = await this.evaluateWithDefaults(type, config);
    await this.prisma.dataSource.update({
      where: { datasetId },
      data: {
        status: evaluation.status,
        lastTest: evaluation.lastTest === null ? null : JSON.stringify(evaluation.lastTest),
        fields: JSON.stringify(evaluation.fields),
      },
    });
    return toTestShape(evaluation.result);
  }

  // -------------------------------------------------------------------------
  // 播种（P0-15）
  // -------------------------------------------------------------------------

  /**
   * 幂等写入一条示例数据源（按 `datasetId` 判断），返回是否真的创建。
   *
   * 示例的 `datasetId` 用固定值（`custom.example-*`）而不是 slug 生成：播种必须可重复、
   * 可预测，且不能占用用户名的 `custom.ds-<n>` 序号。
   */
  async createExample(input: CreateExampleInput): Promise<boolean> {
    const existing = await this.prisma.dataSource.findUnique({
      where: { datasetId: input.datasetId },
    });
    if (existing !== null) return false;
    const evaluation = input.evaluate
      ? await this.evaluateWithDefaults(input.type, input.config)
      : null;
    await this.prisma.dataSource.create({
      data: {
        datasetId: input.datasetId,
        name: input.name,
        description: input.description,
        type: input.type,
        config: JSON.stringify(input.config),
        status: evaluation === null ? 'draft' : evaluation.status,
        lastTest:
          evaluation === null || evaluation.lastTest === null
            ? null
            : JSON.stringify(evaluation.lastTest),
        fields: JSON.stringify(evaluation === null ? [] : evaluation.fields),
      },
    });
    this.logger.log(
      `已播种示例数据源 ${input.name}（${input.datasetId}，${evaluation === null ? 'draft' : evaluation.status}）`,
    );
    return true;
  }

  // -------------------------------------------------------------------------
  // 内部：配置校验与取数
  // -------------------------------------------------------------------------

  /**
   * 保存前的配置校验（PRD R4）：SQL 重新过词法检查、库文件过路径守卫、
   * 表模式还要按**库里的真实结构**核对表名与列名（并把声明类型换成库里的值）。
   */
  private async prepareConfig(
    type: StoredDataSourceType,
    raw: unknown,
  ): Promise<StoredDataSourceConfig> {
    const parsed = readConfig(type, raw);
    if (parsed.ok === false) {
      throw new BadRequestException({ error: parsed.code, message: parsed.message });
    }
    if (type !== 'sqlite') return parsed.config;
    if (!('mode' in parsed.config)) {
      throw new BadRequestException({ error: 'INVALID_REQUEST', message: '配置类型不匹配。' });
    }
    return this.prepareSqliteConfig(parsed.config);
  }

  private async prepareSqliteConfig(config: SqliteConfig): Promise<SqliteConfig> {
    // 打不开的库/越界路径在这里就失败（400），不会被存进台账
    const schema = await this.files.schema(config.file);
    if (config.mode === 'sql') {
      const guarded = inspectSql({
        sql: config.sql,
        declaredParams: config.params.map((parameter) => parameter.name),
      });
      if (guarded.ok === false) {
        throw datasourceFailureToHttp(guarded.code, guarded.message);
      }
      return config;
    }
    const table = schema.tables.find((entry) => entry.name === config.table);
    if (table === undefined) {
      throw new BadRequestException({
        error: 'TABLE_NOT_FOUND',
        message: `表 \`${config.table}\` 不存在（可能已被删除），请重新选表。`,
      });
    }
    const liveColumns = schema.columns[config.table] ?? [];
    const columns = config.columns.map((column) => {
      const live = liveColumns.find((entry) => entry.name === column.name);
      if (live === undefined) {
        throw new BadRequestException({
          error: 'INVALID_REQUEST',
          message: `列 \`${column.name}\` 不在表 \`${config.table}\` 里，请重新勾选。`,
        });
      }
      if (live.supported === false) {
        throw new BadRequestException({
          error: 'INVALID_REQUEST',
          message: `列 \`${column.name}\` 是二进制列，不能作为字段。`,
        });
      }
      // 声明类型以库为准：客户端传什么都不算（A18 的 TEXT→string / REAL→number 由此成立）
      return { name: live.name, declaredType: live.declaredType };
    });
    return { ...config, columns };
  }

  /** 编辑保存时的 header 合并：空串/掩码 = 保留库中原值（PRD A13）。 */
  private mergeHeaders(
    config: StoredDataSourceConfig,
    row: DataSourceRecord,
  ): StoredDataSourceConfig {
    if (!('url' in config)) return config;
    const previous = readStoredConfig(readStoredType(row.type), row.config);
    const previousHeaders = previous !== null && 'url' in previous ? previous.headers : [];
    const merged = mergeRestHeaders(config.headers, previousHeaders);
    if (merged.ok === false) {
      throw new BadRequestException({ error: merged.code, message: merged.message });
    }
    return { ...config, headers: merged.config };
  }

  /**
   * 保存 / 已存测试路径：用**声明的默认值**解析参数后执行一次。
   *
   * 为什么必须带默认值：SQL 模式的 `:status` 若在保存时按"没有值"绑定成 NULL，结果 0 行
   * 会被判 `INVALID_SHAPE`，于是任何带参数的 SQL 数据源都存成 `error`——而它的默认值
   * 本来就是为了"单笔试跑也能出数"。必填且**无**默认值时仍然失败（MISSING_PARAMETER），
   * 但按 R1 不阻塞保存。
   */
  private async evaluateWithDefaults(
    type: StoredDataSourceType,
    config: StoredDataSourceConfig,
  ): Promise<Evaluation> {
    const resolved = resolveParameterValues(configParameters(config), {}, 'INVALID_REQUEST');
    if (resolved.ok === false) {
      const at = new Date().toISOString();
      return {
        status: 'error',
        lastTest: { at, ok: false, code: resolved.code, message: resolved.message },
        fields: staticFieldsFor(type, config),
        result: { ok: false, code: resolved.code, message: resolved.message, durationMs: 0 },
      };
    }
    return this.evaluate(type, config, resolved.values);
  }

  /** 保存路径：执行一次 → 决定 status / lastTest / fields。 */
  private async evaluate(
    type: StoredDataSourceType,
    config: StoredDataSourceConfig,
    values: Readonly<Record<string, string | number>>,
  ): Promise<Evaluation> {
    const at = new Date().toISOString();
    const result = await this.runtime.execute({ type, config, values });
    if (result.ok) {
      return {
        status: 'ready',
        lastTest: {
          at,
          ok: true,
          durationMs: result.durationMs,
          rowCount: result.rowCount,
          truncated: result.truncated,
        },
        fields: result.fields,
        result,
      };
    }
    this.logger.debug(`数据源测试失败（${type}）：${result.code} ${result.message}`);
    return {
      status: 'error',
      lastTest: { at, ok: false, code: result.code, message: result.message },
      // 表模式的字段来自库结构，测试失败也留得下来（用户能先看到字段，再去修库/修过滤）
      fields: staticFieldsFor(type, config),
      result,
    };
  }

  private async buildUpdateData(
    type: StoredDataSourceType,
    config: StoredDataSourceConfig,
    name: string,
    description: string | null,
  ): Promise<{
    name: string;
    description: string | null;
    config: string;
    status: string;
    lastTest: string | null;
    fields: string;
  }> {
    const evaluation = await this.evaluateWithDefaults(type, config);
    return {
      name,
      description,
      config: JSON.stringify(config),
      status: evaluation.status,
      lastTest: evaluation.lastTest === null ? null : JSON.stringify(evaluation.lastTest),
      fields: JSON.stringify(evaluation.fields),
    };
  }

  private async evaluateDraft(
    type: StoredDataSourceType,
    config: StoredDataSourceConfig,
    rawValues: Readonly<Record<string, unknown>> | undefined,
  ): Promise<RuntimeResult> {
    const resolved = resolveParameterValues(
      configParameters(config),
      rawValues ?? {},
      'INVALID_REQUEST',
    );
    if (resolved.ok === false) {
      return { ok: false, code: resolved.code, message: resolved.message, durationMs: 0 };
    }
    return this.runtime.execute({ type, config, values: resolved.values });
  }

  // -------------------------------------------------------------------------
  // 内部：datasetId 与查询
  // -------------------------------------------------------------------------

  private async createDatasetId(name: string): Promise<string> {
    const taken = new Set(
      (await this.prisma.dataSource.findMany({ select: { datasetId: true } })).map(
        (row) => row.datasetId,
      ),
    );
    const candidate = buildCustomDatasetId(name, nextCustomSequence(taken));
    if (taken.has(candidate) === false) return candidate;
    const suggestion = suggestDatasetId(candidate, (datasetId) => taken.has(datasetId));
    throw new ConflictException({
      error: 'DATASOURCE_ID_CONFLICT',
      message: `datasetId \`${candidate}\` 已存在，建议改用 \`${suggestion}\`。`,
      suggestedId: suggestion,
    });
  }

  private async requireRow(datasetId: string): Promise<DataSourceRecord> {
    const row = await this.prisma.dataSource.findUnique({ where: { datasetId } });
    if (row === null) {
      throw new NotFoundException({
        error: 'UNKNOWN_DATASET',
        message: `未知数据源：${datasetId}`,
      });
    }
    return row;
  }

  // -------------------------------------------------------------------------
  // 内部：形状转换
  // -------------------------------------------------------------------------

  private toItem(
    row: DataSourceRecord,
    refScreens: readonly ScreenReference[],
  ): DatasourceItemShape {
    const type = readStoredType(row.type);
    const config = readStoredConfig(type, row.config);
    return {
      datasetId: row.datasetId,
      name: row.name,
      description: row.description,
      type,
      status: readStatus(row.status),
      configSummary: config === null ? '' : configSummary(config),
      refCount: refScreens.length,
      refScreens: refScreens.map(toRefScreenShape),
      lastTest: parseLastTest(row.lastTest),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: DataSourceRecord, refs: readonly ScreenReference[]): DatasourceDetailShape {
    const type = readStoredType(row.type);
    const config = readStoredConfig(type, row.config);
    return {
      ...this.toItem(row, refs),
      config: config === null ? null : maskConfig(config),
      fields: parseFields(row.fields),
      parameters: config === null ? [] : parametersToDefinitions(configParameters(config)),
    };
  }
}

// ---------------------------------------------------------------------------
// 纯函数辅助
// ---------------------------------------------------------------------------

function findBuiltin(datasetId: string): DatasetDefinition | undefined {
  return DATASET_DEFINITIONS.find((definition) => definition.datasetId === datasetId);
}

function builtinReadonly(): ForbiddenException {
  return new ForbiddenException({
    error: 'BUILTIN_READONLY',
    message: '内置数据集只读，不能编辑或删除。',
  });
}

function builtinNoConnection(): DatasourceTestShape {
  return {
    ok: true,
    code: 'BUILTIN_NO_CONNECTION',
    message: '内置数据集，无需连接',
    durationMs: 0,
  };
}

function requireStoredType(value: string): StoredDataSourceType {
  if (isStoredDataSourceType(value)) return value;
  throw new BadRequestException({
    error: 'INVALID_REQUEST',
    message: `不支持的数据源类型：${value}`,
  });
}

function readStoredType(value: string): StoredDataSourceType {
  // DB 里的值只会由本服务写入（写入前已校验）；异常值按 static 呈现而不是让整页 500
  return isStoredDataSourceType(value) ? value : 'static';
}

function readStatus(value: string): DataSourceStatus {
  return value === 'ready' || value === 'error' ? value : 'draft';
}

function normalizeName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new BadRequestException({ error: 'INVALID_REQUEST', message: '请填写名称。' });
  }
  if (trimmed.length > 64) {
    throw new BadRequestException({ error: 'INVALID_REQUEST', message: '名称最多 64 字。' });
  }
  return trimmed;
}

/** 空说明必须落 `null`：契约里 `description` 是 `text | null`，空串会被判非法（A2）。 */
function normalizeDescription(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') return null;
  if (trimmed.length > 200) {
    throw new BadRequestException({ error: 'INVALID_REQUEST', message: '说明最多 200 字。' });
  }
  return trimmed;
}

function readParsedConfig(type: StoredDataSourceType, raw: unknown): StoredDataSourceConfig {
  const parsed = readConfig(type, raw);
  if (parsed.ok === false) {
    throw new BadRequestException({ error: parsed.code, message: parsed.message });
  }
  return parsed.config;
}

function parseLastTest(value: string | null): LastTestResult | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const record = readRecord(parsed);
  if (record === null) return null;
  if (typeof record.at !== 'string' || typeof record.ok !== 'boolean') return null;
  return {
    at: record.at,
    ok: record.ok,
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
    ...(typeof record.durationMs === 'number' ? { durationMs: record.durationMs } : {}),
    ...(typeof record.rowCount === 'number' ? { rowCount: record.rowCount } : {}),
    ...(typeof record.truncated === 'boolean' ? { truncated: record.truncated } : {}),
  };
}

/** 解析落库的 `fields`（坏行按空数组处理：目录据此判 `DATASET_NOT_READY`）。 */
export function parseFields(value: string | null): readonly DatasetFieldDefinition[] {
  if (value === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (Array.isArray(parsed) === false) return [];
  const fields: DatasetFieldDefinition[] = [];
  for (const entry of parsed) {
    const record = readRecord(entry);
    if (record === null) continue;
    if (typeof record.id !== 'string' || typeof record.label !== 'string') continue;
    const valueType = record.valueType;
    if (
      valueType !== 'string' &&
      valueType !== 'number' &&
      valueType !== 'boolean' &&
      valueType !== 'date'
    ) {
      continue;
    }
    fields.push({
      id: record.id,
      label: record.label === '' ? record.id : record.label,
      valueType,
      nullable: record.nullable === true,
    });
  }
  return fields;
}

function toTestShape(result: RuntimeResult): DatasourceTestShape {
  if (result.ok === false) {
    return { ok: false, code: result.code, message: result.message, durationMs: result.durationMs };
  }
  const suffix = result.truncated ? '，已截断至 500 行' : '';
  return {
    ok: true,
    message: `查询成功（${result.rowCount} 行${suffix}）。`,
    durationMs: result.durationMs,
    rowCount: result.rowCount,
    truncated: result.truncated,
    fields: result.fields,
  };
}

/** 失败时仍可保留的字段：表模式来自勾选列 + 声明类型，其余类型推断不出来就留空。 */
function staticFieldsFor(
  type: StoredDataSourceType,
  config: StoredDataSourceConfig,
): readonly DatasetFieldDefinition[] {
  if (type !== 'sqlite') return [];
  if (!('mode' in config) || config.mode !== 'table') return [];
  return fieldsFromTableColumns(config.columns);
}

function toRefScreenShape(reference: ScreenReference): DatasourceRefScreenShape {
  return { id: reference.id, name: reference.name, updatedAt: reference.updatedAt };
}

/** `custom.ds-<n>` 的最大序号 + 1（PRD §8.2：序号可预测、与名称无关）。 */
function nextCustomSequence(taken: ReadonlySet<string>): number {
  let max = 0;
  for (const datasetId of taken) {
    const match = /^custom\.ds-(\d+)$/.exec(datasetId);
    if (match === null) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
}

// 内置条目（列表与详情共用的虚拟投影，PRD §3.3）
function toBuiltinItem(
  definition: DatasetDefinition,
  refScreens: readonly ScreenReference[],
): DatasourceItemShape {
  return {
    datasetId: definition.datasetId,
    name: definition.name,
    description: definition.description,
    type: 'builtin',
    status: 'builtin',
    configSummary: '',
    refCount: refScreens.length,
    refScreens: refScreens.map(toRefScreenShape),
    lastTest: null,
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  };
}

function toBuiltinDetail(
  definition: DatasetDefinition,
  refs: readonly ScreenReference[],
): DatasourceDetailShape {
  return {
    ...toBuiltinItem(definition, refs),
    config: null,
    fields: definition.fields,
    parameters: definition.parameters,
  };
}
