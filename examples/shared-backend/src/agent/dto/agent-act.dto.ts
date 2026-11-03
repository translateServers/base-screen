import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 统一动作入口：一句话 + 作用域 + 该作用域需要的上下文。
 *
 * 字段刻意扁平（不用嵌套对象），`forbidNonWhitelisted` 下嵌套对象的校验信息会变成
 * "property xxx should not exist"，排查成本高。
 */
export class AgentActDto {
  @ApiProperty({ description: '用户原话', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  text!: string;

  @ApiProperty({
    description: '作用域：整屏 / 画布 / 选中组件',
    enum: ['screen', 'canvas', 'components'],
  })
  @IsIn(['screen', 'canvas', 'components'])
  scope!: 'screen' | 'canvas' | 'components';

  @ApiPropertyOptional({ description: '选中组件 ID，与 components 同时出现', type: 'array' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  componentIds?: string[];

  @ApiPropertyOptional({ description: '选中组件快照', type: 'array' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsObject({ each: true })
  components?: Record<string, unknown>[];

  @ApiPropertyOptional({ description: '当前大屏 ID，用于读取可访问图片素材' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  screenId?: string;

  @ApiPropertyOptional({
    description: '宿主设计器目录摘要',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  catalog?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '用户引用的素材与数据集', type: 'array' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsObject({ each: true })
  references?: Record<string, unknown>[];

  @ApiPropertyOptional({
    description: '画布当前值（backgroundColor / hasBackgroundImage）',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  canvas?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '当前屏摘要（组件数 / 类型分布 / 选中项 / 锁定数）',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
