import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

/**
 * 按需注册而不是 `import * from 'echarts'`：示例只需要四种图型与基础交互，
 * 整包会把地图、关系图、3D 等全部打进宿主产物。tree-shaken 后只保留
 * line/bar/pie + grid/legend/title/tooltip + canvas 渲染器。
 */
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

// 第三方类型只出现在本文件内部：对外只暴露 handle 接口与 JSON-safe 载荷。
type ChartOption = Parameters<ReturnType<typeof echarts.init>['setOption']>[0];

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

export function createEchartsChartHandle(host: HTMLElement): EchartsChartHandle {
  const chart = echarts.init(host);
  const listeners = new Set<(payload: EchartsSeriesClickPayload) => void>();

  chart.on('click', (params: unknown) => {
    const detail = params as Partial<{
      seriesIndex: number;
      seriesName: string;
      dataIndex: number;
      name: string;
      value: number;
    }>;
    for (const listener of listeners) {
      listener({
        seriesIndex: typeof detail.seriesIndex === 'number' ? detail.seriesIndex : 0,
        seriesName: typeof detail.seriesName === 'string' ? detail.seriesName : '',
        pointIndex: typeof detail.dataIndex === 'number' ? detail.dataIndex : 0,
        x: typeof detail.name === 'string' ? detail.name : '',
        y: typeof detail.value === 'number' ? detail.value : 0,
      });
    }
  });

  return {
    render(option: unknown): void {
      chart.setOption(option as ChartOption, true);
    },
    resize(): void {
      chart.resize();
    },
    dispose(): void {
      listeners.clear();
      chart.dispose();
    },
    onSeriesClick(listener: (payload: EchartsSeriesClickPayload) => void): void {
      listeners.add(listener);
    },
  };
}
