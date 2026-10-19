import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * e2e 用的临时受管目录。
 *
 * 为什么需要专门的重试逻辑：`rmSync` 会撞上 `EBUSY`——SQLite 的子进程是 `SIGKILL` 的，
 * 文件句柄的释放**不是同步**的（Windows 上尤其明显），`app.close()` 刚返回时
 * `workshop.db` 可能还被占着。
 *
 * 两条原则：
 * 1. 重试 + 容忍：清理失败不该让一个全绿的套件变红（临时目录留在系统 temp 里无害）；
 * 2. 目录里只放受管 `.db`，绝不指向仓库的 `data/`。
 */
export function makeTempDatasourceDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** 删除临时目录：带重试，最终失败只吞掉不抛（见文件头）。 */
export function removeTempDatasourceDir(directory: string): void {
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    // 句柄尚未释放（EBUSY/EPERM）：留给系统 temp 清理，不影响测试结论
  }
}

/** 等一小会儿让 SIGKILL 的子进程真正退出（释放文件句柄）。 */
export async function waitForRunnerExit(milliseconds = 200): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
