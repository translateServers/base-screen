import { createElement } from 'react';
import { h } from 'vue';
import type { ScreenJsonObject, ScreenJsonValue } from '../../packages/contracts/src/index.ts';
import { SCREEN_BLUEPRINT_CAPABILITY_IDS } from '../../packages/contracts/src/index.ts';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_TABULAR_DATA_ADAPTER,
  BaseScreenChartMaterialElement,
  BaseScreenContainerMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenImageMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from '../../packages/material/src/index.ts';
import {
  type BaseScreenMaterialConstructor,
  type BaseScreenPluginRuntime,
  createBaseScreenMaterialCatalog,
  type PluginCommandPort,
  type PluginDesignReadPort,
} from '../../packages/plugin-core/src/index.ts';
import {
  createBaseScreenPluginContributionCommandPort,
  createBaseScreenPluginManager,
} from '../../packages/plugin-manager/src/index.ts';
import { createReactMaterialDefinition } from '../../packages/react/src/index.ts';
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
} from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';
import {
  createPluginDatavRuntime,
  PLUGIN_DATAV_BORDER_BOX_TYPE,
  PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID,
  PLUGIN_DATAV_ID,
  PLUGIN_DATAV_WATER_LEVEL_TYPE,
  registerPluginDatavMaterials,
} from '../../plugins/plugin-datav-materials/src/index.ts';
import {
  createPluginEchartsRuntime,
  registerPluginEcharts,
} from '../../plugins/plugin-echarts/src/index.ts';
import {
  createPluginMetricsRuntime,
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_METRICS_ID,
  PLUGIN_METRICS_RESOURCE_TYPE_ID,
} from '../../plugins/plugin-metrics/src/index.ts';
import {
  createPluginPipelineRuntime,
  PLUGIN_PIPELINE_ID,
  PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
  PLUGIN_PIPELINE_SPOTLIGHT_EVENT,
  PLUGIN_PIPELINE_TOP_BY_PROCESSOR_ID,
} from '../../plugins/plugin-pipeline/src/index.ts';
import {
  applyHostScriptFilter,
  createDatavCompositionRuntime,
  DATAV_COMPOSITION_PLUGIN_ID,
  DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID,
  startHostVariableTimer,
  writeHostVariable,
} from './datav-composition-fixture.ts';
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
if (harnessSearch.has('designer') || harnessSearch.has('case') || harnessSearch.has('cases')) {
  document.body.dataset.layout = 'designer';
}

