import type { ScreenDocument, ScreenHostResourceParameter } from '@base-screen/contracts';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from 'vue';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenChartMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
  defineBaseScreenChartMaterial,
  defineBaseScreenEllipseMaterial,
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTableMaterial,
  defineBaseScreenTextMaterial,
} from '../../packages/material/src/index.ts';
import { createBaseScreenMaterialCatalog } from '../../packages/plugin-core/src/index.ts';
import { defineBaseScreenElements } from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';
import {
  createPlaygroundDatasetCatalog,
  createPlaygroundResourcePort,
  createPlaygroundRuntimeState,
  createPlaygroundVariablePort,
  listPlaygroundDatasets,
  type PlaygroundDatasetId,
  type PlaygroundRuntimeState,
} from './mock-data.ts';

type PlaygroundPath = '/' | '/designer' | '/dataset' | '/binding' | '/errors';

interface PlaygroundRoute {
  readonly path: PlaygroundPath;
  readonly label: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly document: () => ScreenDocument;
}

interface PlaygroundViewerElement extends HTMLElement {
  catalog: typeof catalog;
  resourcePort: ReturnType<typeof createPlaygroundResourcePort>;
  variablePort: ReturnType<typeof createPlaygroundVariablePort>;
  runtimeContributions: typeof runtimeContributions;
  document: ScreenDocument | undefined;
  resourceTimeoutMs: number;
  refreshData: (componentId?: string) => void;
}

interface PlaygroundDesignerElement extends HTMLElement {
  catalog: typeof catalog;
  resourcePort: ReturnType<typeof createPlaygroundResourcePort>;
  variablePort: ReturnType<typeof createPlaygroundVariablePort>;
  datasetCatalogPort: ReturnType<typeof createPlaygroundDatasetCatalog>;
  runtimeContributions: typeof runtimeContributions;
  toolMaterialTypes: {
    readonly text: string;
    readonly rectangle: string;
    readonly ellipse: string;
  };
  document: ScreenDocument | undefined;
}

const registration = defineBaseScreenElements();
const definitions = [
  defineBaseScreenTextMaterial(),
  defineBaseScreenRectangleMaterial(),
  defineBaseScreenEllipseMaterial(),
  defineBaseScreenChartMaterial(),
  defineBaseScreenTableMaterial(),
];
if (!registration.ok || definitions.some((definition) => !definition.ok)) {
  throw new Error('Playground material registration failed.');
}

const vueStatusManifest = {
  type: 'playground.vue-status',
  tagName: 'playground-vue-status',
  name: 'Vue 状态卡片',
  category: 'Vue 应用',
  keywords: ['vue', 'status'],
  defaultSize: { width: 132, height: 132 },
  defaultProps: { label: 'Vue 应用', value: '已连接', tone: 'teal' },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: {
    kind: 'object' as const,
    properties: {
      label: { kind: 'string' as const },
      value: { kind: 'string' as const },
      tone: { kind: 'enum' as const, values: ['teal', 'amber', 'red'] as const },
    },
    required: ['label', 'value', 'tone'],
  },
  propertyPanel: [],
  events: [],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: true, children: false },
};

const vueStatusDefinition = createVueMaterialDefinition({
  manifest: vueStatusManifest,
  component: defineComponent({
    props: {
      label: { type: String, required: true },
      value: { type: String, required: true },
      tone: { type: String, required: true },
    },
    setup(props) {
      return () =>
        h(
          'div',
          {
            class: ['vue-status-card', `vue-status-card--${props.tone}`],
            style:
              'display:grid;align-content:center;gap:8px;height:100%;padding:18px;box-sizing:border-box;border:1px solid currentColor;border-radius:12px;background:rgba(255,255,255,0.04);',
          },
          [
            h('span', { class: 'vue-status-card__label' }, props.label),
            h('strong', { class: 'vue-status-card__value' }, props.value),
            h('small', { class: 'vue-status-card__meta' }, 'Vue bridge material'),
          ],
        );
    },
  }),
});
if (!vueStatusDefinition.ok) {
  throw new Error('Playground Vue material definition failed.');
}
if (customElements.get(vueStatusDefinition.value.manifest.tagName) === undefined) {
  customElements.define(
    vueStatusDefinition.value.manifest.tagName,
    vueStatusDefinition.value.constructor,
  );
}

