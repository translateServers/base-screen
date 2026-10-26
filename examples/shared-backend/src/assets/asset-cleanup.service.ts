import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AssetsService } from './assets.service';

const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 过期临时素材回收：不引入调度依赖，沿用示例后端的生命周期管理。
 * 测试通过 ASSET_CLEANUP_INTERVAL_MS=0 关闭定时器，直接调用 sweep 断言。
 */
@Injectable()
export class AssetCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AssetCleanup');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly assets: AssetsService) {}

  onModuleInit(): void {
    const configured = Number(process.env.ASSET_CLEANUP_INTERVAL_MS ?? DEFAULT_CLEANUP_INTERVAL_MS);
    if (!Number.isFinite(configured) || configured <= 0) return;
    this.timer = setInterval(() => {
      void this.sweep();
    }, configured);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const removed = await this.assets.sweepExpiredTemporaryAssets();
      if (removed > 0) this.logger.log(`已清理 ${removed} 个过期临时素材。`);
    } catch (error) {
      this.logger.warn('临时素材清理失败', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}
