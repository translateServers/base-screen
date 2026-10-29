import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class AgentComponentEditDto {
  @ApiProperty({ description: '用户对选中组件的修改指令', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  instruction!: string;

  @ApiProperty({ description: '宿主提供的选中组件快照', type: 'array', items: { type: 'object' } })
  @IsArray()
  @ArrayMaxSize(12)
  components!: unknown[];
}
