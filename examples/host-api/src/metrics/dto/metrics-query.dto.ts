import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * mock 指标目录：resourceId 白名单在 MetricsService 内判定。
 *
 * 这里刻意不用 `@IsIn` / `@Min` / `@Max` 拦截取值：契约承诺的错误码是
 * `UNKNOWN_METRIC` 与 `INVALID_POINTS`，由 Service 失败关闭地抛出；DTO 只负责
 * "是不是字符串/整数"这类形状问题（那类问题归一为 INVALID_REQUEST）。
 */
export const METRIC_IDS = ['cpu_usage', 'memory_usage', 'request_rate'] as const;

export type MetricId = (typeof METRIC_IDS)[number];

export const MAX_SERIES_POINTS = 120;
export const DEFAULT_SERIES_POINTS = 24;

export class MetricsQueryDto {
  @ApiProperty({ enum: METRIC_IDS, description: '指标 ID' })
  @IsString()
  @IsNotEmpty()
  metric!: string;

  @ApiProperty({
    required: false,
    default: DEFAULT_SERIES_POINTS,
    minimum: 1,
    maximum: MAX_SERIES_POINTS,
    description: '数据点数量（按分钟一个点），省略时取默认值',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  points?: number;
}
