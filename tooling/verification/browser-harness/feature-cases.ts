import type { BaseScreenDesignerElement } from '../../../packages/sdk/src/index.ts';
import {
  FEATURE_CASE_CATALOG,
  type FeatureCaseCatalogEntry,
  type FeatureCaseId,
  featureCaseQuery,
} from './feature-case-catalog.ts';
import { HARNESS_INSPECTOR_MATERIAL_TYPE } from './inspector-control-fixture.ts';

export { FEATURE_CASE_CATALOG, featureCaseQuery } from './feature-case-catalog.ts';

const INSPECTOR_DEMO_ID = 'inspector-demo';
const PLUGIN_PANEL_ID = 'harness.panel';

export interface FeatureCaseDefinition extends FeatureCaseCatalogEntry {
  readonly apply: (designer: BaseScreenDesignerElement) => Promise<void>;
}

function clickShadow(designer: BaseScreenDesignerElement, selector: string): void {
  designer.shadowRoot?.querySelector<HTMLElement>(selector)?.click();
}

function painted(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function setHostShellVisible(visible: boolean): void {
  if (visible) {
    document.body.dataset.caseHostShell = 'true';
    return;
  }
  delete document.body.dataset.caseHostShell;
}

async function until(predicate: () => boolean, attempts = 20): Promise<boolean> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return true;
    await painted();
  }
  return false;
}

async function selectLayer(
  designer: BaseScreenDesignerElement,
  componentId: string,
): Promise<void> {
  clickShadow(designer, '[data-panel-tab="layers"]');
  await until(
    () => designer.shadowRoot?.querySelector(`[data-layer-select="${componentId}"]`) !== null,
  );
  clickShadow(designer, `[data-layer-select="${componentId}"]`);
  await until(() => designer.selection.focusedComponentId === componentId);
}

async function applyCanvas(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  clickShadow(designer, '[data-panel-tab="materials"]');
  await painted();
}

async function applyMaterialGroups(designer: BaseScreenDesignerElement): Promise<void> {
  await applyCanvas(designer);
}

async function applyPluginCommand(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  await selectLayer(designer, 'subtitle');
}

async function applyPluginPanel(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  await until(
    () =>
      designer.shadowRoot?.querySelector(`[data-plugin-panel-tab="${PLUGIN_PANEL_ID}"]`) !== null,
  );
  clickShadow(designer, `[data-plugin-panel-tab="${PLUGIN_PANEL_ID}"]`);
  await painted();
}

async function applyInspectorControl(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  const exists = designer.document?.components.some(
    (component) => component.id === INSPECTOR_DEMO_ID,
  );
  if (!exists) {
    const result = designer.executeCommand({
      type: 'add-component',
      component: {
        id: INSPECTOR_DEMO_ID,
        type: HARNESS_INSPECTOR_MATERIAL_TYPE,
        name: '检查器控件样例',
        parentId: null,
        position: { x: 60, y: 420 },
        size: { width: 240, height: 80 },
        rotation: 0,
        zIndex: 40,
        status: { locked: false, hidden: false },
        props: { title: '检查器控件样例', tone: 'neutral', caption: 'untouched' },
        style: {},
        dataSource: { type: 'static', value: null },
      },
    });
    if (!result.ok) return;
    await painted();
  }
  await selectLayer(designer, INSPECTOR_DEMO_ID);
  clickShadow(designer, '[data-inspector-tab="appearance"]');
  await painted();
}

async function applyPluginMaterial(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  // 插件物料必须先被加进文档才能看到渲染结果；断言侧会自行添加，这里只定位到物料库分类。
  await until(
    () => designer.shadowRoot?.querySelector('[data-material-card="plugin.echarts"]') !== null,
  );
  clickShadow(designer, '[data-panel-tab="materials"]');
  await painted();
}

async function applyPluginDataResource(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  // 资源类型作者面在数据面板；选中一个声明 host-resource 的组件后即可看到资源类型。
  const target = designer.document?.components.find((item) => item.id === 'host-data')?.id;
  if (target !== undefined) await selectLayer(designer, target);
  clickShadow(designer, '[data-inspector-tab="data"]');
  await painted();
}

