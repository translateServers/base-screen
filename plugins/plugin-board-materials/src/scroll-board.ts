import type { ScreenParseResult } from '@base-screen/contracts';
import {
  BASE_SCREEN_MATERIAL_EVENT,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  type BaseScreenTableData,
  parseBaseScreenTableData,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { BoardMaterialElement, type BoardMaterialModel } from './board-element.js';
import {
  BOARD_ALARM_LEVEL_COLORS,
  type BoardAlarmLevelKey,
  PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  PLUGIN_BOARD_SCROLL_BOARD_TYPE,
} from './identity.js';
import { readBoolean, readNumber, readRecord, readString, styleColor } from './json-values.js';
import { createBoardColumnsAdapter } from './tabular-columns-adapter.js';

/**
 * 轮播列表：用滚动动画在固定区域内轮流展示多行明细。
 *
 * 与配套大屏产品的轮播列表同形：表头可选、视口高度固定为「行数 × 行高」、内容按行上滚。
 * 视口高度不随数据条数变化，滚动只改 track 的 transform，因此不会因为数据更新而
 * 改变组件几何（样式稳定性：不得抖动）。
 */
export const PLUGIN_BOARD_SCROLL_BOARD_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_BOARD_SCROLL_BOARD_TYPE,
  tagName: PLUGIN_BOARD_SCROLL_BOARD_TAG_NAME,
  name: '轮播列表',
  category: '指标',
  keywords: ['列表', '轮播', '滚动', '大屏'],
  defaultSize: { width: 420, height: 220 },
  // 原子化：只做「在固定视口里轮播多行明细」。标题属于说明文字，应由文档层的
  // `base.text` 组合；表头是数据自身的列名，不是说明文字，故保留。
  defaultProps: {
    headerVisible: true,
    rowCount: 5,
    intervalMs: 3000,
    autoScroll: true,
    // 等级色列默认关闭：不传即与扩展前的 DOM 逐字一致（旧种子与三端冒烟零改动）。
    statusColumn: '',
    statusPalette: {},
  },
  defaultData: {
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
      { name: '广州', value: 498 },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { columns: ['name', 'value'] } },
  },
  defaultStyle: {
    backgroundColor: '#0b1a2b',
    color: '#e6f1ff',
    headerColor: '#8aa4c0',
    accentColor: '#38bdf8',
    borderColor: '#1e3a5f',
    fontSize: 14,
    rowHeight: 34,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      headerColor: { kind: 'string' },
      accentColor: { kind: 'string' },
      borderColor: { kind: 'string' },
      fontSize: { kind: 'number', minimum: 10, maximum: 32 },
      rowHeight: { kind: 'number', minimum: 20, maximum: 96 },
    },
    required: ['backgroundColor', 'color', 'headerColor', 'accentColor', 'borderColor'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'headerColor', label: '表头色', control: 'color' },
    { style: 'accentColor', label: '强调色', control: 'color' },
    { style: 'borderColor', label: '分隔线色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
    { style: 'rowHeight', label: '行高', control: 'number' },
  ],
  propsSchema: {
    kind: 'object',
    properties: {
      headerVisible: { kind: 'boolean' },
      rowCount: { kind: 'number', minimum: 1, maximum: 50 },
      intervalMs: { kind: 'number', minimum: 200, maximum: 60_000 },
      autoScroll: { kind: 'boolean' },
      // 列 id（不是字段标签）。指向 `columns` 绑定里的某一列；不在绑定里时按「未启用」处理。
      statusColumn: { kind: 'string', maxLength: 64 },
      // 值→色的覆盖：只允许 4 个固定键（等级色板是枚举语义，不是自由字典）。
      statusPalette: {
        kind: 'object',
        properties: {
          critical: { kind: 'string' },
          warning: { kind: 'string' },
          info: { kind: 'string' },
          default: { kind: 'string' },
        },
        required: [],
      },
    },
    // 两个新键**不得**进 required：旧文档的 props 里没有它们，进 required 会让现有
    // 销售大屏种子与三端冒烟立刻 props 校验失败。
    required: ['headerVisible', 'rowCount', 'intervalMs', 'autoScroll'],
  },
  propertyPanel: [
    { prop: 'headerVisible', label: '显示表头', control: 'boolean' },
    { prop: 'rowCount', label: '可见行数', control: 'number' },
    { prop: 'intervalMs', label: '轮播间隔(ms)', control: 'number' },
    { prop: 'autoScroll', label: '自动轮播', control: 'boolean' },
    { prop: 'statusColumn', label: '状态色列(列 id)', control: 'text' },
    // manifest 无法为 4 个键各生成一个取色器（propertyPanel 只有 prop/label/control），
    // 因此用 json 控件，值形如 {"critical":"#f5222d"}；留空即用共用等级调色板。
    { prop: 'statusPalette', label: '等级色覆盖(json)', control: 'json' },
  ],
  events: ['rowClick'],
  dataCapabilities: ['static', 'dataset', 'variable', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'columns',
        minFields: 1,
        maxFields: 64,
        valueTypes: ['string', 'number', 'boolean', 'date'],
      },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

