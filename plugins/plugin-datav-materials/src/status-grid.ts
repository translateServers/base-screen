import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import {
  DATAV_DEFAULT_SURFACE,
  DATAV_SECONDARY_COLOR,
  DATAV_STATUS_COLORS,
  DATAV_STATUS_LABELS,
  type DatavStatusKey,
  normalizeDatavStatus,
  PLUGIN_DATAV_STATUS_GRID_TAG_NAME,
  PLUGIN_DATAV_STATUS_GRID_TYPE,
  statusColorMap,
} from './identity.js';
import { readBoolean, readNumber, readString, styleColor } from './json-values.js';
import {
  createDatavStateAdapter,
  type DatavStateRow,
  readDatavStateRows,
} from './tabular-columns-adapter.js';

/**
 * 状态灯阵：把"多实体 × 值→色"画成等宽格阵。
 *
 * 为什么它是独立物料而不是 `scroll-board` 的一个模式：灯阵的信息形态是**全量可见**
 * （48 台设备一眼扫完，故障红点靠密度对比跳出来），而列表是**逐条滚动**。同一个数据集
 * 用两种画法服务两个判断（"整体健康度" vs "这条告警说了什么"）。
 *
 * 几何不测量 DOM：容量由 `computeStatusGridLayout` 按 `model.size` 与 props 算出，
 * 设计态与预览态因此完全一致（不会因为尚未布局而少画几格）。CSS Grid 只负责把
 * 已决定的格数铺满可用区域。
 */
