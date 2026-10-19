import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DATASOURCE_TYPE_FILTERS, STORED_DATASOURCE_TYPES } from '../datasource.types';

/**
 * 管理侧 DTO：**只做形状校验**（是不是字符串、是不是对象、区间对不对）。
 *
 * 取值域与语义校验（URL scheme、SQL 只读、参数名唯一、列必须在表结构里……）一律由
 * `datasource.config.ts` / `datasources.service.ts` 抛**具体错误码**（`INVALID_REQUEST` /
 * `READONLY_VIOLATION` / `TABLE_NOT_FOUND` …）。理由：这些错误码要出现在抽屉的字段级
 * 红字与测试连接的分类里，而 `ValidationPipe` 只会给出笼统的 `INVALID_REQUEST`。
 *
 * `config` 用 `@IsObject()` 收口而不做嵌套校验：三种 config 形状是**带版本号的联合类型**，
 * class-validator 的联合类型校验会把「未知版本」报成字段错误，而我们要求它在领域层
 * 失败关闭地返回 `INVALID_REQUEST`（并带上版本号）。
 */

/** `GET /api/datasources` 的 query string。 */
export class ListDatasourcesDto {
  @ApiProperty({
    required: false,
    description: '类型筛选：all / builtin / rest / static / sqlite（缺省 all）',
  })
  @IsOptional()
  @IsIn([...DATASOURCE_TYPE_FILTERS])
  type?: string;

  @ApiProperty({ required: false, description: '对 name / datasetId 做不区分大小写的子串匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  query?: string;

  @ApiProperty({ required: false, default: 100, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiProperty({ required: false, default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** `GET /api/datasources/database-files/:name/tables` 的 path 参数。 */
export class DatabaseFileParamDto {
  @ApiProperty({ description: '受管目录内的 .db 文件名（只允许 basename）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;
}

/**
 * 新建 / 编辑数据源的请求体。
 *
 * `description` 允许 `null`（空说明必须落 null，契约里空串非法）也允许不传；
 * `type` 在编辑态不可改，服务层校验（传不同 type → 400 `INVALID_REQUEST`）。
 */
export class SaveDatasourceDto {
  @ApiProperty({ description: '名称（1..64 字）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ required: false, description: '说明（0..200 字，空则落 null）', nullable: true })
  @IsOptional()
  @MaxLength(200)
  description?: string | null;

  @ApiProperty({ description: 'sqlite / rest / static（builtin 由代码常量提供，不可写）' })
  @IsIn([...STORED_DATASOURCE_TYPES])
  type!: string;

  @ApiProperty({ description: '类型专属配置（带版本号 v:1，三种形状见领域类型）' })
  @IsObject()
  config!: Record<string, unknown>;
}

/** 草稿配置（测试连接 / 预览用，不落库）。 */
export class DraftDatasourceDto {
  @ApiProperty({ description: 'sqlite / rest / static / builtin' })
  @IsIn([...STORED_DATASOURCE_TYPES, 'builtin'])
  type!: string;

  @ApiProperty({ required: false, description: 'builtin 无需配置' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /**
   * 预览/测试时给参数填的值（键 = 参数名）。
   *
   * 不传就用声明的默认值；必填参数既没值也没默认值 → `MISSING_PARAMETER`。
   * 这条通道让「SQL 模式 + :status」的预览能换值试算，而不用先保存一条数据源。
   */
  @ApiProperty({ required: false, description: '参数名 → 值（仅本次预览/测试使用）' })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;
}