const catalog = createBaseScreenMaterialCatalog([
  { manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST, constructor: BaseScreenTextMaterialElement },
  {
    manifest: BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
    constructor: BaseScreenRectangleMaterialElement,
  },
  {
    manifest: BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
    constructor: BaseScreenEllipseMaterialElement,
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
  vueStatusDefinition.value,
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
            required: [],
          },
        }
      : undefined,
  hasBlueprintCapability: () => true,
};

const runtimeState = reactive<PlaygroundRuntimeState>(createPlaygroundRuntimeState());
const resourcePort = createPlaygroundResourcePort(runtimeState);
const variablePort = createPlaygroundVariablePort(runtimeState);
const datasetCatalog = createPlaygroundDatasetCatalog();

const routes: readonly PlaygroundRoute[] = [
  {
    path: '/',
    label: 'Overview',
    eyebrow: 'Vue Application',
    title: 'Vue 应用中的 Base Screen',
    description:
      'Vue 负责应用状态与宿主交互，Base Screen 负责渲染同一份 canonical Screen Document。',
    document: createBasicDocument,
  },
  {
    path: '/designer',
    label: 'Designer',
    eyebrow: 'Screen Designer',
    title: '大屏设计器',
    description: '在真实 Vue 宿主中打开 Designer，直接使用物料库、画布、属性面板和数据集绑定。',
    document: () => createDataDocument('designer', '设计器数据联调', false),
  },
  {
    path: '/dataset',
    label: 'Dataset',
    eyebrow: 'Host Dataset',
    title: '宿主数据集运行时',
    description: '表格和图表共享数据集端口，并通过 Vue 状态驱动 region 变量与请求刷新。',
    document: () => createDataDocument('dataset', '数据集运行时'),
  },
  {
    path: '/binding',
    label: 'Binding',
    eyebrow: 'Field Binding',
    title: '字段角色绑定',
    description:
      'Vue 页面只管理应用状态，columns、dimension 和 measures 仍由 Screen Document 声明。',
    document: () => createDataDocument('binding', '字段绑定案例'),
  },
  {
    path: '/errors',
    label: 'Errors',
    eyebrow: 'Fail Closed',
    title: '安全失败状态',
    description: '切换失败开关后，宿主端口返回诊断，物料只展示可见的 error 状态。',
    document: createErrorDocument,
  },
];

