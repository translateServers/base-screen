import type { ScreenParseResult } from 'base-screen/contracts';
import {
  type BaseScreenFragmentDefinition,
  parseBaseScreenFragmentDefinition,
} from 'base-screen/plugin-core';
import {
  auditBaseScreenMaterialSpec,
  BASE_SCREEN_MATERIAL_SPEC_SECTIONS,
  type BaseScreenAuthoringFinding,
  type BaseScreenMaterialSpec,
  type BaseScreenMaterialSpecField,
  compileBaseScreenMaterialSpec,
  hasBaseScreenAuthoringErrors,
  parseBaseScreenMaterialSpec,
} from 'base-screen/plugins';
import { api } from '../lib/api';
import type {
  ComponentDraftShape,
  ComponentScreenReferenceShape,
  OnlineMaterialPackageShape,
} from '../types';
import {
  buildSpecMaterialModule,
  draftTemplateMaterialWithAgent,
  importSpecMaterialModule,
  isSpecMaterialModule,
  type MaterialDraftAgentOutcome,
  readIsolatedMaterialModule,
  readSpecMaterialModule,
} from './component-workshop';
import { loadHostRuntime } from './host-runtime';
import { METRIC_CARD_FRAGMENT } from './metric-value';

/**
 * 组件库的宿主侧模型（ADR-0106）：把后端的三份数据——已发布的在线物料包（`MaterialPackage`）、
 * 原子组件草稿（`ComponentDraft`）、组合（`ComponentFragment`）——汇成作者看到的一张组件列表，
 * 并提供发布 / 草稿 / 上下架 / 删除这几条流程。
 *
 * 规格、渲染骨架与体检全部来自 SDK（ADR-0105 §2.2–§2.6）；这里只做宿主编排与作者用语。
 * 页面（`views/component-*.ts`）只消费这里的函数，不直接拼接口。
 */

export const ONLINE_COMPONENT_TYPE_PREFIX = 'host.online.';
const TAG_PREFIX = 'host-online';
const FRAGMENT_ID_PREFIX = 'host-app.fragment';

// ———————————————————————————— 作者用语 ————————————————————————————

/** 检查器分组（规格 `section`）的作者用语与顺序，直接取 SDK 的分区词汇。 */
export const COMPONENT_SECTION_OPTIONS: readonly {
  readonly id: BaseScreenMaterialSpecField['section'];
  readonly label: string;
}[] = BASE_SCREEN_MATERIAL_SPEC_SECTIONS.map((section) => ({
  id: section.id,
  label: section.label,
}));

export const COMPONENT_FIELD_KIND_OPTIONS: readonly {
  readonly id: BaseScreenMaterialSpecField['kind'];
  readonly label: string;
  readonly glyph: string;
}[] = [
  { id: 'number', label: '数字', glyph: '#' },
  { id: 'text', label: '文本', glyph: 'T' },
  { id: 'boolean', label: '开关', glyph: '◐' },
  { id: 'color', label: '颜色', glyph: '●' },
  { id: 'choice', label: '选项', glyph: '≡' },
];

export const COMPONENT_DATA_OPTIONS: readonly {
  readonly id: BaseScreenMaterialSpec['data']['kind'];
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'none', label: '不需要数据', hint: '装饰或纯配置驱动的组件' },
  { id: 'scalar', label: '一个数值或文字', hint: '读数、百分比、状态文字' },
  { id: 'rows', label: '一张表', hint: '排行、列表、多系列' },
];

// ———————————————————————————— 模板 ————————————————————————————

export interface AtomicComponentSource {
  /**
   * 规格（作者编辑中可能暂时不合法；发布前由 SDK 解析与体检把关）。
   * 带 `template` 的是 L2 模板物料（ADR-0116）：没有渲染代码，`renderBody` 为空串。
   */
  readonly spec: BaseScreenMaterialSpec;
  readonly renderBody: string;
}

/** 是否 L2 模板物料：编辑器据此把代码面板换成模板面板。 */
export function isTemplateComponentSource(source: AtomicComponentSource): boolean {
  return source.spec.template !== undefined;
}

export interface AtomicComponentTemplate {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  build(type: string): AtomicComponentSource;
}

const METRIC_RENDER = `// 只在 root 里绘制；数据就绪时才会调用，加载 / 空态 / 出错由 SDK 统一呈现。
const align = { 靠左: 'flex-start', 居中: 'center', 靠右: 'flex-end' }[props.align] ?? 'flex-start';
root.style.cssText = \`display:flex;align-items:center;justify-content:\${align}\`;
const reading = document.createElement('span');
reading.textContent = formatNumber(value);
reading.style.cssText = \`color:\${style.color};font:600 \${style.fontSize}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap\`;
root.append(reading);`;

