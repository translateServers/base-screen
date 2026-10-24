import type {
  BaseScreenMaterialObjectSchema,
  BaseScreenPluginBlueprintActionContribution,
  BaseScreenPluginDataProcessorContribution,
} from '@base-screen/plugin-core';

/**
 * 插件标识与两类运行期贡献的词汇（ADR-0076）。
 *
 * 这个插件的定位与前三个互补：echarts 出物料、metrics 出资源类型、board-materials 出
 * 渲染类物料族——它们都停在**作者面**。本插件第一次让插件参与**文档的运行时语义**：
 * 一个数据处理器被 `processorId` 引用，一个蓝图动作被 `host-action.actionId` 引用。
 */
export const PLUGIN_PIPELINE_ID = 'base-screen.pipeline';

/**
 * 数据处理器 id。会写进文档的 `processorId`，因此必须满足文档契约的变量名模式。
 */
export const PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID = 'topBy';

/** 处理器参数严格契约：宿主与插件作者面据此校验配置。 */
export const PLUGIN_PIPELINE_TOP_BY_CONFIG_SCHEMA: BaseScreenMaterialObjectSchema = {
  kind: 'object',
  properties: {
    field: { kind: 'string' },
    count: { kind: 'number', minimum: 1, maximum: 500 },
  },
  required: ['field', 'count'],
};

export const PLUGIN_PIPELINE_TOP_BY_CONTRIBUTION: BaseScreenPluginDataProcessorContribution = {
  kind: 'dataProcessor',
  id: PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
  name: '按字段取前 N 条',
  configSchema: PLUGIN_PIPELINE_TOP_BY_CONFIG_SCHEMA,
};

/**
 * 蓝图动作 id。会写进文档 `host-action.actionId`，因此必须满足组件 id 模式（可带点号）。
 */
export const PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID = 'plugin.pipeline.spotlight';

export const PLUGIN_PIPELINE_SPOTLIGHT_PAYLOAD_SCHEMA: BaseScreenMaterialObjectSchema = {
  kind: 'object',
  properties: {
    color: { kind: 'string' },
    strokeWidth: { kind: 'number', minimum: 0, maximum: 24 },
  },
  required: ['color', 'strokeWidth'],
};

/**
 * 动作需要的执行能力。与命令一样走"声明 ∩ 批准 ∩ 支持"：宿主授权该能力，动作才进入
 * 可执行集合；否则作者面看不到、执行面也拒绝。
 */
export const PLUGIN_PIPELINE_ACTION_CAPABILITY = 'blueprint.action.execute';

export const PLUGIN_PIPELINE_SPOTLIGHT_CONTRIBUTION: BaseScreenPluginBlueprintActionContribution = {
  kind: 'blueprintAction',
  id: PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
  name: '高亮选中组件',
  payloadSchema: PLUGIN_PIPELINE_SPOTLIGHT_PAYLOAD_SCHEMA,
  requiredCapability: PLUGIN_PIPELINE_ACTION_CAPABILITY,
};
