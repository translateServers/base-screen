import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenDataField,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';

/**
 * 图表类物料的表格投影：`dimension` 作为横轴分类，每个 `measures` 字段生成一条系列。
 *
 * 与官方 `base.chart` 的同名适配器语义一致（插件不能依赖 `@base-screen/material`，
 * 因此这里独立实现而不是 import 复用）。非数值度量与缺失分类按点跳过，整表没有可用
 * 点时返回绑定错误，避免画出一张空图还显示 ready。
 */
export const PLUGIN_ECHARTS_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const dimension: BaseScreenDataField | undefined = fields.dimension?.[0];
    const measures = fields.measures;
    if (dimension === undefined || measures === undefined || measures.length === 0) {
      return invalidChartProjection();
    }
    const series = measures.map((measure) => ({
      id: measure.id,
      label: measure.label,
      points: dataset.rows.flatMap((row) => {
        const x = row[dimension.id];
        const y = row[measure.id];
        if (x === undefined || x === null || y === undefined || y === null) return [];
        if (typeof y !== 'number' || !Number.isFinite(y)) return [];
        if (typeof x !== 'string' && typeof x !== 'number' && typeof x !== 'boolean') return [];
        return [{ x, y }];
      }),
    }));
    if (series.every((entry) => entry.points.length === 0)) return invalidChartProjection();
    return { ok: true, value: { series }, diagnostics: [] };
  },
};

function invalidChartProjection(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'Chart dataset binding is invalid.',
      },
    ],
  };
}
