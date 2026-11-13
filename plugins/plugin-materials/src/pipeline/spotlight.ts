import type { ScreenJsonObject, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import { PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID } from './identity.js';

/** 动作在浏览器里落地时派发的事件名；宿主/测试据此观察动作确实执行了。 */
export const PLUGIN_PIPELINE_SPOTLIGHT_EVENT = 'base-screen-plugin-materials-spotlight';

export interface PluginMaterialsSpotlightDetail {
  readonly actionId: string;
  readonly color: string;
  readonly strokeWidth: number;
}

/**
 * 动作实现：把"高亮"作为一次 DOM 事件抛出，交给宿主的视觉层处理。
 *
 * 插件不直接改画布 DOM——那属于实现细节（ADR-0027 的宿主边界）。它只声明"我要求高亮，
 * 参数是这些"，怎么显示由宿主决定。没有 DOM 时（Node 测试）静默返回成功，保持可测。
 */
export function emitSpotlight(payload: ScreenJsonValue): ScreenParseResult<ScreenJsonValue> {
  const record = asRecord(payload);
  const detail: PluginMaterialsSpotlightDetail = {
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
