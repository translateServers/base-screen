import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ValidationPipe,
} from '@nestjs/common';
import {
  CUSTOM_GROUP_ID,
  CUSTOM_GROUP_NAME,
  CustomDatasetsService,
} from './custom-datasets.service';
import type { DatasetFieldDefinition, DatasetParameterDefinition } from './dataset-definitions';
import { DatasetsService, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from './datasets.service';
import { QueryDatasetDto } from './dto/dataset.dto';

/**
 * 数据集目录的**合并层**（PRD §5 / A2 / A24）：内置 4 条 + `ready` 的自建。
 *
 * 为什么单开一层而不是改 `DatasetsService`：
 * 1. §15 要求既有 4 个数据集的定义/错误码/文案 **0 行改动**——旧 e2e（47 例）必须零回归；
 * 2. 合并只影响 HTTP 形状（目录条目、分组、describe/query 的分发），不该污染内置实现；
 * 3. A4 的动态参数要求「`monitor.*` 仍走原 DTO 校验、`custom.*` 走声明白名单」，
 *    这条分支天然属于"分发层"。
 *
 * 两条必须同时成立的性质：
 * - **`groups` 由「过滤后、分页前」的命中集合反推**：三端宿主的 `groups()` 探测用
 *   `limit=1`，如果先分页再算 groups，`custom` 分组就会时有时无（A2）；
 * - **目录总上限 50**（契约 `items.max(50)`）：内置 4 + 最近 46 条自建，超出部分在设计器
 *   不可见，但管理页仍能看到全部（它走 `/api/datasources`）。
 */

/** 契约 `items` 的硬上限（`packages/contracts` 的 `z.array(entry).max(50)`）。 */
const CATALOG_ITEM_LIMIT = 50;

export interface CatalogEntryShape {
  readonly datasetId: string;
  readonly name: string;
  /** 自建条目的说明可能是 null（契约允许 `text | null`，空串非法）。 */
  readonly description: string | null;
  readonly groupId: string;
}

export interface CatalogShape {
  readonly groups: readonly { readonly id: string; readonly name: string }[];
  readonly items: readonly CatalogEntryShape[];
}

export interface CatalogDefinitionShape {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly groupId: string;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly parameters: readonly DatasetParameterDefinition[];
}

/** 契约的 tabular：**恰好** `{fields, rows, totalRowCount}`，单元格只允许标量。 */
export interface CatalogTabularShape {
  readonly fields: readonly DatasetFieldDefinition[];
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly totalRowCount: number;
}

/**
 * 与全局 `APP_PIPE` **完全相同**的选项：`monitor.*` 的查询参数手工跑一遍，
 * 才能让 `?componentId=1` 依旧 400、`?window=abc` 依旧 400（旧 e2e 零改动）。
 */
const QUERY_PIPE = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

@Injectable()
export class DatasetCatalogService {
  constructor(
    private readonly datasets: DatasetsService,
    private readonly custom: CustomDatasetsService,
  ) {}

  async list(
    query: string | undefined,
    groupId: string | undefined,
    limit: number | undefined,
  ): Promise<CatalogShape> {
    const resolvedLimit = limit ?? DEFAULT_LIST_LIMIT;
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > MAX_LIST_LIMIT) {
      throw new BadRequestException({
        error: 'INVALID_LIMIT',
        message: `limit must be within 1..${MAX_LIST_LIMIT}`,
      });
    }

    // 内置侧仍然用既有实现：过滤 + 分组反推的行为一个字都没变
    const builtin = this.datasets.list(query, groupId, MAX_LIST_LIMIT);
    const customBudget = Math.max(0, CATALOG_ITEM_LIMIT - builtin.items.length);
    const includeCustom = groupId === undefined || groupId === CUSTOM_GROUP_ID;
    const customEntries = includeCustom ? await this.custom.listReady(customBudget) : [];
    const needle = (query ?? '').trim().toLowerCase();
    const matchedCustom = customEntries
      .filter(
        (entry) =>
          needle === '' ||
          entry.name.toLowerCase().includes(needle) ||
          entry.datasetId.toLowerCase().includes(needle),
      )
      .map((entry) => ({
        datasetId: entry.datasetId,
        name: entry.name,
        description: entry.description,
        groupId: entry.groupId,
      }));

    const items: CatalogEntryShape[] = [...matchedCustom, ...builtin.items]
      .map((item) => ({
        datasetId: item.datasetId,
        name: item.name,
        description: item.description,
        groupId: item.groupId,
      }))
      .slice(0, resolvedLimit);
    const groups = [
      ...builtin.groups,
      ...(matchedCustom.length > 0 ? [{ id: CUSTOM_GROUP_ID, name: CUSTOM_GROUP_NAME }] : []),
    ];
    return { groups, items };
  }

  async describe(datasetId: string): Promise<CatalogDefinitionShape> {
    if (this.custom.owns(datasetId)) return this.custom.describe(datasetId);
    return this.datasets.describe(datasetId);
  }

  /**
   * 查询分发（A4）。
   *
   * `@Query()` 在控制器里是 `Record<string, unknown>`（对 `Object` 不跑
   * `forbidNonWhitelisted`，否则自建数据源的动态参数会被一律 400）。这里按名字空间分派：
   * - `monitor.*`：手工跑同一个 `QueryDatasetDto` + 同一份管道选项 → 旧行为逐字不变；
   * - `custom.*`：按该数据源声明的参数白名单校验（未知参数 400、必填缺值 400）。
   */
  async query(
    datasetId: string,
    raw: Readonly<Record<string, unknown>>,
  ): Promise<CatalogTabularShape> {
    if (this.custom.owns(datasetId)) {
      const result = await this.custom.query(datasetId, raw);
      // 契约严格三键：多一个 `truncated` 都会被判 HOST_DATASET_INVALID（A24）
      return {
        fields: result.fields,
        rows: result.rows,
        totalRowCount: result.totalRowCount,
      };
    }
    const dto: QueryDatasetDto = await QUERY_PIPE.transform(raw, {
      type: 'query',
      metatype: QueryDatasetDto,
    });
    assertNoInjectedFailure(dto.fail);
    return this.datasets.query(datasetId, {
      line: dto.line,
      window: dto.window,
      level: dto.level,
      limit: dto.limit,
    });
  }
}

