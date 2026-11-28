import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/** L3 起草元信息（ADR-0117 D11/D12）：只在智能体起草后发布时带上，供签名记录留痕。 */
export class MaterialAttestationMetaDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  model?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  promptHash?: string;
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => MaterialAttestationMetaDto)
  attestationMeta?: MaterialAttestationMetaDto;
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