export class PluginBoardScrollBoardElement extends BoardMaterialElement {
  static readonly manifest = PLUGIN_BOARD_SCROLL_BOARD_MANIFEST;

  #timer: ReturnType<typeof setInterval> | undefined;
  #offset = 0;
  #rows: readonly Record<string, unknown>[] = [];

  protected renderMaterial(): void {
    this.#stopTimer();
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;

    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.backgroundColor = styleColor(model.style.backgroundColor, '#0b1a2b');
    this.style.color = styleColor(model.style.color, '#e6f1ff');
    this.setAttribute('role', 'table');
    // a11y 名称取物料清单名，不来自文档：物料不再有标题字段。
    this.setAttribute('aria-label', PluginBoardScrollBoardElement.manifest.name);

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState);
      return;
    }
    const parsed = parseBaseScreenTableData(model.dataState.value);
    if (!parsed.ok) {
      this.appendDataStatePlaceholder({
        status: 'error',
        code: 'HOST_DATASET_INVALID',
        message: '列表数据格式无效',
      });
      return;
    }
    this.#paint(parsed.value, model);
  }

  #paint(data: BaseScreenTableData, model: BoardMaterialModel): void {
    const doc = this.ownerDocument;
    const rowHeight = readNumber(model.style.rowHeight, 34);
    const rowCount = Math.max(1, Math.round(readNumber(model.props.rowCount, 5)));
    const headerVisible = readBoolean(model.props.headerVisible, true);
    const fontSize = readNumber(model.style.fontSize, 14);
    const borderColor = styleColor(model.style.borderColor, '#1e3a5f');
    this.#rows = data.rows;
    // 等级色列：列 id 不在绑定里时一律按「未启用」处理（列 id 是配置，不是契约，不报错）。
    const statusColumnId = readString(model.props.statusColumn, '');
    const statusColumnIndex =
      statusColumnId === '' ? -1 : data.columns.findIndex((column) => column.id === statusColumnId);
    const palette = readStatusPalette(model.props.statusPalette);

    const root = doc.createElement('div');
    root.dataset.boardScrollBoard = '';
    // 只有表头 + 视口：没有标题行，整块高度都留给数据行。
    root.style.cssText =
      'display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;padding:6px 10px;';

    if (headerVisible) {
      const header = doc.createElement('div');
      header.dataset.boardHeader = '';
      header.style.cssText = `flex:0 0 auto;display:flex;height:${rowHeight}px;align-items:center;border-bottom:1px solid ${borderColor};color:${styleColor(model.style.headerColor, '#8aa4c0')};font:600 ${fontSize}px/1 sans-serif;`;
      // 启用等级色条时表头补一个等宽占位，否则表头与数据列会错开 4 px + 间距。
      if (statusColumnIndex >= 0) header.appendChild(this.#statusBar('transparent'));
      for (const column of data.columns) header.appendChild(this.#cell(column.label, 1, fontSize));
      root.appendChild(header);
    }

    const viewport = doc.createElement('div');
    viewport.dataset.boardViewport = '';
    // 视口高度由「行数 × 行高」决定，与数据条数无关：数据增减不会改变组件几何。
    viewport.style.cssText = `flex:1 1 auto;position:relative;overflow:hidden;min-height:0;`;
    const visibleCount = Math.min(rowCount, Math.max(1, data.rows.length));
    const track = doc.createElement('div');
    track.dataset.boardTrack = '';
    track.style.cssText = `position:absolute;left:0;right:0;top:0;will-change:transform;`;
    data.rows.forEach((row, rowIndex) => {
      const line = doc.createElement('div');
      line.dataset.boardRow = String(rowIndex);
      line.style.cssText = `display:flex;height:${rowHeight}px;align-items:center;border-bottom:1px solid ${borderColor};font:${fontSize}px/1 sans-serif;`;
      let statusColor: string | undefined;
      if (statusColumnIndex >= 0) {
        const statusColumn = data.columns[statusColumnIndex];
        const raw = statusColumn === undefined ? undefined : row[statusColumn.id];
        const level = typeof raw === 'string' ? raw : '';
        statusColor = alarmLevelColor(palette, level);
        // 行级属性便于断言与样式钩子；色条不是唯一编码，行内等级文字仍然保留。
        line.dataset.boardRowStatus = level === '' ? 'unknown' : level;
        line.appendChild(this.#statusBar(statusColor));
      }
      data.columns.forEach((column, columnIndex) => {
        const value = row[column.id];
        line.appendChild(
          this.#cell(
            value === null || value === undefined ? '' : String(value),
            columnIndex,
            fontSize,
            columnIndex === data.columns.length - 1,
            columnIndex === statusColumnIndex ? statusColor : undefined,
          ),
        );
      });
      line.addEventListener('click', () => this.#emitRowClick(rowIndex, row));
      track.appendChild(line);
    });
    viewport.appendChild(track);
    root.appendChild(viewport);
    this.commit(root);

    // 只有真正容纳不下的数据才轮播；一屏能放下时保持静止（也就不会无谓地消耗定时器）。
    if (readBoolean(model.props.autoScroll, true) && data.rows.length > visibleCount) {
      this.#startTimer(viewport, track, rowHeight, visibleCount, model);
    }
  }

  /** 行左 4 px 状态色条：与文字并存，因此色盲也能读出行等级。 */
  #statusBar(color: string): HTMLElement {
    const bar = this.ownerDocument.createElement('span');
    bar.dataset.boardStatusBar = '';
    bar.style.cssText = `flex:0 0 4px;align-self:stretch;background:${color};margin-right:6px;border-radius:2px;`;
    return bar;
  }

  #cell(
    text: string,
    columnIndex: number,
    fontSize: number,
    alignEnd = false,
    color?: string,
  ): HTMLElement {
    const cell = this.ownerDocument.createElement('span');
    cell.dataset.boardCell = String(columnIndex);
    cell.textContent = text;
    const colorStyle = color === undefined ? '' : `color:${color};`;
    cell.style.cssText = `flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${fontSize}px;${colorStyle}${alignEnd ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}`;
    return cell;
  }

  #startTimer(
    viewport: HTMLElement,
    track: HTMLElement,
    rowHeight: number,
    visibleCount: number,
    model: BoardMaterialModel,
  ): void {
    const interval = Math.max(200, Math.round(readNumber(model.props.intervalMs, 3000)));
    // 视口高度 = 可见行数 × 行高；读取一次，之后只做 transform，不触碰布局属性。
    viewport.dataset.boardVisibleRows = String(visibleCount);
    this.#offset = 0;
    this.#timer = setInterval(() => {
      this.#offset += 1;
      const rows = this.#rows.length;
      // 滚过末尾后从顶部无缝接回：位移取模，避免累积成越来越大的 translate 值。
      const shift = this.#offset % rows;
      track.style.transition = 'transform 420ms cubic-bezier(.33,1,.68,1)';
      track.style.transform = `translateY(${-shift * rowHeight}px)`;
      if (shift === 0) {
        // 归位那一帧不带动画，否则会看到一次从底部弹回顶部的长行程滚动。
        track.style.transition = 'none';
        window.requestAnimationFrame(() => {
          track.style.transition = 'transform 420ms cubic-bezier(.33,1,.68,1)';
        });
      }
    }, interval);
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  #emitRowClick(rowIndex: number, row: Record<string, unknown>): void {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_MATERIAL_EVENT, {
        bubbles: true,
        composed: true,
        detail: { name: 'rowClick', payload: { rowIndex, row } },
      }),
    );
  }

  disconnectedCallback(): void {
    this.#stopTimer();
  }
}

