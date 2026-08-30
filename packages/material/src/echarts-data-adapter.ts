import type {
  ScreenDatasetField,
  ScreenParseResult,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import type { BaseScreenMaterialTabularDataAdapter } from '@base-screen/plugin-core';
import { BaseScreenEChartsMaterialElement } from './echarts-element.js';

export const BASE_SCREEN_ECHARTS_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({
    dataset,
    fields,
  }: {
    dataset: ScreenTabularDataset;
    fields: Readonly<Record<string, readonly ScreenDatasetField[]>>;
  }) {
    const dimension = fields.dimension?.[0];
    const measures = fields.measures;
    if (dimension === undefined || measures === undefined || measures.length === 0) {
      return invalidEChartsProjection();
    }
    return {
      ok: true,
      value: {
        series: measures.map((measure) => ({
          id: measure.id,
          label: measure.label,
          points: dataset.rows.flatMap((row) => {
            const x = row[dimension.id];
            const y = row[measure.id];
            return x === undefined || x === null || y === null
              ? []
              : typeof y === 'number' && Number.isFinite(y)
                ? [{ x, y }]
                : [];
          }),
        })),
      },
      diagnostics: [],
    };
  },
};

Object.defineProperty(BaseScreenEChartsMaterialElement, 'tabularDataAdapter', {
  value: BASE_SCREEN_ECHARTS_TABULAR_DATA_ADAPTER,
});

function invalidEChartsProjection(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'ECharts dataset binding is invalid.',
      },
    ],
  };
}
