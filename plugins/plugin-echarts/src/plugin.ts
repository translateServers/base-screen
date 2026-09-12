import type { BaseScreenPluginRuntime } from '@base-screen/plugin-core';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from './manifest.js';

export const PLUGIN_ECHARTS_ID = 'base-screen.echarts';
export const PLUGIN_ECHARTS_TAG_NAME = PLUGIN_ECHARTS_MATERIAL_MANIFEST.tagName;

/**
 * 无 DOM 依赖：只声明清单。宿主可在任意环境构造 runtime 并交给管理器校验，
 * 自定义元素的注册与实例化另见 register。
 */
export function createPluginEchartsRuntime(): BaseScreenPluginRuntime {
  return {
    manifest: {
      id: PLUGIN_ECHARTS_ID,
      dependencies: [],
      capabilities: [],
      contributions: [
        {
          kind: 'material',
          type: PLUGIN_ECHARTS_MATERIAL_MANIFEST.type,
          tagName: PLUGIN_ECHARTS_MATERIAL_MANIFEST.tagName,
        },
      ],
    },
    activate: () => undefined,
    deactivate: () => undefined,
    dispose: () => undefined,
  };
}