const RING_RENDER = `const percent = Math.max(0, Math.min(100, Number(value) || 0));
const box = Math.min(size.width, size.height);
const stroke = Math.min(Number(style.strokeWidth) || 12, box / 3);
const radius = (box - stroke) / 2;
const length = 2 * Math.PI * radius;
const ns = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(ns, 'svg');
svg.setAttribute('viewBox', \`0 0 \${box} \${box}\`);
svg.style.cssText = 'display:block;width:100%;height:100%';
const ring = (color, dash) => {
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', String(box / 2));
  circle.setAttribute('cy', String(box / 2));
  circle.setAttribute('r', String(radius));
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', String(color));
  circle.setAttribute('stroke-width', String(stroke));
  if (dash !== undefined) {
    circle.setAttribute('stroke-dasharray', \`\${dash} \${length}\`);
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('transform', \`rotate(-90 \${box / 2} \${box / 2})\`);
  }
  return circle;
};
svg.append(ring(style.trackColor), ring(style.fillColor, (percent / 100) * length));
root.style.cssText = 'display:grid;place-items:center;position:relative';
root.append(svg);
if (props.showValue) {
  const reading = document.createElement('span');
  reading.textContent = formatNumber(value);
  reading.style.cssText = \`position:absolute;color:\${style.color};font:600 \${style.fontSize}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums\`;
  root.append(reading);
}`;

const DELTA_RENDER = `const delta = Number(value);
const up = delta > 0;
const flat = !Number.isFinite(delta) || delta === 0;
const better = props.higherIsBetter ? up : !up;
const color = flat ? style.color : better ? style.positiveColor : style.negativeColor;
root.style.cssText = 'display:flex;align-items:center;gap:6px';
const arrow = document.createElement('span');
arrow.textContent = flat ? '—' : up ? '▲' : '▼';
arrow.style.cssText = \`color:\${color};font-size:\${Math.round(Number(style.fontSize) * 0.6)}px\`;
const reading = document.createElement('span');
reading.textContent = formatNumber(Number.isFinite(delta) ? Math.abs(delta) : value);
reading.style.cssText = \`color:\${color};font:600 \${style.fontSize}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums\`;
root.append(arrow, reading);`;

const RANK_RENDER = `const limit = Math.max(1, Number(props.limit) || 5);
const sorted = [...rows]
  .filter((row) => typeof row.value === 'number')
  .sort((a, b) => b.value - a.value)
  .slice(0, limit);
const max = Math.max(...sorted.map((row) => row.value), 1);
root.style.cssText = 'display:flex;flex-direction:column;justify-content:space-around;gap:6px';
for (const row of sorted) {
  const line = document.createElement('div');
  line.style.cssText = \`display:grid;grid-template-columns:5em 1fr auto;align-items:center;gap:8px;color:\${style.color};font:\${style.fontSize}px/1.2 system-ui,sans-serif\`;
  const name = document.createElement('span');
  name.textContent = String(row.name ?? '');
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const track = document.createElement('span');
  track.style.cssText = \`height:8px;border-radius:4px;background:\${style.trackColor};overflow:hidden\`;
  const bar = document.createElement('span');
  bar.style.cssText = \`display:block;height:100%;width:\${(row.value / max) * 100}%;background:\${style.fillColor}\`;
  track.append(bar);
  const reading = document.createElement('span');
  reading.textContent = formatNumber(row.value);
  reading.style.cssText = 'font-variant-numeric:tabular-nums';
  line.append(name, track, reading);
  root.append(line);
}`;

const LAMP_RENDER = `const states = {
  运行: style.runningColor,
  待机: style.standbyColor,
  故障: style.faultColor,
  离线: style.offlineColor,
};
const text = String(value ?? '');
const color = states[text] ?? style.unknownColor;
root.style.cssText = 'display:flex;align-items:center;gap:8px';
const dot = document.createElement('span');
const box = Math.max(6, Math.min(size.height, 18));
dot.style.cssText = \`flex:none;width:\${box}px;height:\${box}px;border-radius:50%;background:\${color}\`;
root.append(dot);
if (props.showText) {
  const label = document.createElement('span');
  label.textContent = text || '--';
  label.style.cssText = \`color:\${style.color};font:500 \${style.fontSize}px/1 system-ui,sans-serif\`;
  root.append(label);
}`;

const BLANK_RENDER = `// 在 root 里绘制。可用：document、root、props、style、size、mode、value、rows、formatNumber。
root.style.cssText = \`display:grid;place-items:center;background:\${style.fill}\`;`;

const baseSpec = (
  type: string,
  input: Omit<BaseScreenMaterialSpec, 'type' | 'category' | 'keywords'> & {
    readonly keywords?: readonly string[];
  },
): BaseScreenMaterialSpec => ({
  type,
  category: '在线组件',
  keywords: input.keywords ?? [],
  name: input.name,
  defaultSize: input.defaultSize,
  ...(input.rotate === undefined ? {} : { rotate: input.rotate }),
  ...(input.numberFormat === undefined ? {} : { numberFormat: input.numberFormat }),
  fields: input.fields,
  data: input.data,
});

