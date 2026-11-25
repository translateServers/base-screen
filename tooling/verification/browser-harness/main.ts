import { createElement } from 'react';
import { h } from 'vue';
import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
} from '../../../packages/contracts/src/index.ts';
import { SCREEN_BLUEPRINT_CAPABILITY_IDS } from '../../../packages/contracts/src/index.ts';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_TABULAR_DATA_ADAPTER,
  BaseScreenChartMaterialElement,
  BaseScreenContainerMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenRuleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenRuleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from '../../../packages/material/src/index.ts';
import {
  type BaseScreenMaterialConstructor,
  type BaseScreenPluginRuntime,
  createBaseScreenMaterialCatalog,
  type PluginCommandPort,
  type PluginDesignReadPort,
  resolveBaseScreenMaterialDefaultStyle,
} from '../../../packages/plugin-core/src/index.ts';
import {
  createBaseScreenPluginContributionCommandPort,
  createBaseScreenPluginManager,
} from '../../../packages/plugin-manager/src/index.ts';
import { createReactMaterialDefinition } from '../../../packages/react/src/index.ts';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
  defineBaseScreenElements,
  SCREEN_AUTHORING_REQUEST_EVENT,
  type ScreenAuthoringRequest,
} from '../../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../../packages/vue/src/index.ts';
import {
  createPluginMaterialsRuntime,
  PLUGIN_BOARD_BORDER_BOX_TYPE,
  PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT_ID,
  PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT_ID,
  PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT_ID,
  PLUGIN_BOARD_TITLE_BAR_FRAGMENT_ID,
  PLUGIN_BOARD_WATER_LEVEL_TYPE,
  PLUGIN_ECHARTS_MATERIAL_MANIFESTS,
  PLUGIN_MATERIALS_ID,
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_METRICS_RESOURCE_TYPE_ID,
  PLUGIN_PIPELINE_ACTION_CAPABILITY,
  PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
  PLUGIN_PIPELINE_SPOTLIGHT_EVENT,
  PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
  registerPluginMaterials,
} from '../../../plugins/plugin-materials/src/index.ts';
import {
  applyHostScriptFilter,
  BOARD_COMPOSITION_PLUGIN_ID,
  BOARD_COMPOSITION_SCRIPT_PROCESSOR_ID,
  createBoardCompositionRuntime,
  startHostVariableTimer,
  writeHostVariable,
} from './board-composition-fixture.ts';
import { mountFeatureCases } from './feature-cases.ts';
import {
  defineHarnessInspectorFixtures,
  HARNESS_INSPECTOR_CONTROL_TAG_NAME,
  harnessInspectorDemoMaterialPackage,
} from './inspector-control-fixture.ts';
import { defineHarnessPluginPanel, HARNESS_PLUGIN_PANEL_TAG_NAME } from './plugin-panel-element.ts';
import {
  defineHarnessSemanticChartMaterial,
  HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST,
  HARNESS_SEMANTIC_CHART_TABULAR_DATA_ADAPTER,
  HarnessSemanticChartMaterialElement,
} from './semantic-chart-material.ts';

// 宿主受控动态加载（ADR-0029）：外部物料包经宿主发起的 import() 进入页面，
// 由宿主审核模块来源并负责失败处理；Base Screen 只消费加载后的可信模块。
const hostedModule = await import('./hosted-material-package.ts');
const hostedMaterialPackage = hostedModule.hostedMaterialPackage;
const draftMaterialPackage = hostedModule.draftMaterialPackage;
const hostedDatasetRankingManifest = hostedModule.hostedDatasetRankingManifest;

const harnessSearch = new URLSearchParams(window.location.search);
/**
 * `?designer` 默认是「范式组件展示」：画布与物料库只放交付面的范式物料（ADR-0099/0102：
 * `packages/material` 与 `plugins`），不出现 harness 自带的演示/验证夹具物料。
 * 浏览器断言依赖的验证文档（桥接按钮、语义图表、排行卡、蓝图与变量样例）改由
 * `?designer&verify` 打开；专项案例、物料分组压力页、组件工坊仍用验证文档。
 */
const tabsDemoMode = harnessSearch.has('tabs-demo');
const showcaseMode =
  tabsDemoMode ||
  (harnessSearch.has('designer') &&
    !['verify', 'case', 'cases', 'material-group-stress', 'workshop'].some((flag) =>
      harnessSearch.has(flag),
    ));
if (harnessSearch.has('designer') || harnessSearch.has('case') || harnessSearch.has('cases')) {
  document.body.dataset.layout = 'designer';
}

const productElements = defineBaseScreenElements();
// 面板标签必须在 manager 激活前注册：preflight 会按贡献声明的 tagName 查询宿主 registry。
defineHarnessPluginPanel();
registerPluginMaterials();
defineHarnessInspectorFixtures();
const officialMaterials = [
  defineBaseScreenTextMaterial(),
  defineBaseScreenRectangleMaterial(),
  defineBaseScreenEllipseMaterial(),
  defineBaseScreenImageMaterial(),
  defineBaseScreenRuleMaterial(),
  defineBaseScreenContainerMaterial(),
  defineBaseScreenChartMaterial(),
  defineHarnessSemanticChartMaterial(),
  defineBaseScreenTableMaterial(),
];
if (!productElements.ok || officialMaterials.some((definition) => !definition.ok)) {
  const diagnostics = [productElements, ...officialMaterials]
    .filter((result) => !result.ok)
    .flatMap((result) => result.diagnostics);
  throw new Error(
    `Base Screen browser harness failed to register its elements: ${JSON.stringify(diagnostics)}`,
  );
}

// 贡献身份跨插件唯一（manager 的 preflight 强制），因此同一个蓝图能力不能被两个插件
// 同时声明。这里把其中一个让给统一物料插件：既避免冲突，也让"能力由插件而非宿主提供"
// 这条通道真正被演示；union 仍覆盖全部能力 id，授权面不变。
const designerAuthoringCapabilities = SCREEN_BLUEPRINT_CAPABILITY_IDS.filter(
  (id) => id !== PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
);
// command.execute 与 design.read 单独声明：下面的 blueprintCapability 贡献由
// designerAuthoringCapabilities 逐项生成，混入端口能力会产出非法的蓝图能力贡献。
const designerAuthoringPluginCapabilities = [
  ...designerAuthoringCapabilities,
  'command.execute',
  'design.read',
];
// 插件命令按当前选区计算位移量：先读快照拿到组件现状，再决定写入什么 patch。
const HARNESS_PLUGIN_NUDGE_X = 40;
let designerCommandPort: PluginCommandPort | undefined;
let designerDesignReadPort: PluginDesignReadPort | undefined;
const designerAuthoringPlugin: BaseScreenPluginRuntime = {
  manifest: {
    id: 'browser-harness-authoring',
    dependencies: [],
    capabilities: designerAuthoringPluginCapabilities,
    contributions: [
      {
        kind: 'dataResourceType',
        id: 'dataset',
        name: '数据集',
        configSchema: {
          kind: 'object',
          properties: { limit: { kind: 'number' }, region: { kind: 'string' } },
          required: ['limit'],
        },
      },
      {
        kind: 'dataResourceType',
        id: 'host_image',
        name: 'Harness image',
        configSchema: { kind: 'object', properties: {}, required: [] },
      },
      {
        kind: 'command',
        id: 'harness.nudge-selection',
        name: 'Nudge selection',
        requiredCapability: 'command.execute',
        menus: ['commandPalette', 'menu.tools', 'context.canvas'],
        shortcut: 'Ctrl+Shift+P',
      },
      {
        kind: 'panel',
        id: 'harness.panel',
        name: 'Harness panel',
        tagName: HARNESS_PLUGIN_PANEL_TAG_NAME,
      },
      {
        kind: 'inspectorControl',
        id: 'harness.tone-control',
        name: 'Tone control',
        tagName: HARNESS_INSPECTOR_CONTROL_TAG_NAME,
      },
      ...designerAuthoringCapabilities.map((id) => ({
        kind: 'blueprintCapability' as const,
        id,
        name: id,
      })),
    ],
  },
  commands: {
    'harness.nudge-selection': async (commandArgs) => {
      if (designerCommandPort === undefined || designerDesignReadPort === undefined) {
        return {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'PLUGIN_CORE_SESSION_INVALID' as const,
              path: [],
              message: 'Plugin command and read ports are not available.',
            },
          ],
        };
      }
      const snapshot = await designerDesignReadPort.read();
      if (!snapshot.ok) {
        return { ok: false as const, diagnostics: snapshot.diagnostics };
      }
      const targetId =
        snapshot.value.focusedComponentId ?? snapshot.value.selectedComponentIds[0] ?? null;
      const target =
        targetId === null
          ? undefined
          : snapshot.value.document.components.find((component) => component.id === targetId);
      if (target === undefined) {
        return {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID' as const,
              path: [],
              message: 'Select a component before running this command.',
            },
          ],
        };
      }
      // chrome 触发时 args 为 null（ADR-0070），面板触发时带 step；位移不同可分辨来源。
      const step =
        typeof commandArgs === 'object' &&
        commandArgs !== null &&
        typeof (commandArgs as { step?: unknown }).step === 'number'
          ? (commandArgs as { step: number }).step
          : HARNESS_PLUGIN_NUDGE_X;
      return designerCommandPort.execute({
        commandId: 'update-components',
        args: {
          componentIds: [target.id],
          patch: {
            position: { x: target.position.x + step, y: target.position.y },
          },
        },
      });
    },
  },
  activate(context) {
    designerCommandPort = context.commandPort;
    designerDesignReadPort = context.designReadPort;
  },
  deactivate() {
    designerCommandPort = undefined;
    designerDesignReadPort = undefined;
  },
  dispose() {
    designerCommandPort = undefined;
    designerDesignReadPort = undefined;
  },
};