/**
 * 故障注入（PRD §12）：只加在 query 上，不加在 list/describe——否则数据面板会整体空白，
 * 断言的就不是「查询失败」而是「面板坏了」。
 *
 * **只认显式开关** `DATASET_FAIL_INJECTION=1`：早先按 `NODE_ENV !== 'production'` 判断，
 * 漏设 NODE_ENV 的部署（很多 PaaS 默认不设）就等于生产环境可注入，这是不可接受的面子。
 * 开关关闭时 `fail` 参数按未声明参数处理（400），不静默忽略——静默忽略会让冒烟以为
 * 自己注入了故障，实际测的是正常路径。
 *
 * （逻辑从 `datasets.controller.ts` 原样搬来：参数校验改到服务层后，注入点必须跟着走，
 * 否则 `?fail=500` 会被 DTO 放行却没人处理。）
 */
function assertNoInjectedFailure(fail: string | undefined): void {
  if (fail === undefined || fail === '') return;
  if (process.env.DATASET_FAIL_INJECTION !== '1') {
    throw new BadRequestException({
      error: 'INVALID_REQUEST',
      message: `Unsupported parameter: fail (set DATASET_FAIL_INJECTION=1 to enable)`,
    });
  }
  if (fail === '500') {
    throw new InternalServerErrorException({
      error: 'INJECTED_FAILURE',
      message: 'Injected dataset failure for smoke testing.',
    });
  }
  throw new BadRequestException({
    error: 'INVALID_REQUEST',
    message: `Unsupported fail mode: ${fail}`,
  });
}
