import { createElement } from 'react';
import { h } from 'vue';
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
} from '../../packages/plugin-core/src/index.ts';
import { createBaseScreenPluginManager } from '../../packages/plugin-manager/src/index.ts';
import { createReactMaterialDefinition } from '../../packages/react/src/index.ts';
import { defineBaseScreenElements } from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';

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
  defineBaseScreenTableMaterial(),
];
if (!productElements.ok || officialMaterials.some((definition) => !definition.ok)) {
  throw new Error('Base Screen browser harness failed to register its elements.');
}

const designerAuthoringCapabilities = [
  'blueprint.trigger.material-event',
  'blueprint.value.event-payload',
  'blueprint.value.variable',
  'blueprint.condition.compare',
  'blueprint.action.set-variable',
  'blueprint.action.emit-host-event',
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
  hasBlueprintCapability: () => true,
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
      props: { text: 'Base Screen 设计器' },
      style: { color: '#e9f2ff', fontSize: 42, fontWeight: '700', textAlign: 'left' },
      dataSource: null,
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
      props: { text: '拖动文本，编辑属性，撤销或重做。' },
      style: { color: '#9fb1c9', fontSize: 20, fontWeight: '400', textAlign: 'left' },
      dataSource: null,
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
      props: { text: '宿主资源已就绪' },
      style: { color: '#39c5bb', fontSize: 16, fontWeight: '400', textAlign: 'left' },
      dataSource: {
        type: 'host-resource' as const,
        resourceType: 'dataset',
        resourceId: 'orders',
        params: { limit: { kind: 'literal' as const, value: 5 } },
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
  ],
  variables: [{ type: 'static' as const, name: 'count', value: 0 }],
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
const hostEvents: unknown[] = [];
let datasetVersion = 0;
let datasetRegion = 'north';
let datasetDelay = false;
const datasetRequests: unknown[] = [];
const resourcePort = {
  async resolve(request: {
    readonly resourceId: string;
    readonly params: Readonly<Record<string, unknown>>;
  }) {
    datasetRequests.push(request);
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
  async resolve() {
    return { ok: true as const, value: datasetRegion, diagnostics: [] };
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
designer.datasetCatalogPort = datasetCatalog;
designer.runtimeContributions = pluginManager.snapshot.contributions;
viewer.resourcePort = resourcePort;
viewer.variablePort = variablePort;
viewer.runtimeContributions = pluginManager.snapshot.contributions;
viewer.blueprintRuntimePort = {
  emit(event) {
    hostEvents.push(event);
  },
};
designer.catalog = bridgeCatalog;
designer.runtimeContributions = runtimeContributions;
designer.toolMaterialTypes = {
  text: 'base.text',
  rectangle: 'base.rectangle',
  ellipse: 'base.ellipse',
  image: 'base.image',
};
// 编组使用显式配置的容器物料（children=true），缺失时 Group 命令按 ADR-0012 保持禁用。
designer.groupMaterialType = 'base.container';
viewer.catalog = bridgeCatalog;
let envelope = {
  projectId: 'browser-harness',
  revision: '1',
  name: '浏览器验证',
  description: null,
  document: screenDocument,
  metadata: {},
};
let nextSaveFailure: 'PROJECT_CONFLICT' | 'PROJECT_UNAVAILABLE' | undefined;
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

Object.assign(window, {
  baseScreenHarness: {
    catalog: bridgeCatalog,
    designer,
    pluginManager,
    viewer,
    hostEvents,
    datasetCatalog,
    datasetRequests,
    setDatasetRegion: (value: string) => {
      datasetRegion = value;
    },
    setDatasetDelay: (value: boolean) => {
      datasetDelay = value;
    },
    bumpDatasetVersion: () => {
      datasetVersion++;
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
            name: '数据表',
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
            name: '数据图表',
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
    failNextSave: (code: 'PROJECT_CONFLICT' | 'PROJECT_UNAVAILABLE') => {
      nextSaveFailure = code;
    },
  },
});