const pluginManager = createBaseScreenPluginManager({
  instanceId: 'browser-harness',
  standaloneMaterialTagNames: officialMaterials
    .filter((definition) => definition.ok)
    .map((definition) => definition.value.manifest.tagName),
  plugins: [
    designerAuthoringPlugin,
    createPluginMaterialsRuntime(),
    createBoardCompositionRuntime(),
  ],
  grantedCapabilities: {
    'browser-harness-authoring': designerAuthoringPluginCapabilities,
    // 统一物料插件既要读选区（检查器控件联动）也要提交事务（命令面板换样式），
    // 还承载原 metrics / pipeline 的蓝图能力与动作执行能力。
    [PLUGIN_MATERIALS_ID]: [
      'command.execute',
      'design.read',
      PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
      PLUGIN_PIPELINE_ACTION_CAPABILITY,
    ],
    // 组合路径模板：宿主自营的脚本过滤器处理器。
    [BOARD_COMPOSITION_PLUGIN_ID]: ['data.process'],
  },
  registry: {
    get: (tagName) => customElements.get(tagName) as BaseScreenMaterialConstructor | undefined,
  },
  // 入站端口把插件命令接进 designer 的文档事务（含 history 提交），因此插件改动可撤销。
  // manager 在此处激活，designer 元素要稍后才从 DOM 取得，故端口内必须惰性引用。
  createCommandPort: () =>
    createBaseScreenCorePluginCommandPort({
      executeCommand: (command) => designer.executeCommand(command),
    }),
  // 只读侧与写入侧配对：插件先读快照再决定发哪条 ScreenDocumentCommand。
  createDesignReadPort: () =>
    createBaseScreenCorePluginDesignReadPort({
      getDocument: () => designer.document,
      getSelection: () => designer.selection,
    }),
});
const managerActivated = await pluginManager.activate();
if (!managerActivated.ok || pluginManager.snapshot === undefined) {
  throw new Error(
    `Base Screen browser harness failed to activate its plugins: ${JSON.stringify(managerActivated)}`,
  );
}
const pluginChecks: ReadonlyArray<readonly [string, boolean]> = [
  ['snapshot', true],
  [
    'standalone-materials',
    [
      'base.text',
      'base.rectangle',
      'base.ellipse',
      'base.image',
      'base.rule',
      'base.container',
    ].every((type) => pluginManager.snapshot?.materials.has(type)),
  ],
  [
    'authoring-resource-type',
    pluginManager.snapshot.contributions.getResourceType('dataset') !== undefined,
  ],
  [
    'authoring-blueprint-capabilities',
    designerAuthoringCapabilities.every((capability) =>
      pluginManager.snapshot?.contributions.hasBlueprintCapability(capability),
    ),
  ],
  ['authoring-panel', pluginManager.snapshot.panels.get('harness.panel') !== undefined],
  [
    'authoring-inspector-control',
    pluginManager.snapshot.inspectorControls.get('harness.tone-control') !== undefined,
  ],
  // 外围插件的贡献必须真的进入快照：preflight 会因能力未授权、tag 未注册或依赖缺失
  // 静默把整个插件排除，只断言宿主自营插件会漏掉这种"声明了但从未生效"。
  [
    'materials-plugin-catalogued',
    pluginManager.snapshot.plugins.get(PLUGIN_MATERIALS_ID) !== undefined,
  ],
  [
    'echarts-material-catalogued',
    pluginManager.snapshot.materials.get('plugin.echarts') !== undefined,
  ],
  [
    'metrics-resource-type',
    pluginManager.snapshot.contributions.getResourceType(PLUGIN_METRICS_RESOURCE_TYPE_ID) !==
      undefined,
  ],
  [
    'metrics-blueprint-capability',
    pluginManager.snapshot.contributions.hasBlueprintCapability(
      PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
    ),
  ],
  // 统一物料插件：8 个板级物料仍要进快照，检查器控件要进授权目录（注册≠授权），
  // 命令要出现在插件记录里——任一项失败都说明插件被 preflight 整体排除。
  [
    'board-materials-catalogued',
    [
      PLUGIN_BOARD_BORDER_BOX_TYPE,
      PLUGIN_BOARD_WATER_LEVEL_TYPE,
      'board.digital-flop',
      'board.scroll-board',
    ].every((type) => pluginManager.snapshot?.materials.has(type) === true),
  ],
  [
    'board-inspector-control-authorized',
    ['base-screen-board-border-picker', 'base-screen-board-title-decor-picker'].every(
      (tagName) => pluginManager.snapshot?.inspectorControls.getByTagName(tagName) !== undefined,
    ),
  ],
  [
    'board-command-catalogued',
    pluginManager.snapshot.plugins
      .get(PLUGIN_MATERIALS_ID)
      ?.contributions.some(
        (item) => item.kind === 'command' && item.id === PLUGIN_BOARD_CYCLE_BORDER_COMMAND_ID,
      ) === true,
  ],
  // 物料插件与设计器 chrome 解耦：不声明 panel，命令也不进任何 context.* 菜单。
  [
    'materials-plugin-has-no-panel',
    pluginManager.snapshot.plugins
      .get(PLUGIN_MATERIALS_ID)
      ?.contributions.every((item) => item.kind !== 'panel') === true,
  ],
  [
    'materials-plugin-has-no-context-menu',
    pluginManager.snapshot.plugins
      .get(PLUGIN_MATERIALS_ID)
      ?.contributions.every(
        (item) =>
          item.kind !== 'command' ||
          item.menus === undefined ||
          item.menus.every((menu) => !menu.startsWith('context.')),
      ) === true,
  ],
  ['no-activation-failures', pluginManager.snapshot.failures.length === 0],
];
const failedPluginChecks = pluginChecks.filter(([, ok]) => !ok).map(([label]) => label);
if (failedPluginChecks.length > 0) {
  throw new Error(
    `Base Screen browser harness plugin snapshot checks failed: ${failedPluginChecks.join(', ')}; failures=${JSON.stringify(
      pluginManager.snapshot.failures,
    )}`,
  );
}
// 贡献索引的唯一来源就是 manager 快照：不再在 harness 里复刻一份字面量索引，
// 否则插件通道没有真正被验证，且两处会各自漂移。
const runtimeContributions = pluginManager.snapshot.contributions;

const catalog = createBaseScreenMaterialCatalog([
  {
    manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
    constructor: BaseScreenTextMaterialElement,
    tabularDataAdapter: BASE_SCREEN_TEXT_TABULAR_DATA_ADAPTER,
  },
  {
    manifest: BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
    constructor: BaseScreenRectangleMaterialElement,
  },
  {
    manifest: BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
    constructor: BaseScreenEllipseMaterialElement,
  },
  {
    manifest: BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
    constructor: BaseScreenImageMaterialElement,
  },
  {
    manifest: BASE_SCREEN_RULE_MATERIAL_MANIFEST,
    constructor: BaseScreenRuleMaterialElement,
  },
  {
    manifest: BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
    constructor: BaseScreenContainerMaterialElement,
  },
  {
    manifest: BASE_SCREEN_CHART_MATERIAL_MANIFEST,
    constructor: BaseScreenChartMaterialElement,
    tabularDataAdapter: BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  },
  {
    manifest: HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST,
    constructor: HarnessSemanticChartMaterialElement,
    tabularDataAdapter: HARNESS_SEMANTIC_CHART_TABULAR_DATA_ADAPTER,
  },
  {
    manifest: BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
    constructor: BaseScreenTableMaterialElement,
    tabularDataAdapter: BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  },
]);

const bridgeManifest = (type: string, tagName: string, name: string) => ({
  type,
  tagName,
  name,
  category: '桥接',
  keywords: ['桥接'],
  defaultSize: { width: 200, height: 36 },
  defaultProps: { label: name },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object' as const,
    properties: { label: { kind: 'string' as const } },
    required: ['label'],
  },
  propertyPanel: [{ prop: 'label', label: '标签', control: 'text' as const }],
  events: ['valueClick'],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
});

const reactBridge = createReactMaterialDefinition({
  manifest: bridgeManifest('harness.react-button', 'harness-react-button', 'React 桥接'),
  component: ({
    label,
    onValueClick,
  }: {
    label: string;
    onValueClick: (payload: unknown) => void;
  }) =>
    createElement(
      'button',
      { type: 'button', onClick: () => onValueClick({ framework: 'react' }) },
      label,
    ),
  eventProps: { valueClick: 'onValueClick' },
});
const vueBridge = createVueMaterialDefinition({
  manifest: bridgeManifest('harness.vue-button', 'harness-vue-button', 'Vue 桥接'),
  component: {
    props: ['label', 'onValueClick'],
    setup(props) {
      return () =>
        h(
          'button',
          { type: 'button', onClick: () => props.onValueClick({ framework: 'vue' }) },
          props.label,
        );
    },
  },
  eventProps: { valueClick: 'onValueClick' },
});
if (!reactBridge.ok || !vueBridge.ok) {
  throw new Error('Base Screen browser harness failed to create framework bridge materials.');
}
customElements.define(reactBridge.value.manifest.tagName, reactBridge.value.constructor);
customElements.define(vueBridge.value.manifest.tagName, vueBridge.value.constructor);
const bridgeCatalog = createBaseScreenMaterialCatalog([
  ...catalog.list(),
  reactBridge.value,
  vueBridge.value,
]);
// 分组必须覆盖目录中每个可见物料，且同一类型只能出现在一个分组里；
// `PLUGIN_ECHARTS_MATERIAL_MANIFESTS` 已包含 `plugin.echarts`，不能再单独列出。
const PLUGIN_CHART_MATERIAL_TYPES = PLUGIN_ECHARTS_MATERIAL_MANIFESTS.map(
  (manifest) => manifest.type,
);
const materialLibraryGrouping = {
  groups: [
    {
      id: 'foundation',
      label: '基础',
      materialTypes: ['base.text', 'base.rectangle', 'base.ellipse', 'base.image', 'base.rule'],
    },
    {
      id: 'data',
      label: '数据',
      children: [
        {
          id: 'charts',
          label: '图表',
          // 插件贡献的物料与外移的图表能力同列：分组必须覆盖目录中每个可见物料，
          // 否则 grouping 会因"缺少可见物料类型"被整体拒绝。
          materialTypes: ['base.chart', 'harness.semantic-chart', ...PLUGIN_CHART_MATERIAL_TYPES],
        },
        { id: 'tables', label: '表格', materialTypes: ['base.table'] },
      ],
    },
    {
      id: 'board',
      label: '大屏',
      // 外围插件 plugin-materials 贡献的全部可见物料；分组必须覆盖目录中每个可见物料。
      materialTypes: [
        'board.digital-flop',
        'board.scroll-board',
        'board.water-level',
        'board.border-box',
        'board.capsule-progress',
        'board.marquee',
        'board.pipeline',
        'board.status-grid',
        'board.status-legend',
        'board.title-decor',
        'board.tabs',
      ],
      // plugin-materials 贡献的组合分片（ADR-0100）：排在本组物料之后。
      fragmentIds: [
        PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT_ID,
        PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT_ID,
        PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT_ID,
        PLUGIN_BOARD_TITLE_BAR_FRAGMENT_ID,
      ],
    },
    {
      id: 'bridges',
      label: '桥接',
      materialTypes: ['harness.react-button', 'harness.vue-button'],
    },
    {
      id: 'best-practices',
      label: '最佳实践',
      materialTypes: [hostedDatasetRankingManifest.type],
    },
  ],
} as const;