/**
 * 大屏组件案例：四个 DataV 风格物料一次入场，最后选中装饰边框以露出插件检查器控件。
 *
 * 用公开 `insertComponent` 建节点、再经 `update-components` 只覆盖布局与 props：
 * manifest 的 `defaultData`（含 tabular 的 `defaultBinding`）由 `insertComponent` 展开成
 * 初始数据源，所以这里**不重写 `dataSource`**。此前手搭完整节点、把 `style` 写成 `{}`，
 * props/styles 不符合物料 schema，事务被拒，case 看起来"打开了但画布上什么都没有"；
 * 之后又把 `dataSource` 覆盖成不带 binding 的裸数据集，tabular 物料因此拿不到表格数据
 * （Renderer 需要 binding 才会跑 adapter），轮播列表退化成"数据不可用"。
 *
 * 坐标刻意排在左侧约 650×540 的可视区内（画布 960×540，右侧检查器会盖住右缘），
 * 且装饰边框声明最低 zIndex 充当外框，其余三个摆在框内。`update-components` 同时改
 * position/size，避免 insertComponent 按默认尺寸做的贴边裁剪把摆位挪走。
 */
const DATAV_CASE_FRAME_Z_INDEX = 1;
const DATAV_CASE_WIDGET_Z_INDEX = 20;

const DATAV_CASE_COMPONENTS: readonly {
  readonly type: string;
  readonly name: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly zIndex: number;
  readonly props: Record<string, unknown>;
}[] = [
  {
    type: 'datav.border-box',
    name: '装饰边框',
    position: { x: 12, y: 12 },
    size: { width: 636, height: 516 },
    zIndex: DATAV_CASE_FRAME_Z_INDEX,
    props: { borderStyle: 'corner-brackets', bracketSize: 22, lineWidth: 2 },
  },
  {
    type: 'datav.digital-flop',
    name: '数字翻牌器',
    position: { x: 36, y: 64 },
    size: { width: 300, height: 130 },
    zIndex: DATAV_CASE_WIDGET_Z_INDEX,
    props: { decimals: 0, thousandsSeparator: true },
  },
  {
    type: 'datav.water-level',
    name: '水位图',
    position: { x: 364, y: 64 },
    size: { width: 150, height: 190 },
    zIndex: DATAV_CASE_WIDGET_Z_INDEX,
    props: { shape: 'circle', decimals: 1 },
  },
  {
    type: 'datav.scroll-board',
    name: '轮播列表',
    position: { x: 36, y: 300 },
    size: { width: 478, height: 200 },
    zIndex: DATAV_CASE_WIDGET_Z_INDEX,
    props: { rowCount: 4, autoScroll: true },
  },
];

/**
 * 标题由文档层用官方文本物料组合，而不是内建在指标物料里——这正是原子化组件要演示的用法：
 * 需要标题就并排放一个 `base.text`，可以独立换行、配色、对齐，不需要时直接删掉。
 *
 * 位置对齐各自组件的左缘（并留出组件内 8px padding），让"贴在一起"看起来仍是一组。
 */
const DATAV_CASE_TITLES: readonly {
  readonly text: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly style: Record<string, unknown>;
}[] = [
  {
    text: '数据总览',
    position: { x: 28, y: 24 },
    size: { width: 300, height: 26 },
    style: { fontSize: 18, fontWeight: '700', textAlign: 'left', color: '#e6f1ff' },
  },
  {
    text: '今日订单',
    position: { x: 44, y: 64 },
    size: { width: 284, height: 20 },
    style: { fontSize: 13, fontWeight: '400', textAlign: 'left', color: '#8aa4c0' },
  },
  {
    text: '资源占用',
    position: { x: 372, y: 64 },
    size: { width: 134, height: 20 },
    style: { fontSize: 13, fontWeight: '400', textAlign: 'left', color: '#8aa4c0' },
  },
  {
    text: '实时排行',
    position: { x: 44, y: 300 },
    size: { width: 462, height: 20 },
    style: { fontSize: 13, fontWeight: '400', textAlign: 'left', color: '#8aa4c0' },
  },
];