const PlaygroundApp = defineComponent({
  name: 'PlaygroundApp',
  setup() {
    const currentPath = ref<PlaygroundPath>(toPlaygroundPath(window.location.pathname));
    const viewer = ref<PlaygroundViewerElement | null>(null);
    const designer = ref<PlaygroundDesignerElement | null>(null);
    const designerChanges = ref(0);
    const observedDesigners = new WeakSet<PlaygroundDesignerElement>();
    const currentRoute = () => routes.find((item) => item.path === currentPath.value) ?? routes[0];

    const navigate = (path: PlaygroundPath): void => {
      if (path !== currentPath.value) {
        window.history.pushState({}, '', path);
        currentPath.value = path;
      }
    };

    const syncViewer = (): void => {
      const element = viewer.value;
      if (element === null) return;
      element.resourcePort = resourcePort;
      element.variablePort = variablePort;
      element.resourceTimeoutMs = 3000;
      element.runtimeContributions = runtimeContributions;
      element.catalog = catalog;
      element.document = currentRoute().document();
    };

    const syncDesigner = (): void => {
      const element = designer.value;
      if (element === null) return;
      if (!observedDesigners.has(element)) {
        element.addEventListener('base-screen-change', () => {
          designerChanges.value += 1;
        });
        observedDesigners.add(element);
      }
      element.resourcePort = resourcePort;
      element.variablePort = variablePort;
      element.datasetCatalogPort = datasetCatalog;
      element.runtimeContributions = runtimeContributions;
      element.toolMaterialTypes = {
        text: 'base.text',
        rectangle: 'base.rectangle',
        ellipse: 'base.ellipse',
      };
      element.catalog = catalog;
      if (element.document === undefined) {
        element.document = currentRoute().document();
      }
    };

    const syncSurfaces = (): void => {
      syncViewer();
      syncDesigner();
    };

    const refresh = (): void => {
      runtimeState.revision += 1;
      viewer.value?.refreshData();
    };

    const toggleFailure = (): void => {
      runtimeState.failed = !runtimeState.failed;
    };

    const toggleDelay = (): void => {
      runtimeState.delayed = !runtimeState.delayed;
    };

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'r' || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      refresh();
    };
    const onPopstate = (): void => {
      currentPath.value = toPlaygroundPath(window.location.pathname);
    };

    onMounted(() => {
      window.addEventListener('keydown', onKeydown);
      window.addEventListener('popstate', onPopstate);
      syncSurfaces();
    });
    onUnmounted(() => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('popstate', onPopstate);
    });

    watch(
      [
        currentPath,
        () => runtimeState.region,
        () => runtimeState.datasetId,
        () => runtimeState.failed,
      ],
      () => void nextTick(syncSurfaces),
      { flush: 'post' },
    );

    return () => {
      const route = currentRoute();
      const isDataRoute = currentPath.value === '/dataset' || currentPath.value === '/binding';
      const isDesignerRoute = currentPath.value === '/designer';
      if (isDesignerRoute) {
        return h('div', { class: 'designer-fullscreen' }, [
          h('base-screen-designer', {
            id: 'playground-designer',
            'data-framework': 'vue',
            'data-host-runtime': 'mock',
            ref: designer,
          }),
        ]);
      }
      return h('div', { class: 'shell' }, [
        h('aside', { class: 'sidebar' }, [
          h(
            'a',
            {
              class: 'brand',
              href: '/',
              onClick: (event: MouseEvent) => {
                event.preventDefault();
                navigate('/');
              },
            },
            [h('strong', 'Base Screen'), h('span', 'Vue playground')],
          ),
          h(
            'nav',
            { class: 'nav', 'aria-label': '案例路由' },
            routes.map((item) =>
              h(
                'a',
                {
                  href: item.path,
                  'aria-current': item.path === currentPath.value ? 'page' : undefined,
                  onClick: (event: MouseEvent) => {
                    event.preventDefault();
                    navigate(item.path);
                  },
                },
                item.label,
              ),
            ),
          ),
          h(
            'p',
            { class: 'sidebar-note' },
            '应用状态、数据集目录和宿主资源端口由 Vue 管理，Viewer 与 Designer 只消费公开 API。',
          ),
        ]),
        h('main', { class: 'main' }, [
          h('header', { class: 'intro' }, [
            h('div', { class: 'intro-copy' }, [
              h('p', { class: 'eyebrow' }, route.eyebrow),
              h('h1', route.title),
              h('p', route.description),
            ]),
            h('code', { class: 'path' }, route.path),
          ]),
          h('section', { class: 'runtime-toolbar', 'aria-label': 'Vue 宿主模拟控制' }, [
            h('div', { class: 'runtime-toolbar__title' }, [
              h('strong', 'Vue Host Runtime'),
              h('span', 'mock ports + dataset catalog'),
            ]),
            isDataRoute
              ? h('label', { class: 'field' }, [
                  h('span', '数据集'),
                  h(
                    'select',
                    {
                      value: runtimeState.datasetId,
                      onChange: (event: Event) => {
                        runtimeState.datasetId = (event.target as HTMLSelectElement)
                          .value as PlaygroundDatasetId;
                      },
                    },
                    listPlaygroundDatasets().map((dataset) =>
                      h('option', { value: dataset.resourceId }, dataset.name),
                    ),
                  ),
                ])
              : null,
            isDataRoute
              ? h('label', { class: 'field' }, [
                  h('span', '区域变量'),
                  h(
                    'select',
                    {
                      value: runtimeState.region,
                      onChange: (event: Event) => {
                        runtimeState.region = (event.target as HTMLSelectElement).value;
                      },
                    },
                    ['north', 'south', 'east', 'west', 'central'].map((region) =>
                      h('option', { value: region }, region),
                    ),
                  ),
                ])
              : null,
            h('button', { type: 'button', class: 'toolbar-button', onClick: refresh }, '刷新数据'),
            h(
              'button',
              {
                type: 'button',
                class: ['toolbar-button', runtimeState.delayed ? 'is-active' : undefined],
                onClick: toggleDelay,
              },
              runtimeState.delayed ? '延迟：开' : '延迟：关',
            ),
            h(
              'button',
              {
                type: 'button',
                class: ['toolbar-button', runtimeState.failed ? 'is-danger' : undefined],
                onClick: toggleFailure,
              },
              runtimeState.failed ? '失败：开' : '失败：关',
            ),
          ]),
          h('div', { class: 'playground-grid' }, [
            h(
              'section',
              {
                class: ['stage', isDesignerRoute ? 'stage--designer' : undefined],
                'aria-label': route.label + ' 案例',
              },
              [
                isDesignerRoute
                  ? h('base-screen-designer', {
                      id: 'playground-designer',
                      'data-framework': 'vue',
                      'data-host-runtime': 'mock',
                      ref: designer,
                    })
                  : h('base-screen-viewer', {
                      id: 'playground-viewer',
                      'data-framework': 'vue',
                      'data-host-runtime': 'mock',
                      ref: viewer,
                    }),
              ],
            ),
            h('aside', { class: 'runtime-inspector' }, [
              h('div', { class: 'inspector-heading' }, [
                h('span', '数据集目录'),
                h('strong', isDataRoute || isDesignerRoute ? runtimeState.datasetId : '未使用'),
              ]),
              h(
                'p',
                { class: 'inspector-copy' },
                isDesignerRoute
                  ? 'Designer 已接入数据集目录，可在数据面板选择数据集并配置字段角色。'
                  : isDataRoute
                    ? datasetDescription(runtimeState.datasetId)
                    : '进入 Designer、Dataset 或 Binding 查看真实宿主数据流。',
              ),
              isDesignerRoute
                ? h('div', { class: 'inspector-heading' }, [
                    h('span', '设计器变更'),
                    h('strong', String(designerChanges.value)),
                  ])
                : null,
              h('div', { class: 'inspector-heading' }, [
                h('span', '最近请求'),
                h('strong', String(runtimeState.requests.length)),
              ]),
              h(
                'ol',
                { class: 'request-list' },
                runtimeState.requests
                  .slice(0, 5)
                  .map((request) =>
                    h('li', [
                      h('code', request.componentId),
                      h('span', `${request.resourceId} · ${String(request.params.region ?? '-')}`),
                    ]),
                  ),
              ),
            ]),
          ]),
        ]),
      ]);
    };
  },
});

