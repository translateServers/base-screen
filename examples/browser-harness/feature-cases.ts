import type { BaseScreenDesignerElement } from '../../packages/sdk/src/index.ts';
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

/** 大屏组件案例：四个 DataV 风格物料一次入场，最后选中装饰边框以露出插件检查器控件。 */
const DATAV_CASE_COMPONENTS: readonly {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly props: Record<string, unknown>;
  readonly dataSource: unknown;
}[] = [
  {
    id: 'datav-flop-demo',
    type: 'datav.digital-flop',
    name: '数字翻牌器',
    position: { x: 60, y: 380 },
    size: { width: 260, height: 110 },
    props: { title: '今日订单', decimals: 0, thousandsSeparator: true },
    dataSource: { type: 'static', value: 128_430 },
  },
  {
    id: 'datav-water-demo',
    type: 'datav.water-level',
    name: '水位图',
    position: { x: 340, y: 380 },
    size: { width: 150, height: 170 },
    props: { title: '资源占用', shape: 'circle', decimals: 1 },
    dataSource: { type: 'static', value: 68.5 },
  },
  {
    id: 'datav-board-demo',
    type: 'datav.scroll-board',
    name: '轮播列表',
    position: { x: 510, y: 380 },
    size: { width: 390, height: 170 },
    props: { title: '实时排行', rowCount: 4, autoScroll: true },
    dataSource: {
      type: 'static',
      value: {
        fields: [
          { id: 'name', label: '名称', valueType: 'string', nullable: false },
          { id: 'value', label: '数值', valueType: 'number', nullable: false },
        ],
        rows: [
          { name: '上海', value: 982 },
          { name: '深圳', value: 871 },
          { name: '北京', value: 763 },
          { name: '杭州', value: 654 },
          { name: '成都', value: 542 },
        ],
      },
    },
  },
  {
    id: 'datav-border-demo',
    type: 'datav.border-box',
    name: '装饰边框',
    position: { x: 60, y: 30 },
    size: { width: 520, height: 330 },
    props: { title: '数据总览', borderStyle: 'corner-brackets', bracketSize: 22, lineWidth: 2 },
    dataSource: null,
  },
];

async function applyPluginDatavMaterials(designer: BaseScreenDesignerElement): Promise<void> {
  setHostShellVisible(false);
  designer.setWorkbenchMode('canvas');
  for (const component of DATAV_CASE_COMPONENTS) {
    if (designer.document?.components.some((item) => item.id === component.id) === true) continue;
    const result = designer.executeCommand({
      type: 'add-component',
      component: {
        ...component,
        parentId: null,
        rotation: 0,
        zIndex: 60,
        status: { locked: false, hidden: false },
        style: {},
      },
    });
    if (!result.ok) return;
  }
  await painted();
  await selectLayer(designer, 'datav-border-demo');
  clickShadow(designer, '[data-inspector-tab="appearance"]');
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

const CASE_APPLIERS = {
  canvas: applyCanvas,
  'material-groups': applyMaterialGroups,
  'plugin-command': applyPluginCommand,
  'plugin-panel': applyPluginPanel,
  'inspector-control': applyInspectorControl,
  'plugin-material': applyPluginMaterial,
  'plugin-data-resource': applyPluginDataResource,
  'plugin-datav-materials': applyPluginDatavMaterials,
  dataset: applyDataset,
  'semantic-chart': applySemanticChart,
  blueprint: applyBlueprint,
  'host-authoring': applyHostAuthoring,
  variables: applyVariables,
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
