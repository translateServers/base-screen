import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { DatasetsModule } from './datasets/datasets.module';
import { DemoModule } from './demo/demo.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScreensModule } from './screens/screens.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScreensModule,
    MetricsModule,
    DatasetsModule,
    // 演示端点（`/api/demo/press|roster`）：给「新建 REST 数据源」一个开箱可用的目标。
    DemoModule,
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