/** 新建原子组件的起点：都按 ADR-0099 / ADR-0102 范式写好，体检零错误。 */
export const ATOMIC_COMPONENT_TEMPLATES: readonly AtomicComponentTemplate[] = [
  {
    id: 'metric',
    name: '单值读数',
    hint: '一个数字 + 读数格式，最常用的 KPI 读数',
    build: (type) => ({
      spec: baseSpec(type, {
        name: '单值读数',
        keywords: ['读数', 'KPI'],
        defaultSize: { width: 220, height: 64 },
        numberFormat: { decimals: 1, unit: true, thousandsSeparator: true },
        fields: [
          {
            key: 'align',
            label: '对齐',
            section: 'structure',
            kind: 'choice',
            default: '靠左',
            options: ['靠左', '居中', '靠右'],
          },
          { key: 'color', label: '读数色', section: 'text', kind: 'color', default: '#e6f1ff' },
          {
            key: 'fontSize',
            label: '字号',
            section: 'text',
            kind: 'number',
            default: 40,
            min: 10,
            max: 160,
            unit: 'px',
          },
        ],
        data: { kind: 'scalar', valueType: 'number', sample: 12846.5 },
      }),
      renderBody: METRIC_RENDER,
    }),
  },
  {
    id: 'ring',
    name: '进度环',
    hint: '百分比进度，读数格式跟随「显示读数」开关',
    build: (type) => ({
      spec: baseSpec(type, {
        name: '进度环',
        keywords: ['进度', '百分比'],
        defaultSize: { width: 160, height: 160 },
        numberFormat: {
          decimals: 1,
          unit: '%',
          visibleWhen: { key: 'showValue', equals: true },
        },
        fields: [
          {
            key: 'showValue',
            label: '显示读数',
            section: 'format',
            kind: 'boolean',
            default: true,
          },
          {
            key: 'color',
            label: '读数色',
            section: 'text',
            kind: 'color',
            default: '#e6f1ff',
            visibleWhen: { key: 'showValue', equals: true },
          },
          {
            key: 'fontSize',
            label: '读数字号',
            section: 'text',
            kind: 'number',
            default: 26,
            min: 10,
            max: 72,
            unit: 'px',
            visibleWhen: { key: 'showValue', equals: true },
          },
          {
            key: 'trackColor',
            label: '轨道色',
            section: 'surface',
            kind: 'color',
            default: '#132f4c',
          },
          {
            key: 'fillColor',
            label: '填充色',
            section: 'surface',
            kind: 'color',
            default: '#38bdf8',
          },
          {
            key: 'strokeWidth',
            label: '线宽',
            section: 'surface',
            kind: 'number',
            default: 12,
            min: 2,
            max: 40,
            unit: 'px',
          },
        ],
        data: { kind: 'scalar', valueType: 'number', sample: 72.4 },
      }),
      renderBody: RING_RENDER,
    }),
  },
  {
    id: 'delta',
    name: '同比变化',
    hint: '箭头与颜色双重编码涨跌，「越高越好」决定哪一侧算改善',
    build: (type) => ({
      spec: baseSpec(type, {
        name: '同比变化',
        keywords: ['同比', '环比', '涨跌'],
        defaultSize: { width: 140, height: 40 },
        numberFormat: { decimals: 1, unit: '%' },
        fields: [
          {
            key: 'higherIsBetter',
            label: '越高越好',
            section: 'structure',
            kind: 'boolean',
            default: true,
          },
          { key: 'color', label: '持平色', section: 'text', kind: 'color', default: '#7fa6c4' },
          {
            key: 'fontSize',
            label: '字号',
            section: 'text',
            kind: 'number',
            default: 22,
            min: 10,
            max: 96,
            unit: 'px',
          },
          {
            key: 'positiveColor',
            label: '改善色',
            section: 'semantic',
            kind: 'color',
            default: '#34d399',
          },
          {
            key: 'negativeColor',
            label: '恶化色',
            section: 'semantic',
            kind: 'color',
            default: '#f87171',
          },
        ],
        data: { kind: 'scalar', valueType: 'number', sample: 12.6 },
      }),
      renderBody: DELTA_RENDER,
    }),
  },
  {
    id: 'rank',
    name: '排名条',
    hint: '一张「名称 + 数值」的表，按数值降序取前 N',
    build: (type) => ({
      spec: baseSpec(type, {
        name: '排名条',
        keywords: ['排名', '排行', 'TopN'],
        defaultSize: { width: 320, height: 200 },
        numberFormat: { decimals: 0, thousandsSeparator: true },
        fields: [
          {
            key: 'limit',
            label: '显示条数',
            section: 'structure',
            kind: 'number',
            default: 5,
            min: 1,
            max: 20,
            step: 1,
          },
          { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#e6f1ff' },
          {
            key: 'fontSize',
            label: '字号',
            section: 'text',
            kind: 'number',
            default: 13,
            min: 10,
            max: 32,
            unit: 'px',
          },
          {
            key: 'trackColor',
            label: '轨道色',
            section: 'surface',
            kind: 'color',
            default: '#132f4c',
          },
          {
            key: 'fillColor',
            label: '填充色',
            section: 'surface',
            kind: 'color',
            default: '#38bdf8',
          },
        ],
        data: {
          kind: 'rows',
          roles: [
            { id: 'name', label: '名称', valueType: 'string' },
            { id: 'value', label: '数值', valueType: 'number' },
          ],
          sample: [
            { name: '华东', value: 4820 },
            { name: '华南', value: 3960 },
            { name: '华北', value: 3410 },
            { name: '西南', value: 2280 },
            { name: '西北', value: 1240 },
          ],
        },
      }),
      renderBody: RANK_RENDER,
    }),
  },
  {
    id: 'lamp',
    name: '状态灯',
    hint: '运行 / 待机 / 故障 / 离线四态，正常低饱和、异常高亮',
    build: (type) => ({
      spec: baseSpec(type, {
        name: '状态灯',
        keywords: ['状态', '设备'],
        defaultSize: { width: 120, height: 28 },
        fields: [
          {
            key: 'showText',
            label: '显示状态文字',
            section: 'structure',
            kind: 'boolean',
            default: true,
          },
          {
            key: 'color',
            label: '文字色',
            section: 'text',
            kind: 'color',
            default: '#e6f1ff',
            visibleWhen: { key: 'showText', equals: true },
          },
          {
            key: 'fontSize',
            label: '字号',
            section: 'text',
            kind: 'number',
            default: 14,
            min: 10,
            max: 48,
            unit: 'px',
            visibleWhen: { key: 'showText', equals: true },
          },
          {
            key: 'runningColor',
            label: '运行',
            section: 'semantic',
            kind: 'color',
            default: '#2f9e6f',
          },
          {
            key: 'standbyColor',
            label: '待机',
            section: 'semantic',
            kind: 'color',
            default: '#5b7a99',
          },
          {
            key: 'faultColor',
            label: '故障',
            section: 'semantic',
            kind: 'color',
            default: '#f05252',
          },
          {
            key: 'offlineColor',
            label: '离线',
            section: 'semantic',
            kind: 'color',
            default: '#4b5563',
          },
          {
            key: 'unknownColor',
            label: '未知',
            section: 'semantic',
            kind: 'color',
            default: '#9ca3af',
          },
        ],
        data: { kind: 'scalar', valueType: 'string', sample: '运行' },
      }),
      renderBody: LAMP_RENDER,
    }),
  },
  {
    // L2 模板物料（ADR-0116）：没有渲染代码，外观由受限 SVG 图元模板描述。
    id: 'gauge-template',
    name: '环形仪表（无代码）',
    hint: '模板物料：图元 + 绑定表达式描述外观，在线包里没有代码',
    build: (type) => ({
      spec: {
        type,
        name: '环形仪表',
        category: '在线组件',
        keywords: ['仪表盘', '环形', '进度'],
        defaultSize: { width: 220, height: 220 },
        numberFormat: { decimals: 0, unit: '%' },
        fields: [
          { key: 'min', label: '最小值', section: 'structure', kind: 'number', default: 0 },
          { key: 'max', label: '最大值', section: 'structure', kind: 'number', default: 100 },
          { key: 'warnAt', label: '告警线', section: 'structure', kind: 'number', default: 80 },
          { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#e2e8f0' },
          {
            key: 'fontSize',
            label: '字号',
            section: 'text',
            kind: 'number',
            default: 36,
            min: 16,
            max: 72,
            unit: 'px',
          },
          {
            key: 'backgroundColor',
            label: '背景色',
            section: 'surface',
            kind: 'color',
            default: '#0b1220',
          },
          {
            key: 'trackColor',
            label: '轨道色',
            section: 'surface',
            kind: 'color',
            default: '#1e293b',
          },
          {
            key: 'fillColor',
            label: '主色',
            section: 'semantic',
            kind: 'color',
            default: '#22d3ee',
          },
          {
            key: 'warningColor',
            label: '告警色',
            section: 'semantic',
            kind: 'color',
            default: '#f87171',
          },
        ],
        statePresetKeys: ['fillColor'],
        data: { kind: 'scalar', valueType: 'number', sample: 72 },
        events: [
          {
            name: 'valueClick',
            label: '点击读数',
            payload: { value: { type: 'number', value: 'value' } },
          },
        ],
        template: {
          viewBox: [0, 0, 220, 220],
          nodes: [
            {
              kind: 'rect',
              id: 'bg',
              x: 0,
              y: 0,
              width: 220,
              height: 220,
              fill: 'style.backgroundColor',
            },
            {
              kind: 'arc',
              id: 'track',
              cx: 110,
              cy: 116,
              r: 88,
              thickness: 14,
              start: -135,
              end: 135,
              stroke: 'style.trackColor',
            },
            {
              kind: 'arc',
              id: 'fill',
              cx: 110,
              cy: 116,
              r: 88,
              thickness: 14,
              start: -135,
              end: '-135 + pct(value, props.min, props.max) * 270',
              stroke: 'value >= props.warnAt ? style.warningColor : style.fillColor',
              on: 'valueClick',
            },
            {
              kind: 'text',
              id: 'reading',
              x: 110,
              y: 116,
              fontSize: 'style.fontSize',
              fontWeight: 700,
              anchor: 'middle',
              baseline: 'middle',
              content: 'format(value)',
              fill: 'style.color',
              backdrop: 'bg',
            },
          ],
          animations: [{ kind: 'change', target: 'fill', attributes: ['end'], duration: 700 }],
        },
      },
      renderBody: '',
    }),
  },
  {
    id: 'blank',
    name: '空白',
    hint: '从零开始：一个填充色，其余自己加',
    build: (type) => ({
      spec: baseSpec(type, {
        name: '新组件',
        defaultSize: { width: 240, height: 120 },
        fields: [
          { key: 'fill', label: '填充色', section: 'surface', kind: 'color', default: '#0f2438' },
        ],
        data: { kind: 'none' },
      }),
      renderBody: BLANK_RENDER,
    }),
  },
];

/** 渲染代码里可用的变量（代码编辑器的补全与悬停说明）。 */
export const RENDER_CONTEXT_COMPLETIONS: readonly {
  readonly label: string;
  readonly detail: string;
}[] = [
  { label: 'root', detail: '绘制容器（满盒）。只在这里面画' },
  { label: 'props', detail: '结构类可调项的当前值' },
  { label: 'style', detail: '外观类可调项的当前值' },
  { label: 'size', detail: '组件尺寸 { width, height }' },
  { label: 'mode', detail: "'design' 编辑中 / 'preview' / 'runtime'" },
  { label: 'value', detail: '一个数值或文字（数据为单值时）' },
  { label: 'rows', detail: '表格的行，键为列 id（数据为一张表时）' },
  { label: 'formatNumber', detail: '按读数格式（小数位 / 单位 / 千分位）格式化' },
  { label: 'document', detail: '用来创建元素：document.createElement(...)' },
];

// ———————————————————————————— 组件列表 ————————————————————————————

export type AtomicComponentStatus = 'unpublished' | 'listed' | 'unlisted';

export interface AtomicComponentItem {
  readonly kind: 'atomic';
  readonly type: string;
  readonly name: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly status: AtomicComponentStatus;
  /** 有未发布的改动（草稿存在）。从未发布的组件也算。 */
  readonly hasDraft: boolean;
  readonly pkg: OnlineMaterialPackageShape | undefined;
  readonly draft: ComponentDraftShape | undefined;
  readonly references: readonly ComponentScreenReferenceShape[];
  readonly updatedAt: string;
  /** 作者当前要编辑的版本：有草稿取草稿，否则取已发布版本。读不出时为 undefined。 */
  readonly working: AtomicComponentSource | undefined;
  /** 已发布版本（未发布时为 undefined）。 */
  readonly published: AtomicComponentSource | undefined;
}

export interface FragmentComponentItem {
  readonly kind: 'fragment';
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly definition: BaseScreenFragmentDefinition;
  /** 宿主预置组合只读；后端组合可编辑。 */
  readonly preset: boolean;
  readonly revision: number;
  readonly updatedAt: string;
}

export type ComponentItem = AtomicComponentItem | FragmentComponentItem;

export interface ComponentLibrarySnapshot {
  readonly atomic: readonly AtomicComponentItem[];
  readonly fragments: readonly FragmentComponentItem[];
  /** 读不出来的条目：不阻断列表，逐条告诉作者。 */
  readonly warnings: readonly string[];
}

export async function loadComponentLibrary(
  signal?: AbortSignal,
): Promise<ScreenParseResult<ComponentLibrarySnapshot>> {
  const [packages, drafts, fragments, references] = await Promise.all([
    api.listMaterialPackages(signal),
    api.listComponentDrafts(signal),
    api.listComponentFragments(signal),
    api.listComponentReferences(signal),
  ]);
  const failed = [packages, drafts, fragments].find((result) => !result.ok);
  if (failed !== undefined && !failed.ok) return libraryFailure(failed.error.message);
  if (!packages.ok || !drafts.ok || !fragments.ok) return libraryFailure('组件库读取失败。');
  const warnings: string[] = [];
  const refs: Readonly<Record<string, readonly ComponentScreenReferenceShape[]>> = references.ok
    ? references.data.references
    : {};
  if (!references.ok) warnings.push(`引用统计读取失败：${references.error.message}`);

  const packageByType = new Map(
    packages.data.packages
      .filter((pkg) => pkg.type.startsWith(ONLINE_COMPONENT_TYPE_PREFIX))
      .map((pkg) => [pkg.type, pkg] as const),
  );
  const draftByType = new Map(drafts.data.drafts.map((draft) => [draft.type, draft] as const));
  const types = new Set([...packageByType.keys(), ...draftByType.keys()]);
  const atomic: AtomicComponentItem[] = [];
  for (const type of types) {
    const pkg = packageByType.get(type);
    const draft = draftByType.get(type);
    if (pkg !== undefined && !isSpecMaterialModule(pkg.code)) {
      // 旧模板生成的在线物料（ADR-0090 初版）照常在物料库里工作，只是不能在组件库里编辑。
      warnings.push(`「${pkg.name}」是旧版在线物料，组件库不提供编辑。`);
      continue;
    }
    if (pkg !== undefined && readIsolatedMaterialModule(pkg.code) !== undefined) {
      // L3 隔离代码组件（ADR-0117）：代码只在沙箱里运行，物料库里照常可用；组件库暂不提供编辑。
      warnings.push(`「${pkg.name}」是隔离代码组件，组件库暂不提供编辑。`);
      continue;
    }
    const published = pkg === undefined ? undefined : readSource(pkg.code);
    const working = draft === undefined ? published : readSource(draft.source);
    if (working === undefined) {
      warnings.push(`「${draft?.name ?? pkg?.name ?? type}」的源码无法读取。`);
    }
    const spec = working?.spec;
    const keywords = spec !== undefined && Array.isArray(spec.keywords) ? spec.keywords : [];
    atomic.push({
      kind: 'atomic',
      type,
      name: draft?.name ?? spec?.name ?? pkg?.name ?? type,
      category: typeof spec?.category === 'string' ? spec.category : '在线组件',
      keywords,
      status:
        pkg === undefined
          ? 'unpublished'
          : pkg.manifest.libraryVisible === false
            ? 'unlisted'
            : 'listed',
      hasDraft: draft !== undefined,
      pkg,
      draft,
      references: refs[type] ?? [],
      updatedAt: latest(draft?.updatedAt, pkg?.updatedAt),
      working,
      published,
    });
  }
  atomic.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const fragmentItems: FragmentComponentItem[] = [presetFragmentItem(METRIC_CARD_FRAGMENT)];
  for (const row of fragments.data.fragments) {
    const parsed = parseBaseScreenFragmentDefinition(row.definition);
    if (!parsed.ok) {
      warnings.push(`组合「${row.name}」的定义无效：${parsed.diagnostics[0]?.message ?? ''}`);
      continue;
    }
    fragmentItems.push({
      kind: 'fragment',
      id: row.id,
      name: parsed.value.name,
      category: parsed.value.category,
      keywords: parsed.value.keywords,
      definition: parsed.value,
      preset: false,
      revision: row.revision,
      updatedAt: row.updatedAt,
    });
  }
  return { ok: true, value: { atomic, fragments: fragmentItems, warnings }, diagnostics: [] };
}

/** 编辑页物料库要用的组合：宿主预置 + 后端保存的（解析失败的跳过）。 */
export async function loadHostFragmentDefinitions(): Promise<
  readonly BaseScreenFragmentDefinition[]
> {
  const result = await api.listComponentFragments();
  const saved = result.ok
    ? result.data.fragments.flatMap((row) => {
        const parsed = parseBaseScreenFragmentDefinition(row.definition);
        return parsed.ok ? [parsed.value] : [];
      })
    : [];
  return [METRIC_CARD_FRAGMENT, ...saved];
}

function presetFragmentItem(definition: BaseScreenFragmentDefinition): FragmentComponentItem {
  return {
    kind: 'fragment',
    id: definition.id,
    name: definition.name,
    category: definition.category,
    keywords: definition.keywords,
    definition,
    preset: true,
    revision: 0,
    updatedAt: '',
  };
}

function readSource(code: string): AtomicComponentSource | undefined {
  const read = readSpecMaterialModule(code);
  if (read === undefined || read.spec === null || typeof read.spec !== 'object') return undefined;
  return { spec: read.spec as BaseScreenMaterialSpec, renderBody: read.renderBody };
}

function latest(...values: readonly (string | undefined)[]): string {
  const sorted = values.filter((value): value is string => value !== undefined).sort();
  return sorted[sorted.length - 1] ?? '';
}

function libraryFailure(message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'HOST_RESOURCE_UNAVAILABLE', path: [], message }],
  };
}

