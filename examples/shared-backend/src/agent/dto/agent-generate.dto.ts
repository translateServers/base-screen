import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
   * 宿主设计器的可用物料摘要。内部形状由 `parseAgentCatalog` 严格解析。
   * 图片候选由后端按候选请求的 `screenId` 从资产库读取，客户端提供的 assets 字段不参与授权。
   */
  /**
   * 用户在这一句话上显式引用的素材与数据集。
   *
   * 元素形如 `{ kind: 'asset', assetId }` / `{ kind: 'dataset', datasetId }`，由引擎上送。
   * 这里只校验「是个对象数组、不超上限」，具体身份在 service 里按目录与数据集目录逐一核对。
   */
  @ApiPropertyOptional({ description: '用户引用的素材与数据集', type: 'array' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsObject({ each: true })
  references?: Record<string, unknown>[];

  @ApiPropertyOptional({
    description: '宿主带来的组件目录；省略时使用最小内置目录',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  catalog?: Record<string, unknown>;
}