// 变长标签压力演示分组：仅在 URL 携带 ?material-group-stress 时替换默认分组，
// 用于人工验收长名称截断、分栏钻取与窄面板浮层，不影响默认验收数据。
const materialLibraryStressGrouping = {
  groups: [
    { id: 'foundation', label: '基础', materialTypes: ['base.text'] },
    {
      id: 'shapes',
      label: '图形',
      materialTypes: ['base.rectangle', 'base.ellipse', 'base.rule'],
    },
    { id: 'media', label: '媒体素材库', materialTypes: ['base.image'] },
    {
      id: 'data',
      label: '数据可视化图表组件超长名称',
      children: [
        {
          id: 'charts',
          label: '图表',
          materialTypes: ['base.chart', ...PLUGIN_CHART_MATERIAL_TYPES],
        },
        {
          id: 'advanced',
          label: '高级图表',
          children: [
            { id: 'semantic-chart', label: '语义图表', materialTypes: ['harness.semantic-chart'] },
          ],
        },
        {
          id: 'tables',
          label: '一个超长的分组名称用来验证省略号截断效果',
          materialTypes: ['base.table'],
        },
      ],
    },
    {
      id: 'board',
      label: '大屏组件超长分组名称用于截断',
      materialTypes: [
        'board.digital-flop',
        'board.scroll-board',
        'board.water-level',
        'board.border-box',
        'board.capsule-progress',
        'board.marquee',
        'board.pipeline',
        'board.status-grid',
        'board.status-legend',
        'board.title-decor',
        'board.tabs',
      ],
      // plugin-materials 贡献的组合分片（ADR-0100）：排在本组物料之后。
      fragmentIds: [
        PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT_ID,
        PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT_ID,
        PLUGIN_BOARD_DEVICE_PANEL_FRAGMENT_ID,
        PLUGIN_BOARD_TITLE_BAR_FRAGMENT_ID,
      ],
    },
    {
      id: 'bridges',
      label: '跨框架桥接素材',
      materialTypes: ['harness.react-button', 'harness.vue-button'],
    },
    {
      id: 'best-practices',
      label: '宿主数据集最佳实践',
      materialTypes: [hostedDatasetRankingManifest.type],
    },
  ],
} as const;
/** 范式展示用分组：去掉只含 harness 夹具物料的「桥接」「最佳实践」，图表组不含语义图表。 */
const showcaseMaterialLibraryGrouping = {
  groups: materialLibraryGrouping.groups
    .filter((group) => group.id !== 'bridges' && group.id !== 'best-practices')
    .map((group) =>
      group.id !== 'data'
        ? group
        : {
            ...group,
            children: group.children.map((child) => ({
              ...child,
              materialTypes: child.materialTypes.filter(
                (type) => !isHarnessFixtureMaterialType(type),
              ),
            })),
          },
    ),
};
/** harness 自带的演示/验证夹具物料（桥接、语义图表、排行卡、检查器样例、草稿包）。 */
function isHarnessFixtureMaterialType(type: string): boolean {
  return type.startsWith('harness.') || type.startsWith('hosted.') || type.startsWith('draft.');
}
const activeMaterialLibraryGrouping = harnessSearch.has('material-group-stress')
  ? materialLibraryStressGrouping
  : showcaseMode
    ? showcaseMaterialLibraryGrouping
    : materialLibraryGrouping;

// --- 宿主托管物料包（ADR-0029 演示）---
// 宿主加载并审核独立物料模块后，显式 define() 并一次性构建只含该包的 catalog。
const hostedDefinitions = hostedMaterialPackage.define();
if (!hostedDefinitions.ok) {
  throw new Error('Base Screen browser harness failed to register its hosted material package.');
}
const hostedEntries = hostedDefinitions.value;
const inspectorDemoDefinitions = harnessInspectorDemoMaterialPackage.define();
if (!inspectorDemoDefinitions.ok) {
  throw new Error('Base Screen browser harness failed to register its inspector control fixture.');
}
const hostedCatalog = createBaseScreenMaterialCatalog(hostedEntries);
const hostedDatasetRankingEntry = hostedEntries.find(
  (entry) => entry.manifest.type === hostedDatasetRankingManifest.type,
);
if (hostedDatasetRankingEntry === undefined) {
  throw new Error('Base Screen browser harness is missing its dataset material best practice.');
}
// 插件声明的物料必须并入设计器目录才会真正渲染：manager 的 preflight 已把插件的
// material 贡献按宿主 registry 解析成 catalog entry。快照同时含宿主自营物料
// （standaloneMaterialTagNames），它们在下面已由 catalog/bridgeCatalog 声明，
// 故只取尚未出现的类型，避免 catalog 的唯一性校验冲突。
const declaredMaterialTypes = new Set(bridgeCatalog.list().map((entry) => entry.manifest.type));
const pluginMaterials = (pluginManager.snapshot?.materials.list() ?? []).filter(
  (entry) => !declaredMaterialTypes.has(entry.manifest.type),
);
const designerCatalog = createBaseScreenMaterialCatalog([
  ...bridgeCatalog.list(),
  ...pluginMaterials,
  hostedDatasetRankingEntry,
  inspectorDemoDefinitions.value[0]!,
]);
const draftDefinitions = draftMaterialPackage.define();
if (!draftDefinitions.ok) {
  throw new Error('Base Screen browser harness failed to register its draft material package.');
}
const draftEntries = draftDefinitions.value;
const draftCatalog = createBaseScreenMaterialCatalog(draftEntries);
const combinedDraftCatalog = createBaseScreenMaterialCatalog([...hostedEntries, ...draftEntries]);

/**
 * 范式组件展示：1920×1080 画布上摆出项目自带的原子物料（ADR-0099/0102），按物料 manifest 的
 * 默认属性、默认样式与默认数据生成，和从物料库拖进来的结果一致。左上角原有演示组件保持原位
 * （蓝图、变量与断言都按 id 引用它们），展示组件铺在右上、中部与下方。
 */
type ShowcaseSlot = readonly [
  id: string,
  type: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
];
const SHOWCASE_SLOTS: readonly ShowcaseSlot[] = [
  // 左上：文本、图片与其余图表
  ['showcase-title', 'base.text', '标题', 80, 26, 640, 44],
  ['showcase-image', 'base.image', '图片', 80, 96, 260, 240],
  ['showcase-chart-scatter', 'plugin.chart.scatter', '散点图', 356, 96, 282, 240],
  ['showcase-chart-heatmap', 'plugin.chart.heatmap', '热力图', 654, 96, 282, 240],
  ['showcase-chart-base', 'base.chart', '图表', 80, 356, 420, 184],
  ['showcase-echarts', 'plugin.echarts', 'ECharts 图表', 516, 356, 420, 184],
  // 右上：指标与装饰
  ['showcase-board-title', 'board.title-decor', '标题装饰', 960, 36, 400, 32],
  ['showcase-tabs', 'board.tabs', '标签页', 1400, 28, 480, 40],
  ['showcase-board-rule', 'base.rule', '分割线', 80, 76, 1800, 2],
  ['showcase-digital-flop', 'board.digital-flop', '数字翻牌器', 960, 96, 320, 120],
  ['showcase-status-grid', 'board.status-grid', '状态灯阵', 1300, 96, 340, 84],
  ['showcase-water-level', 'board.water-level', '水位图', 1680, 96, 200, 240],
  ['showcase-status-legend', 'board.status-legend', '状态分布', 1300, 192, 340, 48],
  ['showcase-capsule-progress', 'board.capsule-progress', '胶囊进度', 960, 236, 680, 34],
  ['showcase-scroll-board', 'board.scroll-board', '轮播列表', 960, 290, 420, 250],
  ['showcase-border-box', 'board.border-box', '装饰边框', 1400, 356, 480, 184],
  ['showcase-rectangle', 'base.rectangle', '矩形', 1440, 396, 180, 104],
  ['showcase-ellipse', 'base.ellipse', '椭圆', 1660, 396, 180, 104],
  // 中部：滚动字幕
  ['showcase-marquee', 'board.marquee', '滚动字幕', 80, 576, 1800, 40],
  // 下方：产线、表格与图表
  ['showcase-pipeline', 'board.pipeline', '产线工序链', 80, 640, 604, 200],
  ['showcase-table', 'base.table', '表格', 80, 856, 604, 184],
  ['showcase-chart-bar', 'plugin.chart.bar', '柱状图', 704, 640, 282, 192],
  ['showcase-chart-line', 'plugin.chart.line', '折线图', 1002, 640, 282, 192],
  ['showcase-chart-area', 'plugin.chart.area', '面积图', 1300, 640, 282, 192],
  ['showcase-chart-hbar', 'plugin.chart.hbar', '条形图', 1598, 640, 282, 192],
  ['showcase-chart-pie', 'plugin.chart.pie', '饼图', 704, 848, 282, 192],
  ['showcase-chart-donut', 'plugin.chart.donut', '环形图', 1002, 848, 282, 192],
  ['showcase-chart-gauge', 'plugin.chart.gauge', '仪表盘', 1300, 848, 282, 192],
  ['showcase-chart-radar', 'plugin.chart.radar', '雷达图', 1598, 848, 282, 192],
];
/** 只有标题文案和图片地址需要覆盖默认数据，其余组件一律用物料自带的示例数据。 */
const SHOWCASE_STATIC_VALUES: Readonly<Record<string, ScreenJsonValue>> = {
  'showcase-title': '范式组件 · 1920 × 1080',
  'showcase-image': '/cover.svg',
};
const SHOWCASE_STYLE_OVERRIDES: Readonly<Record<string, ScreenJsonObject>> = {
  'showcase-title': { color: '#e9f2ff', fontSize: 30, fontWeight: '700' },
};
interface HarnessComponentOptions {
  readonly value?: ScreenJsonValue;
  readonly style?: ScreenJsonObject;
  readonly props?: ScreenJsonObject;
  /** 所在从画布（ADR-0109）；省略即主画布。 */
  readonly canvasId?: string;
}