// ———————————————————————————— 体检 ————————————————————————————

/** 体检结论定位到哪里：一个可调项、数据、读数格式、代码，或整体。 */
export type FindingTarget =
  | { readonly kind: 'field'; readonly index: number }
  | { readonly kind: 'data' }
  | { readonly kind: 'format' }
  | { readonly kind: 'code' }
  | { readonly kind: 'general' };

export function findingTarget(finding: BaseScreenAuthoringFinding): FindingTarget {
  // 渲染代码与 L2 模板共用底部面板：TPL 规则指向模板。
  if (finding.rule === 'RENDER' || /^TPL\d+$/.test(finding.rule)) return { kind: 'code' };
  if (finding.path?.[0] === 'template') return { kind: 'code' };
  const [head, index] = finding.path ?? [];
  if (head === 'fields' && typeof index === 'number') return { kind: 'field', index };
  if (head === 'data') return { kind: 'data' };
  if (head === 'numberFormat') return { kind: 'format' };
  return { kind: 'general' };
}

/**
 * 一次完整体检：规格与渲染代码的静态检查（SDK），再真的加载一次模块——语法错误只有加载才知道。
 */
export async function auditAtomicComponent(
  source: AtomicComponentSource,
): Promise<readonly BaseScreenAuthoringFinding[]> {
  const findings = [
    ...auditBaseScreenMaterialSpec(source.spec, { renderSource: source.renderBody }),
  ];
  if (hasBaseScreenAuthoringErrors(findings)) return findings;
  const parsed = parseBaseScreenMaterialSpec(source.spec);
  if (!parsed.ok) return findings;
  const imported = await importSpecMaterialModule(
    buildSpecMaterialModule(parsed.value, source.renderBody),
  );
  if (!imported.ok) {
    findings.unshift({
      rule: 'RENDER',
      severity: 'error',
      message: imported.diagnostics[0]?.message ?? '渲染代码无法加载。',
    });
  }
  return findings;
}

