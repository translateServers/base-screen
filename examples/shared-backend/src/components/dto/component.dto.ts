import { IsInt, IsObject, IsString, Length, Min } from 'class-validator';
import { ONLINE_MATERIAL_TYPE_PATTERN } from '../../material-packages/dto/material-package.dto';

/** 草稿 type 与在线物料同一命名空间：首次发布时直接成为 MaterialPackage.type。 */
export const COMPONENT_DRAFT_TYPE_PATTERN = ONLINE_MATERIAL_TYPE_PATTERN;
/** 与 plugin-core 的分片 id 同一词法（ADR-0100 F7）。 */
export const COMPONENT_FRAGMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

export class SaveComponentDraftDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  @Length(1, 200 * 1024)
  source!: string;

  /** 新建传 0；更新传当前 revision（乐观锁）。 */
  @IsInt()
  @Min(0)
  revision!: number;
}

export class CreateComponentFragmentDto {
  @IsObject()
  definition!: Record<string, unknown>;
}

export class UpdateComponentFragmentDto extends CreateComponentFragmentDto {
  @IsInt()
  @Min(1)
  revision!: number;
}

export function isComponentDraftType(value: string): boolean {
  return COMPONENT_DRAFT_TYPE_PATTERN.test(value);
}

export function isComponentFragmentId(value: string): boolean {
  return COMPONENT_FRAGMENT_ID_PATTERN.test(value);
}
