import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AGENT_MATERIAL_ISOLATED_INSTRUCTION_MAX } from '../agent-material-isolated';

/**
 * 组件工坊「代码组件（隔离）」的「让智能体起草」（ADR-0117 D12）：一句话描述要的组件；
 * 修复轮另带上一轮原文与体检 + 沙箱试运行整理的结论。
 */
export class AgentMaterialIsolatedDto {
  @ApiProperty({
    description: '用户对组件的一句话描述',
    minLength: 2,
    maxLength: AGENT_MATERIAL_ISOLATED_INSTRUCTION_MAX,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(AGENT_MATERIAL_ISOLATED_INSTRUCTION_MAX)
  instruction!: string;

  @ApiPropertyOptional({
    description:
      '宿主前端体检 / 沙箱试运行未通过后的一次修复：上一轮模型原文 output 与按规格或代码路径整理的 issues（rule / path / message）',
  })
  @IsOptional()
  @IsObject()
  repair?: Record<string, unknown>;
}