// ———————————————————————————— 草稿与发布 ————————————————————————————

export type LibraryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly message: string;
      readonly code?: string;
      readonly findings?: readonly BaseScreenAuthoringFinding[];
      readonly references?: readonly ComponentScreenReferenceShape[];
    };

export function createAtomicComponentType(name: string): string {
  const slug = slugify(name);
  return `${ONLINE_COMPONENT_TYPE_PREFIX}${/^[a-z]/.test(slug) ? slug : `c-${slug}`}-${randomToken(4)}`;
}

/**
 * 让智能体起草一个原子组件（ADR-0116 D7 / S6）：后端调模型，宿主前端解析 + 体检 + 最多 2 轮修复，
 * 通过后**只存成草稿**（新类型，不发布、不热刷新），作者在编辑器里看过、改过再发布。
 * 修不好如实返回体检结论，不存半成品。
 */
export async function draftAtomicComponentWithAgent(input: {
  readonly instruction: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: {
    readonly phase: 'drafting' | 'repairing';
    readonly round: number;
  }) => void;
}): Promise<
  | { readonly ok: true; readonly type: string; readonly outcome: MaterialDraftAgentOutcome }
  | { readonly ok: false; readonly message: string; readonly outcome?: MaterialDraftAgentOutcome }
> {
  const type = createAtomicComponentType('draft');
  const outcome = await draftTemplateMaterialWithAgent({
    instruction: input.instruction,
    type,
    category: '在线组件',
    ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
    request: async (body) => {
      const result = await api.draftMaterial(body.instruction, body.repair, input.signal);
      return result.ok
        ? { ok: true, output: result.data.output }
        : { ok: false, message: result.error.message };
    },
  });
  if (!outcome.ok) return { ok: false, message: outcome.message, outcome };
  const saved = await saveAtomicDraft({
    type,
    source: { spec: outcome.spec, renderBody: '' },
    revision: 0,
  });
  if (!saved.ok)
    return { ok: false, message: `起草成功，但保存草稿失败：${saved.message}`, outcome };
  return { ok: true, type, outcome };
}

