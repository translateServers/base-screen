import { LineChart } from 'echarts/charts';
import { GridComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { getInstanceByDom, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { h } from 'vue';
import VChart from 'vue-echarts';
import { createBaseScreenMaterialCatalog } from '../../packages/plugin-core/src/index.ts';
import { defineBaseScreenDesigner, defineBaseScreenViewer } from '../../packages/sdk/src/index.ts';
import { createVueMaterialDefinition } from '../../packages/vue/src/index.ts';

use([CanvasRenderer, LineChart, GridComponent, TitleComponent, TooltipComponent]);

const designerDefinition = defineBaseScreenDesigner();
const viewerDefinition = defineBaseScreenViewer();
if (!designerDefinition.ok || !viewerDefinition.ok) {
  throw new Error('Base Screen Vue harness failed to register its designer/viewer.');
}

const materialManifest = (type: string, tagName: string, name: string, propsSchema: unknown) => ({
  type,
  tagName,
  name,
  category: 'Vue 专场',
  keywords: ['vue'],
  defaultSize: { width: 400, height: 260 },
  defaultProps: { title: name, data: [120, 200, 150, 80, 170] },
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema,
  propertyPanel: [],
  events: [],
  dataCapabilities: ['static' as const],
  designCapabilities: { resize: true, rotate: true, children: false },
});

const chartPropsSchema = {
  kind: 'object' as const,
  properties: {
    title: { kind: 'string' as const },
    data: { kind: 'array' as const, items: { kind: 'number' as const } },
  },
  required: ['title', 'data'],
};

const chartOption = (props: { title: string; data: number[] }) => ({
  title: { text: props.title, left: 'center', textStyle: { color: '#e9f2ff' } },
  tooltip: { trigger: 'axis' as const },
  grid: { left: 44, right: 20, top: 44, bottom: 32 },
  xAxis: {
    type: 'category' as const,
    data: ['周一', '周二', '周三', '周四', '周五'],
    axisLabel: { color: '#9fb1c9' },
  },
  yAxis: {
    type: 'value' as const,
    axisLabel: { color: '#9fb1c9' },
    splitLine: { lineStyle: { color: 'rgba(159,177,201,0.18)' } },
  },
  series: [
    {
      type: 'line' as const,
      data: props.data,
      smooth: true,
      lineStyle: { color: '#39c5bb' },
      itemStyle: { color: '#39c5bb' },
    },
  ],
});

// 朴素桥接：直接把 vue-echarts 的 VChart 当作桥接组件使用。
// vue-echarts 依靠它注入的全局样式表（x-vue-echarts { width:100%; height:100% }）
// 撑开图表宿主。物料被挂载在 designer/viewer 的 shadow root 内，全局样式无法穿透，
// 但 @base-screen/vue 桥接层会把匹配组件根标签的全局规则传播进宿主 shadow root，
// 并在根元素塌陷为 0×0 时重挂组件，因此朴素桥接也能正常显示。
const naiveChartComponent = {
  props: ['title', 'data'],
  setup(props: { title: string; data: number[] }) {
    return () => h(VChart, { option: chartOption(props) });
  },
};

// 对照桥接：物料侧显式指定内联尺寸 + 开启 autoresize，
// 不依赖桥接层样式传播也能渲染；用于验证两种路径都可用。
const fixedChartComponent = {
  props: ['title', 'data'],
  setup(props: { title: string; data: number[] }) {
    return () =>
      h(VChart, {
        class: 'vue-chart-fixed',
        option: chartOption(props),
        style: 'display:block;width:100%;height:100%;',
        autoresize: true,
      });
  },
};

const textManifest = {
  type: 'harness.vue-text',
  tagName: 'harness-vue-text',
  name: 'Vue 文本按钮',
  category: 'Vue 专场',
  keywords: ['vue'],
  defaultSize: { width: 360, height: 48 },
  defaultProps: { label: 'Vue 桥接基线' },
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
  designCapabilities: { resize: true, rotate: true, children: false },
};

const textComponent = {
  props: ['label', 'onValueClick'],
  setup(props: { label: string; onValueClick: (payload: unknown) => void }) {
    return () =>
      h(
        'div',
        { style: 'display:flex;align-items:center;gap:12px;height:100%;box-sizing:border-box;' },
        [
          h('span', { class: 'vue-label' }, props.label),
          h(
            'button',
            {
              type: 'button',
              style:
                'background:#1d2a3a;color:#e9f2ff;border:1px solid #33465c;border-radius:4px;cursor:pointer;',
              onClick: () => props.onValueClick({ framework: 'vue' }),
            },
            '点我',
          ),
        ],
      );
  },
};

const baseline = createVueMaterialDefinition({
  manifest: textManifest,
  component: textComponent,
  eventProps: { valueClick: 'onValueClick' },
});
const naiveChart = createVueMaterialDefinition({
  manifest: materialManifest(
    'harness.vue-chart-naive',
    'harness-vue-chart-naive',
    'VChart 朴素桥接',
    chartPropsSchema,
  ),
  component: naiveChartComponent,
});
const fixedChart = createVueMaterialDefinition({
  manifest: materialManifest(
    'harness.vue-chart-fixed',
    'harness-vue-chart-fixed',
    'VChart 对照桥接',
    chartPropsSchema,
  ),
  component: fixedChartComponent,
});
if (!baseline.ok || !naiveChart.ok || !fixedChart.ok) {
  throw new Error('Base Screen Vue harness failed to create its bridge materials.');
}
customElements.define(baseline.value.manifest.tagName, baseline.value.constructor);
customElements.define(naiveChart.value.manifest.tagName, naiveChart.value.constructor);
customElements.define(fixedChart.value.manifest.tagName, fixedChart.value.constructor);
const catalog = createBaseScreenMaterialCatalog([
  baseline.value,
  naiveChart.value,
  fixedChart.value,
]);

const buildDocument = (seed: number) => ({
  canvas: { width: 960, height: 540, backgroundColor: '#17212b' },
  components: [
    {
      id: 'baseline',
      type: baseline.value.manifest.type,
      name: 'Vue 桥接基线',
      parentId: null,
      position: { x: 60, y: 56 },
      size: { width: 360, height: 48 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: { label: 'Vue 桥接基线' },
      style: {},
      dataSource: null,
    },
    {
      id: 'chart-naive',
      type: naiveChart.value.manifest.type,
      name: 'VChart 朴素桥接',
      parentId: null,
      position: { x: 60, y: 140 },
      size: { width: 420, height: 260 },
      rotation: 0,
      zIndex: 2,
      status: { locked: false, hidden: false },
      props: { title: '朴素桥接（桥接层样式传播）', data: chartData(seed) },
      style: {},
      dataSource: null,
    },
    {
      id: 'chart-fixed',
      type: fixedChart.value.manifest.type,
      name: 'VChart 对照桥接',
      parentId: null,
      position: { x: 500, y: 140 },
      size: { width: 420, height: 260 },
      rotation: 0,
      zIndex: 3,
      status: { locked: false, hidden: false },
      props: { title: '对照桥接（内联显式尺寸）', data: chartData(seed) },
      style: {},
      dataSource: null,
    },
  ],
  variables: [{ type: 'static' as const, name: 'seed', value: seed }],
  blueprint: { rules: [] },
});

function chartData(seed: number): number[] {
  return [120, 200, 150, 80, 170].map((value) => value + seed);
}

let seed = 0;
let documentSnapshot = buildDocument(seed);

const designer = document.querySelector('base-screen-designer')!;
const viewer = document.querySelector('base-screen-viewer')!;

designer.catalog = catalog;
designer.toolMaterialTypes = {
  text: 'harness.vue-text',
};
// 编组依赖 children=true 的容器物料，Vue 专场物料均不可容纳子元素，
// 不配置 groupMaterialType，Group 命令按 ADR-0012 保持禁用。
designer.document = documentSnapshot;
designer.addEventListener('base-screen-change', (event) => {
  viewer.document = (event as CustomEvent<{ document: typeof documentSnapshot }>).detail.document;
});
viewer.catalog = catalog;
viewer.document = documentSnapshot;

const diagnostics = document.querySelector<HTMLElement>('[data-diagnostics]')!;
const eventLog = document.querySelector<HTMLElement>('#event-log')!;
const hostEvents: unknown[] = [];
viewer.addEventListener('base-screen-material-event', (event) => {
  hostEvents.push((event as CustomEvent<unknown>).detail);
  eventLog.textContent = hostEvents
    .map((entry, index) => `#${index + 1} ${JSON.stringify(entry)}`)
    .join('\n');
});

interface MaterialDiagnostic {
  readonly id: string;
  readonly type: string;
  readonly host: { readonly width: number; readonly height: number };
  readonly hasChart: boolean;
  readonly chartHost: { readonly width: number; readonly height: number };
  readonly canvas: { readonly width: number; readonly height: number } | undefined;
  readonly initialized: boolean;
  readonly contentRendered: boolean;
}

interface SurfaceDiagnostic {
  readonly surface: string;
  readonly materials: readonly MaterialDiagnostic[];
}

function readMaterialDiagnostic(element: Element): MaterialDiagnostic {
  const host = element.getBoundingClientRect();
  const chartElement = element.querySelector('x-vue-echarts') ?? undefined;
  const hostDiv = chartElement?.querySelector('.echarts-host') ?? undefined;
  const canvas = hostDiv?.querySelector('canvas') ?? undefined;
  const hasChart = chartElement !== undefined;
  const canvasRect = canvas?.getBoundingClientRect();
  return {
    id: element.getAttribute('data-base-screen-component-id') ?? 'unknown',
    type: element.tagName.toLowerCase(),
    host: { width: host.width, height: host.height },
    hasChart,
    chartHost: hasChart
      ? {
          width: chartElement.getBoundingClientRect().width,
          height: chartElement.getBoundingClientRect().height,
        }
      : { width: 0, height: 0 },
    canvas:
      hasChart && canvasRect !== undefined
        ? { width: canvasRect.width, height: canvasRect.height }
        : undefined,
    initialized: hasChart
      ? hostDiv !== undefined && getInstanceByDom(hostDiv as HTMLElement) !== undefined
      : false,
    // 图表物料看画布是否非零；普通 Vue 物料看宿主是否有尺寸且渲染了内容。
    contentRendered: hasChart
      ? canvasRect !== undefined && canvasRect.width > 0 && canvasRect.height > 0
      : host.width > 0 &&
        host.height > 0 &&
        (element.childElementCount > 0 || (element.textContent ?? '').trim().length > 0),
  };
}

function readSurfaceDiagnostic(name: string, root: ShadowRoot | undefined): SurfaceDiagnostic {
  const elements = root?.querySelectorAll('[data-base-screen-component-id]') ?? [];
  return { surface: name, materials: [...elements].map(readMaterialDiagnostic) };
}

function runDiagnostics() {
  const surfaces = [
    readSurfaceDiagnostic('designer', designer.shadowRoot),
    readSurfaceDiagnostic('viewer', viewer.shadowRoot),
  ];
  diagnostics.textContent = '';
  for (const surface of surfaces) {
    const heading = document.createElement('div');
    heading.className = 'diagnostic-row';
    heading.innerHTML = `<span class="diagnostic-key">${surface.surface}</span><span>${surface.materials.length} 个物料</span>`;
    diagnostics.appendChild(heading);
    for (const row of surface.materials) {
      const line = document.createElement('div');
      line.className = 'diagnostic-row';
      const visible = row.contentRendered;
      const detail = row.hasChart
        ? `物料 ${row.host.width.toFixed(0)}×${row.host.height.toFixed(0)} · ` +
          `宿主 ${row.chartHost.width.toFixed(0)}×${row.chartHost.height.toFixed(0)} · ` +
          `画布 ${row.canvas === undefined ? '无' : `${row.canvas.width.toFixed(0)}×${row.canvas.height.toFixed(0)}`} · ` +
          `实例 ${row.initialized ? '已创建' : '未创建'}`
        : `物料 ${row.host.width.toFixed(0)}×${row.host.height.toFixed(0)} · 普通 Vue 内容`;
      line.innerHTML =
        `<span class="diagnostic-key">${row.id}</span>` + `<span>${row.type}<br>${detail}</span>`;
      const badge = document.createElement('span');
      badge.className = visible ? 'diagnostic-ok' : 'diagnostic-fail';
      badge.textContent = visible ? '内容可见' : '内容不可见';
      line.appendChild(badge);
      diagnostics.appendChild(line);
    }
  }
  return surfaces;
}

document
  .querySelector<HTMLButtonElement>('[data-action="rerender"]')!
  .addEventListener('click', () => {
    seed += 13;
    documentSnapshot = buildDocument(seed);
    designer.document = documentSnapshot;
    viewer.document = documentSnapshot;
    setTimeout(runDiagnostics, 150);
  });
document
  .querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]')!
  .addEventListener('click', () => {
    designer.style.display = designer.style.display === 'none' ? '' : 'none';
    viewer.style.display = viewer.style.display === 'none' ? '' : 'none';
    setTimeout(runDiagnostics, 150);
  });
document
  .querySelector<HTMLButtonElement>('[data-action="refresh"]')!
  .addEventListener('click', runDiagnostics);
setTimeout(runDiagnostics, 300);

Object.assign(window, {
  vueHarness: {
    designer,
    viewer,
    catalog,
    getDocument: () => documentSnapshot,
    hostEvents,
    runDiagnostics,
    render(seedOverride?: number) {
      seed = seedOverride ?? seed;
      documentSnapshot = buildDocument(seed);
      designer.document = documentSnapshot;
      viewer.document = documentSnapshot;
    },
  },
});
