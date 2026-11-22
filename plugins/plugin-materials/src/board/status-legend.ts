import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialObjectSchema,
  type BaseScreenMaterialTabularDataAdapter,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import {
  BOARD_SECONDARY_COLOR,
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  type BoardStatusKey,
  isBoardStatusKey,
  normalizeBoardStatus,
  PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME,
  PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  statusColorMap,
} from './identity.js';
import { readBoolean, readNumber, styleColor } from './json-values.js';

/**
 * 状态图例：设备五态的分布读数（运行 n / 待机 n / 故障 n / 离线 n / 未知 n）。
 *
 * 它原本内建在状态灯阵的底栏里（`showLegend`）。按 ADR-0099 的原子判定拆出来：
 * - T1 单一读数：图例读的是「各状态各有几台」，灯阵读的是「每台是什么状态」；
 * - T3 拆开不失效：图例单独放上画布仍然有意义（一排汇总读数），不像图表的坐标轴；
 * - T4 可组合：多个灯阵、或灯阵 + 工序链可以共用一条图例，放在哪、多宽由文档层决定。
 *
 * 只消费一列（状态列），因此可以绑定与灯阵相同的数据，也可以单独绑定任何带状态列的表。
 * 计数按五态归一（未知值归 `unknown`），合计恒等于行数。
 */
const STATUS_LEGEND_PROPS_SCHEMA = {
  kind: 'object',
  properties: {
    showCount: { kind: 'boolean' },
  },
  required: ['showCount'],
} satisfies BaseScreenMaterialObjectSchema;

const STATUS_LEGEND_STYLE_SCHEMA = {
  kind: 'object',
  properties: {
    backgroundColor: { kind: 'string' },
    color: { kind: 'string' },
    fontSize: { kind: 'number', minimum: 10, maximum: 32 },
    runningColor: { kind: 'string' },
    standbyColor: { kind: 'string' },
    faultColor: { kind: 'string' },
    offlineColor: { kind: 'string' },
    unknownColor: { kind: 'string' },
  },
  // 五态色不进 required：缺省回落到 `BOARD_STATUS_COLORS`，与灯阵、工序链同源。
  required: ['backgroundColor', 'color', 'fontSize'],
} satisfies BaseScreenMaterialObjectSchema;

/** 图例顺序的唯一来源：DOM 顺序与断言顺序都按它。 */
export const STATUS_LEGEND_ORDER: readonly BoardStatusKey[] = [
  'running',
  'standby',
  'fault',
  'offline',
  'unknown',
];

export type StatusLegendCounts = Readonly<Record<BoardStatusKey, number>>;

export const PLUGIN_BOARD_STATUS_LEGEND_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_STATUS_LEGEND_TYPE,
  tagName: PLUGIN_BOARD_STATUS_LEGEND_TAG_NAME,
  name: '状态图例',
  category: '指标',
  keywords: ['图例', '状态', '设备', '分布', '大屏'],
  defaultSize: { width: 420, height: 24 },
  defaultProps: {
    showCount: true,
  },
  defaultData: {
    fields: [
      { id: 'name', label: '设备', valueType: 'string', nullable: false },
      { id: 'status', label: '状态', valueType: 'string', nullable: false },
    ],
    rows: [
      { name: '1#冲压机', status: 'fault' },
      { name: '2#冲床', status: 'running' },
      { name: '3#焊机', status: 'standby' },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { status: ['status'] } },
  },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: BOARD_SECONDARY_COLOR,
    fontSize: 11,
    runningColor: BOARD_STATUS_COLORS.running,
    standbyColor: BOARD_STATUS_COLORS.standby,
    faultColor: BOARD_STATUS_COLORS.fault,
    offlineColor: BOARD_STATUS_COLORS.offline,
    unknownColor: BOARD_STATUS_COLORS.unknown,
  },
  styleSchema: STATUS_LEGEND_STYLE_SCHEMA,
  stylePanel: [
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
    { style: 'backgroundColor', label: '背景色', control: 'color' },
    { style: 'runningColor', label: '运行色', control: 'color' },
    { style: 'standbyColor', label: '待机色', control: 'color' },
    { style: 'faultColor', label: '故障色', control: 'color' },
    { style: 'offlineColor', label: '离线色', control: 'color' },
    { style: 'unknownColor', label: '未知状态色', control: 'color' },
  ],
  propsSchema: STATUS_LEGEND_PROPS_SCHEMA,
  propertyPanel: [{ prop: 'showCount', label: '显示计数', control: 'boolean' }],
  editorDescriptor: parseStatusLegendEditorDescriptor(),
  events: [],
  dataCapabilities: ['static', 'dataset', 'host-resource'],
  dataBinding: {
    roles: [{ id: 'status', minFields: 1, maxFields: 1, valueTypes: ['string'] }],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

/** 检查器编排（ADR-0099 §2.4）：读数格式 → 文字 → 填充 → 语义色（默认折叠）。 */
function parseStatusLegendEditorDescriptor(): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    {
      appearance: [
        {
          id: 'format',
          label: '读数格式',
          fields: [
            {
              id: 'showCount',
              target: 'props',
              path: ['showCount'],
              label: '显示计数',
              control: 'boolean',
            },
          ],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            { id: 'color', target: 'style', path: ['color'], label: '文字色', control: 'color' },
            {
              id: 'fontSize',
              target: 'style',
              path: ['fontSize'],
              label: '字号',
              control: 'number',
            },
          ],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            {
              id: 'backgroundColor',
              target: 'style',
              path: ['backgroundColor'],
              label: '背景色',
              control: 'color',
              allowGradient: true,
            },
          ],
        },
        {
          id: 'states',
          label: '语义色',
          collapsed: true,
          fields: [
            {
              id: 'runningColor',
              target: 'style',
              path: ['runningColor'],
              label: '运行色',
              control: 'color',
            },
            {
              id: 'standbyColor',
              target: 'style',
              path: ['standbyColor'],
              label: '待机色',
              control: 'color',
            },
            {
              id: 'faultColor',
              target: 'style',
              path: ['faultColor'],
              label: '故障色',
              control: 'color',
            },
            {
              id: 'offlineColor',
              target: 'style',
              path: ['offlineColor'],
              label: '离线色',
              control: 'color',
            },
            {
              id: 'unknownColor',
              target: 'style',
              path: ['unknownColor'],
              label: '未知状态色',
              control: 'color',
            },
          ],
        },
      ],
    },
    STATUS_LEGEND_PROPS_SCHEMA,
    STATUS_LEGEND_STYLE_SCHEMA,
    undefined,
    undefined,
  );
  if (!parsed.ok) {
    throw new Error('plugin-materials status legend editor descriptor is invalid.');
  }
  return parsed.value;
}

