import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';

/** 演示端点（`/api/demo/*`）：只服务「新建 REST 数据源」的冒烟与人眼验收。 */
@Module({
  controllers: [DemoController],
})
export class DemoModule {}
