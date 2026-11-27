import type { ScreenComponent, ScreenDocument, ScreenJsonValue } from '../../../packages/contracts/src/index.ts';
import type { BaseScreenMaterialCatalogEntry, BaseScreenMaterialManifest } from '../../../packages/plugin-core/src/index.ts';
import { createBaseScreenMaterialCatalog } from '../../../packages/plugin-core/src/index.ts';
import {
  auditBaseScreenMaterialSpec,
  createBaseScreenSpecMaterialDefinition,
} from '../../../packages/plugin-sdk/src/index.ts';
import type { BaseScreenViewerElement } from '../../../packages/sdk/src/index.ts';
import { defineBaseScreenElements } from '../../../packages/sdk/src/index.ts';
import {
  definePluginBoardBorderBoxMaterial,
  definePluginBoardDigitalFlopMaterial,
  definePluginBoardWaterLevelMaterial,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
} from '../../../plugins/plugin-materials/src/index.ts';
import { HARNESS_TEMPLATE_MATERIAL_SPECS } from './template-materials.ts';

/**
 * ADR-0116 D9 对照页：左边手写物料（有对应的才放），右边 L2 模板物料。
 * 「换一组读数」重新注入文档，观察模板的读数过渡；查看器下动画播放、事件可点。
 */

const elements = defineBaseScreenElements();
if (!elements.ok) throw new Error('Base Screen 元素注册失败。');

function unwrap(result: { ok: boolean; value?: BaseScreenMaterialCatalogEntry; diagnostics: readonly { message: string; path: readonly (string | number)[] }[] }, label: string): BaseScreenMaterialCatalogEntry {
  if (!result.ok || result.value === undefined) {
    throw new Error(`${label} 注册失败：${result.diagnostics.map((item) => `${item.path.join('.')} ${item.message}`).join('；')}`);
  }
  return result.value;
}

const entries: BaseScreenMaterialCatalogEntry[] = [
  unwrap(definePluginBoardWaterLevelMaterial(), '水位图'),
  unwrap(definePluginBoardDigitalFlopMaterial(), '翻牌器'),
  unwrap(definePluginBoardBorderBoxMaterial(), '边框'),
];
const auditLog: string[] = [];
HARNESS_TEMPLATE_MATERIAL_SPECS.forEach((spec, index) => {
  const findings = auditBaseScreenMaterialSpec(spec);
  for (const finding of findings) {
    auditLog.push(`${spec.name} · ${finding.rule} ${finding.severity} ${finding.path?.join('.') ?? ''} ${finding.message}`);
  }
  const definition = createBaseScreenSpecMaterialDefinition({ spec, tagName: `harness-tpl-${index}` });
  if (!definition.ok) {
    throw new Error(`${spec.name}：${definition.diagnostics.map((item) => `${item.path.join('.')} ${item.message}`).join('；')}`);
  }
  entries.push(unwrap(definition.value.define(), spec.name));
});
const catalog = createBaseScreenMaterialCatalog(entries);
const manifests = new Map(entries.map((entry) => [entry.manifest.type, entry.manifest]));

