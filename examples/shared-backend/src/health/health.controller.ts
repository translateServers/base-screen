import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: '存活探针：冒烟脚本与前端等待就绪使用' })
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
