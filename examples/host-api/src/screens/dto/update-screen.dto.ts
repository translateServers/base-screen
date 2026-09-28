import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, Min } from 'class-validator';

export class UpdateScreenDto {
  @ApiProperty({ description: 'canonical Screen Document JSON（由 @base-screen/contracts 校验）' })
  @IsObject()
  document!: Record<string, unknown>;

  @ApiProperty({ description: '加载时的 revision，用于乐观锁；不匹配返回 409', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision!: number;
}
