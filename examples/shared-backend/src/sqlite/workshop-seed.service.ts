import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  assertManagedDirIsolated,
  managedDatasourceDir,
  WORKSHOP_DATABASE_FILE,
} from '../datasources/datasource-path';
import { SqliteExecutorService } from './sqlite-executor.service';

/**
 * 演示库 `workshop.db` 的启动时幂等种子（架构 §8）。
 *
 * 为什么放在 `onModuleInit` 而不是「迁移之后跑个脚本」：`pnpm dev` / `pnpm start` /
 * 三端冒烟的 `node dist/main.js` / e2e 四条入口都要能拿到演示库，任何"手工一步"都会
 * 让「开箱可演示」这条需求失效（PRD P0-13：零手工步骤）。
 *
 * 幂等：文件存在就跳过（**不覆盖、不校验内容**）——用户可能在里面加了自己的表/数据。
 * 生成动作本身在子进程里完成（唯一以写模式打开 SQLite 的地方），主进程从不写库。
 *
 * 失败**不阻塞启动**（`logger.warn`）：演示库只是示例资产，权限只读的部署环境里
 * 它不该让整个后端起不来；管理页的空态文案会兜底（「受管目录内没有可用的 .db 文件」）。
 * 但 `assertManagedDirIsolated` 的失败是**硬失败**——那是安全不变量，不是配置偏好。
 */
@Injectable()
export class WorkshopSeedService implements OnModuleInit {
  private readonly logger = new Logger(WorkshopSeedService.name);

  constructor(private readonly executor: SqliteExecutorService) {}

  async onModuleInit(): Promise<void> {
    const directory = managedDatasourceDir();
    // 受管目录绝不能是宿主 data/ 本身（否则 screens.db 会变成可选数据源）：fail fast
    assertManagedDirIsolated(directory);
    try {
      mkdirSync(directory, { recursive: true });
      // ping 是幂等的：这里再调一次只是为保证「执行器自检」先于建库失败而暴露
      await this.executor.ping();
      const result = await this.executor.seedWorkshop(join(directory, WORKSHOP_DATABASE_FILE));
      if (result.created) {
        this.logger.log(
          `已生成演示库 ${WORKSHOP_DATABASE_FILE}（${result.tables.map((table) => table.name).join(', ')}）`,
        );
      } else {
        this.logger.debug(`演示库 ${WORKSHOP_DATABASE_FILE} 已存在，跳过生成。`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.warn(`演示库 ${WORKSHOP_DATABASE_FILE} 生成失败（不影响启动）：${message}`);
    }
  }
}
