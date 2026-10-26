import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
