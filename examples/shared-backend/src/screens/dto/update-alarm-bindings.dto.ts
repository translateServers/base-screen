import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/** 告警绑定是宿主自有 JSON；结构由 `validateAlarmBindingsInput` 失败关闭校验。 */
export class UpdateAlarmBindingsDto {
  @ApiProperty({
    description: 'alarm key → component id → level → 样式覆盖（字符串值）',
    type: Object,
  })
  @IsObject()
  bindings!: Record<string, unknown>;
}