/**
 * 五态计数：固定顺序（running→standby→fault→offline→unknown），
 * 计数之和**恒等于**输入长度（未知状态已归 `unknown`，不会被丢掉）。
 */
export function buildStatusLegend(statuses: readonly unknown[]): StatusLegendCounts {
  const counts: Record<BoardStatusKey, number> = {
    running: 0,
    standby: 0,
    fault: 0,
    offline: 0,
    unknown: 0,
  };
  for (const status of statuses) counts[normalizeBoardStatus(status)] += 1;
  return counts;
}

/**
 * 表格 → `{ counts, total }`：只读 `status` 角色绑定的那一列。
 * 角色未绑定时失败关闭（与基座同码，不新增诊断码）。
 */
export const STATUS_LEGEND_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const field = fields.status?.[0];
    if (field === undefined) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_DATASET_BINDING_INVALID',
            path: [],
            message: 'Dataset binding role "status" is required.',
          },
        ],
      };
    }
    const counts = buildStatusLegend(dataset.rows.map((row) => row[field.id]));
    return { ok: true, value: { counts, total: dataset.rows.length }, diagnostics: [] };
  },
};

/** 从 `dataState.value` 读回计数；形状不符时返回 `undefined`，由物料走「数据无效」降级。 */
export function readStatusLegendCounts(value: unknown): StatusLegendCounts | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const counts = (value as { readonly counts?: unknown }).counts;
  if (typeof counts !== 'object' || counts === null || Array.isArray(counts)) return undefined;
  const result: Record<BoardStatusKey, number> = {
    running: 0,
    standby: 0,
    fault: 0,
    offline: 0,
    unknown: 0,
  };
  for (const [key, count] of Object.entries(counts)) {
    if (!isBoardStatusKey(key)) return undefined;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined;
    result[key] = count;
  }
  return result;
}

export class PluginBoardStatusLegendElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_STATUS_LEGEND_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.setAttribute('role', 'group');
    // a11y 名称取物料清单名，不来自文档：物料没有标题字段。
    this.setAttribute('aria-label', PluginBoardStatusLegendElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const counts = readStatusLegendCounts(model.dataState.value);
    if (counts === undefined) {
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: 'Status legend payload is invalid.',
      });
      return;
    }
    this.#paint(counts, model);
  }

  #paint(counts: StatusLegendCounts, model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const colors = statusColorMap(model.style);
    const showCount = readBoolean(model.props.showCount, true);
    const fontSize = readNumber(model.style.fontSize, 11);
    const color = styleColor(model.style.color, BOARD_SECONDARY_COLOR);

    const legend = doc.createElement('div');
    legend.dataset.boardStatusLegend = '';
    legend.setAttribute('role', 'list');
    legend.style.cssText = `display:flex;align-items:center;gap:10px;width:100%;height:100%;min-width:0;overflow:hidden;font:${fontSize}px/1 sans-serif;color:${color};`;
    for (const state of STATUS_LEGEND_ORDER) {
      const item = doc.createElement('span');
      item.dataset.state = state;
      item.dataset.count = String(counts[state]);
      item.setAttribute('role', 'listitem');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;white-space:nowrap;';
      const dot = doc.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = `width:8px;height:8px;border-radius:2px;background:${colors[state]};`;
      item.appendChild(dot);
      // 颜色不是唯一编码：每一项都带状态中文。
      const text = showCount
        ? `${BOARD_STATUS_LABELS[state]} ${counts[state]}`
        : BOARD_STATUS_LABELS[state];
      item.appendChild(doc.createTextNode(text));
      legend.appendChild(item);
    }
    this.commit(legend);
  }
}

Object.defineProperty(PluginBoardStatusLegendElement, 'tabularDataAdapter', {
  value: STATUS_LEGEND_TABULAR_DATA_ADAPTER,
});

export function definePluginBoardStatusLegendMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_STATUS_LEGEND_MANIFEST,
    element: PluginBoardStatusLegendElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
