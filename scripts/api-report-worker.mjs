import { parentPort, workerData } from 'node:worker_threads';
import { extractApiReport } from './api-reports.mjs';

/**
 * API 报告提取的常驻 worker。由 api-reports.mjs 的线程池按入口分片派生，一段 worker 连续处理
 * 分片内的所有入口，因此 TypeScript 与 API Extractor 每个 worker 只加载一次。
 * 结果逐条回传并按 index 对号入座；失败也回传，不让 worker 抛错中断整个线程池。
 */
for (const task of workerData.shard) {
  let outcome;
  try {
    outcome = extractApiReport(task);
  } catch (error) {
    outcome = {
      detail: error instanceof Error ? error.message : String(error),
      failed: true,
    };
  }
  parentPort.postMessage({ index: task.index, outcome });
}

parentPort.postMessage({ done: true });
