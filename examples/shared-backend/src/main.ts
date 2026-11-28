import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { materialSandboxBodyParser } from './material-sandbox/material-sandbox-body.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // 让 SIGTERM / SIGINT 触发 Nest 的生命周期钩子：SQLite 执行器的子进程在
  // `OnModuleDestroy` 里 SIGKILL，没有这行时进程被杀会留下 runner 孤儿进程。
  app.enableShutdownHooks();
  // 前后端分离：三个前端跑在不同 dev server / 静态源上，按 origin 放行。
  app.enableCors();
  app.setGlobalPrefix('api');
  // L3 沙箱路由（ADR-0118 §4）：PUT 体积上限 4MB，比全局默认的 100KB 大得多，必须单独一个
  // body 中间件、只挂这一条路径前缀，不动全局限额（挂载顺序早于 Nest 自己的全局 JSON 解析器，
  // 后者看到流已读完会自动跳过，不会覆盖这里设好的 `req.body`）。
  app.use('/api/material-sandbox', materialSandboxBodyParser);

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? '3000');
  const swaggerDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Base Screen Host API')
      .setDescription('Base Screen 全栈示例的共享后端：大屏文档存取与确定性 mock 指标数据。')
      .setVersion('0.0.0')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(port);
  new Logger('bootstrap').log(
    `Host API listening on http://127.0.0.1:${port} (OpenAPI: /api/docs)`,
  );
}

void bootstrap();
