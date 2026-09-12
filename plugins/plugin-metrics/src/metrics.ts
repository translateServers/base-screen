import type {
  BaseScreenMaterialObjectSchema,
  BaseScreenPluginDataResourceTypeContribution,
} from '@base-screen/plugin-core';

export const PLUGIN_METRICS_ID = 'base-screen.metrics';

/**
 * 数据资源类型 id 会写进文档 `dataSource.resourceType`，因此必须满足文档契约的
 * 变量名模式（`^[A-Za-z_][A-Za-z0-9_]{0,127}$`）——不能带点号。
 */
export const PLUGIN_METRICS_RESOURCE_TYPE_ID = 'metricsSummary';

export const PLUGIN_METRICS_RESOURCE_TYPE_NAME = '指标汇总';

/**
 * 该插件为蓝图规则声明的能力。能力 id 必须来自 managers 的受支持能力表，
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