const productElements = defineBaseScreenElements();
// 面板标签必须在 manager 激活前注册：preflight 会按贡献声明的 tagName 查询宿主 registry。
defineHarnessPluginPanel();
registerPluginEcharts();
registerPluginDatavMaterials();
defineHarnessInspectorFixtures();
const officialMaterials = [
  defineBaseScreenTextMaterial(),
  defineBaseScreenRectangleMaterial(),
  defineBaseScreenEllipseMaterial(),
  defineBaseScreenImageMaterial(),
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
// 同时声明。这里把其中一个让给外围插件 plugin-metrics：既避免冲突，也让"能力由插件
// 而非宿主提供"这条通道真正被演示；union 仍覆盖全部能力 id，授权面不变。
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
    createPluginEchartsRuntime(),
    createPluginMetricsRuntime(),
    createPluginDatavRuntime(),
    createPluginPipelineRuntime(),
    createDatavCompositionRuntime(),
  ],
  grantedCapabilities: {
    'browser-harness-authoring': designerAuthoringPluginCapabilities,
    'base-screen.echarts': ['command.execute', 'design.read'],
    // 大屏组件插件要读选区并提交事务，因此同样需要这两个端口能力。
    [PLUGIN_DATAV_ID]: ['command.execute', 'design.read'],
    // 声明者即批准者只在此处是宿主自营插件；蓝图能力仍需宿主支持表认可才生效。
    [PLUGIN_METRICS_ID]: [PLUGIN_METRICS_BLUEPRINT_CAPABILITY],
    // ADR-0076：运行期插件。动作能力必须显式批准，动作才进入可执行集合。
    [PLUGIN_PIPELINE_ID]: ['data.process', 'blueprint.action.execute'],
    // 组合路径模板：宿主自营的脚本过滤器处理器。
    [DATAV_COMPOSITION_PLUGIN_ID]: ['data.process'],
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
    ['base.text', 'base.rectangle', 'base.ellipse', 'base.image', 'base.container'].every((type) =>
      pluginManager.snapshot?.materials.has(type),
    ),
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
    'echarts-plugin-catalogued',
    pluginManager.snapshot.plugins.get('base-screen.echarts') !== undefined,
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
  // 大屏组件插件：四个物料都要进快照，检查器控件要进授权目录（注册≠授权），
  // 命令要出现在插件记录里——任一项失败都说明插件被 preflight 整体排除。
  ['datav-plugin-catalogued', pluginManager.snapshot.plugins.get(PLUGIN_DATAV_ID) !== undefined],
  [
    'datav-materials-catalogued',
    [
      PLUGIN_DATAV_BORDER_BOX_TYPE,
      PLUGIN_DATAV_WATER_LEVEL_TYPE,
      'datav.digital-flop',
      'datav.scroll-board',
    ].every((type) => pluginManager.snapshot?.materials.has(type) === true),
  ],
  [
    'datav-inspector-control-authorized',
    ['base-screen-datav-border-picker'].every(
      (tagName) => pluginManager.snapshot?.inspectorControls.getByTagName(tagName) !== undefined,
    ),
  ],
  [
    'datav-command-catalogued',
    pluginManager.snapshot.plugins
      .get(PLUGIN_DATAV_ID)
      ?.contributions.some(
        (item) => item.kind === 'command' && item.id === PLUGIN_DATAV_CYCLE_BORDER_COMMAND_ID,
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
const materialLibraryGrouping = {
  groups: [
    {
      id: 'foundation',
      label: '基础',
      materialTypes: ['base.text', 'base.rectangle', 'base.ellipse', 'base.image'],
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
          materialTypes: ['base.chart', 'harness.semantic-chart', 'plugin.echarts'],
        },
        { id: 'tables', label: '表格', materialTypes: ['base.table'] },
      ],
    },
    {
      id: 'datav',
      label: '大屏',
      // 外围插件 plugin-datav-materials 贡献的四个物料；分组必须覆盖目录中每个可见物料。
      materialTypes: [
        'datav.digital-flop',
        'datav.scroll-board',
        'datav.water-level',
        'datav.border-box',
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
    { id: 'shapes', label: '图形', materialTypes: ['base.rectangle', 'base.ellipse'] },
    { id: 'media', label: '媒体素材库', materialTypes: ['base.image'] },
    {
      id: 'data',
      label: '数据可视化图表组件超长名称',
      children: [
        { id: 'charts', label: '图表', materialTypes: ['base.chart', 'plugin.echarts'] },
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
      id: 'datav',
      label: '大屏组件超长分组名称用于截断',
      materialTypes: [
        'datav.digital-flop',
        'datav.scroll-board',
        'datav.water-level',
        'datav.border-box',
      ],
    },
    {
      id: 'bridges',
      label: '跨框架桥接物料',
      materialTypes: ['harness.react-button', 'harness.vue-button'],
    },
    {
      id: 'best-practices',
      label: '宿主数据集最佳实践',
      materialTypes: [hostedDatasetRankingManifest.type],
    },
  ],
} as const;
const activeMaterialLibraryGrouping = new URLSearchParams(window.location.search).has(
  'material-group-stress',
)
  ? materialLibraryStressGrouping
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
      // 条件样式预警演示（ADR-0058）：宿主指标 >100 时变红加粗，回落自动恢复基础样式。
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
      styleRules: [
        {
          id: 'over-100',
          when: { path: [], operator: 'gt' as const, value: 100 },
          style: { color: '#ff4d4f', fontWeight: '700' },
        },
      ],
      dataSource: {
        type: 'variable' as const,
        variableId: 'metric-value',
      },
    },
    {
      // 条件样式端口演示（ADR-0059）：文档零告警知识（无 styleRules），阈值与视觉映射
      // 全部归宿主端口；宿主指标 >100 时变橙加粗，回落自动恢复基础样式。
      id: 'port-warning',
      type: 'base.text',
      name: '宿主端口预警',
      parentId: null,
      position: { x: 560, y: 288 },
      size: { width: 340, height: 32 },
      rotation: 0,
      zIndex: 8,
      status: { locked: false, hidden: false },
      props: {},
      style: { color: '#9fb1c9', fontSize: 16, fontWeight: '400', textAlign: 'left' },
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
    // 组合路径模板（DataV 差距调研第四节）：计时器触发与推送数据都写这个变量，
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
      processorId: DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID,
      controlled: false,
    },
  ],
  blueprint: {
    rules: [
      {
        id: 'title-click',
        trigger: { type: 'material-event' as const, componentId: 'title', eventName: 'valueClick' },
        actions: [
          {
            type: 'emit-host-event' as const,
            eventName: 'titleClick',
            payload: { kind: 'literal' as const, value: { source: 'harness' } },
          },
        ],
      },
      {
        // ADR-0076：引用插件声明的宿主动作。已声明即走宿主动作端口，未声明会被 manager
        // 失败关闭；这条规则同时是端到端断言的入口（点标题 → 动作执行）。
        id: 'plugin-action-demo',
        trigger: {
          type: 'material-event' as const,
          componentId: 'subtitle',
          eventName: 'valueClick',
        },
        actions: [
          {
            type: 'host-action' as const,
            actionId: PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
            payload: {
              kind: 'object' as const,
              properties: {
                color: { kind: 'literal' as const, value: '#ffa940' },
                strokeWidth: { kind: 'literal' as const, value: 3 },
              },
            },
          },
        ],
      },
      {
        // 组合路径模板（DataV 差距调研 4.1）：宿主定时器/推送写变量 → 本规则触发 → 插件动作。
        // DataV 上"计时器节点"承载的功能由此闭环，且**不需要** Base Screen 新增触发器节点：
        // 缺的从来是作者面形态，不是功能。`harnessTick` 初值 0 时规则也会触发一次，
        // 因此断言观察的是动作事件次数在启动定时器之后的增量。
        id: 'variable-trigger-demo',
        trigger: {
          type: 'variable-event' as const,
          variableId: 'harness-tick',
          eventName: 'data-updated',
        },
        actions: [
          {
            type: 'host-action' as const,
            actionId: PLUGIN_PIPELINE_SPOTLIGHT_ACTION_ID,
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
    ],
  },
};

const designer = document.querySelector('base-screen-designer')!;
const viewer = document.querySelector('base-screen-viewer')!;
const blueprintCanvas = designer.querySelector<HTMLElement>('[data-harness-blueprint-canvas]')!;
const blueprintGraph = blueprintCanvas.querySelector<HTMLElement>(
  '[data-harness-blueprint-graph]',
)!;
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
  selection.textContent =
    state.selection === null
      ? '未选择图元素'
      : `已选择 ${state.selection.kind}: ${state.selection.id}`;
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
  async resolve() {
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
const variablePort = {
  async resolve(request: {
    readonly variableId: string;
    readonly sourceId: string;
    readonly sourceType: 'data-source' | 'url-query';
    readonly processorId?: string;
    readonly purpose: 'runtime' | 'authoring-preview';
  }) {
    variableRequests.push({
      variableId: request.variableId,
      sourceId: request.sourceId,
      sourceType: request.sourceType,
      purpose: request.purpose,
    });
    // 组合路径模板（DataV 差距调研 4.2）：宿主脚本过滤器。
    //
    // 这里的顺序就是宿主该有的顺序：**先取到原始值，再交给处理器**。`processorId` 是文档里
    // 的不透明标识，宿主要自己知道它对应哪个脚本资产与哪些参数，脚本正文与参数都留在宿主侧
    // ——换脚本因此不必改文档。
    if (request.processorId === DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID) {
      return applyHostScriptFilter(pluginManager, {
        scriptId: harnessScriptId,
        value: harnessScriptRows,
        options: harnessScriptOptions,
      });
    }
    if (request.sourceType === 'url-query') {
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
const variableCatalog = {
  async list({
    query,
    sourceType,
  }: {
    readonly query: string;
    readonly sourceType: 'data-source' | 'url-query';
  }) {
    const normalized = query.trim().toLocaleLowerCase();
    const items = [
      {
        sourceId: 'browser-region',
        sourceType: 'data-source' as const,
        name: 'dataSourceRegion',
        description: 'Browser Harness 数据源变量案例',
      },
      {
        sourceId: 'tenant-region',
        sourceType: 'data-source' as const,
        name: 'tenantRegion',
        description: '当前租户区域',
      },
      {
        sourceId: 'private-token',
        sourceType: 'data-source' as const,
        name: 'privateToken',
        description: '无权预览的敏感变量',
      },
      {
        sourceId: 'campaign',
        sourceType: 'url-query' as const,
        name: 'urlCampaign',
        description: 'Browser Harness URL 查询参数变量案例',
      },
    ].filter(
      (item) =>
        item.sourceType === sourceType &&
        [item.sourceId, item.name, item.description].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        ),
    );
    return { ok: true as const, value: { items }, diagnostics: [] };
  },
  async describe({ sourceId }: { readonly sourceId: string }) {
    const descriptor =
      sourceId === 'browser-region'
        ? {
            sourceId,
            sourceType: 'data-source' as const,
            name: 'dataSourceRegion',
            description: 'Browser Harness 数据源变量案例',
            previewable: true,
          }
        : sourceId === 'tenant-region'
          ? {
              sourceId,
              sourceType: 'data-source' as const,
              name: 'tenantRegion',
              description: '当前租户区域',
              previewable: true,
            }
          : sourceId === 'private-token'
            ? {
                sourceId,
                sourceType: 'data-source' as const,
                name: 'privateToken',
                description: '无权预览的敏感变量',
                previewable: true,
              }
            : sourceId === 'campaign'
              ? {
                  sourceId,
                  sourceType: 'url-query' as const,
                  name: 'urlCampaign',
                  description: 'Browser Harness URL 查询参数变量案例',
                  previewable: true,
                }
              : undefined;
    return descriptor === undefined
      ? {
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'HOST_VARIABLE_CATALOG_FAILED' as const,
              path: [],
              message: 'Harness variable descriptor was not found.',
            },
          ],
        }
      : { ok: true as const, value: descriptor, diagnostics: [] };
  },
};
designer.resourcePort = resourcePort;
designer.variablePort = variablePort;
designer.variableCatalogPort = variableCatalog;
designer.datasetPort = datasetPort;
designer.runtimeContributions = pluginManager.snapshot.contributions;
// ADR-0076：宿主把蓝图宿主动作接到 manager 的插件动作路由。designerHostAdapter 是**聚合**
// 端口，赋值时会用它自己的字段重写各单项端口，因此这里把宿主已有的端口对象原样透传，
// 否则会把上面刚设好的 resourcePort/variablePort/datasetPort 一并清空。
const pluginActionRequests: Array<{ readonly actionId: string; readonly payload: unknown }> = [];
designer.designerHostAdapter = {
  capabilities: {
    projectCatalog: false,
    projectPreview: false,
    projectSnapshots: false,
    resources: true,
    datasets: true,
    variableCatalog: true,
    variables: true,
    actions: true,
  },
  resources: resourcePort,
  datasets: datasetPort,
  variableCatalog,
  variables: variablePort,
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
const conditionalStylePort = {
  resolve({
    componentId,
    dataState,
  }: {
    readonly componentId: string;
    readonly dataState: { readonly status: string; readonly value?: unknown };
  }) {
    if (componentId !== 'port-warning' || dataState.status !== 'ready') return undefined;
    return typeof dataState.value === 'number' && dataState.value > 100
      ? { color: '#ffa940', fontWeight: '700' }
      : undefined;
  },
};
designer.conditionalStylePort = conditionalStylePort;
designer.catalog = designerCatalog;
designer.materialLibraryGrouping = activeMaterialLibraryGrouping;
designer.materialLibraryState = {
  status: 'partial',
  failedCount: 1,
  draftTypes: ['harness.semantic-chart'],
  unavailableTypes: ['base.table'],
};
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
  variablePort,
  conditionalStylePort,
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
let envelope = {
  projectId: 'browser-harness',
  revision: '1',
  name: '浏览器验证',
  description: null,
  document: screenDocument,
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
      action === 'blueprint' ? '已切换到交互编排工作台。' : '已发起宿主编辑请求，等待编辑器返回。',
    );
  } else {
    setHostStatus('无法发起宿主编辑请求。', 'error');
  }
});

mountFeatureCases(designer);

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
    // 组合路径模板（DataV 差距调研第四节）的观察与驱动点。
    datavCompositionPluginId: DATAV_COMPOSITION_PLUGIN_ID,
    datavScriptProcessorId: DATAV_COMPOSITION_SCRIPT_PROCESSOR_ID,
    datavVariableWrites: hostVariableWrites,
    /** 计时器触发：宿主自建定时器 → 写变量 → 蓝图规则。只在断言调用后运行。 */
    startDatavTick: (intervalMs = 40) => {
      hostVariableTimer?.stop();
      let tick = 0;
      hostVariableTimer = startHostVariableTimer(designer, {
        variableId: 'harness-tick',
        intervalMs,
        produce: () => {
          tick += 1;
          return tick;
        },
        // 与 pushDatavVariable 记同一份观察数组：两条路径的写入次数必须在同一处可比。
        onWrite: (value) => hostVariableWrites.push({ variableId: 'harness-tick', value }),
      });
    },
    stopDatavTick: () => {
      hostVariableTimer?.stop();
      hostVariableTimer = undefined;
    },
    /** 推送数据：外部事件驱动的单次写入，与计时器共用同一条宿主写变量原语。 */
    pushDatavVariable: (value) => {
      const result = writeHostVariable(designer, 'harness-tick', value);
      if (result.ok) hostVariableWrites.push({ variableId: 'harness-tick', value });
      return result;
    },
    /** 脚本过滤器：换脚本只改宿主侧标识与参数，文档里的 processorId 不动。 */
    setDatavScript: (scriptId, options) => {
      harnessScriptId = scriptId;
      harnessScriptOptions = (options ?? {}) as ScreenJsonObject;
    },
    setDatavScriptRows: (rows) => {
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
    variableCatalog,
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
        variablePort,
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
        blueprint: { rules: [] },
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
        blueprint: { rules: [] },
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
        blueprint: { rules: [] },
      };
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
        blueprint: { rules: [] },
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