/** 保存草稿：不影响已发布版本与正在使用的大屏（ADR-0106 D3）。 */
export async function saveAtomicDraft(input: {
  readonly type: string;
  readonly source: AtomicComponentSource;
  readonly revision: number;
}): Promise<LibraryResult<ComponentDraftShape>> {
  const name =
    typeof input.source.spec.name === 'string' && input.source.spec.name.trim() !== ''
      ? input.source.spec.name.trim()
      : '未命名组件';
  const result = await api.saveComponentDraft(input.type, {
    name: name.slice(0, 80),
    source: buildSpecMaterialModule(input.source.spec, input.source.renderBody),
    revision: input.revision,
  });
  return result.ok
    ? { ok: true, value: result.data.draft }
    : { ok: false, message: result.error.message, code: result.error.code };
}

export async function discardAtomicDraft(type: string): Promise<LibraryResult<null>> {
  const result = await api.deleteComponentDraft(type);
  return result.ok ? { ok: true, value: null } : { ok: false, message: result.error.message };
}

/**
 * 发布：体检 → 编译 Manifest（新 tagName，ADR-0090 §5）→ 写在线物料包 → 热刷新 catalog → 清草稿。
 * 体检有错误时不写任何东西。
 */
export async function publishAtomicComponent(input: {
  readonly type: string;
  readonly source: AtomicComponentSource;
  readonly pkg: OnlineMaterialPackageShape | undefined;
}): Promise<LibraryResult<OnlineMaterialPackageShape>> {
  const findings = await auditAtomicComponent(input.source);
  if (hasBaseScreenAuthoringErrors(findings)) {
    return { ok: false, message: '体检有错误，修正后再发布。', findings };
  }
  const parsed = parseBaseScreenMaterialSpec(input.source.spec);
  if (!parsed.ok) return { ok: false, message: '组件定义不完整。', findings };
  const visible = input.pkg?.manifest.libraryVisible !== false;
  const manifest = compileBaseScreenMaterialSpec(parsed.value, {
    tagName: `${TAG_PREFIX}-${slugify(input.type.slice(ONLINE_COMPONENT_TYPE_PREFIX.length))}-${randomToken(8)}`,
    ...(visible ? {} : { libraryVisible: false }),
  });
  if (!manifest.ok) {
    return { ok: false, message: manifest.diagnostics[0]?.message ?? '清单编译失败。' };
  }
  const body = {
    type: input.type,
    name: parsed.value.name.slice(0, 80),
    manifest: manifest.value as unknown as Record<string, unknown>,
    code: buildSpecMaterialModule(parsed.value, input.source.renderBody),
  };
  const saved =
    input.pkg === undefined
      ? await api.createMaterialPackage(body)
      : await api.updateMaterialPackage(input.pkg.id, { ...body, revision: input.pkg.revision });
  if (!saved.ok) return { ok: false, message: saved.error.message, code: saved.error.code };
  const runtime = await loadHostRuntime();
  const applied = await runtime.applyOnlineMaterialPackage(saved.data.package, 'code');
  if (!applied.ok) {
    return {
      ok: false,
      message: `已保存，但装载进物料库失败：${applied.diagnostics[0]?.message ?? '未知错误'}`,
    };
  }
  // 发布即「草稿 = 已发布」：删掉草稿，组件库据此显示「已发布、无改动」。失败只影响徽标。
  await api.deleteComponentDraft(input.type);
  return { ok: true, value: saved.data.package };
}