// 反例：每条只犯一种错，检验体检规则确实报得出来。
const BASE_BAD = HARNESS_TEMPLATE_MATERIAL_SPECS[2] as (typeof HARNESS_TEMPLATE_MATERIAL_SPECS)[number];
const BAD_TEMPLATE = BASE_BAD.template as NonNullable<typeof BASE_BAD.template>;
const withNodes = (nodes: readonly unknown[]) => ({ ...BASE_BAD, template: { ...BAD_TEMPLATE, nodes, animations: [] } }) as unknown;
const BG = BAD_TEMPLATE.nodes[0];
const TEXT = (patch: Record<string, unknown>) => ({
  kind: 'text',
  id: 'reading',
  x: 110,
  y: 110,
  fontSize: 'style.fontSize',
  content: 'format(value)',
  fill: 'style.color',
  backdrop: 'bg',
  ...patch,
});
const BAD_CASES: readonly [string, unknown, string?][] = [
  ['TPL1 白名单外元素', withNodes([BG, { kind: 'foreignObject', id: 'html' }])],
  ['TPL1 事件属性', withNodes([BG, { kind: 'rect', id: 'r', x: 0, y: 0, width: 1, height: 1, onclick: 'alert(1)' }])],
  ['TPL1 url() 颜色', withNodes([{ ...BG, fill: 'url(https://evil.example/x)' }])],
  ['TPL2 引用未声明字段', withNodes([BG, TEXT({ content: 'props.secret' })])],
  ['TPL2 闭集外函数', withNodes([BG, TEXT({ content: 'fetch(value)' })])],
  ['TPL3 repeat 超限', withNodes([BG, { kind: 'repeat', id: 'many', source: { range: 500 }, children: [] }])],
  ['TPL4 id 重复', withNodes([BG, { ...BG }])],
  ['TPL5 颜色由数据算出', withNodes([BG, TEXT({ fill: "concat('#', value)" })])],
  ['TPL5 字号随数据变化', withNodes([BG, TEXT({ fontSize: 'value / 2' })])],
  ['TPL6 文字没有底板', withNodes([BG, TEXT({ backdrop: undefined })])],
  ['TPL7 字号过小', withNodes([BG, TEXT({ fontSize: 12 })])],
  ['TPL8 对比度过低', withNodes([BG, TEXT({ fill: '#111827' })])],
  ['TPL9 示例数据求不出', withNodes([BG, TEXT({ x: 'value / 0 * 0' })])],
  ['TPL10 越界', withNodes([BG, { kind: 'circle', id: 'out', cx: 400, cy: 400, r: 20, fill: '#fff' }])],
  ['D1 模板与渲染代码同时出现', BASE_BAD, 'root.textContent = "x"'],
];
const badLog = BAD_CASES.map(([label, spec, renderSource]) => {
  const findings = auditBaseScreenMaterialSpec(
    spec,
    renderSource === undefined ? {} : { renderSource },
  ).filter((finding) => finding.rule !== 'R4');
  const rules = [...new Set(findings.map((finding) => finding.rule))].join(',') || '（无）';
  return `${label} → ${rules}：${findings[0]?.message ?? ''}`;
});

interface Pair {
  readonly title: string;
  readonly handwritten?: BaseScreenMaterialManifest;
  readonly template: string;
  readonly value: () => ScreenJsonValue | undefined;
}

const random = (low: number, high: number): number => Math.round((low + Math.random() * (high - low)) * 10) / 10;
const statuses = ['normal', 'warning', 'alarm', 'offline'];
let round = 0;

const PAIRS: readonly Pair[] = [
  { title: '水位图', handwritten: PLUGIN_BOARD_WATER_LEVEL_MANIFEST, template: 'harness.tpl-water-level', value: () => (round === 0 ? 68.5 : random(5, 98)) },
  { title: '翻牌器', handwritten: PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST, template: 'harness.tpl-digital-flop', value: () => (round === 0 ? 1286435 : Math.round(random(1000, 9_999_999))) },
  { title: '环形仪表', template: 'harness.tpl-gauge', value: () => (round === 0 ? 72 : random(0, 100)) },
  { title: '状态灯', template: 'harness.tpl-status-lamp', value: () => statuses[round % statuses.length] ?? 'normal' },
  {
    title: '折线',
    template: 'harness.tpl-line',
    value: () =>
      round === 0
        ? undefined
        : { fields: [{ id: 'category', label: '类目', valueType: 'string', nullable: false }, { id: 'amount', label: '数值', valueType: 'number', nullable: false }], rows: ['1月', '2月', '3月', '4月', '5月', '6月', '7月'].map((category) => ({ category, amount: random(60, 260) })) },
  },
  { title: '装饰边框', handwritten: PLUGIN_BOARD_BORDER_BOX_MANIFEST, template: 'harness.tpl-border-box', value: () => undefined },
];

