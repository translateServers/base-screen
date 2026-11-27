import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AgentGenerateDto } from './agent-generate.dto';

/** 候选不创建大屏；图片素材权限按当前 screenId 在后端重新读取。 */
export class AgentCandidateDto extends PickType(AgentGenerateDto, [
  'catalog',
  'references',
] as const) {
  /**
   * 设计器里用户的原话：与 `/agent/act` 的 `text` 同一上限（300）。修复轮也走这里，
   * 沿用 `/agent/generate` 的 120 字主题上限会让长指令的修复请求直接 400。
   */
  @ApiProperty({ description: '用户原话（整屏指令）', minLength: 2, maxLength: 300 })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  topic!: string;

  @ApiProperty({ description: '当前编辑大屏 ID，用于读取可访问图片素材' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  screenId!: string;

  @ApiPropertyOptional({
    description:
      '前端校验或引擎拒绝后的一次修复（ADR-0112 §2.1.6）：上一轮的 repairContext.output 与按 IR 路径整理的诊断',
  })
  @IsOptional()
  @IsObject()
  repair?: Record<string, unknown>;
}
