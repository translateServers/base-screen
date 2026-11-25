import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AgentGenerateDto } from './agent-generate.dto';

/** 候选不创建大屏；图片素材权限按当前 screenId 在后端重新读取。 */
export class AgentCandidateDto extends PickType(AgentGenerateDto, [
  'topic',
  'catalog',
  'references',
] as const) {
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
