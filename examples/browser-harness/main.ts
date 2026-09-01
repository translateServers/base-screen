import { createElement } from 'react';
import { h } from 'vue';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
  BASE_SCREEN_ECHARTS_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_TABULAR_DATA_ADAPTER,
  BaseScreenChartMaterialElement,
  BaseScreenContainerMaterialElement,
  BaseScreenEChartsMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
  defineBaseScreenChartMaterial,
  defineBaseScreenContainerMaterial,
  defineBaseScreenEChartsMaterial,
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
} from '../../packages/plugin-core/src/index.ts';
import { createBaseScreenPluginManager } from '../../packages/plugin-manager/src/index.ts';
import { createReactMaterialDefinition } from '../../packages/react/src/index.ts';
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenBlueprintCanvasCommand,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasState,
  type BaseScreenBlueprintCanvasStateEventDetail,
  defineBaseScreenElements,
  SCREEN_AUTHORING_REQUEST_EVENT,
  type ScreenAuthoringRequest,
} from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';

// 宿主受控动态加载（ADR-0029）：外部物料包经宿主发起的 import() 进入页面，
// 由宿主审核模块来源并负责失败处理；Base Screen 只消费加载后的可信模块。
const hostedModule = await import('./hosted-material-package.ts');
const hostedMaterialPackage = hostedModule.hostedMaterialPackage;
const draftMaterialPackage = hostedModule.draftMaterialPackage;
const hostedDatasetRankingManifest = hostedModule.hostedDatasetRankingManifest;

if (new URLSearchParams(window.location.search).has('designer')) {
  document.body.dataset.layout = 'designer';
}

const productElements = defineBaseScreenElements();
const officialMaterials = [
  defineBaseScreenTextMaterial(),
  defineBaseScreenRectangleMaterial(),
  defineBaseScreenEllipseMaterial(),
  defineBaseScreenImageMaterial(),
  defineBaseScreenContainerMaterial(),
  defineBaseScreenChartMaterial(),
  defineBaseScreenEChartsMaterial(),
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

const designerAuthoringCapabilities = [
  'blueprint.trigger.material-event',
  'blueprint.value.event-payload',
  'blueprint.value.variable',
  'blueprint.condition.compare',
  'blueprint.action.set-variable',
  'blueprint.action.emit-host-event',
  'blueprint.action.component-visibility',
] as const;
const designerAuthoringPlugin: BaseScreenPluginRuntime = {
  manifest: {
    id: 'browser-harness-authoring',
    dependencies: [],
    capabilities: designerAuthoringCapabilities,
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
      ...designerAuthoringCapabilities.map((id) => ({
        kind: 'blueprintCapability' as const,
        id,
        name: id,
      })),
    ],
  },
  activate() {},
  deactivate() {},
  dispose() {},
};

const pluginManager = createBaseScreenPluginManager({
  instanceId: 'browser-harness',
  standaloneMaterialTagNames: officialMaterials
    .filter((definition) => definition.ok)
    .map((definition) => definition.value.manifest.tagName),
  plugins: [designerAuthoringPlugin],
  grantedCapabilities: { 'browser-harness-authoring': designerAuthoringCapabilities },
  registry: {
    get: (tagName) => customElements.get(tagName) as BaseScreenMaterialConstructor | undefined,
  },
  createCommandPort: undefined,
});
const managerActivated = await pluginManager.activate();
if (
  !managerActivated.ok ||
  pluginManager.snapshot === undefined ||
  !['base.text', 'base.rectangle', 'base.ellipse', 'base.image', 'base.container'].every((type) =>
    pluginManager.snapshot?.materials.has(type),
  ) ||
  pluginManager.snapshot.contributions.getResourceType('dataset') === undefined ||
  !designerAuthoringCapabilities.every((capability) =>
    pluginManager.snapshot?.contributions.hasBlueprintCapability(capability),
  )
) {
  throw new Error('Base Screen browser harness failed to inspect its material registry.');
}

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
    manifest: BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
    constructor: BaseScreenEChartsMaterialElement,
    tabularDataAdapter: BASE_SCREEN_ECHARTS_TABULAR_DATA_ADAPTER,
  },
  {
    manifest: BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
    constructor: BaseScreenTableMaterialElement,
    tabularDataAdapter: BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  },
]);

