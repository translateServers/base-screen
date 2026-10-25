import { IsBoolean, IsInt, IsObject, IsString, Length, Matches, Min } from 'class-validator';

/** 在线物料类型只能落在 host.online.* 命名空间，避免覆盖内置物料。 */
export const ONLINE_MATERIAL_TYPE_PATTERN = /^host\.online\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export class SaveMaterialPackageDto {
  @IsString()
  @Matches(ONLINE_MATERIAL_TYPE_PATTERN)
  type!: string;

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsObject()
  manifest!: Record<string, unknown>;

  @IsString()
  @Length(1, 200 * 1024)
  code!: string;
}

export class UpdateMaterialPackageDto extends SaveMaterialPackageDto {
  @IsInt()
  @Min(1)
  revision!: number;
}

export class SetMaterialPackageVisibilityDto {
  @IsBoolean()
  visible!: boolean;
}
