import type {
  BaseScreenMaterialObjectSchema,
  BaseScreenPluginDataResourceTypeContribution,
} from '@base-screen/plugin-core';

/**
 * 统一物料插件里的「资源类型 + 蓝图能力」词法（原独立 metrics 插件）。
 *
 * 这两项都停在作者面：资源类型进入数据源面板的类型选择器，蓝图能力让画布上的
 * 蓝图规则可以引用它。它们不渲染任何东西，因此这里的实现零 DOM。
 */

/**
 * 数据资源类型 id 会写进文档 `dataSource.resourceType`，因此必须满足文档契约的
 * 变量名模式（`^[A-Za-z_][A-Za-z0-9_]{0,127}$`）——不能带点号。
 */
export const PLUGIN_METRICS_RESOURCE_TYPE_ID = 'metricsSummary';

export const PLUGIN_METRICS_RESOURCE_TYPE_NAME = '指标汇总';

/**
 * 为蓝图规则声明的能力。能力 id 必须来自 managers 的受支持能力表，
 * 且同时出现在清单 `capabilities` 中才会被授权（声明 ∩ 批准 ∩ 支持）。
 */
export const PLUGIN_METRICS_BLUEPRINT_CAPABILITY = 'blueprint.action.request-component-data';

/** 资源参数严格契约：宿主据此校验请求，插件侧也复用同一形状做归一化。 */
export const PLUGIN_METRICS_CONFIG_SCHEMA: BaseScreenMaterialObjectSchema = {
  kind: 'object',
  properties: {
    metric: { kind: 'string' },
    window: { kind: 'enum', values: ['day', 'week', 'month'] },
    limit: { kind: 'number', minimum: 1, maximum: 100 },
  },
  required: ['metric', 'window'],
};

export const PLUGIN_METRICS_RESOURCE_TYPE: BaseScreenPluginDataResourceTypeContribution = {
  kind: 'dataResourceType',
  id: PLUGIN_METRICS_RESOURCE_TYPE_ID,
  name: PLUGIN_METRICS_RESOURCE_TYPE_NAME,
  configSchema: PLUGIN_METRICS_CONFIG_SCHEMA,
  // 同一指标窗口内的并发请求可共享 in-flight 结果。
  queryScope: 'resource',
};
