import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenDataField,
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';
import { createVueMaterialDefinition } from '@base-screen/vue';
import MetricValue from '../components/MetricValue.vue';
import { METRIC_VALUE_MANIFEST } from './metric-value';

export interface MetricValueProps {
  readonly unit: string;
  readonly value: number | null;
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
 * 与 Vanilla / React 两端同一形态；元素注册由调用方显式完成（公开入口）。
 *
 * 样式说明：Vue 桥接会把文档全局样式规则传播进设计器 shadow root，
 * 因此物料样式可以写在应用样式表里（见 src/styles/components.css 的 .metric-value）。
 */
export function createMetricValueMaterial(): BaseScreenMaterialCatalogEntry {
  const definition = createVueMaterialDefinition<MetricValueProps>({
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
