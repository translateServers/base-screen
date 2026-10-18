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
import { ListDatasetsDto, QueryDatasetDto } from './dto/dataset.dto';

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
  describe(@Param('datasetId') datasetId: string): DatasetDefinitionShape {
    return this.datasets.describe(datasetId);
  }
}

/**
 * 故障注入（PRD §12）：只加在 query 上，不加在 list/describe——否则数据面板会整体空白，
 * 断言的就不是「查询失败」而是「面板坏了」。
 *
 * 生产环境不生效：非 production 之外一律按未声明参数处理，避免把调试入口带进生产。
 */
function assertNoInjectedFailure(fail: string | undefined): void {
  if (fail === undefined || fail === '') return;
  if (process.env.NODE_ENV === 'production') {
    throw new BadRequestException({
      error: 'INVALID_REQUEST',
      message: 'Unsupported parameter: fail',
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
