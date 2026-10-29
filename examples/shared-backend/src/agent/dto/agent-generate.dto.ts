import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AgentGenerateDto {
  @ApiProperty({ description: '大屏主题，一句话', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  topic!: string;

  @ApiPropertyOptional({ description: '自定义大屏名称；省略时用智能体给出的标题' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;
}
