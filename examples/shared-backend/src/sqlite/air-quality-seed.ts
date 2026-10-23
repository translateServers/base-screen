import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AIR_QUALITY_HOURLY, AIR_QUALITY_LATEST } from '../datasets/air-quality-snapshot';
import {
  AIR_QUALITY_DATABASE_FILE,
  assertManagedDirIsolated,
  managedDatasourceDir,
} from '../datasources/datasource-path';
import type { SqliteExecutorService } from './sqlite-executor.service';

/**
 * 幂等生成空气质量快照库：文件存在就跳过（用户可能改过，不覆盖）。
 *
 * 由数据源播种在创建 `custom.air-*` 之前调用，保证「目录里能看到 → describe/query 可用」
 * 是一条闭环；失败时调用方只跳过这三个数据源，不影响其余示例。
 */
export async function ensureAirQualityDatabase(
  executor: SqliteExecutorService,
  directory: string = managedDatasourceDir(),
): Promise<boolean> {
  assertManagedDirIsolated(directory);
  const file = join(directory, AIR_QUALITY_DATABASE_FILE);
  if (existsSync(file)) return false;
  const result = await executor.seedAirQuality(file, {
    hourly: AIR_QUALITY_HOURLY,
    latest: AIR_QUALITY_LATEST,
  });
  return result.created;
}
