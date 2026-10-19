import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  CatalogDefinitionShape,
  CatalogShape,
  CatalogTabularShape,
} from './dataset-catalog.service';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DescribeDatasetDto, ListDatasetsDto } from './dto/dataset.dto';

/**
 * 数据集接口（PRD §6.1 / §5）：`list` / `describe` / `query` 三条，形状与
 * `ScreenHostDatasetPort` 的三个方法一一对应。
 *
 * 本控制器在 T03 被改成**转发层**：真正的合并（内置 4 + ready 自建）与参数分发
 * 在 `DatasetCatalogService` 里。控制器只保留两件必须留在框架层的事：
 * 1. 路由形状与声明顺序（两段路由比一段先声明）；
 * 2. `ListDatasetsDto` / `DescribeDatasetDto` 的存在，让全局 `ValidationPipe` 的
 *    `whitelist + forbidNonWhitelisted` 继续对 list / describe 生效（旧 e2e 依赖它：
 *    `?bogus=1` 与 `?fail=500` 在 describe 上必须 400）。
 *
 * `query` 的参数改成 `Record<string, unknown>`（**故意不挂 DTO**）：自建数据源的参数是
 * 动态声明，若用 `forbidNonWhitelisted` 会一律 400（PRD F4）。`monitor.*` 的 DTO 校验
 * 由 `DatasetCatalogService` 用同一个 `QueryDatasetDto` + 同一份管道选项手工补回来，
 * 因此旧行为逐字不变。
 *
 * 错误体统一 `{error, message}`，由全局 `AllExceptionsFilter` 透传。
 */
@ApiTags('datasets')
@Controller('datasets')
export class DatasetsController {
  constructor(private readonly catalog: DatasetCatalogService) {}

  @Get()
  @ApiOperation({ summary: '数据集目录：内置 + 已就绪的自建（含分组）' })
  list(@Query() query: ListDatasetsDto): Promise<CatalogShape> {
    return this.catalog.list(query.query, query.groupId, query.limit);
  }

  /**
   * 路由顺序：两段的 `:datasetId/query` 必须比一段的 `:datasetId` 先声明，
   * 避免将来改成前缀匹配时被短路。
   */
  @Get(':datasetId/query')
  @ApiOperation({ summary: '数据集查询：fields 必须与 describe 逐字段一致' })
  @ApiParam({ name: 'datasetId', example: 'monitor.devices' })
  @ApiResponse({ status: 400, description: '参数非法（UNKNOWN_LINE / INVALID_WINDOW 等）' })
  @ApiResponse({ status: 404, description: 'UNKNOWN_DATASET / DATASET_NOT_READY' })
  query(
    @Param('datasetId') datasetId: string,
    // 无 DTO 的意图见类注释：动态参数不能走 whitelist，校验在 catalog 里按数据类型分派
    @Query() raw: Record<string, unknown>,
  ): Promise<CatalogTabularShape> {
    return this.catalog.query(datasetId, raw);
  }

  @Get(':datasetId')
  @ApiOperation({ summary: '数据集描述：字段（顺序即绑定默认顺序）与参数（含枚举/区间/默认值）' })
  @ApiParam({ name: 'datasetId', example: 'monitor.devices' })
  @ApiResponse({ status: 404, description: 'UNKNOWN_DATASET / DATASET_NOT_READY' })
  @ApiResponse({ status: 400, description: 'INVALID_REQUEST：未声明的 query 参数' })
  describe(
    @Param('datasetId') datasetId: string,
    // 空 DTO 的唯一作用：让 ValidationPipe 的 whitelist / forbidNonWhitelisted 对这条路由
    // 也生效。没有 `@Query()` 时未知参数会被静默忽略（`?bogus=1` 仍 200），
    // 而 `?fail=500` 也会被"忽略"成一次正常 describe——故障注入就漏到了面板路径上。
    @Query() _query: DescribeDatasetDto,
  ): Promise<CatalogDefinitionShape> {
    return this.catalog.describe(datasetId);
  }
}
