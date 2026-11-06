import { createReactMaterialDefinition } from '@base-screen/react';
import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/sdk/contracts';
import type {
  BaseScreenDataField,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/sdk/plugin-core';
import { METRIC_VALUE_MANIFEST } from './metric-value';

export interface MetricValueProps {
  readonly unit: string;
  readonly value: number | null;
}

/**
 * React 自有物料：普通函数组件经 `@base-screen/react` 桥接为 Base Screen 物料。
 * mapModel 把全量 model（含 dataState 投影值）映射为组件 props。
 *
 * 原子物料：只呈现「数值 + 单位」。标题交给文档层的 `base.text`，底座与边框交给
 * `base.container` 或边框物料，都不内建在读数组件里。
 *
 * 注意：React 桥接不把文档全局样式传播进设计器 shadow root（Vue 桥接会），
 * 因此物料样式必须自包含——这里用内联样式，且不写 width/height
 * （渲染盒由引擎赋值为 canonical component.size）。
 */
export function MetricValue({ unit, value }: MetricValueProps): React.ReactElement {
  return (
    <div
      data-metric-value
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '100%',
        padding: '14px 16px',
        color: '#e8eefb',
        font: '12px/1.4 system-ui, sans-serif',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        data-metric-value-number
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: '#39c5bb',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value === null ? '--' : `${value}${unit}`}
      </div>
    </div>
  );
}

/**
 * 表格数据投影：角色 `value` 绑定的字段取第一行数值（三端同一语义）。
 * 返回值是普通对象字面量——它同时满足 `ScreenJsonValue` 的索引签名约束。
 */
const metricValueAdapter: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const field: BaseScreenDataField | undefined = fields.value?.[0];
    const row = dataset.rows[0];
    const raw = field === undefined || row === undefined ? undefined : row[field.id];
    if (
      field === undefined ||
      row === undefined ||
      typeof raw !== 'number' ||
      !Number.isFinite(raw)
    ) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_DATASET_BINDING_INVALID',
            path: [],
            message: 'Metric value binding is invalid.',
          },
        ],
      };
    }
    return { ok: true, value: { value: raw }, diagnostics: [] };
  },
};

function readDataStateValue(model: BaseScreenMaterialModel): number | null {
  if (model.dataState.status !== 'ready') return null;
  const value: unknown = model.dataState.value;
  if (value === null || typeof value !== 'object') return null;
  const raw = (value as { readonly value?: unknown }).value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * 组装指标读数物料：桥接产出元素构造器 + catalog 条目（含表格适配器）。
 * 元素注册由调用方经 `customElements.define` 显式完成（公开入口，无隐式副作用）。
 */
export function createMetricValueMaterial(): BaseScreenMaterialCatalogEntry {
  const definition = createReactMaterialDefinition<MetricValueProps>({
    manifest: METRIC_VALUE_MANIFEST,
    component: MetricValue,
    mapModel: (model) => ({
      unit: String(model.props.unit ?? ''),
      value: readDataStateValue(model),
    }),
  });
  if (!definition.ok) {
    throw new Error(`METRIC_VALUE_MATERIAL_INVALID:${definition.diagnostics[0]?.code}`);
  }
  const entry = definition.value;
  return {
    manifest: entry.manifest,
    constructor: entry.constructor,
    tabularDataAdapter: metricValueAdapter,
  };
}