async function applyPluginDatavMaterials(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  let borderId: string | undefined;
  const specs: readonly {
    readonly type: string;
    readonly name: string;
    readonly position: { readonly x: number; readonly y: number };
    readonly size?: { readonly width: number; readonly height: number };
    readonly zIndex?: number;
    readonly props?: Record<string, unknown>;
    readonly style?: Record<string, unknown>;
    readonly dataSource?: unknown;
  }[] = [
    ...DATAV_CASE_COMPONENTS,
    ...DATAV_CASE_TITLES.map((entry) => ({
      type: 'base.text',
      name: entry.text,
      position: entry.position,
      size: entry.size,
      zIndex: DATAV_CASE_WIDGET_Z_INDEX,
      props: { autoWidth: false },
      style: entry.style,
      // `base.text` 的可见文案来自数据源（不是组件名），所以标题文本得写进 static 数据。
      dataSource: { type: 'static', value: entry.text },
    })),
  ];
  for (const spec of specs) {
    // 重复应用同一 case 时不重复插入：按类型 + 名称判存在（标题是 base.text，类型会重名）。
    const existing = designer.document?.components.find(
      (item) => item.type === spec.type && item.name === spec.name,
    );
    if (existing !== undefined) {
      if (spec.type === 'datav.border-box') borderId = existing.id;
      continue;
    }
    const inserted = designer.insertComponent({
      materialType: spec.type,
      name: spec.name,
      position: spec.position,
    });
    if (!inserted.ok) return;
    const id = designer.selection.focusedComponentId;
    if (id === null) return;
    const manifest = designer.catalog?.get(spec.type)?.manifest;
    if (manifest === undefined) return;
    const patched = designer.executeCommand({
      type: 'update-components',
      componentIds: [id],
      patch: {
        // 位置与尺寸一次改到位：insertComponent 已按默认尺寸做过贴边裁剪。
        position: spec.position,
        ...(spec.size === undefined ? {} : { size: spec.size }),
        ...(spec.zIndex === undefined ? {} : { zIndex: spec.zIndex }),
        // props/style 都是整体替换：在 manifest 默认值上覆盖，避免漏掉 schema 必填字段。
        props: { ...manifest.defaultProps, ...spec.props },
        ...(spec.style === undefined ? {} : { style: { ...manifest.defaultStyle, ...spec.style } }),
        ...(spec.dataSource === undefined ? {} : { dataSource: spec.dataSource }),
      },
    });
    if (!patched.ok) return;
    if (spec.type === 'datav.border-box') borderId = id;
  }
  await painted();
  if (borderId !== undefined) await selectLayer(designer, borderId);
  clickShadow(designer, '[data-inspector-tab="appearance"]');
  await painted();
}

/** 运行期贡献案例：选中挂着插件动作规则的组件，露出宿主动作的声明名。 */
async function applyPluginRuntime(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  await selectLayer(designer, 'subtitle');
  await painted();
}

async function applyDataset(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  await selectLayer(designer, 'dataset-ranking-demo');
  clickShadow(designer, '[data-inspector-tab="data"]');
  await painted();
}

async function applySemanticChart(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  await selectLayer(designer, 'semantic-chart-demo');
  clickShadow(designer, '[data-inspector-tab="appearance"]');
  await painted();
}

async function applyBlueprint(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('blueprint');
  await painted();
}

async function applyHostAuthoring(designer: BaseScreenDesignerElement): Promise<void> {
  designer.setWorkbenchMode('canvas');
  await selectLayer(designer, 'title');
  setHostShellVisible(true);
  designer.requestComponentTextEdit('props');
  await painted();
}

async function applyVariables(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  clickShadow(designer, '[data-panel-tab="variables"]');
  await painted();
}

const COMPOSITE_CARD_NAME = '组合底座';

/**
 * 组合分片案例：一次 `insertComponentFragment` 建出一张卡片。
 *
 * 这张卡不是某个"卡片物料"，而是四个原子物料的组合——底座 `base.container` 作 shell，
 * 标题与读数是 `base.text`，中间一条 `base.rule`。`props`/`style` 只写增量，基座负责与
 * manifest 默认值合并后过 schema，因此不需要像 `plugin-datav-materials` 那样先 insert
 * 再整体 patch 一遍。shell 物料 `libraryVisible: false`，不可从物料库插入，但按
 * `designCapabilities.children` 作为组合外壳是允许的。
 */
async function applyCompositeInsertion(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  const already = designer.document?.components.some(
    (component) => component.name === COMPOSITE_CARD_NAME,
  );
  if (already !== true) {
    designer.insertComponentFragment({
      anchor: { x: 680, y: 56 },
      shell: {
        key: 'shell',
        materialType: 'base.container',
        name: COMPOSITE_CARD_NAME,
        size: { width: 240, height: 120 },
        style: { fill: '#101a2e', borderColor: '#2b3f5c', borderWidth: 1, opacity: 1 },
      },
      nodes: [
        {
          key: 'title',
          materialType: 'base.text',
          name: '组合标题',
          offset: { x: 16, y: 12 },
          size: { width: 208, height: 22 },
          style: { fontSize: 14, fontWeight: '400', color: '#8aa4c0', textAlign: 'left' },
          dataSource: { type: 'static', value: '组合读数' },
        },
        {
          key: 'rule',
          materialType: 'base.rule',
          name: '组合分隔线',
          offset: { x: 16, y: 40 },
          size: { width: 208, height: 2 },
        },
        {
          key: 'value',
          materialType: 'base.text',
          name: '组合读数',
          offset: { x: 16, y: 50 },
          size: { width: 208, height: 58 },
          style: { fontSize: 34, fontWeight: '700', color: '#39c5bb', textAlign: 'left' },
          dataSource: { type: 'static', value: '42.7%' },
        },
      ],
    });
  }
  const shell = designer.document?.components.find(
    (component) => component.name === COMPOSITE_CARD_NAME,
  );
  if (shell !== undefined) await selectLayer(designer, shell.id);
  clickShadow(designer, '[data-inspector-tab="appearance"]');
  await painted();
}

