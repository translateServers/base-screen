import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  /**
   * 宿主设计器的实时目录：物料摘要 + 素材清单。
   *
   * 只校验「是个对象」，内部形状由 `parseAgentCatalog` 严格解析（越界数量、非法 type、
   * 未知字段一律拒绝并 400）。放在请求里而不是快照文件里，是为了让「刚发布的在线物料」
   * 与「刚上传的素材」下一句话就能用上。
   */
  @ApiPropertyOptional({
    description: '宿主带来的组件目录与素材清单；省略时使用最小内置目录',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  catalog?: Record<string, unknown>;
}
