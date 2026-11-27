import type { BaseScreenMaterialSpec } from '../../src/index.js';

/**
 * L2 模板物料的测试样本（ADR-0116）：单值仪表与多行折线，各自体检零错误。
 * 写法与 `tooling/verification/browser-harness/template-materials.ts` 的 S5 对照物料一致；
 * 包测试不能从 tooling 导入，所以这里留一份。
 */
export const GAUGE_SPEC: BaseScreenMaterialSpec = {
  type: 'host.online.tpl-gauge',
  name: '环形仪表',
  category: '指标',
  keywords: ['仪表盘'],
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
    { key: 'trackColor', label: '轨道色', section: 'surface', kind: 'color', default: '#1e293b' },
    { key: 'fillColor', label: '主色', section: 'semantic', kind: 'color', default: '#22d3ee' },
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
};

export const LINE_SPEC: BaseScreenMaterialSpec = {
  type: 'host.online.tpl-line',
  name: '折线',
  category: '图表',
  keywords: ['折线'],
  defaultSize: { width: 420, height: 220 },
  fields: [
    {
      key: 'showPoints',
      label: '显示数据点',
      section: 'structure',
      kind: 'boolean',
      default: true,
    },
    { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#94a3b8' },
    {
      key: 'fontSize',
      label: '字号',
      section: 'text',
      kind: 'number',
      default: 16,
      min: 16,
      max: 32,
      unit: 'px',
    },
    {
      key: 'backgroundColor',
      label: '背景色',
      section: 'surface',
      kind: 'color',
      default: '#0b1220',
    },
    { key: 'strokeColor', label: '线条色', section: 'surface', kind: 'color', default: '#38bdf8' },
  ],
  data: {
    kind: 'rows',
    roles: [
      { id: 'category', label: '类目', valueType: 'string' },
      { id: 'amount', label: '数值', valueType: 'number' },
    ],
    sample: [
      { category: '1月', amount: 120 },
      { category: '2月', amount: 168 },
      { category: '3月', amount: 142 },
    ],
  },
  events: [
    {
      name: 'pointClick',
      label: '点击数据点',
      payload: { category: { type: 'string', value: 'row.category' } },
    },
  ],
  template: {
    viewBox: [0, 0, 420, 220],
    nodes: [
      {
        kind: 'rect',
        id: 'bg',
        x: 0,
        y: 0,
        width: 420,
        height: 220,
        fill: 'style.backgroundColor',
      },
      {
        kind: 'polyline',
        id: 'line',
        points: {
          source: 'rows',
          x: '48 + index * 348 / max(count - 1, 1)',
          y: "174 - scale(row.amount, minOf(rows, 'amount'), maxOf(rows, 'amount'), 0, 140)",
        },
        stroke: 'style.strokeColor',
        strokeWidth: 3,
      },
      {
        kind: 'when',
        id: 'points-on',
        test: 'props.showPoints',
        children: [
          {
            kind: 'repeat',
            id: 'points',
            source: 'rows',
            children: [
              {
                kind: 'circle',
                id: 'point',
                r: 5,
                cx: '48 + index * 348 / max(count - 1, 1)',
                cy: "174 - scale(row.amount, minOf(rows, 'amount'), maxOf(rows, 'amount'), 0, 140)",
                fill: 'style.backgroundColor',
                stroke: 'style.strokeColor',
                strokeWidth: 3,
                on: 'pointClick',
              },
            ],
          },
        ],
      },
      {
        kind: 'repeat',
        id: 'labels',
        source: 'rows',
        children: [
          {
            kind: 'text',
            id: 'label',
            x: '48 + index * 348 / max(count - 1, 1)',
            y: 204,
            fontSize: 'style.fontSize',
            anchor: 'middle',
            baseline: 'middle',
            content: 'row.category',
            fill: 'style.color',
            backdrop: 'bg',
          },
        ],
      },
    ],
  },
};