const CASE_APPLIERS = {
  canvas: applyCanvas,
  'material-groups': applyMaterialGroups,
  'plugin-command': applyPluginCommand,
  'plugin-panel': applyPluginPanel,
  'inspector-control': applyInspectorControl,
  'plugin-material': applyPluginMaterial,
  'plugin-data-resource': applyPluginDataResource,
  'plugin-datav-materials': applyPluginDatavMaterials,
  'plugin-runtime': applyPluginRuntime,
  dataset: applyDataset,
  'semantic-chart': applySemanticChart,
  blueprint: applyBlueprint,
  'host-authoring': applyHostAuthoring,
  variables: applyVariables,
  'composite-insertion': applyCompositeInsertion,
} as const satisfies Record<FeatureCaseId, FeatureCaseDefinition['apply']>;

export const FEATURE_CASES: readonly FeatureCaseDefinition[] = FEATURE_CASE_CATALOG.map(
  (entry) => ({
    ...entry,
    apply: CASE_APPLIERS[entry.id],
  }),
);

export function featureCaseById(id: string | null): FeatureCaseDefinition | undefined {
  if (id === null || id.length === 0) return undefined;
  return FEATURE_CASES.find((item) => item.id === id);
}

function currentSearch(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function caseUrl(caseId: string, stressGrouping: boolean): string {
  return `${window.location.pathname}${featureCaseQuery({ id: caseId, stressGrouping })}${window.location.hash}`;
}

function renderDock(activeId: string | undefined): void {
  const root = document.querySelector<HTMLElement>('[data-feature-cases]');
  const list = document.querySelector<HTMLElement>('[data-feature-cases-list]');
  const hint = document.querySelector<HTMLElement>('[data-feature-cases-hint]');
  if (root === null || list === null || hint === null) return;
  const active = featureCaseById(activeId ?? null);
  if (active === undefined) {
    hint.replaceChildren('选择一条专项案例，设计器会跳到对应选区或面板。');
  } else {
    const command = document.createElement('code');
    command.textContent = `${active.focused} · ${active.verify}`;
    hint.replaceChildren(`${active.lookAt} 改动面：${active.packages.join(' / ')}。`, command);
  }
  list.replaceChildren(
    ...FEATURE_CASES.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.featureCase = item.id;
      button.title = item.summary;
      button.textContent = item.title;
      if (item.id === activeId) button.setAttribute('aria-current', 'page');
      return button;
    }),
  );
  root.hidden = false;
  document.body.dataset.caseDock = 'true';
}

async function applyFromLocation(designer: BaseScreenDesignerElement): Promise<void> {
  const params = currentSearch();
  const requested = params.get('case');
  const showDock = requested !== null || params.has('cases');
  if (!showDock) {
    const root = document.querySelector<HTMLElement>('[data-feature-cases]');
    if (root !== null) root.hidden = true;
    delete document.body.dataset.caseDock;
    setHostShellVisible(false);
    return;
  }
  document.body.dataset.layout = 'designer';
  const definition = featureCaseById(requested);
  renderDock(definition?.id);
  if (definition === undefined) return;
  const stressOn = params.has('material-group-stress');
  if (stressOn !== definition.stressGrouping) {
    window.location.assign(caseUrl(definition.id, definition.stressGrouping));
    return;
  }
  await definition.apply(designer);
}

export function mountFeatureCases(designer: BaseScreenDesignerElement): void {
  const root = document.querySelector<HTMLElement>('[data-feature-cases]');
  if (root === null) return;
  root.addEventListener('click', (event) => {
    const close = (event.target as HTMLElement).closest('[data-feature-cases-close]');
    if (close !== null) {
      root.hidden = true;
      delete document.body.dataset.caseDock;
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-feature-case]');
    const caseId = button?.dataset.featureCase;
    const definition = featureCaseById(caseId ?? null);
    if (definition === undefined) return;
    const next = caseUrl(definition.id, definition.stressGrouping);
    const stressOn = currentSearch().has('material-group-stress');
    if (stressOn !== definition.stressGrouping) {
      window.location.assign(next);
      return;
    }
    history.pushState({ featureCase: definition.id }, '', next);
    void applyFromLocation(designer);
  });
  window.addEventListener('popstate', () => {
    void applyFromLocation(designer);
  });
  void applyFromLocation(designer);
}
