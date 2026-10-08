import type {
  BaseScreenPluginRuntime,
  PluginCommandPort,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
import { definePlugin } from '@base-screen/plugin-sdk';
import {
  DATAV_BORDER_STYLES,
  type DatavBorderStyle,
  isDatavBorderStyle,
  PLUGIN_DATAV_BORDER_BOX_TYPE,
  PLUGIN_DATAV_BORDER_PICKER_ID,
  PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
  PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_DATAV_DIGITAL_FLOP_TYPE,
  PLUGIN_DATAV_ID,
  PLUGIN_DATAV_SCROLL_BOARD_TYPE,
  PLUGIN_DATAV_WATER_LEVEL_TYPE,
} from './identity.js';

/**
 * 大屏组件插件的 runtime：四个物料 + 一个检查器控件 + 一条文档事务命令。
 *
 * 与 `plugin-echarts`（渲染类 + 第三方依赖 + 手写裸 runtime）互补，本插件用 SDK 的
 * `definePlugin` 在构造点自校验清单，用来证明"零第三方依赖的渲染类插件也能走完整
 * 作者面"。runtime 本身零 DOM：自定义元素的注册与实例化在 register.ts。
 *
 * 命令 `cycle-border-style` 演示一条真实可用的插件命令：读当前选区 → 在六个边框
 * 样式里轮换 → 经 command.execute 提交 update-components 事务，因此天然可撤销。
 */
export function createPluginDatavRuntime(): BaseScreenPluginRuntime {
  let commandPort: PluginCommandPort | undefined;
  let designReadPort: PluginDesignReadPort | undefined;

  const defined = definePlugin({
    manifest: {
      id: PLUGIN_DATAV_ID,
      dependencies: [],
      capabilities: ['command.execute', 'design.read'],
      contributions: [
        ...materialContributions(),
        {
          kind: 'inspectorControl',
          id: PLUGIN_DATAV_BORDER_PICKER_ID,
          name: '边框样式选择器',
          tagName: PLUGIN_DATAV_BORDER_PICKER_TAG_NAME,
        },
        {
          kind: 'command',
          id: PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID,
          name: '轮换边框样式',
          requiredCapability: 'command.execute',
          // 命令面板与画布右键都提供入口；面板路径还能带 borderStyle 参数直达某个样式。
          menus: ['commandPalette', 'context.component'],
        },
      ],
    },
    commands: {
      [PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID]: async (commandArgs) => {
        if (commandPort === undefined || designReadPort === undefined) {
          return failure(
            'PLUGIN_CORE_SESSION_INVALID',
            'Command and design-read ports are unavailable.',
          );
        }
        const snapshot = await designReadPort.read();
        if (!snapshot.ok) return snapshot;
        const focused = snapshot.value.document.components.find(
          (component) => component.id === snapshot.value.focusedComponentId,
        );
        if (focused === undefined || focused.type !== PLUGIN_DATAV_BORDER_BOX_TYPE) {
          return failure(
            'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
            'Focus a datav.border-box component to cycle its border style.',
          );
        }
        const current = readBorderStyle(focused.props);
        // 允许调用方指定目标样式（面板点击），否则按声明顺序轮换（菜单/快捷键触发）。
        const requested = readRequestedStyle(commandArgs);
        const next = requested ?? nextBorderStyle(current);
        return commandPort.execute({
          commandId: 'update-components',
          args: {
            componentIds: [focused.id],
            // `props` 是整体替换：必须带上当前其余字段，否则 schema 必填的
            // borderStyle/bracketSize/lineWidth 会被抹掉，事务被拒。
            patch: { props: { ...focused.props, borderStyle: next } },
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
  });
  if (!defined.ok) {
    // 清单是模块内常量，写错属于开发期错误；直接把诊断抛出来便于定位。
    throw new Error(
      `PLUGIN_DATAV_MANIFEST_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}

function materialContributions() {
  return [
    {
      kind: 'material' as const,
      type: PLUGIN_DATAV_DIGITAL_FLOP_TYPE,
      tagName: 'base-screen-datav-digital-flop',
    },
    {
      kind: 'material' as const,
      type: PLUGIN_DATAV_SCROLL_BOARD_TYPE,
      tagName: 'base-screen-datav-scroll-board',
    },
    {
      kind: 'material' as const,
      type: PLUGIN_DATAV_WATER_LEVEL_TYPE,
      tagName: 'base-screen-datav-water-level',
    },
    {
      kind: 'material' as const,
      type: PLUGIN_DATAV_BORDER_BOX_TYPE,
      tagName: 'base-screen-datav-border-box',
    },
  ];
}

function readBorderStyle(props: Readonly<Record<string, unknown>>): DatavBorderStyle | undefined {
  const value = props.borderStyle;
  return isDatavBorderStyle(value) ? value : undefined;
}

/** 从命令参数里读目标样式；args 为 null（chrome 触发）或非法时返回 undefined。 */
function readRequestedStyle(commandArgs: unknown): DatavBorderStyle | undefined {
  if (typeof commandArgs !== 'object' || commandArgs === null || Array.isArray(commandArgs)) {
    return undefined;
  }
  const requested = (commandArgs as { readonly borderStyle?: unknown }).borderStyle;
  return isDatavBorderStyle(requested) ? requested : undefined;
}

function nextBorderStyle(current: DatavBorderStyle | undefined): DatavBorderStyle {
  const index = current === undefined ? -1 : DATAV_BORDER_STYLES.indexOf(current);
  return DATAV_BORDER_STYLES[(index + 1) % DATAV_BORDER_STYLES.length]!;
}

function failure(
  code: 'PLUGIN_CORE_SESSION_INVALID' | 'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
  message: string,
) {
  return {
    ok: false as const,
    diagnostics: [{ severity: 'error' as const, code, path: [] as const, message }],
  };
}