/**
 * 列投影走共用工厂（`createBoardColumnsAdapter`）：`scroll-board` / `status-grid` /
 * `pipeline` 的「表格 → 视图模型」只有一份实现。导出名保持不变（外部按名字引用）。
 */
export const PLUGIN_BOARD_SCROLL_BOARD_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter =
  createBoardColumnsAdapter('columns');

/** 等级色板的可用键：与 manifest 的 `statusPalette` schema 一致（4 个固定键）。 */
const STATUS_PALETTE_KEYS = ['critical', 'warning', 'info', 'default'] as const;

/**
 * 读 `statusPalette`：只接受 4 个固定键的字符串值，其余键与非法值一律忽略。
 * 空对象（默认值）= 完全回落到共用等级调色板。
 */
function readStatusPalette(value: unknown): Readonly<Record<string, string>> {
  const record = readRecord(value);
  const palette: Record<string, string> = {};
  if (record === undefined) return palette;
  for (const key of STATUS_PALETTE_KEYS) {
    const color = record[key];
    if (typeof color === 'string' && color.length > 0) palette[key] = color;
  }
  return palette;
}

function isAlarmLevelKey(value: string): value is BoardAlarmLevelKey {
  return Object.hasOwn(BOARD_ALARM_LEVEL_COLORS, value);
}

/**
 * 等级 → 颜色，优先级：`statusPalette[level]` → 共用等级调色板 → `statusPalette.default`
 * → 中性 `unknown`。未知等级不报错、不进失败计数（等级是数据内容，不是配置错误）。
 */
function alarmLevelColor(palette: Readonly<Record<string, string>>, level: string): string {
  const override = palette[level];
  if (override !== undefined) return override;
  if (isAlarmLevelKey(level)) return BOARD_ALARM_LEVEL_COLORS[level];
  return palette.default ?? BOARD_ALARM_LEVEL_COLORS.unknown;
}

Object.defineProperty(PluginBoardScrollBoardElement, 'tabularDataAdapter', {
  value: PLUGIN_BOARD_SCROLL_BOARD_TABULAR_DATA_ADAPTER,
});

export function definePluginBoardScrollBoardMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
    element: PluginBoardScrollBoardElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