/** 按物料 manifest 的默认属性、样式与示例数据生成组件，和从物料库拖进来的结果一致。 */
function createHarnessMaterialComponent(
  [id, type, name, x, y, width, height]: ShowcaseSlot,
  zIndex: number,
  options: HarnessComponentOptions = {},
): ScreenComponentNode {
  const manifest = designerCatalog.list().find((entry) => entry.manifest.type === type)?.manifest;
  if (manifest === undefined) {
    throw new Error(`Browser harness showcase material is not catalogued: ${type}`);
  }
  return {
    id,
    type,
    name,
    parentId: null,
    ...(options.canvasId === undefined ? {} : { canvasId: options.canvasId }),
    position: { x, y },
    size: { width, height },
    rotation: 0,
    zIndex,
    status: { locked: false, hidden: false },
    props: { ...structuredClone(manifest.defaultProps), ...options.props },
    style: {
      ...structuredClone(resolveBaseScreenMaterialDefaultStyle(manifest, undefined)),
      ...options.style,
    },
    dataSource:
      manifest.defaultData === undefined
        ? null
        : {
            type: 'static' as const,
            value: structuredClone(options.value ?? manifest.defaultData),
            ...(manifest.staticData?.kind === 'tabular'
              ? { binding: structuredClone(manifest.staticData.defaultBinding) }
              : {}),
          },
  };
}

const showcaseComponents: ScreenComponentNode[] = SHOWCASE_SLOTS.map((slot, index) => {
  const value = SHOWCASE_STATIC_VALUES[slot[0]];
  const style = SHOWCASE_STYLE_OVERRIDES[slot[0]];
  return createHarnessMaterialComponent(slot, 20 + index, {
    ...(value === undefined ? {} : { value }),
    ...(style === undefined ? {} : { style }),
  });
});

/**
 * 标签页切换画布示例（`?tabs-demo`，ADR-0109）：主画布放标题与「标签页」，三个页面各放一组组件。
 * 蓝图把标签页的 `tabChange` 按 `value` 分三路判断，命中的一路打开对应页面；切页由运行时完成
 * （关闭弹框 → 旧页 closed → 新页 opened → page-changed）。标签值就是页面 id，便于对照。
 */
const TABS_DEMO_PAGES = [
  { id: 'overview', name: '总览' },
  { id: 'security', name: '安防' },
  { id: 'energy', name: '能耗' },
] as const;
const TABS_DEMO_TAB_ROWS = TABS_DEMO_PAGES.map((page) => ({ label: page.name, value: page.id }));
const tabsDemoComponents: ScreenComponentNode[] = [
  createHarnessMaterialComponent(['tabs-demo-title', 'base.text', '标题', 80, 34, 640, 48], 1, {
    value: '园区运营中心',
    style: { color: '#e9f2ff', fontSize: 34, fontWeight: '700' },
  }),
  createHarnessMaterialComponent(
    ['tabs-demo-tabs', 'board.tabs', '页面标签', 1260, 38, 580, 44],
    2,
    {
      value: {
        fields: [
          { id: 'label', label: '标签', valueType: 'string', nullable: false },
          { id: 'value', label: '值', valueType: 'string', nullable: false },
        ],
        rows: TABS_DEMO_TAB_ROWS,
      },
      style: { fontSize: 18 },
    },
  ),
  createHarnessMaterialComponent(['tabs-demo-rule', 'base.rule', '分割线', 80, 104, 1760, 2], 3),
  // 总览
  createHarnessMaterialComponent(
    ['overview-flop', 'board.digital-flop', '今日产值', 80, 150, 420, 140],
    10,
    { canvasId: 'overview' },
  ),
  createHarnessMaterialComponent(
    ['overview-progress', 'board.capsule-progress', '目标完成', 80, 320, 420, 34],
    11,
    { canvasId: 'overview' },
  ),
  createHarnessMaterialComponent(
    ['overview-bar', 'plugin.chart.bar', '区域产值', 540, 150, 640, 420],
    12,
    { canvasId: 'overview' },
  ),
  createHarnessMaterialComponent(
    ['overview-board', 'board.scroll-board', '区域排行', 1220, 150, 620, 420],
    13,
    { canvasId: 'overview' },
  ),
  createHarnessMaterialComponent(
    ['overview-line', 'plugin.chart.line', '产值趋势', 80, 610, 1760, 420],
    14,
    { canvasId: 'overview' },
  ),
  // 安防
  createHarnessMaterialComponent(
    ['security-grid', 'board.status-grid', '摄像头状态', 80, 150, 860, 260],
    10,
    { canvasId: 'security' },
  ),
  createHarnessMaterialComponent(
    ['security-legend', 'board.status-legend', '状态分布', 80, 430, 860, 56],
    11,
    { canvasId: 'security' },
  ),
  createHarnessMaterialComponent(
    ['security-board', 'board.scroll-board', '告警列表', 980, 150, 860, 400],
    12,
    { canvasId: 'security' },
  ),
  createHarnessMaterialComponent(
    ['security-pie', 'plugin.chart.pie', '告警类型', 80, 610, 860, 420],
    13,
    { canvasId: 'security' },
  ),
  createHarnessMaterialComponent(
    ['security-hbar', 'plugin.chart.hbar', '区域告警', 980, 610, 860, 420],
    14,
    { canvasId: 'security' },
  ),
  // 能耗
  createHarnessMaterialComponent(
    ['energy-water', 'board.water-level', '储能水位', 80, 150, 320, 360],
    10,
    { canvasId: 'energy' },
  ),
  createHarnessMaterialComponent(
    ['energy-gauge', 'plugin.chart.gauge', '实时负荷', 440, 150, 420, 360],
    11,
    { canvasId: 'energy' },
  ),
  createHarnessMaterialComponent(
    ['energy-area', 'plugin.chart.area', '用电趋势', 900, 150, 940, 360],
    12,
    { canvasId: 'energy' },
  ),
  createHarnessMaterialComponent(
    ['energy-pipeline', 'board.pipeline', '供能链路', 80, 560, 860, 240],
    13,
    { canvasId: 'energy' },
  ),
  createHarnessMaterialComponent(
    ['energy-radar', 'plugin.chart.radar', '能效评估', 980, 560, 860, 470],
    14,
    { canvasId: 'energy' },
  ),
];
const tabsDemoDocument = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#0b1220' },
  components: tabsDemoComponents,
  subCanvases: TABS_DEMO_PAGES.map((page) => ({ ...page, display: 'page' as const })),
  startCanvasId: 'overview',
  variables: [],
  blueprint: {
    nodes: [
      { kind: 'component' as const, id: 'component:tabs-demo-tabs', componentId: 'tabs-demo-tabs' },
      ...TABS_DEMO_PAGES.flatMap((page) => [
        {
          kind: 'condition' as const,
          id: `condition-${page.id}`,
          name: `选中${page.name}`,
          condition: {
            left: { kind: 'event-payload' as const, path: ['value'] },
            operator: 'eq' as const,
            right: { kind: 'literal' as const, value: page.id },
          },
        },
        { kind: 'sub-canvas' as const, id: `canvas:${page.id}`, canvasId: page.id },
      ]),
    ],
    edges: TABS_DEMO_PAGES.flatMap((page) => [
      {
        kind: 'flow' as const,
        id: `edge-judge-${page.id}`,
        from: { node: 'component:tabs-demo-tabs', port: 'event:tabChange' },
        to: { node: `condition-${page.id}`, port: 'judge' },
      },
      {
        kind: 'flow' as const,
        id: `edge-open-${page.id}`,
        from: { node: `condition-${page.id}`, port: 'yes' },
        to: { node: `canvas:${page.id}`, port: 'open' },
      },
    ]),
    layout: {
      nodes: [
        { id: 'component:tabs-demo-tabs', x: 80, y: 220 },
        ...TABS_DEMO_PAGES.flatMap((page, index) => [
          { id: `condition-${page.id}`, x: 360, y: 80 + index * 180 },
          { id: `canvas:${page.id}`, x: 640, y: 80 + index * 180 },
        ]),
      ],
    },
  },
};

const screenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
  components: [
    {
      id: 'title',
      type: 'base.text',
      name: '标题',
      parentId: null,
      position: { x: 80, y: 80 },
      size: { width: 500, height: 72 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#e9f2ff', fontSize: 42, fontWeight: '700', textAlign: 'left' },
      dataSource: { type: 'static' as const, value: 'Base Screen 设计器' },
    },
    {
      id: 'subtitle',
      type: 'base.text',
      name: '副标题',
      parentId: null,
      position: { x: 84, y: 172 },
      size: { width: 430, height: 48 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#9fb1c9', fontSize: 20, fontWeight: '400', textAlign: 'left' },
      dataSource: {
        type: 'variable' as const,
        variableId: 'browser-url-query-campaign',
      },
    },
    {
      id: 'host-data',
      type: 'base.text',
      name: '宿主数据',
      parentId: null,
      position: { x: 84, y: 236 },
      size: { width: 430, height: 32 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#39c5bb', fontSize: 16, fontWeight: '400', textAlign: 'left' },
      dataSource: {
        type: 'variable' as const,
        variableId: 'browser-data-source-region',
      },
    },
    {
      // 组件状态演示（ADR-0110）：宿主指标 >100 时切到「预警」状态（变红加粗），回落自动恢复默认。
      id: 'metric-warning',
      type: 'base.text',
      name: '指标预警',
      parentId: null,
      position: { x: 560, y: 236 },
      size: { width: 340, height: 48 },
      rotation: 0,
      zIndex: 7,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#9fb1c9', fontSize: 28, fontWeight: '400', textAlign: 'left' },
      states: {
        items: [{ id: 'over-100', name: '预警', style: { color: '#ff4d4f', fontWeight: '700' } }],
        judge: {
          input: { kind: 'component-data' as const, path: [] },
          cases: [{ operator: 'gt' as const, value: 100, stateId: 'over-100' }],
        },
      },
      dataSource: {
        type: 'variable' as const,
        variableId: 'metric-value',
      },
    },
    {
      id: 'react-bridge',
      type: reactBridge.value.manifest.type,
      name: 'React 桥接',
      parentId: null,
      position: { x: 84, y: 300 },
      size: { width: 200, height: 36 },
      rotation: 0,
      zIndex: 4,
      status: { locked: false, hidden: false },
      props: { label: 'React 桥接' },
      style: {},
      dataSource: null,
    },
    {
      id: 'vue-bridge',
      type: vueBridge.value.manifest.type,
      name: 'Vue 桥接',
      parentId: null,
      position: { x: 84, y: 348 },
      size: { width: 200, height: 36 },
      rotation: 0,
      zIndex: 5,
      status: { locked: false, hidden: false },
      props: { label: 'Vue 桥接' },
      style: {},
      dataSource: null,
    },
    {
      id: 'semantic-chart-demo',
      type: HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST.type,
      name: '语义图表',
      parentId: null,
      position: { x: 560, y: 320 },
      size: { width: 340, height: 220 },
      rotation: 0,
      zIndex: 6,
      status: { locked: false, hidden: false },
      props: structuredClone(HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST.defaultProps),
      style: structuredClone(HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST.defaultStyle),
      dataSource: {
        type: 'dataset' as const,
        datasetId: 'tabular-orders',
        params: {
          limit: { kind: 'literal' as const, value: 2 },
          region: { kind: 'variable' as const, variableId: 'region' },
        },
        binding: { fields: { dimension: ['category'], measures: ['amount'] } },
      },
    },
    {
      id: 'dataset-ranking-demo',
      type: hostedDatasetRankingManifest.type,
      name: '数据集排行卡',
      parentId: null,
      position: { x: 84, y: 390 },
      size: { width: 420, height: 140 },
      rotation: 0,
      zIndex: 9,
      status: { locked: false, hidden: false },
      props: structuredClone(hostedDatasetRankingManifest.defaultProps),
      style: structuredClone(hostedDatasetRankingManifest.defaultStyle),
      dataSource: {
        type: 'dataset' as const,
        datasetId: 'tabular-orders',
        params: {
          limit: { kind: 'literal' as const, value: 5 },
          region: { kind: 'variable' as const, variableId: 'region' },
        },
        binding: { fields: { dimension: ['category'], measures: ['amount'] } },
      },
    },
  ],
  variables: [
    { type: 'static' as const, id: 'count', name: 'count', initialValue: 0 },
    { type: 'static' as const, id: 'region', name: 'region', initialValue: 'north' },
    { type: 'static' as const, id: 'metric-value', name: 'metricValue', initialValue: 42 },
    {
      type: 'data-source' as const,
      id: 'browser-data-source-region',
      name: 'dataSourceRegion',
      description: 'Browser Harness 数据源变量案例',
      initialValue: 'fallback-region',
      sourceId: 'browser-region',
      controlled: false,
    },
    {
      type: 'url-query' as const,
      id: 'browser-url-query-campaign',
      name: 'urlCampaign',
      description: 'Browser Harness URL 查询参数变量案例',
      initialValue: 'organic',
      sourceId: 'campaign',
      controlled: false,
    },
    // 组合路径模板：计时器触发与推送数据都写这个变量，
    // 蓝图规则 `variable-trigger-demo` 监听它的 data-updated。值本身没有语义，
    // 它只是"宿主自有触发源 → 变量 → 蓝图"这条链路的观察点。
    { type: 'static' as const, id: 'harness-tick', name: 'harnessTick', initialValue: 0 },
    // 组合路径模板：用户可编写过滤器。文档只存宿主资产标识 `scriptId`，脚本正文留在
    // 宿主侧；`processorId` 让宿主在解析这个变量时把上游值路由到自己的脚本处理器。
    {
      type: 'data-source' as const,
      id: 'harness-script-filter',
      name: 'scriptFilter',
      description: 'Browser Harness 宿主脚本过滤器组合路径',
      initialValue: null,
      sourceId: 'harness-script-source',
      processorId: BOARD_COMPOSITION_SCRIPT_PROCESSOR_ID,
      controlled: false,
    },
  ],
  blueprint: {
    nodes: [
      { kind: 'component' as const, id: 'component:title', componentId: 'title' },
      { kind: 'component' as const, id: 'component:subtitle', componentId: 'subtitle' },
      { kind: 'variable' as const, id: 'variable:harness-tick', variableId: 'harness-tick' },
      { kind: 'host' as const, id: 'host' },
    ],
    edges: [
      {
        kind: 'flow' as const,
        id: 'title-click',
        from: { node: 'component:title', port: 'event:valueClick' },
        to: { node: 'host', port: 'event:titleClick' },
        payload: { kind: 'literal' as const, value: { source: 'harness' } },
      },
      {
        // ADR-0076：引用插件声明的宿主动作。已声明即走宿主动作端口，未声明会被 manager
        // 失败关闭；这条连线同时是端到端断言的入口（点标题 → 动作执行）。
        kind: 'flow' as const,
        id: 'plugin-action-demo',
        from: { node: 'component:subtitle', port: 'event:valueClick' },
        to: { node: 'host', port: `action:${PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID}` },
        payload: {
          kind: 'object' as const,
          properties: {
            color: { kind: 'literal' as const, value: '#ffa940' },
            strokeWidth: { kind: 'literal' as const, value: 3 },
          },
        },
      },
      {
        // 组合路径模板·计时器触发：宿主定时器/推送写变量 → 变量值更新锚点 → 插件动作。
        // `harnessTick` 初值 0 时连线也会触发一次，因此断言观察的是动作事件次数在启动
        // 定时器之后的增量。
        kind: 'flow' as const,
        id: 'variable-trigger-demo',
        from: { node: 'variable:harness-tick', port: 'data-updated' },
        to: { node: 'host', port: `action:${PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID}` },
        payload: {
          kind: 'object' as const,
          properties: {
            color: { kind: 'literal' as const, value: '#39c5bb' },
            strokeWidth: { kind: 'literal' as const, value: 1 },
          },
        },
      },
    ],
  },
};

const designer = document.querySelector('base-screen-designer')!;
const viewer = document.querySelector('base-screen-viewer')!;
const blueprintCanvas = designer.querySelector<HTMLElement>('[data-harness-blueprint-canvas]')!;
const blueprintGraph = blueprintCanvas.querySelector<HTMLElement>(
  '[data-harness-blueprint-graph]',
)!;
// 默认走引擎内置蓝图画布；Playwright 宿主画布断言显式带 ?hostCanvas 保留 harness 画布。
if (!new URL(location.href).searchParams.has('hostCanvas')) blueprintCanvas.remove();
let blueprintCanvasState: BaseScreenBlueprintCanvasState | undefined;
let blueprintCommandSequence = 0;
let readyBlueprintGeneration = -1;

type BlueprintCanvasCommandInput = BaseScreenBlueprintCanvasCommand extends infer Command
  ? Command extends BaseScreenBlueprintCanvasCommand
    ? Omit<Command, 'commandId' | 'generation' | 'documentRevision'>
    : never
  : never;

function renderBlueprintCanvasState(state: BaseScreenBlueprintCanvasState): void {
  blueprintCanvas.dataset.active = String(state.active);
  const heading = document.createElement('strong');
  heading.textContent = `${state.graph.nodes.length} 个节点 · ${state.graph.edges.length} 条连线`;
  const detail = document.createElement('span');
  detail.textContent = `generation ${state.generation} · revision ${state.documentRevision}`;
  const selection = document.createElement('span');
  const picked = [...state.selection.nodes, ...state.selection.edges];
  selection.textContent = picked.length === 0 ? '未选择图元素' : `已选择 ${picked.join(', ')}`;
  blueprintGraph.replaceChildren(heading, detail, selection);
}

blueprintCanvas.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, (event) => {
  const state = (event as CustomEvent<BaseScreenBlueprintCanvasStateEventDetail>).detail.state;
  blueprintCanvasState = state;
  renderBlueprintCanvasState(state);
  if (readyBlueprintGeneration !== state.generation) {
    readyBlueprintGeneration = state.generation;
    sendBlueprintCanvasCommand({ type: 'ready' });
  }
});

function sendBlueprintCanvasCommand(
  input: BlueprintCanvasCommandInput,
  commandId = `harness-${++blueprintCommandSequence}`,
): boolean {
  const state = blueprintCanvasState;
  if (state === undefined) return false;
  const command = {
    ...input,
    commandId,
    generation: state.generation,
    documentRevision: state.documentRevision,
  } as BaseScreenBlueprintCanvasCommand;
  blueprintCanvas.dispatchEvent(
    new CustomEvent<BaseScreenBlueprintCanvasCommandEventDetail>(
      BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
      { bubbles: true, composed: true, detail: { command } },
    ),
  );
  return true;
}
const hostEvents: unknown[] = [];
// 设计态「事件」开关开启后，画布内组件原生事件转发到宿主的日志（与 Viewer 事件同形）。
const designerNativeEvents: unknown[] = [];
designer.addEventListener('base-screen-material-event', (event) => {
  designerNativeEvents.push((event as CustomEvent).detail);
});
let datasetVersion = 0;
let datasetRegion = 'north';
let datasetDelay = false;
let metricValue = 42;
// 组合路径模板的宿主侧状态：脚本资产标识、处理器参数与上游数据都由宿主掌握，
// 文档只存一个不透明的 processorId。
let harnessScriptId = 'overThreshold';
let harnessScriptOptions: ScreenJsonObject = { field: 'amount', threshold: 800 };
let harnessScriptRows: ScreenJsonValue = [
  { name: '上海', amount: 982 },
  { name: '深圳', amount: 871 },
  { name: '北京', amount: 763 },
];
// 组合路径模板的调度句柄：定时器只在断言启动后运行，避免常驻后台任务干扰其它断言。
let hostVariableTimer: ReturnType<typeof startHostVariableTimer> | undefined;
let hostVariableWrites: Array<{ readonly variableId: string; readonly value: ScreenJsonValue }> =
  [];
const datasetRequests: unknown[] = [];
const variableRequests: Array<{
  readonly variableId: string;
  readonly sourceId: string;
  readonly sourceType: 'data-source' | 'url-query';
  readonly purpose: string;
}> = [];
const resourcePort = {
  async resolve({
    resourceType,
    resourceId,
  }: {
    readonly resourceType: string;
    readonly resourceId: string;
  }) {
    if (resourceType === 'host_image' && resourceId === 'harness-image-asset') {
      return { ok: true as const, value: '/cover.svg', diagnostics: [] };
    }
    return { ok: true as const, value: { records: 5 }, diagnostics: [] };
  },
};
const datasetPort = {
  queryScope: 'dataset' as const,
  async groups() {
    return {
      ok: true as const,
      value: [
        { id: 'system', name: '系统数据' },
        { id: 'external', name: '外部数据' },
      ],
      diagnostics: [],
    };
  },
  async list() {
    return {
      ok: true as const,
      value: {
        items: [
          {
            datasetId: 'tabular-orders',
            name: '订单数据集',
            description: '用于浏览器验证的表格与图表数据。',
            groupId: 'system',
          },
        ],
      },
      diagnostics: [],
    };
  },
  async describe({ datasetId }: { readonly datasetId: string }) {
    if (datasetId === 'auto-text-data') {
      return {
        ok: true as const,
        value: {
          datasetId,
          name: '自适应文本',
          description: null,
          groupId: 'system',
          fields: [{ id: 'value', label: '文本', valueType: 'string' as const }],
          parameters: [],
        },
        diagnostics: [],
      };
    }
    if (datasetId === 'metric-value') {
      return {
        ok: true as const,
        value: {
          datasetId,
          name: '指标值',
          description: null,
          groupId: 'system',
          fields: [{ id: 'value', label: '指标值', valueType: 'number' as const }],
          parameters: [],
        },
        diagnostics: [],
      };
    }
    return {
      ok: true as const,
      value: {
        datasetId: 'tabular-orders',
        name: '订单数据集',
        description: '用于浏览器验证的表格与图表数据。',
        groupId: 'system',
        fields: [
          { id: 'category', label: '分类', valueType: 'string' as const },
          { id: 'amount', label: '金额', valueType: 'number' as const },
        ],
        parameters: [
          {
            name: 'limit',
            label: '行数',
            valueType: 'number' as const,
            required: false,
            minimum: 1,
            maximum: 100,
            defaultValue: 2,
          },
          {
            name: 'region',
            label: '区域',
            valueType: 'string' as const,
            required: false,
          },
          {
            name: 'rangeStart',
            label: '起始日期',
            valueType: 'date' as const,
            required: false,
            defaultValue: '2026-10-01',
          },
        ],
      },
      diagnostics: [],
    };
  },
  async query(request: {
    readonly componentId: string;
    readonly datasetId: string;
    readonly params: Readonly<Record<string, unknown>>;
  }) {
    datasetRequests.push(request);
    if (request.datasetId === 'auto-text-data') {
      return {
        ok: true as const,
        value: {
          fields: [{ id: 'value', label: '文本', valueType: 'string' as const }],
          rows: [{ value: window.autoWidthResourceValue ?? '' }],
        },
        diagnostics: [],
      };
    }
    if (request.datasetId === 'metric-value') {
      return {
        ok: true as const,
        value: {
          fields: [{ id: 'value', label: '指标值', valueType: 'number' as const }],
          rows: [{ value: metricValue }],
        },
        diagnostics: [],
      };
    }
    if (request.datasetId === 'tabular-orders') {
      if (datasetDelay) await new Promise((resolve) => setTimeout(resolve, 500));
      if (request.params.region === 'error') {
        return {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'HOST_RESOURCE_FAILED' as const,
              path: [],
              message: 'Harness dataset failure.',
            },
          ],
        };
      }
      return {
        ok: true as const,
        value: {
          fields: [
            { id: 'category', label: '分类', valueType: 'string' as const },
            { id: 'amount', label: '金额', valueType: 'number' as const },
          ],
          rows: [
            { category: 'A', amount: datasetVersion + 2 },
            { category: 'B', amount: datasetVersion + 4 },
          ],
        },
        diagnostics: [],
      };
    }
    return {
      ok: false as const,
      diagnostics: [
        {
          severity: 'error' as const,
          code: 'HOST_RESOURCE_UNAVAILABLE' as const,
          path: [],
          message: 'Harness dataset is unavailable.',
        },
      ],
    };
  },
};
/** 宿主自己知道哪些 sourceId 属于 URL 查询来源：合并端口后 Engine 不再传枚举。 */
function harnessSourceType(sourceId: string): 'data-source' | 'url-query' {
  return sourceId === 'campaign' ? 'url-query' : 'data-source';
}

