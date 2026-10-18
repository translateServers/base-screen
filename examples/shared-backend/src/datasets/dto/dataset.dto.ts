import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 数据集接口的 query string 形状。
 *
 * 只做**形状**校验（是不是字符串/整数）：取值白名单（产线、等级）与区间（limit、window）
 * 由 `DatasetsService` 失败关闭地判定，因为契约承诺的错误码是 `UNKNOWN_LINE` /
 * `UNKNOWN_LEVEL` / `INVALID_LIMIT` / `INVALID_WINDOW`，而不是笼统的 `INVALID_REQUEST`。
 *
 * 全局 `forbidNonWhitelisted` 已开启：任何未在此声明的参数（例如 `componentId`）都会被
 * 直接拒绝，因此「宿主多传参」不会被静默忽略。
 */

export class ListDatasetsDto {
  @ApiProperty({
    required: false,
    description: '对 datasetId / 名称 / 说明做不区分大小写的子串匹配',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  query?: string;

  @ApiProperty({ required: false, description: '分组 id（production / alarm）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupId?: string;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}

/**
 * 空 DTO：`GET /api/datasets/:datasetId` 不接受任何 query 参数。
 *
 * 类里一个属性都不声明，唯一目的是让全局 ValidationPipe 的
 * `whitelist + forbidNonWhitelisted` 对这条路由生效——没有 `@Query()` 时 Nest 不会跑校验，
 * `?bogus=1` 会被静默忽略成 200。有了它：未知参数 → 400 `INVALID_REQUEST`，
 * 且 `?fail=500` 这条只属于 query 路由的开关不会漏到 describe 上（数据面板整体空白）。
 */
export class DescribeDatasetDto {}

export class QueryDatasetDto {
  @ApiProperty({ required: false, description: '产线（LINE-A / LINE-B / LINE-C）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  line?: string;

  @ApiProperty({ required: false, description: '告警时间窗（分钟，1–1440）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  window?: number;

  @ApiProperty({ required: false, description: '告警等级过滤（all / critical / warning / info）' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  level?: string;

  @ApiProperty({ required: false, description: '返回条数上限（各数据集区间不同）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @ApiProperty({
    required: false,
    description: '仅开发环境生效的故障注入：fail=500 让本次查询返回 500',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  fail?: string;
}
