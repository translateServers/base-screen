/**
 * 图表实例化的分帧调度器。
 *
 * ECharts 的 `init + setOption` 每个实例约 4–6ms，一张 100 图表的屏幕会在首帧
 * 同步堆出数百毫秒长任务，把文本、边框、SVG 图表和整个设计器界面一起卡住。
 * 这里把实例化排成共享队列，每帧只花固定预算，首帧先出轻量内容，图表随后逐帧补齐。
 */
const FRAME_BUDGET_MS = 8;

const pendingTasks = new Set<() => void>();
let frameHandle: number | undefined;

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function requestFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 0) as unknown as number;
}

function runFrame(): void {
  frameHandle = undefined;
  const deadline = now() + FRAME_BUDGET_MS;
  for (const task of pendingTasks) {
    pendingTasks.delete(task);
    try {
      task();
    } catch {
      // 单个图表失败不能拖垮整帧队列，也不能阻断同屏其它图表。
    }
    if (now() >= deadline) break;
  }
  if (pendingTasks.size > 0) {
    frameHandle = requestFrame(runFrame);
  }
}

/** 把一次图表实例化排到当前帧预算内；同一任务重复排入会合并。 */
export function scheduleChartRender(task: () => void): void {
  pendingTasks.add(task);
  if (frameHandle === undefined) {
    frameHandle = requestFrame(runFrame);
  }
}

/** 取消尚未执行的图表实例化（元素断开时必须调用，避免持有已卸载节点）。 */
export function cancelChartRender(task: () => void): void {
  pendingTasks.delete(task);
}
