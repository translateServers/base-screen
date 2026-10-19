import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DatasetsModule } from './datasets/datasets.module';
import { DatasourcesModule } from './datasources/datasources.module';
import { DemoModule } from './demo/demo.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScreensModule } from './screens/screens.module';
import { SqliteModule } from './sqlite/sqlite.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScreensModule,
    MetricsModule,
    // 数据源管理（台账 / 测试 / 预览 / 受管目录）。必须排在 DatasetsModule 之前：
    // 后者依赖它导出的 DatasourceRuntime（test/preview 与设计器查询共用同一份取数实现）。
    DatasourcesModule,
    DatasetsModule,
    // 演示端点（`/api/demo/press|roster`）：给「新建 REST 数据源」一个开箱可用的目标。
    DemoModule,
    // SQLite 执行层：providers 里的 WorkshopSeedService 在启动时幂等生成演示库，
    // 因此 `dev` / `start` / `node dist/main.js` 四条入口都自动具备 workshop.db，无需手工脚本。
    SqliteModule,
    HealthModule,
  ],
  providers: [
    // 全局管道/过滤器/拦截器注册在模块里而非 main.ts：e2e 直接加载 AppModule 即可覆盖。
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
