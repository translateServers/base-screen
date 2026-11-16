/**
 * 图表渲染 adapter 的惰性入口。
 *
 * ECharts 的体积远大于本插件的其它物料，静态 import 会让任何引入本插件的宿主在首屏
 * 就下载并解析整包——哪怕文档里一个图表都没有。因此这里只保留 JSON-safe 的 handle
 * 接口，真正的 `echarts/*` 依赖放在 `echarts-runtime.ts`，等首个图表实例化时才动态
 * import 拉取。
 *
 * 单飞（single-flight）：模块级缓存同一个 Promise，同屏多个图表并发插入只触发一次
 * 加载；运行期模块本身只求值一次，`echarts.use()` 的按需注册也只执行一次。
 */

export interface EchartsSeriesClickPayload {
  readonly seriesIndex: number;
  readonly seriesName: string;
  readonly pointIndex: number;
  readonly x: string;
  readonly y: number;
}

export interface EchartsChartHandle {
  render(option: unknown): void;
  resize(): void;
  dispose(): void;
  onSeriesClick(listener: (payload: EchartsSeriesClickPayload) => void): void;
}

export interface EchartsChartAdapter {
  createChartHandle(host: HTMLElement): EchartsChartHandle;
}

let adapterPromise: Promise<EchartsChartAdapter> | undefined;

/**
 * 加载 ECharts 运行期。并发调用共享同一次动态 import；失败结果同样被缓存，
 * 由调用方按物料降级路径呈现，不做隐式重试（避免每帧重复请求失败的分包）。
 */
export function loadEchartsChartAdapter(): Promise<EchartsChartAdapter> {
  adapterPromise ??= import('./echarts-runtime.js').then((module) => ({
    createChartHandle: module.createEchartsChartHandle,
  }));
  return adapterPromise;
}