const hostCatalogPort = {
  async resolve(request: {
    readonly sourceId: string;
    readonly params: Readonly<Record<string, unknown>>;
    readonly purpose: 'runtime' | 'authoring-preview';
  }) {
    variableRequests.push({
      sourceId: request.sourceId,
      sourceType: harnessSourceType(request.sourceId),
      purpose: request.purpose,
    });
    // 组合路径模板·脚本过滤器：宿主脚本过滤器。
    //
    // 顺序就是宿主该有的顺序：**先取到原始值，再交给处理器**。脚本资产与参数都留在宿主侧，
    // 因此宿主按自己的 `sourceId` 命名空间决定要不要路由到脚本处理器（Engine 不再传
    // `processorId` 这类文档内标识）。
    if (request.sourceId === 'harness-script-source') {
      return applyHostScriptFilter(pluginManager, {
        scriptId: harnessScriptId,
        value: harnessScriptRows,
        options: harnessScriptOptions,
      });
    }
    if (harnessSourceType(request.sourceId) === 'url-query') {
      return {
        ok: true as const,
        value: new URLSearchParams(window.location.search).get(request.sourceId) ?? 'organic',
        diagnostics: [],
      };
    }
    if (request.sourceId === 'browser-region') {
      return { ok: true as const, value: 'north', diagnostics: [] };
    }
    if (request.sourceId === 'private-token' && request.purpose === 'authoring-preview') {
      return {
        ok: false as const,
        diagnostics: [
          {
            severity: 'error' as const,
            code: 'HOST_VARIABLE_CATALOG_FAILED' as const,
            path: [],
            message: 'secret-value-should-never-render',
          },
        ],
      };
    }
    if (request.sourceId === 'tenant-region' && datasetRegion === 'variable-error') {
      return {
        ok: false as const,
        diagnostics: [
          {
            severity: 'error' as const,
            code: 'HOST_VARIABLE_CATALOG_FAILED' as const,
            path: [],
            message: 'Harness variable resolution failed.',
          },
        ],
      };
    }
    return { ok: true as const, value: datasetRegion, diagnostics: [] };
  },
};
const hostCatalogEntries = [
  {
    sourceId: 'browser-region',
    name: 'dataSourceRegion',
    description: 'Browser Harness 数据源变量案例',
  },
  {
    sourceId: 'tenant-region',
    name: 'tenantRegion',
    description: '当前租户区域',
  },
  {
    sourceId: 'private-token',
    name: 'privateToken',
    description: '无权预览的敏感变量',
  },
  {
    sourceId: 'campaign',
    name: 'urlCampaign',
    description: 'Browser Harness URL 查询参数变量案例',
  },
];