export async function setAtomicVisibility(
  pkg: OnlineMaterialPackageShape,
  visible: boolean,
): Promise<LibraryResult<OnlineMaterialPackageShape>> {
  const result = await api.setMaterialPackageVisibility(pkg.id, visible);
  if (!result.ok) return { ok: false, message: result.error.message };
  const runtime = await loadHostRuntime();
  const applied = await runtime.applyOnlineMaterialPackage(result.data.package, 'manifest');
  if (!applied.ok) {
    return { ok: false, message: applied.diagnostics[0]?.message ?? '物料库刷新失败。' };
  }
  return { ok: true, value: result.data.package };
}

/** 删除：被大屏引用的已发布组件由后端阻断（返回引用列表），建议改为下架。 */
export async function deleteAtomicComponent(
  item: AtomicComponentItem,
): Promise<LibraryResult<null>> {
  if (item.pkg !== undefined) {
    const removed = await api.deleteMaterialPackage(item.pkg.id);
    if (!removed.ok) {
      const refScreens = removed.error.payload?.refScreens;
      return {
        ok: false,
        message: removed.error.message,
        code: removed.error.code,
        references: Array.isArray(refScreens)
          ? (refScreens as ComponentScreenReferenceShape[])
          : item.references,
      };
    }
    const runtime = await loadHostRuntime();
    await runtime.removeOnlineMaterialPackage(item.type);
  }
  return discardAtomicDraft(item.type);
}

