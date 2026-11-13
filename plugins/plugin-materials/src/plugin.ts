import type {
  BaseScreenPluginContribution,
  BaseScreenPluginRuntime,
  PluginCommandPort,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
import { definePlugin } from '@base-screen/plugin-sdk';
import {
  BOARD_BORDER_STYLES,
  type BoardBorderStyle,
  isBoardBorderStyle,
  PLUGIN_BOARD_BORDER_BOX_TAG_NAME,
  PLUGIN_BOARD_BORDER_BOX_TYPE,
  PLUGIN_BOARD_BORDER_PICKER_ID,
  PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME,
  PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE,
  PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME,
  PLUGIN_BOARD_DIGITAL_FLOP_TYPE,
  PLUGIN_BOARD_MARQUEE_TAG_NAME,
  PLUGIN_BOARD_MARQUEE_TYPE,
  PLUGIN_BOARD_PIPELINE_TAG_NAME,
  PLUGIN_BOARD_PIPELINE_TYPE,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TYPE,
  PLUGIN_BOARD_STATUS_GRID_TAG_NAME,
  PLUGIN_BOARD_STATUS_GRID_TYPE,
  PLUGIN_BOARD_WATER_LEVEL_TAG_NAME,
  PLUGIN_BOARD_WATER_LEVEL_TYPE,
} from './board/identity.js';
import {
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
  PLUGIN_ECHARTS_MATERIAL_MANIFESTS,
  PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
} from './echarts/manifest.js';
import {
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_METRICS_RESOURCE_TYPE,
} from './metrics/metrics.js';
import {
  PLUGIN_PIPELINE_ACTION_CAPABILITY,
  PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
  PLUGIN_PIPELINE_SPOTLIGHT_CONTRIBUTION,
  PLUGIN_PIPELINE_TOP_BY_CONTRIBUTION,
  PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
} from './pipeline/identity.js';
import { applyTopBy } from './pipeline/processors.js';
import { emitSpotlight } from './pipeline/spotlight.js';

/** 统一物料包的身份：一个插件承载全部图表、大屏组件与运行期贡献。 */
export const PLUGIN_MATERIALS_ID = 'base-screen.materials';

/** 图表家族物料的入口标签，供宿主注册与文档引用。 */
export const PLUGIN_ECHARTS_TAG_NAME = PLUGIN_ECHARTS_MATERIAL_MANIFEST.tagName;

export const PLUGIN_ECHARTS_TOGGLE_COMMAND_ID = 'base-screen.echarts.toggle-series-type';
export const PLUGIN_ECHARTS_SERIES_PICKER_ID = 'base-screen.echarts.series-picker';

/**
 * 统一物料插件的 runtime：19 个物料、2 个检查器控件、2 条命令，外加原 metrics /
 * pipeline 两个插件的能力面（1 个数据资源类型、1 个蓝图能力、1 个数据处理器、
 * 1 个蓝图动作）。
 *
 * 本插件只负责"物料与物料相关的作者面 / 运行期贡献"：物料进入画布目录，检查器控件经
 * editorDescriptor 授权后出现在属性面板，处理器与动作由宿主经 manager 路由。它不向设计器
 * 注入任何 chrome——没有 `panel` 贡献（左栏页签），命令也不写 `menus`（省略即只进命令面板），
 * 因此不会产生右键菜单项。
 *
 * runtime 本身零 DOM：自定义元素注册与实例化在 register.ts。
 */
export function createPluginMaterialsRuntime(): BaseScreenPluginRuntime {
  let commandPort: PluginCommandPort | undefined;
  let designReadPort: PluginDesignReadPort | undefined;

  const defined = definePlugin({
    manifest: {
      id: PLUGIN_MATERIALS_ID,
      dependencies: [],
      capabilities: [
        'command.execute',
        'design.read',
        PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
        PLUGIN_PIPELINE_ACTION_CAPABILITY,
      ],
      contributions: [
        ...materialContributions(),
        ...authoringContributions(),
        ...runtimeContributions(),
      ],
    },
    commands: {
      [PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID]: async (commandArgs) =>
        cycleBorderStyle(commandArgs, commandPort, designReadPort),
      [PLUGIN_ECHARTS_TOGGLE_COMMAND_ID]: async () => toggleSeriesType(commandPort, designReadPort),
    },
    dataProcessors: {
      [PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID]: (value, config) => applyTopBy(value, config),
    },
    blueprintActions: {
      [PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID]: (payload) => emitSpotlight(payload),
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
      `PLUGIN_MATERIALS_MANIFEST_INVALID:${defined.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(',')}`,
    );
  }
  return defined.value;
}

/** 19 个物料：8 个大屏组件 + 1 个通用图表 + 10 个图表家族。 */
function materialContributions(): BaseScreenPluginContribution[] {
  const boardMaterials = [
    [PLUGIN_BOARD_DIGITAL_FLOP_TYPE, PLUGIN_BOARD_DIGITAL_FLOP_TAG_NAME],
    [PLUGIN_BOARD_SCROLL_BOARD_TYPE, PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME],
    [PLUGIN_BOARD_WATER_LEVEL_TYPE, PLUGIN_BOARD_WATER_LEVEL_TAG_NAME],
    [PLUGIN_BOARD_BORDER_BOX_TYPE, PLUGIN_BOARD_BORDER_BOX_TAG_NAME],
    [PLUGIN_BOARD_CAPSULE_PROGRESS_TYPE, PLUGIN_BOARD_CAPSULE_PROGRESS_TAG_NAME],
    [PLUGIN_BOARD_MARQUEE_TYPE, PLUGIN_BOARD_MARQUEE_TAG_NAME],
    [PLUGIN_BOARD_STATUS_GRID_TYPE, PLUGIN_BOARD_STATUS_GRID_TAG_NAME],
    [PLUGIN_BOARD_PIPELINE_TYPE, PLUGIN_BOARD_PIPELINE_TAG_NAME],
  ] as const;
  return [
    ...boardMaterials.map(([type, tagName]) => ({ kind: 'material' as const, type, tagName })),
    ...PLUGIN_ECHARTS_MATERIAL_MANIFESTS.map((manifest) => ({
      kind: 'material' as const,
      type: manifest.type,
      tagName: manifest.tagName,
    })),
  ];
}

/**
 * 检查器控件与命令都属于物料作者面：控件由 editorDescriptor 的 `control: 'custom'`
 * 引用，命令让作者在命令面板里调整当前物料。两者都不进入右键菜单或左栏。
 */
function authoringContributions(): BaseScreenPluginContribution[] {
  return [
    {
      kind: 'inspectorControl',
      id: PLUGIN_BOARD_BORDER_PICKER_ID,
      name: '边框样式选择器',
      tagName: PLUGIN_BOARD_BORDER_PICKER_TAG_NAME,
    },
    {
      kind: 'inspectorControl',
      id: PLUGIN_ECHARTS_SERIES_PICKER_ID,
      name: '图表类型选择器',
      tagName: PLUGIN_ECHARTS_SERIES_PICKER_TAG_NAME,
    },
    {
      kind: 'command',
      id: PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
      name: '轮换边框样式',
      requiredCapability: 'command.execute',
    },
    {
      kind: 'command',
      id: PLUGIN_ECHARTS_TOGGLE_COMMAND_ID,
      name: '切换图型',
      requiredCapability: 'command.execute',
    },
  ];
}

/**
 * 运行期与资源类贡献（原独立 metrics / pipeline 插件的能力面）：
 * 数据资源类型进入数据源类型选择器，蓝图能力让规则可引用，处理器与动作由宿主经 manager 路由。
 * 这些贡献都没有 tagName，也没有 panel/menus。
 */
function runtimeContributions(): BaseScreenPluginContribution[] {
  return [
    PLUGIN_METRICS_RESOURCE_TYPE,
    {
      kind: 'blueprintCapability',
      id: PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
      name: '请求组件数据',
    },
    PLUGIN_PIPELINE_TOP_BY_CONTRIBUTION,
    PLUGIN_PIPELINE_SPOTLIGHT_CONTRIBUTION,
  ];
}

async function cycleBorderStyle(
  commandArgs: unknown,
  commandPort: PluginCommandPort | undefined,
  designReadPort: PluginDesignReadPort | undefined,
) {
  if (commandPort === undefined || designReadPort === undefined) {
    return failure('PLUGIN_CORE_SESSION_INVALID', 'Command and design-read ports are unavailable.');
  }
  const snapshot = await designReadPort.read();
  if (!snapshot.ok) return snapshot;
  const focused = snapshot.value.document.components.find(
    (component) => component.id === snapshot.value.focusedComponentId,
  );
  if (focused === undefined || focused.type !== PLUGIN_BOARD_BORDER_BOX_TYPE) {
    return failure(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
      'Focus a board.border-box component to cycle its border style.',
    );
  }
  const current = readBorderStyle(focused.props);
  // 允许调用方指定目标样式（面板点击），否则按声明顺序轮换（命令面板触发）。
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
}

async function toggleSeriesType(
  commandPort: PluginCommandPort | undefined,
  designReadPort: PluginDesignReadPort | undefined,
) {
  if (commandPort === undefined || designReadPort === undefined) {
    return failure('PLUGIN_CORE_SESSION_INVALID', 'Command and design-read ports are unavailable.');
  }
  const snapshot = await designReadPort.read();
  if (!snapshot.ok) return snapshot;
  const focused = snapshot.value.document.components.find(
    (component) => component.id === snapshot.value.focusedComponentId,
  );
  if (focused === undefined || focused.type !== PLUGIN_ECHARTS_MATERIAL_MANIFEST.type) {
    return failure(
      'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
      'Focus a plugin.echarts component to toggle its series type.',
    );
  }
  const current = (focused.props as { seriesType?: unknown }).seriesType;
  const next = nextSeriesType(current);
  return commandPort.execute({
    commandId: 'update-components',
    args: {
      componentIds: [focused.id],
      // props 是整体替换：必须带上当前其余字段，否则 schema 必填的
      // titleText/showTooltip 会被这条命令抹掉，事务被拒。
      patch: { props: { ...focused.props, seriesType: next } },
    },
  });
}

const SERIES_CYCLE = ['line', 'bar', 'area', 'pie'] as const;

/** 命令按固定顺序轮换，保证同一次点击在三端得到同一个下一档。 */
function nextSeriesType(current: unknown): (typeof SERIES_CYCLE)[number] {
  const index = SERIES_CYCLE.findIndex((value) => value === current);
  return SERIES_CYCLE[(index + 1) % SERIES_CYCLE.length] ?? 'line';
}

function readBorderStyle(props: Readonly<Record<string, unknown>>): BoardBorderStyle | undefined {
  const value = props.borderStyle;
  return isBoardBorderStyle(value) ? value : undefined;
}

/** 从命令参数里读目标样式；args 为 null（chrome 触发）或非法时返回 undefined。 */
function readRequestedStyle(commandArgs: unknown): BoardBorderStyle | undefined {
  if (typeof commandArgs !== 'object' || commandArgs === null || Array.isArray(commandArgs)) {
    return undefined;
  }
  const requested = (commandArgs as { readonly borderStyle?: unknown }).borderStyle;
  return isBoardBorderStyle(requested) ? requested : undefined;
}

function nextBorderStyle(current: BoardBorderStyle | undefined): BoardBorderStyle {
  const index = current === undefined ? -1 : BOARD_BORDER_STYLES.indexOf(current);
  return BOARD_BORDER_STYLES[(index + 1) % BOARD_BORDER_STYLES.length]!;
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