const hostCatalog = {
  async list({ query }: { readonly query: string }) {
    const normalized = query.trim().toLocaleLowerCase();
    const items = hostCatalogEntries.filter((item) =>
      [item.sourceId, item.name, item.description].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
    return { ok: true as const, value: { items }, diagnostics: [] };
  },
  async describe({ sourceId }: { readonly sourceId: string }) {
    const entry = hostCatalogEntries.find((item) => item.sourceId === sourceId);
    return entry === undefined
      ? {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'HOST_VARIABLE_CATALOG_FAILED' as const,
              path: [],
              message: 'Harness catalog descriptor was not found.',
            },
          ],
        }
      : {
          ok: true as const,
          value: { ...entry, parameters: [], previewable: true },
          diagnostics: [],
        };
  },
  resolve: hostCatalogPort.resolve,
};
designer.resourcePort = resourcePort;
designer.hostCatalogPort = hostCatalog;
designer.datasetPort = datasetPort;
designer.runtimeContributions = pluginManager.snapshot.contributions;
// ADR-0076：宿主把蓝图宿主动作接到 manager 的插件动作路由。designerHostAdapter 是**聚合**
// 端口，赋值时会用它自己的字段重写各单项端口，因此这里把宿主已有的端口对象原样透传，
// 否则会把上面刚设好的 resourcePort/hostCatalogPort/datasetPort 一并清空。
const pluginActionRequests: Array<{ readonly actionId: string; readonly payload: unknown }> = [];
designer.designerHostAdapter = {
  capabilities: {
    projectCatalog: false,
    projectPreview: false,
    projectSnapshots: false,
    resources: true,
    datasets: true,
    hostCatalog: true,
    actions: true,
  },
  resources: resourcePort,
  datasets: datasetPort,
  hostCatalog,
  actions: {
    async execute(action) {
      // Engine 只做「已声明」门禁后把请求抛给宿主；宿主再路由到 manager 的插件动作路由。
      // 未声明的 actionId 由 manager 失败关闭，不会静默成功。
      //
      // 这两个端口的字段名不同，必须显式映射：宿主动作端口给的是 `{ name, payload }`
      // （name 就是文档里的 `host-action.actionId`），而 manager 要的是 `{ actionId, payload }`。
      // 直接把整个 action 透传会让 actionId 变成 undefined，于是每次蓝图动作都在 manager
      // 那一层按"未声明"失败关闭，而宿主这一侧毫无察觉——动作看起来配好了，却从不执行。
      pluginActionRequests.push({ actionId: action.name, payload: action.payload });
      await pluginManager.executeBlueprintAction({
        actionId: action.name,
        payload: action.payload as never,
      });
    },
  },
};
designer.catalog = showcaseMode
  ? createBaseScreenMaterialCatalog(
      designerCatalog.list().filter((entry) => !isHarnessFixtureMaterialType(entry.manifest.type)),
    )
  : designerCatalog;
designer.materialLibraryGrouping = activeMaterialLibraryGrouping;
// 「部分加载失败 / 草稿 / 不可用」是验证物料库状态条的样例数据，展示页不带。
if (!showcaseMode) {
  designer.materialLibraryState = {
    status: 'partial',
    failedCount: 1,
    draftTypes: ['harness.semantic-chart'],
    unavailableTypes: ['base.table'],
  };
}
const materialLibraryActions: string[] = [];
designer.addEventListener(BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT, (event) => {
  materialLibraryActions.push((event as CustomEvent<{ action: string }>).detail.action);
});
if (pluginManager.snapshot !== undefined) {
  designer.pluginCatalog = pluginManager.snapshot.plugins;
  designer.pluginPanels = pluginManager.snapshot.panels;
  designer.inspectorControls = pluginManager.snapshot.inspectorControls;
  designer.pluginCommandPort = createBaseScreenPluginContributionCommandPort(pluginManager);
}
designer.toolMaterialTypes = {
  text: 'base.text',
  rectangle: 'base.rectangle',
  ellipse: 'base.ellipse',
  image: 'base.image',
};
// 编组使用显式配置的容器物料（children=true），缺失时 Group 命令按 ADR-0012 保持禁用。
designer.groupMaterialType = 'base.container';
const viewerConfigured = viewer.configure({
  catalog: designerCatalog,
  resourcePort,
  datasetPort,
  hostCatalogPort: hostCatalog,
  runtimeContributions,
  blueprintRuntimePort: {
    emit: (event) => {
      hostEvents.push(event);
    },
  },
});
if (!viewerConfigured.ok) {
  throw new Error('Browser Harness Viewer configuration failed.');
}
/** 范式组件展示文档：只有画布与范式物料组件，不带验证用的变量、数据源与蓝图。 */
const showcaseDocument = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#17212b' },
  components: showcaseComponents,
  variables: [],
  blueprint: { nodes: [], edges: [] },
};
let envelope = {
  projectId: 'browser-harness',
  revision: '1',
  name: tabsDemoMode ? '标签页切换画布' : showcaseMode ? '范式组件展示' : '浏览器验证',
  description: null,
  document: (tabsDemoMode
    ? tabsDemoDocument
    : showcaseMode
      ? showcaseDocument
      : screenDocument) as ScreenDocument,
  metadata: {},
};
let nextSaveFailure: 'PROJECT_CONFLICT' | 'PROJECT_UNAVAILABLE' | undefined;
// 模拟保存 loading：>0 时让 save 挂起对应毫秒，用于在浏览器里观察保存按钮的 loading（spinner）状态。
let saveDelayMs = 0;
designer.projectAdapter = {
  capabilities: { publish: false },
  async load({ projectId }) {
    return projectId === envelope.projectId
      ? { ok: true as const, value: envelope, diagnostics: [] }
      : {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'ENVELOPE_INVALID' as const,
              path: ['projectId'],
              message: 'Unknown project.',
            },
          ],
        };
  },
  async save(request) {
    if (saveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
    if (nextSaveFailure !== undefined) {
      const code = nextSaveFailure;
      nextSaveFailure = undefined;
      return {
        ok: false as const,
        diagnostics: [
          { severity: 'error' as const, code, path: [], message: 'Harness project failure.' },
        ],
      };
    }
    envelope = {
      ...envelope,
      revision: String(Number(envelope.revision) + 1),
      document: request.document,
    };
    return { ok: true as const, value: envelope, diagnostics: [] };
  },
};
designer.addEventListener('base-screen-change', (event) => {
  viewer.document = (event as CustomEvent<{ document: typeof screenDocument }>).detail.document;
});
const loaded = await designer.load('browser-harness');
if (!loaded.ok) {
  throw new Error(
    `Base Screen browser harness failed to load its project: ${loaded.diagnostics
      .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
      .join(',')}`,
  );
}
designer.runtimeContributions = runtimeContributions;
viewer.document = designer.document;

// --- 宿主作者 shell（Shadow DOM 外） ---
const hostShell = document.querySelector<HTMLElement>('[data-host-shell]')!;
const hostSelection = hostShell.querySelector<HTMLElement>('[data-host-selection]')!;
const hostEditor = hostShell.querySelector<HTMLTextAreaElement>('[data-host-editor]')!;
const hostStatus = hostShell.querySelector<HTMLOutputElement>('[data-host-status]')!;
let pendingAuthoringRequest: ScreenAuthoringRequest | undefined;
let pendingHostRevision: string | null = null;

function setHostStatus(message: string, tone: 'ok' | 'error' = 'ok'): void {
  hostStatus.textContent = message;
  hostStatus.dataset.tone = tone;
}

function hostRequestForAction(action: string): boolean {
  if (action === 'blueprint') return designer.setWorkbenchMode('blueprint').ok;
  if (action === 'component-text' || action === 'component-data') {
    const target = action === 'component-text' ? 'props' : 'data';
    return designer.requestComponentTextEdit(target) !== null;
  }
  return false;
}

designer.addEventListener(SCREEN_AUTHORING_REQUEST_EVENT, (event) => {
  const request = (event as CustomEvent<{ readonly request: ScreenAuthoringRequest }>).detail
    .request;
  pendingAuthoringRequest = request;
  pendingHostRevision = request.documentRevision;
  hostEditor.value = request.source;
  setHostStatus(`宿主编辑请求：${request.componentId} 的 ${request.target}`);
});

designer.addEventListener('base-screen-selection-change', (event) => {
  const interaction = (event as CustomEvent<{ focusedComponentId: string | null }>).detail;
  const component = designer.document?.components.find(
    (item) => item.id === interaction.focusedComponentId,
  );
  hostSelection.textContent = component === undefined ? '未选择组件' : `已选择：${component.name}`;
});

hostShell.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-host-action]');
  if (button === null) return;
  const action = button.dataset.hostAction;
  if (action === 'commit') {
    if (pendingAuthoringRequest === undefined) {
      setHostStatus('没有进行中的宿主编辑请求。', 'error');
      return;
    }
    const request = pendingAuthoringRequest;
    const result = designer.commitComponentTextEdit({
      requestId: request.requestId,
      expectedRevision: pendingHostRevision,
      componentId: request.componentId,
      target: request.target as 'props' | 'style' | 'data',
      source: hostEditor.value,
    });
    if (result.ok) {
      pendingAuthoringRequest = undefined;
      setHostStatus('组件文本编辑已提交，产生一条历史记录。');
    } else {
      setHostStatus(
        `提交被拒绝：${result.diagnostics.map((item) => item.code).join(',')}`,
        'error',
      );
    }
    return;
  }
  if (action === 'cancel') {
    if (pendingAuthoringRequest !== undefined) {
      designer.cancelAuthoringEdit(pendingAuthoringRequest.requestId);
    }
    pendingAuthoringRequest = undefined;
    hostEditor.value = '';
    setHostStatus('宿主编辑已取消。');
    return;
  }
  if (hostRequestForAction(action ?? '')) {
    setHostStatus(
      action === 'blueprint' ? '已切换到蓝图工作台。' : '已发起宿主编辑请求，等待编辑器返回。',
    );
  } else {
    setHostStatus('无法发起宿主编辑请求。', 'error');
  }
});

mountFeatureCases(designer);
// 组件工坊（ADR-0105）：只在 `?workshop` 时挂载，避免固定定位按钮干扰其他断言的命中测试。
if (harnessSearch.has('workshop')) {
  const { mountHarnessComponentWorkshop } = await import('./component-workshop-host.ts');
  await mountHarnessComponentWorkshop(designer);
}

