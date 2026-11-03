import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
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
}
