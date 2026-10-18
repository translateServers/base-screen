import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { DatasetCatalog, DatasetDefinitionShape, DatasetTabular } from './datasets.service';
import { DatasetsService } from './datasets.service';
import { DescribeDatasetDto, ListDatasetsDto, QueryDatasetDto } from './dto/dataset.dto';

/**
 * 数据集接口（PRD §6.1）：`list` / `describe` / `query` 三条，形状与
 * `ScreenHostDatasetPort` 的三个方法一一对应。
 *
 * 错误体统一 `{ error, message }`，由全局 `AllExceptionsFilter` 透传：
 * 404 `UNKNOWN_DATASET`、400 `UNKNOWN_LINE` / `UNKNOWN_LEVEL` / `INVALID_LIMIT` /
 * `INVALID_WINDOW` / `MISSING_PARAMETER`、500 `INTERNAL_ERROR`。**非法参数不 500、
 * 不返回空数组冒充成功。**
 */
@ApiTags('datasets')
@Controller('datasets')
export class DatasetsController {
  constructor(private readonly datasets: DatasetsService) {}

  @Get()
  @ApiOperation({ summary: '数据集目录：一次返回分组与条目（供设计器数据面板消费）' })
  list(@Query() query: ListDatasetsDto): DatasetCatalog {
    return this.datasets.list(query.query, query.groupId, query.limit);
  }

  /**
   * 路由顺序：两段的 `:datasetId/query` 必须比一段的 `:datasetId` 先声明，
   * 避免将来改成前缀匹配时被短路。
   */
  @Get(':datasetId/query')
  @ApiOperation({ summary: '数据集查询：fields 必须与 describe 逐字段一致' })
  @ApiParam({ name: 'datasetId', example: 'monitor.devices' })
  @ApiResponse({ status: 400, description: '参数非法（UNKNOWN_LINE / INVALID_WINDOW 等）' })
  @ApiResponse({ status: 404, description: 'UNKNOWN_DATASET' })
  query(@Param('datasetId') datasetId: string, @Query() query: QueryDatasetDto): DatasetTabular {
    assertNoInjectedFailure(query.fail);
    return this.datasets.query(datasetId, {
      line: query.line,
      window: query.window,
      level: query.level,
      limit: query.limit,
    });
  }

  @Get(':datasetId')
  @ApiOperation({ summary: '数据集描述：字段（顺序即绑定默认顺序）与参数（含枚举/区间/默认值）' })
  @ApiParam({ name: 'datasetId', example: 'monitor.devices' })
  @ApiResponse({ status: 404, description: 'UNKNOWN_DATASET' })
  @ApiResponse({ status: 400, description: 'INVALID_REQUEST：未声明的 query 参数' })
  describe(
    @Param('datasetId') datasetId: string,
    // 空 DTO 的唯一作用：让 ValidationPipe 的 whitelist / forbidNonWhitelisted 对这条路由
    // 也生效。没有 `@Query()` 时未知参数会被静默忽略（`?bogus=1` 仍 200），
    // 而 `?fail=500` 也会被"忽略"成一次正常 describe——故障注入就漏到了面板路径上。
    @Query() _query: DescribeDatasetDto,
  ): DatasetDefinitionShape {
    return this.datasets.describe(datasetId);
  }
}

/**
 * 故障注入（PRD §12）：只加在 query 上，不加在 list/describe——否则数据面板会整体空白，
 * 断言的就不是"查询失败"而是"面板坏了"。
 *
 * **只认显式开关** `DATASET_FAIL_INJECTION=1`：早先按 `NODE_ENV !== 'production'` 判断，
 * 漏设 NODE_ENV 的部署（很多 PaaS 默认不设）就等于生产环境可注入，这是不可接受的面子。
 * 开关关闭时 `fail` 参数按未声明参数处理（400），不静默忽略——静默忽略会让冒烟以为
 * 自己注入了故障，实际测的是正常路径。
 */
function assertNoInjectedFailure(fail: string | undefined): void {
  if (fail === undefined || fail === '') return;
  if (process.env.DATASET_FAIL_INJECTION !== '1') {
    throw new BadRequestException({
      error: 'INVALID_REQUEST',
      message: 'Unsupported parameter: fail (set DATASET_FAIL_INJECTION=1 to enable)',
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
