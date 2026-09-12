import type { BaseScreenPluginRuntime } from '@base-screen/plugin-core';
import { definePlugin } from '@base-screen/plugin-sdk';
import {
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_METRICS_ID,
  PLUGIN_METRICS_RESOURCE_TYPE,
} from './metrics.js';

/**
 * 声明式插件的对照示例：与 `plugin-echarts`（渲染类 + 第三方依赖 + 自定义元素）互补。
 *
 * 本插件是「功能类 + 零第三方依赖 + 无自定义元素」那一档——它不渲染任何东西，
 * 只声明两项能力面：
 * - `dataResourceType`：一类宿主资源，进入数据面板的类型选择器；
 * - `blueprintCapability`：让画布上的蓝图规则可以引用它。
 *
 * 因此它的源码零 DOM、零外部依赖，可在 Node 中直接构造与校验；这也是外围插件
 * 分区里「依赖隔离」之外那条通道的最小证据。
 *
 * 用 `definePlugin` 在模块内自我校验：作者的清单写错时，在构造点就得到诊断，
 * 而不是等到宿主 preflight 才失败。
 */
export function createPluginMetricsRuntime(): BaseScreenPluginRuntime {
  const defined = definePlugin({
    manifest: {
      id: PLUGIN_METRICS_ID,
      dependencies: [],
      capabilities: [PLUGIN_METRICS_BLUEPRINT_CAPABILITY],
      contributions: [
        PLUGIN_METRICS_RESOURCE_TYPE,
        {
          kind: 'blueprintCapability',
          id: PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
          name: '请求组件数据',
        },
      ],
    },
    activate() {},
    deactivate() {},
    dispose() {},
  });
  if (!defined.ok) {
    // 清单是模块内常量，写错属于开发期错误；直接把诊断抛出来便于定位。
    throw new Error(
      `PLUGIN_METRICS_MANIFEST_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}
