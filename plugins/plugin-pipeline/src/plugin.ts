import type { ScreenJsonObject, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenPluginRuntime } from '@base-screen/plugin-core';
import { definePlugin } from '@base-screen/plugin-sdk';
import {
  PLUGIN_PIPELINE_ACTION_CAPABILITY,
  PLUGIN_PIPELINE_ID,
  PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
  PLUGIN_PIPELINE_SPOTLIGHT_CONTRIBUTION,
  PLUGIN_PIPELINE_TOP_BY_CONTRIBUTION,
  PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
} from './identity.js';
import { applyTopBy } from './processors.js';

/** 动作在浏览器里落地时派发的事件名；宿主/测试据此观察动作确实执行了。 */
export const PLUGIN_PIPELINE_SPOTLIGHT_EVENT = 'base-screen-plugin-pipeline-spotlight';

export interface PluginPipelineSpotlightDetail {
  readonly actionId: string;
  readonly color: string;
  readonly strokeWidth: number;
}

/**
 * 运行期插件的对照示例（ADR-0076）：**首个只贡献运行时语义、不贡献任何界面元素**的插件。
 *
 * 两个承载体：
 * - `dataProcessor`（`topBy`）——文档 `processorId` 引用它，宿主在解析变量/数据源时调用；
 * - `blueprintAction`（`spotlight`）——文档 `host-action.actionId` 引用它，Engine 把它作为
 *   宿主动作抛出，宿主端口路由回本插件的 handler。
 *
 * 两者都是纯函数式实现、零 DOM 依赖（动作派发事件也只在浏览器执行时发生），因此可在 Node
 * 中直接构造与校验——这也是它能在单测里被完整覆盖的原因。
 */
export function createPluginPipelineRuntime(): BaseScreenPluginRuntime {
  const defined = definePlugin({
    manifest: {
      id: PLUGIN_PIPELINE_ID,
      dependencies: [],
      capabilities: [PLUGIN_PIPELINE_ACTION_CAPABILITY],
      contributions: [PLUGIN_PIPELINE_TOP_BY_CONTRIBUTION, PLUGIN_PIPELINE_SPOTLIGHT_CONTRIBUTION],
    },
    dataProcessors: {
      [PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID]: (value, config) => applyTopBy(value, config),
    },
    blueprintActions: {
      [PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID]: (payload) => emitSpotlight(payload),
    },
    activate() {},
    deactivate() {},
    dispose() {},
  });
  if (!defined.ok) {
    // 清单是模块内常量，写错属于开发期错误；直接把诊断抛出来便于定位。
    throw new Error(
      `PLUGIN_PIPELINE_MANIFEST_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}

/**
 * 动作实现：把"高亮"作为一次 DOM 事件抛出，交给宿主的视觉层处理。
 *
 * 插件不直接改画布 DOM——那属于实现细节（ADR-0027 的宿主边界）。它只声明"我要求高亮，
 * 参数是这些"，怎么显示由宿主决定。没有 DOM 时（Node 测试）静默返回成功，保持可测。
 */
function emitSpotlight(payload: ScreenJsonValue): ScreenParseResult<ScreenJsonValue> {
  const record = asRecord(payload);
  const detail: PluginPipelineSpotlightDetail = {
    actionId: PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
    color: typeof record.color === 'string' ? record.color : '#38bdf8',
    strokeWidth: typeof record.strokeWidth === 'number' ? record.strokeWidth : 2,
  };
  const target = globalThis as { dispatchEvent?: (event: unknown) => boolean };
  if (typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    target.dispatchEvent(new CustomEvent(PLUGIN_PIPELINE_SPOTLIGHT_EVENT, { detail }));
  }
  return { ok: true, value: { actionId: detail.actionId }, diagnostics: [] };
}

function asRecord(value: ScreenJsonValue): ScreenJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ScreenJsonObject)
    : {};
}