// ———————————————————————————— 组合 ————————————————————————————

export function createFragmentId(): string {
  return `${FRAGMENT_ID_PREFIX}-${Date.now().toString(36)}-${randomToken(4)}`;
}

export async function saveFragmentDefinition(input: {
  readonly definition: BaseScreenFragmentDefinition;
  readonly revision: number | undefined;
}): Promise<LibraryResult<{ readonly revision: number }>> {
  const parsed = parseBaseScreenFragmentDefinition(input.definition);
  if (!parsed.ok) {
    return { ok: false, message: parsed.diagnostics[0]?.message ?? '组合定义无效。' };
  }
  const definition = parsed.value as unknown as Record<string, unknown>;
  const result =
    input.revision === undefined
      ? await api.createComponentFragment(definition)
      : await api.updateComponentFragment(parsed.value.id, definition, input.revision);
  return result.ok
    ? { ok: true, value: { revision: result.data.fragment.revision } }
    : { ok: false, message: result.error.message, code: result.error.code };
}

export async function deleteFragment(id: string): Promise<LibraryResult<null>> {
  const result = await api.deleteComponentFragment(id);
  return result.ok ? { ok: true, value: null } : { ok: false, message: result.error.message };
}

// ———————————————————————————— 编辑页往返 ————————————————————————————

const RETURN_KEY = 'base-screen.host.component-return';

/** 与 `asset-return.ts` 同形：只记住 `#/screens/<id>/edit`，组件库据此显示「返回大屏」。 */
export function rememberComponentReturn(href: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, href);
  } catch {
    // 存储不可用时只是少了返回入口。
  }
}

export function readComponentReturn(): { readonly href: string } | null {
  try {
    const href = sessionStorage.getItem(RETURN_KEY);
    return href !== null && /^#\/screens\/[^/]+\/edit$/.test(href) ? { href } : null;
  } catch {
    return null;
  }
}

export function clearComponentReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // 同上。
  }
}

// ———————————————————————————— 小工具 ————————————————————————————

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug.length > 0 ? slug : 'component';
}

export function randomToken(length: number): string {
  const source =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : Math.random().toString(36).slice(2);
  return source.slice(0, length);
}
