import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { AssetScope } from '../asset.types';

/** 素材列表：后台按 scope 切换公共/临时；设计器按 screenId 取公共 + 本屏临时。 */
export class ListAssetsQueryDto {
  @IsOptional()
  @IsIn(['public', 'temporary'])
  scope?: AssetScope;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  screenId?: string;

  /** 名称关键字。素材库面板不传（要全量），意图引用选择器按页搜。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  q?: string;

  /** 分页：两者都不传时返回全量，保持素材库面板的既有行为。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** 上传：带 scope=temporary + screenId 时写入当前大屏的临时素材。 */
export class UploadAssetQueryDto {
  @IsOptional()
  @IsIn(['public', 'temporary'])
  scope?: AssetScope;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  screenId?: string;
}