function component(id: string, manifest: BaseScreenMaterialManifest, x: number, value: ScreenJsonValue | undefined): ScreenComponent {
  const size = manifest.defaultSize ?? { width: 200, height: 200 };
  const data = value ?? manifest.defaultData;
  // 多行静态数据要带字段绑定（设计器插入组件时从 staticData.defaultBinding 取同一份）。
  const binding =
    manifest.staticData?.kind === 'tabular' && manifest.staticData.defaultBinding !== undefined
      ? { binding: manifest.staticData.defaultBinding }
      : {};
  return {
    id,
    type: manifest.type,
    name: manifest.name,
    parentId: null,
    position: { x, y: 20 },
    size: { width: size.width, height: size.height },
    rotation: 0,
    zIndex: 1,
    status: { locked: false, hidden: false },
    props: structuredClone(manifest.defaultProps ?? {}),
    style: structuredClone(manifest.defaultStyle ?? {}),
    // 不收数据的物料（dataCapabilities 为空）：数据源写 null（文档必填字段，可为空）。
    ...((manifest.dataCapabilities ?? []).length === 0
      ? { dataSource: null }
      : { dataSource: { type: 'static' as const, value: data ?? null, ...binding } }),
  } as ScreenComponent;
}

function documentFor(pair: Pair): ScreenDocument {
  const template = manifests.get(pair.template) as BaseScreenMaterialManifest;
  const value = pair.value();
  const components: ScreenComponent[] = [];
  const left = pair.handwritten;
  if (left !== undefined) components.push(component('handwritten', left, 20, value));
  const x = left === undefined ? 20 : 40 + (left.defaultSize?.width ?? 200);
  components.push(component('template', template, x, value));
  const width = Math.max(480, x + (template.defaultSize?.width ?? 200) + 20);
  const height = 40 + Math.max(left?.defaultSize?.height ?? 0, template.defaultSize?.height ?? 0);
  return { canvas: { width, height, backgroundColor: '#05080c' }, components, blueprint: { nodes: [], edges: [] }, variables: [] };
}

const grid = document.querySelector<HTMLElement>('[data-pairs]') as HTMLElement;
const events = document.querySelector<HTMLElement>('[data-events]') as HTMLElement;
const audit = document.querySelector<HTMLElement>('[data-audit]') as HTMLElement;
audit.textContent = `${auditLog.length === 0 ? '体检：6 个模板物料无问题。' : auditLog.join('\n')}\n\n反例：\n${badLog.join('\n')}`;

const viewers: { readonly pair: Pair; readonly viewer: BaseScreenViewerElement }[] = [];
for (const pair of PAIRS) {
  const section = document.createElement('section');
  section.className = 'pair';
  section.dataset.pair = pair.template;
  const heading = document.createElement('h2');
  heading.textContent = pair.handwritten === undefined ? `${pair.title}（无手写对照）` : `${pair.title}：左手写 / 右模板`;
  const stage = document.createElement('div');
  stage.className = 'stage';
  const viewer = document.createElement('base-screen-viewer') as BaseScreenViewerElement;
  stage.append(viewer);
  section.append(heading, stage);
  grid.append(section);
  const configured = viewer.configure({ catalog });
  if (!configured.ok) throw new Error(`Viewer 配置失败：${pair.title}`);
  const problems = document.createElement('pre');
  problems.className = 'problems';
  problems.dataset.problems = pair.template;
  section.append(problems);
  viewer.addEventListener('base-screen-diagnostic', (event) => {
    const detail = (event as CustomEvent<{ diagnostics: readonly { code: string; path: readonly (string | number)[]; message: string }[] }>).detail;
    problems.textContent = detail.diagnostics.map((item) => `${item.code} ${item.path.join('.')} ${item.message}`).join('\n');
  });
  const doc = documentFor(pair);
  stage.style.aspectRatio = `${doc.canvas.width} / ${doc.canvas.height}`;
  viewer.document = doc;
  viewer.addEventListener('base-screen-material-event', (event) => {
    const detail = (event as CustomEvent).detail as unknown;
    events.textContent = `${pair.title}：${JSON.stringify(detail)}`;
  });
  viewers.push({ pair, viewer });
}

document.querySelector('[data-next]')?.addEventListener('click', () => {
  round += 1;
  for (const { pair, viewer } of viewers) viewer.document = documentFor(pair);
});

(globalThis as { __templateHarness?: unknown }).__templateHarness = { viewers, auditLog, badLog, next: () => (document.querySelector('[data-next]') as HTMLButtonElement).click() };
