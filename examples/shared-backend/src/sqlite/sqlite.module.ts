import { Module } from '@nestjs/common';
import { SqliteExecutorService } from './sqlite-executor.service';
import { WorkshopSeedService } from './workshop-seed.service';

/**
 * SQLite 执行层模块。
 *
 * `SqliteExecutorService` 对外导出（管理侧的 test/preview/query 三个入口共用一个进程池）；
 * `WorkshopSeedService` 只为副作用存在：`onModuleInit` 里幂等生成 `workshop.db`，
 * 因此 `dev` / `start` / `node dist/main.js` / e2e 都自动具备演示库。
 */
@Module({
  providers: [SqliteExecutorService, WorkshopSeedService],
  exports: [SqliteExecutorService],
})
export class SqliteModule {}