export const PLUGIN_DATAV_STATUS_GRID_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_STATUS_GRID_TYPE,
  tagName: PLUGIN_DATAV_STATUS_GRID_TAG_NAME,
  name: '状态灯阵',
  category: '指标',
  keywords: ['状态', '灯阵', '设备', '大屏'],
  defaultSize: { width: 604, height: 420 },
  // 原子化：只画"多实体的状态格"。标题/说明由文档层的 base.text 组合。
  defaultProps: {
    columns: 8,
    showLegend: true,
    showValue: false,
    labelVisible: false,
    emptyText: '无设备数据',
  },
  defaultData: {
    fields: [
      { id: 'name', label: '设备', valueType: 'string', nullable: false },
      { id: 'status', label: '状态', valueType: 'string', nullable: false },
      { id: 'load', label: '负载', valueType: 'number', unit: '%', nullable: false },
    ],
    rows: [
      { name: '1#冲压机', status: 'fault', load: 86 },
      { name: '2#冲床', status: 'running', load: 64 },
      { name: '3#焊机', status: 'standby', load: 12 },
    ],
  },
  staticData: {
    kind: 'tabular',
    // 位置语义：第 1 列 = 标签、第 2 列 = 状态、第 3 列（可选）= 数值。
    defaultBinding: { fields: { items: ['name', 'status', 'load'] } },
  },
  defaultStyle: {
    backgroundColor: 'transparent',
    color: DATAV_DEFAULT_SURFACE.color,
    labelColor: DATAV_SECONDARY_COLOR,
    legendColor: DATAV_SECONDARY_COLOR,
    // 五态色只从 identity.ts 取默认值，物料内不写十六进制字面量。
    runningColor: DATAV_STATUS_COLORS.running,
    standbyColor: DATAV_STATUS_COLORS.standby,
    faultColor: DATAV_STATUS_COLORS.fault,
    offlineColor: DATAV_STATUS_COLORS.offline,
    unknownColor: DATAV_STATUS_COLORS.unknown,
    tileGap: 6,
    tileRadius: 4,
    fontSize: 11,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      labelColor: { kind: 'string' },
      legendColor: { kind: 'string' },
      runningColor: { kind: 'string' },
      standbyColor: { kind: 'string' },
      faultColor: { kind: 'string' },
      offlineColor: { kind: 'string' },
      unknownColor: { kind: 'string' },
      tileGap: { kind: 'number', minimum: 0, maximum: 24 },
      tileRadius: { kind: 'number', minimum: 0, maximum: 16 },
      fontSize: { kind: 'number', minimum: 10, maximum: 32 },
    },
    required: [
      'backgroundColor',
      'color',
      'labelColor',
      'legendColor',
      'runningColor',
      'standbyColor',
      'faultColor',
      'offlineColor',
      'unknownColor',
    ],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color' },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'labelColor', label: '设备名色', control: 'color' },
    { style: 'legendColor', label: '图例色', control: 'color' },
    { style: 'runningColor', label: '运行色', control: 'color' },
    { style: 'standbyColor', label: '待机色', control: 'color' },
    { style: 'faultColor', label: '故障色', control: 'color' },
    { style: 'offlineColor', label: '离线色', control: 'color' },
    { style: 'unknownColor', label: '未知状态色', control: 'color' },
    { style: 'tileGap', label: '格间距', control: 'number' },
    { style: 'tileRadius', label: '圆角', control: 'number' },
    { style: 'fontSize', label: '字号', control: 'number' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      columns: { kind: 'number', minimum: 1, maximum: 24 },
      showLegend: { kind: 'boolean' },
      showValue: { kind: 'boolean' },
      labelVisible: { kind: 'boolean' },
      emptyText: { kind: 'string', maxLength: 16 },
    },
    required: ['columns', 'showLegend', 'showValue', 'labelVisible', 'emptyText'],
  },
  propertyPanel: [
    { prop: 'columns', label: '每行列数', control: 'number' },
    { prop: 'showLegend', label: '显示图例', control: 'boolean' },
    { prop: 'showValue', label: '格内显示数值', control: 'boolean' },
    { prop: 'labelVisible', label: '显示设备名', control: 'boolean' },
    { prop: 'emptyText', label: '空数据文案', control: 'text' },
  ],
  // tileClick 是 P1：本轮不给事件，避免"声明了但宿主没有通道"的空承诺。
  events: [],
  dataCapabilities: ['static', 'dataset', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'items',
        minFields: 1,
        maxFields: 3,
        // 必须同时含 string 与 number：name/status 是字符串，load 是数字。
        valueTypes: ['string', 'number'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

/** 最小格边长（px）：小于它就少排一列/一行，而不是把格子压成 1 px 不可辨。 */
export const STATUS_GRID_MIN_TILE_SIZE = 18;

/** 根容器的内边距与图例行高（布局纯函数的输入，元素与单测共用同一常量）。 */
export const STATUS_GRID_PADDING = 8;
export const STATUS_GRID_LEGEND_HEIGHT = 22;

/** 灯阵列数上限（与 propsSchema 的 columns 上限一致）。 */
export const STATUS_GRID_MAX_COLUMNS = 24;

export interface StatusGridLayoutInput {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly total: number;
  readonly tileGap: number;
  readonly minTileSize: number;
}

export interface StatusGridLayout {
  readonly columns: number;
  readonly rows: number;
  /** 可容纳的格数 = columns × rows（空表时也至少 1 行，用于画骨架）。 */
  readonly capacity: number;
  /** 实际画出的格数 = min(total, capacity)。 */
  readonly visible: number;
  /** 超出容量的条数（`+N`）。 */
  readonly hidden: number;
}

/**
 * 灯阵布局：纯函数，不测量 DOM。
 *
 * 先按宽度收缩列数（保证格宽 ≥ `minTileSize`），再按高度收缩行数；两者相乘即容量。
 * `total === 0` 时仍返回 1 行容量，让空表能画出与有数据时**同尺寸**的骨架格。
 */
export function computeStatusGridLayout(input: StatusGridLayoutInput): StatusGridLayout {
  const gap = Math.max(0, Math.round(input.tileGap));
  const minTile = Math.max(1, Math.round(input.minTileSize));
  const slot = minTile + gap;
  const columnsWanted = clampInt(input.columns, 1, STATUS_GRID_MAX_COLUMNS);
  const columnsFit = Math.floor((Math.max(0, input.width) + gap) / slot);
  const columns = Math.max(1, Math.min(columnsWanted, Math.max(1, columnsFit)));
  const rowsFit = Math.max(1, Math.floor((Math.max(0, input.height) + gap) / slot));
  const total = Math.max(0, Math.trunc(input.total));
  const rowsNeeded = Math.max(1, Math.ceil(total / columns));
  const rows = Math.min(rowsNeeded, rowsFit);
  const capacity = rows * columns;
  const visible = Math.min(total, capacity);
  return { columns, rows, capacity, visible, hidden: Math.max(0, total - capacity) };
}

export type StatusLegendCounts = Readonly<Record<DatavStatusKey, number>>;

/**
 * 图例计数：五项固定顺序（running→standby→fault→offline→unknown），
 * 计数之和**恒等于** items 长度（未知状态已归 `unknown`，不会被丢掉）。
 */
export function buildStatusLegend(items: readonly DatavStateRow[]): StatusLegendCounts {
  const counts: Record<DatavStatusKey, number> = {
    running: 0,
    standby: 0,
    fault: 0,
    offline: 0,
    unknown: 0,
  };
  for (const item of items) counts[normalizeDatavStatus(item.status)] += 1;
  return counts;
}

/** 图例顺序的唯一来源：DOM 顺序与断言顺序都按它。 */
export const STATUS_GRID_LEGEND_ORDER: readonly DatavStatusKey[] = [
  'running',
  'standby',
  'fault',
  'offline',
  'unknown',
];

export class PluginDatavStatusGridElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_STATUS_GRID_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    // 宿主元素是 group；真正的 list 是格阵容器（listitem 必须是 list 的直接子节点，
    // 若把 list 放在宿主上、格子在中间一层 div 里，辅助技术会断开归属关系）。
    this.setAttribute('role', 'group');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginDatavStatusGridElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const items = readDatavStateRows(model.dataState.value, 'items');
    if (items === undefined) {
      // 投影失败（不是空数据）：保留上一帧并打角标，别把故障画成"没有设备"。
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: 'Status grid payload is invalid.',
      });
      return;
    }
    this.#paint(items, model);
  }

  #paint(items: readonly DatavStateRow[], model: DatavMaterialModel): void {
    const doc = this.ownerDocument;
    const colors = statusColorMap(model.style);
    const gap = Math.max(0, Math.round(readNumber(model.style.tileGap, 6)));
    const radius = Math.max(0, Math.round(readNumber(model.style.tileRadius, 4)));
    const fontSize = readNumber(model.style.fontSize, 11);
    const showLegend = readBoolean(model.props.showLegend, true);
    const showValue = readBoolean(model.props.showValue, false);
    const labelVisible = readBoolean(model.props.labelVisible, false);
    const legendHeight = showLegend ? STATUS_GRID_LEGEND_HEIGHT : 0;
    const layout = computeStatusGridLayout({
      width: model.size.width - STATUS_GRID_PADDING * 2,
      height: model.size.height - STATUS_GRID_PADDING * 2 - legendHeight,
      columns: Math.round(readNumber(model.props.columns, 8)),
      total: items.length,
      tileGap: gap,
      minTileSize: STATUS_GRID_MIN_TILE_SIZE,
    });

    this.style.backgroundColor = styleColor(model.style.backgroundColor, 'transparent');
    this.style.color = styleColor(model.style.color, DATAV_DEFAULT_SURFACE.color);

    const root = doc.createElement('div');
    root.dataset.datavStatusGrid = '';
    root.style.cssText = `display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;padding:${STATUS_GRID_PADDING}px;gap:${legendHeight === 0 ? 0 : 6}px;`;

    const grid = doc.createElement('div');
    grid.dataset.datavStatusTiles = '';
    grid.setAttribute('role', 'list');
    grid.style.cssText = `flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(${layout.columns},minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:${gap}px;`;

    if (items.length === 0) {
      // 空表：只画骨架，不产生 tile（A14 断言"0 个 tile"）。尺寸与有数据时一致。
      for (let index = 0; index < layout.capacity; index += 1) {
        const skeleton = doc.createElement('div');
        skeleton.dataset.datavStatusSkeleton = '';
        skeleton.style.cssText = `border-radius:${radius}px;border:1px solid ${styleColor(model.style.offlineColor, DATAV_STATUS_COLORS.offline)};opacity:.28;`;
        grid.appendChild(skeleton);
      }
    } else {
      for (const item of items.slice(0, layout.visible)) {
        grid.appendChild(
          this.#tile(item, {
            colors,
            radius,
            fontSize,
            showValue,
            labelVisible,
            labelColor: styleColor(model.style.labelColor, DATAV_SECONDARY_COLOR),
            valueColor: styleColor(model.style.color, DATAV_DEFAULT_SURFACE.color),
          }),
        );
      }
    }
    root.appendChild(grid);

    if (items.length === 0) {
      const empty = doc.createElement('div');
      empty.dataset.datavStatusEmpty = '';
      empty.textContent = readString(model.props.emptyText, '无设备数据');
      // 覆盖在骨架之上而不是挤占布局：空表与非空表的格子尺寸因此完全相同。
      empty.style.cssText = `position:absolute;inset:0;display:grid;place-items:center;font:${fontSize}px/1.4 sans-serif;color:${styleColor(model.style.labelColor, DATAV_SECONDARY_COLOR)};pointer-events:none;`;
      root.style.position = 'relative';
      root.appendChild(empty);
    }

    const footer = this.#footer(items, {
      showLegend,
      hidden: layout.hidden,
      fontSize,
      legendColor: styleColor(model.style.legendColor, DATAV_SECONDARY_COLOR),
      colors,
    });
    if (footer !== undefined) root.appendChild(footer);

    this.commit(root);
  }

  #tile(
    item: DatavStateRow,
    options: {
      readonly colors: Readonly<Record<DatavStatusKey, string>>;
      readonly radius: number;
      readonly fontSize: number;
      readonly showValue: boolean;
      readonly labelVisible: boolean;
      readonly labelColor: string;
      readonly valueColor: string;
    },
  ): HTMLElement {
    const doc = this.ownerDocument;
    const status = normalizeDatavStatus(item.status);
    const color = options.colors[status];
    const tile = doc.createElement('div');
    tile.dataset.datavStatusTile = '';
    tile.dataset.status = status;
    tile.setAttribute('role', 'listitem');
    // 颜色不是唯一编码：无障碍名称始终带状态中文，视觉上再由 label/value 双编码。
    const label = `${item.name === '' ? '未命名设备' : item.name} ${DATAV_STATUS_LABELS[status]}`;
    const outOfRange = item.value !== undefined && (item.value < 0 || item.value > 100);
    tile.setAttribute('aria-label', outOfRange ? `${label}，读数超出范围` : label);
    tile.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:0;min-height:0;overflow:hidden;border-radius:${options.radius}px;background:${color};font:${options.fontSize}px/1.1 sans-serif;`;

    if (options.labelVisible && item.name !== '') {
      const name = doc.createElement('span');
      name.dataset.datavStatusName = '';
      name.textContent = item.name;
      name.style.cssText = `max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${options.labelColor};`;
      tile.appendChild(name);
    }
    if (options.showValue && item.value !== undefined) {
      const value = doc.createElement('span');
      value.dataset.datavStatusValue = '';
      // 读数保留原值（128% 就显示 128%），不因为越界而改成 100——那是着色的事，不是读数的事。
      value.textContent = String(item.value);
      value.style.cssText = `max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${options.valueColor};font-variant-numeric:tabular-nums;`;
      tile.appendChild(value);
    }
    return tile;
  }

  #footer(
    items: readonly DatavStateRow[],
    options: {
      readonly showLegend: boolean;
      readonly hidden: number;
      readonly fontSize: number;
      readonly legendColor: string;
      readonly colors: Readonly<Record<DatavStatusKey, string>>;
    },
  ): HTMLElement | undefined {
    if (!options.showLegend && options.hidden === 0) return undefined;
    const doc = this.ownerDocument;
    const footer = doc.createElement('div');
    footer.dataset.datavStatusFooter = '';
    footer.style.cssText = `flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:8px;height:${STATUS_GRID_LEGEND_HEIGHT}px;font:${options.fontSize}px/1 sans-serif;color:${options.legendColor};`;

    if (options.showLegend) {
      const counts = buildStatusLegend(items);
      const legend = doc.createElement('div');
      legend.dataset.datavStatusLegend = '';
      legend.style.cssText =
        'display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden;pointer-events:none;';
      for (const state of STATUS_GRID_LEGEND_ORDER) {
        const item = doc.createElement('span');
        item.dataset.state = state;
        item.dataset.count = String(counts[state]);
        item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;white-space:nowrap;';
        const dot = doc.createElement('span');
        dot.style.cssText = `width:8px;height:8px;border-radius:2px;background:${options.colors[state]};`;
        item.appendChild(dot);
        item.appendChild(doc.createTextNode(`${DATAV_STATUS_LABELS[state]} ${counts[state]}`));
        legend.appendChild(item);
      }
      footer.appendChild(legend);
    }

    if (options.hidden > 0) {
      const hidden = doc.createElement('span');
      hidden.dataset.datavStatusHidden = '';
      hidden.textContent = `+${options.hidden}`;
      hidden.style.cssText = 'flex:0 0 auto;font-variant-numeric:tabular-nums;white-space:nowrap;';
      footer.appendChild(hidden);
    }
    return footer;
  }
}

// 绑定宿主资源/数据集时，渲染器先用 adapter 把表格投影成 `{ items, total }`；
// 没有这个静态属性，绑定会以 HOST_DATASET_BINDING_INVALID 失败。
Object.defineProperty(PluginDatavStatusGridElement, 'tabularDataAdapter', {
  value: createDatavStateAdapter('items'),
});

export function definePluginDatavStatusGridMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_STATUS_GRID_MANIFEST,
    element: PluginDatavStatusGridElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