const runtimeContributions = {
  getResourceType: (resourceType: string) =>
    resourceType === 'dataset'
      ? {
          kind: 'dataResourceType' as const,
          id: 'dataset',
          name: '数据集',
          configSchema: {
            kind: 'object' as const,
            properties: {
              limit: { kind: 'number' as const, minimum: 1, maximum: 100 },
              region: { kind: 'string' as const },
            },
            required: ['limit'],
          },
        }
      : undefined,
  hasBlueprintCapability: (capability: string) =>
    (designerAuthoringCapabilities as readonly string[]).includes(capability),
};

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
        { id: 'charts', label: '图表', materialTypes: ['base.chart', 'base.echarts'] },
        { id: 'tables', label: '表格', materialTypes: ['base.table'] },
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
        { id: 'charts', label: '图表', materialTypes: ['base.chart'] },
        {
          id: 'advanced',
          label: '高级图表',
          children: [{ id: 'echarts', label: 'ECharts 高级图表', materialTypes: ['base.echarts'] }],
        },
        {
          id: 'tables',
          label: '一个超长的分组名称用来验证省略号截断效果',
          materialTypes: ['base.table'],
        },
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
const hostedCatalog = createBaseScreenMaterialCatalog(hostedEntries);
const hostedDatasetRankingEntry = hostedEntries.find(
  (entry) => entry.manifest.type === hostedDatasetRankingManifest.type,
);
if (hostedDatasetRankingEntry === undefined) {
  throw new Error('Base Screen browser harness is missing its dataset material best practice.');
}
const designerCatalog = createBaseScreenMaterialCatalog([
  ...bridgeCatalog.list(),
  hostedDatasetRankingEntry,
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
      dataSource: { type: 'static' as const, value: '拖动文本，编辑属性，撤销或重做。' },
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
      dataSource: { type: 'static' as const, value: '宿主资源已就绪' },
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
        type: 'host-resource' as const,
        resourceType: 'dataset',
        resourceId: 'metric-value',
        params: { limit: { kind: 'literal' as const, value: 1 } },
        binding: null,
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
        type: 'host-resource' as const,
        resourceType: 'dataset',
        resourceId: 'metric-value',
        params: { limit: { kind: 'literal' as const, value: 1 } },
        binding: null,
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
      id: 'echarts-demo',
      type: BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.type,
      name: 'ECharts 语义图',
      parentId: null,
      position: { x: 560, y: 320 },
      size: { width: 340, height: 220 },
      rotation: 0,
      zIndex: 6,
      status: { locked: false, hidden: false },
      props: structuredClone(BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.defaultProps),
      style: structuredClone(BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.defaultStyle),
      dataSource: {
        type: 'host-resource' as const,
        resourceType: 'dataset',
        resourceId: 'tabular-orders',
        params: {
          limit: { kind: 'literal' as const, value: 2 },
          region: { kind: 'variable' as const, name: 'region' },
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
        type: 'host-resource' as const,
        resourceType: 'dataset',
        resourceId: 'tabular-orders',
        params: {
          limit: { kind: 'literal' as const, value: 5 },
          region: { kind: 'variable' as const, name: 'region' },
        },
        binding: { fields: { dimension: ['category'], measures: ['amount'] } },
      },
    },
  ],
  variables: [
    { type: 'static' as const, name: 'count', value: 0 },
    { type: 'static' as const, name: 'region', value: 'north' },
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
const datasetRequests: unknown[] = [];
const variableRequests: Array<{ readonly variableId: string; readonly purpose: string }> = [];
const resourcePort = {
  async resolve(request: {
    readonly resourceId: string;
    readonly params: Readonly<Record<string, unknown>>;
  }) {
    datasetRequests.push(request);
    if (request.resourceId === 'metric-value') {
      return { ok: true as const, value: metricValue, diagnostics: [] };
    }
    if (request.resourceId === 'tabular-orders') {
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
    return { ok: true as const, value: { records: 5 }, diagnostics: [] };
  },
};
const variablePort = {
  async resolve(request: {
    readonly variableId: string;
    readonly purpose: 'runtime' | 'authoring-preview';
  }) {
    variableRequests.push({ variableId: request.variableId, purpose: request.purpose });
    if (request.variableId === 'private-token' && request.purpose === 'authoring-preview') {
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
    if (request.variableId === 'tenant-region' && datasetRegion === 'variable-error') {
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
  async list({ query }: { readonly query: string }) {
    const normalized = query.trim().toLocaleLowerCase();
    const items = [
      {
        variableId: 'tenant-region',
        name: 'tenantRegion',
        description: '当前租户区域',
      },
      {
        variableId: 'private-token',
        name: 'privateToken',
        description: '无权预览的敏感变量',
      },
    ].filter((item) =>
      [item.variableId, item.name, item.description].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
    return { ok: true as const, value: { items }, diagnostics: [] };
  },
  async describe({ variableId }: { readonly variableId: string }) {
    const descriptor =
      variableId === 'tenant-region'
        ? {
            variableId,
            name: 'tenantRegion',
            description: '当前租户区域',
            previewable: true,
          }
        : variableId === 'private-token'
          ? {
              variableId,
              name: 'privateToken',
              description: '无权预览的敏感变量',
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
const datasetCatalog = {
  async list() {
    return {
      ok: true as const,
      value: {
        items: [
          {
            resourceType: 'dataset',
            resourceId: 'tabular-orders',
            name: '订单数据集',
            description: '用于浏览器验证的表格与图表数据。',
          },
        ],
      },
      diagnostics: [],
    };
  },
  async describe() {
    return {
      ok: true as const,
      value: {
        resourceType: 'dataset',
        resourceId: 'tabular-orders',
        name: '订单数据集',
        description: '用于浏览器验证的表格与图表数据。',
        fields: [
          { id: 'category', label: '分类', valueType: 'string' as const },
          { id: 'amount', label: '金额', valueType: 'number' as const },
        ],
        parameters: [
          {
            name: 'limit',
            label: '行数',
            editor: 'number' as const,
            defaultValue: 2,
          },
          {
            name: 'region',
            label: '区域',
            editor: 'text' as const,
          },
        ],
      },
      diagnostics: [],
    };
  },
};
designer.resourcePort = resourcePort;
designer.variablePort = variablePort;
designer.variableCatalogPort = variableCatalog;
designer.datasetCatalogPort = datasetCatalog;
designer.runtimeContributions = pluginManager.snapshot.contributions;
// ADR-0059 宿主条件样式端口：阈值与视觉映射归宿主告警体系，屏幕只消费结果。
// 初始化前经守卫 setter 提交（与 resourcePort 同形）；两个元素共用同一宿主实现。
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
viewer.conditionalStylePort = conditionalStylePort;
viewer.resourcePort = resourcePort;
viewer.variablePort = variablePort;
viewer.runtimeContributions = pluginManager.snapshot.contributions;
viewer.blueprintRuntimePort = {
  emit(event) {
    hostEvents.push(event);
  },
};
designer.catalog = designerCatalog;
designer.materialLibraryGrouping = activeMaterialLibraryGrouping;
designer.materialLibraryState = {
  status: 'partial',
  failedCount: 1,
  draftTypes: ['base.echarts'],
  unavailableTypes: ['base.table'],
};
const materialLibraryActions: string[] = [];
designer.addEventListener(BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT, (event) => {
  materialLibraryActions.push((event as CustomEvent<{ action: string }>).detail.action);
});
designer.runtimeContributions = runtimeContributions;
designer.toolMaterialTypes = {
  text: 'base.text',
  rectangle: 'base.rectangle',
  ellipse: 'base.ellipse',
  image: 'base.image',
};
// 编组使用显式配置的容器物料（children=true），缺失时 Group 命令按 ADR-0012 保持禁用。
designer.groupMaterialType = 'base.container';
viewer.catalog = designerCatalog;
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

Object.assign(window, {
  baseScreenHarness: {
    catalog: designerCatalog,
    designer,
    pluginManager,
    viewer,
    hostEvents,
    designerNativeEvents,
    materialManifests: {
      text: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
      chart: BASE_SCREEN_CHART_MATERIAL_MANIFEST,
      echarts: BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
      table: BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
      react: reactBridge.value.manifest,
      vue: vueBridge.value.manifest,
      datasetRanking: hostedDatasetRankingManifest,
    },
    datasetCatalog,
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
      designer.refreshData('metric-warning');
      designer.refreshData('port-warning');
      viewer.refreshData('metric-warning');
      viewer.refreshData('port-warning');
    },
    createDatasetDemo: () => {
      const demo = document.createElement('base-screen-viewer') as typeof viewer;
      demo.dataset.datasetDemo = 'true';
      demo.catalog = bridgeCatalog;
      demo.resourcePort = resourcePort;
      demo.variablePort = variablePort;
      demo.resourceTimeoutMs = 100;
      demo.runtimeContributions = runtimeContributions;
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
              type: 'host-resource' as const,
              resourceType: 'dataset',
              resourceId: 'tabular-orders',
              params: {
                limit: { kind: 'literal' as const, value: 2 },
                region: { kind: 'variable' as const, name: 'region' },
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
              type: 'host-resource' as const,
              resourceType: 'dataset',
              resourceId: 'tabular-orders',
              params: {
                limit: { kind: 'literal' as const, value: 2 },
                region: { kind: 'variable' as const, name: 'region' },
              },
              binding: { fields: { dimension: ['category'], measures: ['amount'] } },
            },
          },
        ],
        variables: [{ type: 'host' as const, name: 'region', variableId: 'region' }],
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
