import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AGENT_MATERIAL_INSTRUCTION_MAX } from '../agent-material';

/** 组件工坊「让智能体起草」（ADR-0116 D7）：一句话描述要的组件；修复轮另带上一轮原文与体检结论。 */
export class AgentMaterialDto {
  @ApiProperty({
    description: '用户对组件的一句话描述',
    minLength: 2,
    maxLength: AGENT_MATERIAL_INSTRUCTION_MAX,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(AGENT_MATERIAL_INSTRUCTION_MAX)
  instruction!: string;

  @ApiPropertyOptional({
    description:
      '宿主前端体检未通过后的一次修复：上一轮模型原文 output 与按规格路径整理的 issues（rule / path / message）',
  })
  @IsOptional()
  @IsObject()
  repair?: Record<string, unknown>;
}
