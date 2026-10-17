import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import type { MetricSeries } from './metrics.service';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('series')
  @ApiOperation({ summary: '确定性 mock 指标时序（同参数同结果）' })
  series(@Query() query: MetricsQueryDto): MetricSeries {
    return this.metrics.series(query.metric, query.points);
  }
}