Object.assign(window, {
  baseScreenHarness: {
    catalog: designerCatalog,
    designer,
    pluginManager,
    // ADR-0076：运行期贡献的观察点。
    pluginActionRequests,
    applyPluginDataProcessor: (request) => pluginManager.applyDataProcessor(request),
    pluginPipelineSpotlightEvent: PLUGIN_PIPELINE_SPOTLIGHT_EVENT,
    pluginPipelineProcessorId: PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
    pluginPipelineActionId: PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
    // 组合路径模板的观察与驱动点。
    boardCompositionPluginId: BOARD_COMPOSITION_PLUGIN_ID,
    boardScriptProcessorId: BOARD_COMPOSITION_SCRIPT_PROCESSOR_ID,
    boardVariableWrites: hostVariableWrites,
    /** 计时器触发：宿主自建定时器 → 写变量 → 蓝图规则。只在断言调用后运行。 */
    startBoardTick: (intervalMs = 40) => {
      hostVariableTimer?.stop();
      let tick = 0;
      hostVariableTimer = startHostVariableTimer(designer, {
        variableId: 'harness-tick',
        intervalMs,
        produce: () => {
          tick += 1;
          return tick;
        },
        // 与 pushBoardVariable 记同一份观察数组：两条路径的写入次数必须在同一处可比。
        onWrite: (value) => hostVariableWrites.push({ variableId: 'harness-tick', value }),
      });
    },
    stopBoardTick: () => {
      hostVariableTimer?.stop();
      hostVariableTimer = undefined;
    },
    /** 推送数据：外部事件驱动的单次写入，与计时器共用同一条宿主写变量原语。 */
    pushBoardVariable: (value) => {
      const result = writeHostVariable(designer, 'harness-tick', value);
      if (result.ok) hostVariableWrites.push({ variableId: 'harness-tick', value });
      return result;
    },
    /** 脚本过滤器：换脚本只改宿主侧标识与参数，文档里的 processorId 不动。 */
    setBoardScript: (scriptId, options) => {
      harnessScriptId = scriptId;
      harnessScriptOptions = (options ?? {}) as ScreenJsonObject;
    },
    setBoardScriptRows: (rows) => {
      harnessScriptRows = rows as ScreenJsonValue;
    },
    viewer,
    hostEvents,
    designerNativeEvents,
    materialManifests: {
      text: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
      chart: BASE_SCREEN_CHART_MATERIAL_MANIFEST,
      semanticChart: HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST,
      table: BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
      react: reactBridge.value.manifest,
      vue: vueBridge.value.manifest,
      datasetRanking: hostedDatasetRankingManifest,
    },
    datasetPort,
    datasetRequests,
    hostCatalog,
    variableRequests,
    materialLibraryActions,
    materialLibraryGrouping: activeMaterialLibraryGrouping,
    hostShell,
    pendingAuthoringRequest: () => pendingAuthoringRequest,
    blueprintCanvas,
    blueprintCanvasState: () => blueprintCanvasState,
    sendBlueprintCanvasCommand,
    setDatasetRegion: (value: string) => {
      datasetRegion = value;
    },
    setDatasetDelay: (value: boolean) => {
      datasetDelay = value;
    },
    bumpDatasetVersion: () => {
      datasetVersion++;
    },
    setMetricValue: (value: number) => {
      metricValue = value;
      designer.getVariable('metric-value')?.set(value);
      viewer.getVariable('metric-value')?.set(value);
    },
    createDatasetDemo: () => {
      const demo = document.createElement('base-screen-viewer') as typeof viewer;
      demo.dataset.datasetDemo = 'true';
      const configured = demo.configure({
        catalog: bridgeCatalog,
        resourcePort,
        datasetPort,
        hostCatalogPort: hostCatalog,
        resourceTimeoutMs: 100,
        runtimeContributions,
      });
      if (!configured.ok) throw new Error('Dataset demo configuration failed.');
      demo.document = {
        canvas: { width: 960, height: 540, backgroundColor: '#111827' },
        components: [
          {
            id: 'table-demo',
            type: 'base.table',
            name: '表格',
            parentId: null,
            position: { x: 20, y: 20 },
            size: { width: 420, height: 260 },
            rotation: 0,
            zIndex: 0,
            status: { locked: false, hidden: false },
            props: BASE_SCREEN_TABLE_MATERIAL_MANIFEST.defaultProps,
            style: BASE_SCREEN_TABLE_MATERIAL_MANIFEST.defaultStyle,
            dataSource: {
              type: 'dataset' as const,
              datasetId: 'tabular-orders',
              params: {
                limit: { kind: 'literal' as const, value: 2 },
                region: { kind: 'variable' as const, variableId: 'region' },
              },
              binding: { fields: { columns: ['category', 'amount'] } },
            },
          },
          {
            id: 'chart-demo',
            type: 'base.chart',
            name: '图表',
            parentId: null,
            position: { x: 460, y: 20 },
            size: { width: 420, height: 260 },
            rotation: 0,
            zIndex: 1,
            status: { locked: false, hidden: false },
            props: BASE_SCREEN_CHART_MATERIAL_MANIFEST.defaultProps,
            style: BASE_SCREEN_CHART_MATERIAL_MANIFEST.defaultStyle,
            dataSource: {
              type: 'dataset' as const,
              datasetId: 'tabular-orders',
              params: {
                limit: { kind: 'literal' as const, value: 2 },
                region: { kind: 'variable' as const, variableId: 'region' },
              },
              binding: { fields: { dimension: ['category'], measures: ['amount'] } },
            },
          },
        ],
        variables: [
          {
            type: 'data-source' as const,
            id: 'region',
            name: 'region',
            initialValue: null,
            sourceId: 'region',
            controlled: true,
          },
        ],
        blueprint: { nodes: [], edges: [] },
      };
      document.body.appendChild(demo);
      return demo;
    },
    getEnvelope: () => envelope,
    hostedPackage: hostedMaterialPackage,
    hostedEntries,
    draftPackage: draftMaterialPackage,
    draftEntries,
    draftCatalog,
    combinedDraftCatalog,
    createDraftDesignerDemo: () => {
      const draftDesigner = document.createElement('base-screen-designer') as typeof designer;
      draftDesigner.catalog = combinedDraftCatalog;
      draftDesigner.document = {
        canvas: { width: 960, height: 540, backgroundColor: '#111827' },
        components: [
          {
            id: 'draft-badge',
            type: draftEntries[0]!.manifest.type,
            name: '草稿徽章',
            parentId: null,
            position: { x: 40, y: 40 },
            size: { width: 260, height: 72 },
            rotation: 0,
            zIndex: 0,
            status: { locked: false, hidden: false },
            props: draftEntries[0]!.manifest.defaultProps,
            style: draftEntries[0]!.manifest.defaultStyle,
            dataSource: { type: 'static' as const, value: '草稿数据' },
          },
        ],
        variables: [],
        blueprint: { nodes: [], edges: [] },
      };
      document.body.appendChild(draftDesigner);
      return draftDesigner;
    },
    publishDraftPreflight: (draftDocument: { components?: Array<{ type?: string }> }) => {
      const draftTypes = new Set(draftEntries.map((entry) => entry.manifest.type));
      const blocked = (draftDocument.components ?? []).some((component) =>
        draftTypes.has(component.type ?? ''),
      );
      return blocked ? { ok: false, code: 'HOST_SKILL_DRAFT_MATERIAL_PUBLISHED' } : { ok: true };
    },
    // ADR-0040 封面验证探针：独立 designer 实例，只含托管包目录（hosted-metric 声明 /cover.svg），
    // 不进入主 designer 的物料库与分组，避免影响既有断言与截图。
    createCoverProbeDemo: () => {
      const probe = document.createElement('base-screen-designer') as typeof designer;
      probe.dataset.coverProbe = 'true';
      probe.catalog = hostedCatalog;
      probe.document = {
        canvas: { width: 960, height: 540, backgroundColor: '#111827' },
        components: [
          {
            id: 'probe',
            type: hostedEntries[1]!.manifest.type,
            name: '封面探针',
            parentId: null,
            position: { x: 40, y: 40 },
            size: { width: 260, height: 96 },
            rotation: 0,
            zIndex: 0,
            status: { locked: false, hidden: false },
            props: hostedEntries[1]!.manifest.defaultProps,
            style: hostedEntries[1]!.manifest.defaultStyle,
            dataSource: { type: 'static' as const, value: '探针数据' },
          },
        ],
        variables: [],
        blueprint: { nodes: [], edges: [] },
      };
      // 探针必须落在受支持档位：降级档（<896 宽或 <640 高）会把整个工作台换成提示，
      // 卡片永远不可见。固定 1200×720 让封面缩略图断言与宿主视口无关。
      probe.style.width = '1200px';
      probe.style.height = '720px';
      document.body.appendChild(probe);
      return probe;
    },
    createHostedPackageDemo: () => {
      const demo = document.createElement('base-screen-viewer') as typeof viewer;
      demo.dataset.hostedPackageDemo = 'true';
      demo.catalog = hostedCatalog;
      demo.document = {
        canvas: { width: 960, height: 540, backgroundColor: '#111827' },
        components: [
          {
            id: 'hosted-badge',
            type: hostedEntries[0]!.manifest.type,
            name: '托管徽章',
            parentId: null,
            position: { x: 40, y: 40 },
            size: { width: 260, height: 72 },
            rotation: 0,
            zIndex: 0,
            status: { locked: false, hidden: false },
            props: hostedEntries[0]!.manifest.defaultProps,
            style: hostedEntries[0]!.manifest.defaultStyle,
            dataSource: { type: 'static' as const, value: '远程数据' },
          },
        ],
        variables: [],
        blueprint: { nodes: [], edges: [] },
      };
      document.body.appendChild(demo);
      return demo;
    },
    setSaveDelay: (ms: number) => {
      saveDelayMs = ms;
    },
    failNextSave: (code: 'PROJECT_CONFLICT' | 'PROJECT_UNAVAILABLE') => {
      nextSaveFailure = code;
    },
  },
});
