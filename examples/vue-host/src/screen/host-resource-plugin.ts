import type {
  BaseScreenMaterialObjectSchema,
  BaseScreenPluginRuntime,
} from 'base-screen/plugin-core';
import { definePlugin } from 'base-screen/plugins';

/**
 * 宿主自有的「数据资源类型」声明。
 *
 * 这不是可选的装饰：设计器/查看器一旦拿到 runtimeContributions，渲染器就会用
 * `getResourceType` 校验每个 host-resource 组件，未声明的类型会被直接丢弃；
 * 数据面板也靠它拿到参数 schema 与显示名。因此资源类型必须在这里与
 * `host-data-channel` 的白名单保持一致。
 */
export const HOST_RESOURCE_PLUGIN_ID = 'host-app.resources';

export const DEMO_METRIC_RESOURCE = 'demo_metric';
export const DEMO_SERIES_RESOURCE = 'demo_series';
export const DEMO_RANKING_RESOURCE = 'demo_ranking';
/** 宿主素材库的图片身份（ADR-0089）：resourceId 是素材 id，解析结果是稳定内容 URL。 */
export const HOST_IMAGE_RESOURCE = 'host_image';

const POINTS_CONFIG_SCHEMA: BaseScreenMaterialObjectSchema = {
  kind: 'object',
  properties: {
    points: { kind: 'number', minimum: 1, maximum: 120 },
  },
  required: [],
};

const RANKING_CONFIG_SCHEMA: BaseScreenMaterialObjectSchema = {
  kind: 'object',
  properties: {
    limit: { kind: 'number', minimum: 1, maximum: 20 },
  },
  required: [],
};

/** 零 DOM、零 handler：只声明宿主愿意暴露给文档的三个资源类型。 */
export function createHostResourceRuntime(): BaseScreenPluginRuntime {
  const defined = definePlugin({
    manifest: {
      id: HOST_RESOURCE_PLUGIN_ID,
      dependencies: [],
      capabilities: [],
      contributions: [
        {
          kind: 'dataResourceType',
          id: DEMO_METRIC_RESOURCE,
          name: '演示指标（标量）',
          configSchema: POINTS_CONFIG_SCHEMA,
        },
        {
          kind: 'dataResourceType',
          id: DEMO_SERIES_RESOURCE,
          name: '演示指标（时序）',
          configSchema: POINTS_CONFIG_SCHEMA,
        },
        {
          kind: 'dataResourceType',
          id: DEMO_RANKING_RESOURCE,
          name: '演示排行',
          configSchema: RANKING_CONFIG_SCHEMA,
        },
        {
          kind: 'dataResourceType',
          id: HOST_IMAGE_RESOURCE,
          name: '图片素材',
          configSchema: { kind: 'object', properties: {}, required: [] },
        },
      ],
    },
    activate() {},
    deactivate() {},
    dispose() {},
  });
  if (!defined.ok) {
    throw new Error(
      `HOST_RESOURCE_PLUGIN_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}
