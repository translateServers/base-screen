import type {
  BaseScreenPluginRuntime,
  PluginCommandPort,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
import {
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
  PLUGIN_ECHARTS_PANEL_TAG_NAME,
  PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
} from './manifest.js';

export const PLUGIN_ECHARTS_ID = 'base-screen.echarts';
export const PLUGIN_ECHARTS_TAG_NAME = PLUGIN_ECHARTS_MATERIAL_MANIFEST.tagName;
export const PLUGIN_ECHARTS_TOGGLE_COMMAND_ID = 'base-screen.echarts.toggle-series-type';
export const PLUGIN_ECHARTS_PANEL_ID = 'base-screen.echarts.overview';
export const PLUGIN_ECHARTS_SERIES_PICKER_ID = 'base-screen.echarts.series-picker';

/**
 * 无 DOM 依赖：只声明清单与命令处理。宿主可在任意环境构造 runtime 并交给管理器校验，
 * 自定义元素的注册与实例化另见 register。
 *
 * 外移的图表能力在此用上四个承载面：material（画布组件）、command（聚焦图表切换
 * 折线/柱状：design.read 读现状、command.execute 写回可撤销事务）、panel（左栏
 * 图表概览，经面板动作回调自身命令）与 inspectorControl（属性面板系列类型选择器，
 * 由 editorDescriptor 声明并经清单授权）。
 */
export function createPluginEchartsRuntime(): BaseScreenPluginRuntime {
  let commandPort: PluginCommandPort | undefined;
  let designReadPort: PluginDesignReadPort | undefined;

  return {
    manifest: {
      id: PLUGIN_ECHARTS_ID,
      dependencies: [],
      capabilities: ['command.execute', 'design.read'],
      contributions: [
        {
          kind: 'material',
          type: PLUGIN_ECHARTS_MATERIAL_MANIFEST.type,
          tagName: PLUGIN_ECHARTS_MATERIAL_MANIFEST.tagName,
        },
        {
          kind: 'command',
          id: PLUGIN_ECHARTS_TOGGLE_COMMAND_ID,
          name: '切换折线/柱状',
          requiredCapability: 'command.execute',
          menus: ['context.component'],
        },
        {
          kind: 'inspectorControl',
          id: PLUGIN_ECHARTS_SERIES_PICKER_ID,
          name: '图表类型选择器',
          tagName: PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
        },
        {
          kind: 'panel',
          id: PLUGIN_ECHARTS_PANEL_ID,
          name: '图表概览',
          tagName: PLUGIN_ECHARTS_PANEL_TAG_NAME,
        },
      ],
    },
    commands: {
      [PLUGIN_ECHARTS_TOGGLE_COMMAND_ID]: async () => {
        if (commandPort === undefined || designReadPort === undefined) {
          return {
            ok: false as const,
            diagnostics: [
              {
                severity: 'error' as const,
                code: 'PLUGIN_CORE_SESSION_INVALID' as const,
                path: [] as const,
                message: 'Command and design-read ports are unavailable.',
              },
            ],
          };
        }
        const snapshot = await designReadPort.read();
        if (!snapshot.ok) return snapshot;
        const focused = snapshot.value.document.components.find(
          (component) => component.id === snapshot.value.focusedComponentId,
        );
        if (focused === undefined || focused.type !== PLUGIN_ECHARTS_MATERIAL_MANIFEST.type) {
          return {
            ok: false as const,
            diagnostics: [
              {
                severity: 'error' as const,
                code: 'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID' as const,
                path: [] as const,
                message: 'Focus a plugin.echarts component to toggle its series type.',
              },
            ],
          };
        }
        const current = (focused.props as { seriesType?: unknown }).seriesType;
        const next = current === 'bar' ? 'line' : 'bar';
        return commandPort.execute({
          commandId: 'update-components',
          args: {
            componentIds: [focused.id],
            patch: { props: { seriesType: next } },
          },
        });
      },
    },
    activate(context) {
      commandPort = context.commandPort;
      designReadPort = context.designReadPort;
    },
    deactivate() {
      commandPort = undefined;
      designReadPort = undefined;
    },
    dispose() {
      commandPort = undefined;
      designReadPort = undefined;
    },
  };
}