createApp(PlaygroundApp).mount('#app');

Object.assign(window, {
  playgroundRuntime: { state: runtimeState, resourcePort, variablePort, datasetCatalog },
});

function createBasicDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
    components: [
      text('title', 'Base Screen Playground', 80, 92, 520, 70, 42, '#e9f2ff'),
      text('subtitle', '真实 Vue 应用负责状态与宿主端口。', 84, 184, 520, 44, 20, '#9fb1c9'),
      rectangle('accent', 84, 276, 280, 132, '#173d47'),
      {
        id: 'vue-status',
        type: vueStatusManifest.type,
        name: 'Vue 状态卡片',
        parentId: null,
        position: { x: 420, y: 276 },
        size: { width: 132, height: 132 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: { label: 'Vue 应用', value: '已连接', tone: 'teal' },
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function createDataDocument(
  prefix: string,
  title: string,
  useRegionVariable = true,
): ScreenDocument {
  const source = {
    type: 'host-resource' as const,
    resourceType: 'dataset',
    resourceId: runtimeState.datasetId,
    params: {
      limit: { kind: 'literal' as const, value: 5 } satisfies ScreenHostResourceParameter,
      region: useRegionVariable
        ? ({ kind: 'variable', name: 'region' } satisfies ScreenHostResourceParameter)
        : ({ kind: 'literal', value: runtimeState.region } satisfies ScreenHostResourceParameter),
    },
  };
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#111923' },
    components: [
      text(`${prefix}-title`, title, 48, 40, 620, 58, 30, '#f5f8fc'),
      {
        id: `${prefix}-table`,
        type: 'base.table',
        name: '表格',
        parentId: null,
        position: { x: 48, y: 128 },
        size: { width: 420, height: 300 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: BASE_SCREEN_TABLE_MATERIAL_MANIFEST.defaultProps,
        style: BASE_SCREEN_TABLE_MATERIAL_MANIFEST.defaultStyle,
        dataSource: {
          ...source,
          binding: { fields: { columns: ['category', 'amount', 'orders'] } },
        },
      },
      {
        id: `${prefix}-chart`,
        type: 'base.chart',
        name: '图表',
        parentId: null,
        position: { x: 500, y: 128 },
        size: { width: 420, height: 300 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: BASE_SCREEN_CHART_MATERIAL_MANIFEST.defaultProps,
        style: BASE_SCREEN_CHART_MATERIAL_MANIFEST.defaultStyle,
        dataSource: {
          ...source,
          binding: { fields: { dimension: ['category'], measures: ['amount', 'orders'] } },
        },
      },
    ],
    variables: useRegionVariable ? [{ type: 'host', name: 'region', variableId: 'region' }] : [],
    blueprint: { rules: [] },
  };
}

function createErrorDocument(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#241923' },
    components: [
      text('error-title', '安全失败案例', 80, 94, 520, 70, 42, '#f5f8fc'),
      {
        id: 'error-data',
        type: 'base.text',
        name: '失败数据',
        parentId: null,
        position: { x: 84, y: 210 },
        size: { width: 520, height: 42 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: { color: '#ff9c9c', fontSize: 18, fontWeight: '400', textAlign: 'left' },
        dataSource: {
          type: 'host-resource',
          resourceType: 'dataset',
          resourceId: 'playground-error',
          params: {},
          binding: null,
        },
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function text(
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  color: string,
): ScreenDocument['components'][number] {
  return {
    id,
    type: 'base.text',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { color, fontSize, fontWeight: '700', textAlign: 'left' },
    dataSource: { type: 'static', value },
  };
}

function rectangle(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
): ScreenDocument['components'][number] {
  return {
    id,
    type: 'base.rectangle',
    name: id,
    parentId: null,
    position: { x, y },
    size: { width, height },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: { fill, borderColor: '#39c5bb', borderWidth: 1, opacity: 1 },
    dataSource: null,
  };
}

function normalizePath(pathname: string): PlaygroundPath {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return routes.some((route) => route.path === path) ? (path as PlaygroundPath) : '/';
}

function toPlaygroundPath(pathname: string): PlaygroundPath {
  return normalizePath(pathname || '/');
}

function datasetDescription(datasetId: PlaygroundDatasetId): string {
  return (
    listPlaygroundDatasets().find((dataset) => dataset.resourceId === datasetId)?.description ?? ''
  );
}
