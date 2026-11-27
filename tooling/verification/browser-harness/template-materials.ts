import type { BaseScreenMaterialSpec } from '../../../packages/plugin-sdk/src/index.ts';

/**
 * ADR-0116 D9：用 L2 模板改写的 6 种物料（只存在于验证工程）。
 *
 * 每个规格都只有数据、没有渲染代码；用来检验图元、表达式与动画的最小集是否够用，
 * 并与手写物料并排对照（templates.html）。
 */

const WATER_LEVEL: BaseScreenMaterialSpec = {
  type: 'harness.tpl-water-level',
  name: '水位图（模板）',
  category: '指标',
  keywords: ['水位', '百分比', '模板'],
  defaultSize: { width: 200, height: 240 },
  numberFormat: { decimals: 1, unit: '%' },
  fields: [
    { key: 'showLabel', label: '显示读数', section: 'format', kind: 'boolean', default: true },
    { key: 'waveAnimation', label: '波浪动画', section: 'motion', kind: 'boolean', default: true },
    { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#e6f1ff' },
    { key: 'fontSize', label: '字号', section: 'text', kind: 'number', default: 24, min: 12, max: 64, unit: 'px' },
    { key: 'backgroundColor', label: '背景色', section: 'surface', kind: 'color', default: '#0b1a2b' },
    { key: 'waterColor', label: '水色', section: 'surface', kind: 'color', default: '#1d4ed8' },
    { key: 'waveColor', label: '浪色', section: 'surface', kind: 'color', default: '#38bdf8' },
    { key: 'borderColor', label: '描边色', section: 'surface', kind: 'color', default: '#1e3a5f' },
  ],
  data: { kind: 'scalar', valueType: 'number', sample: 68.5 },
  events: [{ name: 'valueClick', label: '点击读数', payload: { value: { type: 'number', value: 'value' } } }],
  template: {
    viewBox: [0, 0, 200, 240],
    nodes: [
      { kind: 'rect', id: 'bg', x: 0, y: 0, width: 200, height: 240, fill: 'style.backgroundColor', on: 'valueClick' },
      {
        kind: 'clip',
        id: 'tank',
        shape: { kind: 'circle', id: 'tank-shape', cx: 100, cy: 120, r: 84 },
        children: [
          {
            kind: 'wave',
            id: 'back',
            x: -120,
            y: '204 - pct(value) * 168',
            width: 440,
            height: 240,
            amplitude: 7,
            wavelength: 120,
            phase: 40,
            fill: 'style.waveColor',
            opacity: 0.55,
          },
          {
            kind: 'wave',
            id: 'front',
            x: -120,
            y: '208 - pct(value) * 168',
            width: 440,
            height: 240,
            amplitude: 5,
            wavelength: 120,
            fill: 'style.waterColor',
          },
        ],
      },
      { kind: 'circle', id: 'rim', cx: 100, cy: 120, r: 86, fill: 'none', stroke: 'style.borderColor', strokeWidth: 4 },
      {
        kind: 'when',
        id: 'label-on',
        test: 'props.showLabel',
        children: [
          {
            kind: 'text',
            id: 'label',
            x: 100,
            y: 120,
            fontSize: 'style.fontSize',
            fontWeight: 600,
            anchor: 'middle',
            baseline: 'middle',
            content: 'format(value)',
            fill: 'style.color',
            backdrop: 'front',
          },
        ],
      },
    ],
    animations: [
      { kind: 'loop', target: 'back', property: 'translateX', from: 0, to: 120, duration: 3200, enabledBy: 'props.waveAnimation' },
      { kind: 'loop', target: 'front', property: 'translateX', from: 120, to: 0, duration: 2400, enabledBy: 'props.waveAnimation' },
      { kind: 'change', target: 'front', attributes: ['y'], duration: 600 },
      { kind: 'change', target: 'back', attributes: ['y'], duration: 600 },
    ],
  },
};

const DIGITAL_FLOP: BaseScreenMaterialSpec = {
  type: 'harness.tpl-digital-flop',
  name: '翻牌器（模板）',
  category: '指标',
  keywords: ['翻牌', '数字', '模板'],
  defaultSize: { width: 360, height: 96 },
  numberFormat: { decimals: 0, thousandsSeparator: true },
  fields: [
    { key: 'color', label: '数字色', section: 'text', kind: 'color', default: '#7dd3fc' },
    { key: 'fontSize', label: '字号', section: 'text', kind: 'number', default: 44, min: 16, max: 96, unit: 'px' },
    { key: 'cardColor', label: '卡片色', section: 'surface', kind: 'color', default: '#0f2a4a' },
    { key: 'borderColor', label: '描边色', section: 'surface', kind: 'color', default: '#1e4f80' },
  ],
  data: { kind: 'scalar', valueType: 'number', sample: 1286435 },
  template: {
    viewBox: [0, 0, 360, 96],
    nodes: [
      {
        kind: 'repeat',
        id: 'digits',
        source: { range: 'len(format(value))' },
        children: [
          {
            kind: 'g',
            id: 'digit',
            x: '(360 - count * 36) / 2 + index * 36',
            y: 8,
            children: [
              {
                kind: 'when',
                id: 'digit-card',
                test: "charAt(format(value), index) != ','",
                children: [
                  { kind: 'rect', id: 'card', x: 2, y: 0, width: 32, height: 80, rx: 4, fill: 'style.cardColor', stroke: 'style.borderColor', strokeWidth: 1 },
                  { kind: 'line', id: 'seam', x1: 2, y1: 40, x2: 34, y2: 40, stroke: 'rgba(0,0,0,0.35)', strokeWidth: 1 },
                ],
              },
              {
                kind: 'text',
                id: 'char',
                x: 18,
                y: 42,
                fontSize: 'style.fontSize',
                fontWeight: 600,
                anchor: 'middle',
                baseline: 'middle',
                content: 'charAt(format(value), index)',
                fill: 'style.color',
                backdrop: 'card',
              },
            ],
          },
        ],
      },
    ],
  },
};

const GAUGE: BaseScreenMaterialSpec = {
  type: 'harness.tpl-gauge',
  name: '环形仪表（模板）',
  category: '指标',
  keywords: ['仪表盘', '环形', '进度', '模板'],
  defaultSize: { width: 220, height: 220 },
  numberFormat: { decimals: 0, unit: '%' },
  fields: [
    { key: 'min', label: '最小值', section: 'structure', kind: 'number', default: 0 },
    { key: 'max', label: '最大值', section: 'structure', kind: 'number', default: 100 },
    { key: 'warnAt', label: '告警线', section: 'structure', kind: 'number', default: 80 },
    { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#e2e8f0' },
    { key: 'fontSize', label: '字号', section: 'text', kind: 'number', default: 36, min: 12, max: 72, unit: 'px' },
    { key: 'backgroundColor', label: '背景色', section: 'surface', kind: 'color', default: '#0b1220' },
    { key: 'trackColor', label: '轨道色', section: 'surface', kind: 'color', default: '#1e293b' },
    { key: 'tickColor', label: '刻度色', section: 'surface', kind: 'color', default: '#475569' },
    { key: 'fillColor', label: '主色', section: 'semantic', kind: 'color', default: '#22d3ee' },
    { key: 'warnColor', label: '告警色', section: 'semantic', kind: 'color', default: '#f87171' },
  ],
  statePresetKeys: ['fillColor'],
  data: { kind: 'scalar', valueType: 'number', sample: 72 },
  events: [{ name: 'valueClick', label: '点击读数', payload: { value: { type: 'number', value: 'value' } } }],
  template: {
    viewBox: [0, 0, 220, 220],
    nodes: [
      { kind: 'rect', id: 'bg', x: 0, y: 0, width: 220, height: 220, fill: 'style.backgroundColor' },
      { kind: 'ticks', id: 'scale', cx: 110, cy: 116, r: 70, length: 7, count: 11, start: -135, end: 135, stroke: 'style.tickColor', strokeWidth: 2 },
      { kind: 'arc', id: 'track', cx: 110, cy: 116, r: 88, thickness: 14, start: -135, end: 135, stroke: 'style.trackColor' },
      {
        kind: 'arc',
        id: 'fill',
        cx: 110,
        cy: 116,
        r: 88,
        thickness: 14,
        start: -135,
        end: '-135 + pct(value, props.min, props.max) * 270',
        stroke: 'value >= props.warnAt ? style.warnColor : style.fillColor',
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

const STATUS_LAMP: BaseScreenMaterialSpec = {
  type: 'harness.tpl-status-lamp',
  name: '状态灯（模板）',
  category: '状态',
  keywords: ['状态', '指示灯', '告警', '模板'],
  defaultSize: { width: 96, height: 96 },
  rotate: false,
  fields: [
    { key: 'idleColor', label: '离线色', section: 'semantic', kind: 'color', default: '#64748b' },
    { key: 'okColor', label: '正常色', section: 'semantic', kind: 'color', default: '#22c55e' },
    { key: 'warnColor', label: '预警色', section: 'semantic', kind: 'color', default: '#f59e0b' },
    { key: 'alarmColor', label: '告警色', section: 'semantic', kind: 'color', default: '#ef4444' },
  ],
  data: { kind: 'scalar', valueType: 'string', sample: 'alarm' },
  template: {
    viewBox: [0, 0, 96, 96],
    nodes: [
      {
        kind: 'circle',
        id: 'halo',
        cx: 48,
        cy: 48,
        r: 40,
        opacity: 0.28,
        fill: "pick(value, 'normal', style.okColor, 'warning', style.warnColor, 'alarm', style.alarmColor, style.idleColor)",
      },
      {
        kind: 'circle',
        id: 'core',
        cx: 48,
        cy: 48,
        r: 24,
        fill: "pick(value, 'normal', style.okColor, 'warning', style.warnColor, 'alarm', style.alarmColor, style.idleColor)",
        stroke: 'rgba(255,255,255,0.35)',
        strokeWidth: 2,
      },
    ],
    animations: [
      { kind: 'loop', target: 'halo', property: 'scale', from: 0.8, to: 1.15, duration: 900, easing: 'ease-in-out', alternate: true, enabledBy: "value == 'alarm'" },
    ],
  },
};

const LINE: BaseScreenMaterialSpec = {
  type: 'harness.tpl-line',
  name: '折线（模板）',
  category: '图表',
  keywords: ['折线', '趋势', '模板'],
  defaultSize: { width: 420, height: 220 },
  fields: [
    { key: 'showPoints', label: '显示数据点', section: 'structure', kind: 'boolean', default: true },
    { key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#94a3b8' },
    { key: 'fontSize', label: '字号', section: 'text', kind: 'number', default: 16, min: 12, max: 32, unit: 'px' },
    { key: 'backgroundColor', label: '背景色', section: 'surface', kind: 'color', default: '#0b1220' },
    { key: 'gridColor', label: '网格色', section: 'surface', kind: 'color', default: '#1e293b' },
    { key: 'lineColor', label: '线条色', section: 'surface', kind: 'color', default: '#38bdf8' },
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
      { category: '4月', amount: 205 },
      { category: '5月', amount: 188 },
      { category: '6月', amount: 236 },
    ],
  },
  events: [
    { name: 'pointClick', label: '点击数据点', payload: { category: { type: 'string', value: 'row.category' }, amount: { type: 'number', value: 'row.amount' } } },
  ],
  template: {
    viewBox: [0, 0, 420, 220],
    nodes: [
      { kind: 'rect', id: 'bg', x: 0, y: 0, width: 420, height: 220, fill: 'style.backgroundColor' },
      {
        kind: 'repeat',
        id: 'grid',
        source: { range: 4 },
        children: [{ kind: 'line', id: 'grid-line', x1: 40, y1: '24 + index * 50', x2: 404, y2: '24 + index * 50', stroke: 'style.gridColor', strokeWidth: 1 }],
      },
      {
        kind: 'polyline',
        id: 'line',
        points: {
          source: 'rows',
          x: '48 + index * 348 / max(count - 1, 1)',
          y: "174 - scale(row.amount, minOf(rows, 'amount'), maxOf(rows, 'amount'), 0, 140)",
        },
        stroke: 'style.lineColor',
        strokeWidth: 3,
        strokeLinecap: 'round',
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
                cx: '48 + index * 348 / max(count - 1, 1)',
                cy: "174 - scale(row.amount, minOf(rows, 'amount'), maxOf(rows, 'amount'), 0, 140)",
                r: 5,
                fill: 'style.backgroundColor',
                stroke: 'style.lineColor',
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

const BORDER_BOX: BaseScreenMaterialSpec = {
  type: 'harness.tpl-border-box',
  name: '装饰边框（模板）',
  category: '装饰',
  keywords: ['边框', '装饰', '模板'],
  defaultSize: { width: 400, height: 240 },
  fields: [
    { key: 'animate', label: '呼吸动画', section: 'motion', kind: 'boolean', default: true },
    { key: 'fillColor', label: '填充色', section: 'surface', kind: 'color', default: 'rgba(14,30,52,0.6)' },
    { key: 'borderColor', label: '描边色', section: 'surface', kind: 'color', default: '#1e4f80' },
    { key: 'accentColor', label: '角标色', section: 'surface', kind: 'color', default: '#38bdf8' },
  ],
  data: { kind: 'none' },
  template: {
    viewBox: [0, 0, 400, 240],
    fit: 'stretch',
    nodes: [
      { kind: 'rect', id: 'panel', x: 4, y: 4, width: 392, height: 232, rx: 2, fill: 'style.fillColor', stroke: 'style.borderColor', strokeWidth: 1 },
      {
        kind: 'g',
        id: 'corners',
        children: [
          { kind: 'path', id: 'tl', d: [['M', 2, 30], ['L', 2, 2], ['L', 30, 2]], fill: 'none', stroke: 'style.accentColor', strokeWidth: 3 },
          { kind: 'path', id: 'tr', d: [['M', 370, 2], ['L', 398, 2], ['L', 398, 30]], fill: 'none', stroke: 'style.accentColor', strokeWidth: 3 },
          { kind: 'path', id: 'br', d: [['M', 398, 210], ['L', 398, 238], ['L', 370, 238]], fill: 'none', stroke: 'style.accentColor', strokeWidth: 3 },
          { kind: 'path', id: 'bl', d: [['M', 30, 238], ['L', 2, 238], ['L', 2, 210]], fill: 'none', stroke: 'style.accentColor', strokeWidth: 3 },
        ],
      },
    ],
    animations: [
      { kind: 'loop', target: 'corners', property: 'opacity', from: 0.45, to: 1, duration: 1600, easing: 'ease-in-out', alternate: true, enabledBy: 'props.animate' },
    ],
  },
};

export const HARNESS_TEMPLATE_MATERIAL_SPECS: readonly BaseScreenMaterialSpec[] = [
  WATER_LEVEL,
  DIGITAL_FLOP,
  GAUGE,
  STATUS_LAMP,
  LINE,
  BORDER_BOX,
];
