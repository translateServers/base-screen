import type {
  ScreenDatasetField,
  ScreenParseResult,
  ScreenTabularDataset,
} from '@base-screen/contracts';
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
import { DatavMaterialElement, type DatavMaterialModel } from './datav-element.js';
import { PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME, PLUGIN_DATAV_SCROLL_BOARD_TYPE } from './identity.js';
import { readBoolean, readNumber, readString, styleColor } from './json-values.js';

/**
 * 轮播列表：用滚动动画在固定区域内轮流展示多行明细。
 *
 * 与 DataV 的轮播列表同形：表头可选、视口高度固定为「行数 × 行高」、内容按行上滚。
 * 视口高度不随数据条数变化，滚动只改 track 的 transform，因此不会因为数据更新而
 * 改变组件几何（样式稳定性：不得抖动）。
 */
export const PLUGIN_DATAV_SCROLL_BOARD_MANIFEST: BaseScreenMaterialManifest = {
  type: PLUGIN_DATAV_SCROLL_BOARD_TYPE,
  tagName: PLUGIN_DATAV_SCROLL_BOARD_TAG_NAME,
  name: '轮播列表',
  category: '指标',
  keywords: ['列表', '轮播', '滚动', '大屏'],
  defaultSize: { width: 420, height: 220 },
  defaultProps: {
    title: '实时排行',
    headerVisible: true,
    rowCount: 5,
    intervalMs: 3000,
    autoScroll: true,
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
      title: { kind: 'string', maxLength: 64 },
      headerVisible: { kind: 'boolean' },
      rowCount: { kind: 'number', minimum: 1, maximum: 50 },
      intervalMs: { kind: 'number', minimum: 200, maximum: 60_000 },
      autoScroll: { kind: 'boolean' },
    },
    required: ['headerVisible', 'rowCount', 'intervalMs', 'autoScroll'],
  },
  propertyPanel: [
    { prop: 'title', label: '标题', control: 'text' },
    { prop: 'headerVisible', label: '显示表头', control: 'boolean' },
    { prop: 'rowCount', label: '可见行数', control: 'number' },
    { prop: 'intervalMs', label: '轮播间隔(ms)', control: 'number' },
    { prop: 'autoScroll', label: '自动轮播', control: 'boolean' },
  ],
  events: ['rowClick'],
  dataCapabilities: ['static', 'dataset', 'variable'],
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

export class PluginDatavScrollBoardElement extends DatavMaterialElement {
  static readonly manifest = PLUGIN_DATAV_SCROLL_BOARD_MANIFEST;

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
    this.setAttribute('aria-label', readString(model.props.title, '轮播列表'));

    if (model.dataState.status !== 'ready') {
      this.appendDataStatePlaceholder(model.dataState.status);
      return;
    }
    const parsed = parseBaseScreenTableData(model.dataState.value);
    if (!parsed.ok) {
      this.appendDataStatePlaceholder('error');
      return;
    }
    this.#paint(parsed.value, model);
  }

  #paint(data: BaseScreenTableData, model: DatavMaterialModel): void {
    const doc = this.ownerDocument;
    const rowHeight = readNumber(model.style.rowHeight, 34);
    const rowCount = Math.max(1, Math.round(readNumber(model.props.rowCount, 5)));
    const headerVisible = readBoolean(model.props.headerVisible, true);
    const fontSize = readNumber(model.style.fontSize, 14);
    const borderColor = styleColor(model.style.borderColor, '#1e3a5f');
    this.#rows = data.rows;

    const root = doc.createElement('div');
    root.dataset.datavScrollBoard = '';
    root.style.cssText =
      'display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;padding:6px 10px;';

    const title = readString(model.props.title);
    if (title !== '') {
      const heading = doc.createElement('div');
      heading.dataset.datavBoardTitle = '';
      heading.textContent = title;
      heading.style.cssText = `flex:0 0 auto;font:600 ${fontSize + 1}px/1.6 sans-serif;color:${styleColor(model.style.headerColor, '#8aa4c0')};letter-spacing:.06em;`;
      root.appendChild(heading);
    }

    if (headerVisible) {
      const header = doc.createElement('div');
      header.dataset.datavBoardHeader = '';
      header.style.cssText = `flex:0 0 auto;display:flex;height:${rowHeight}px;align-items:center;border-bottom:1px solid ${borderColor};color:${styleColor(model.style.headerColor, '#8aa4c0')};font:600 ${fontSize}px/1 sans-serif;`;
      for (const column of data.columns) header.appendChild(this.#cell(column.label, 1, fontSize));
      root.appendChild(header);
    }

    const viewport = doc.createElement('div');
    viewport.dataset.datavBoardViewport = '';
    // 视口高度由「行数 × 行高」决定，与数据条数无关：数据增减不会改变组件几何。
    viewport.style.cssText = `flex:1 1 auto;position:relative;overflow:hidden;min-height:0;`;
    const visibleCount = Math.min(rowCount, Math.max(1, data.rows.length));
    const track = doc.createElement('div');
    track.dataset.datavBoardTrack = '';
    track.style.cssText = `position:absolute;left:0;right:0;top:0;will-change:transform;`;
    data.rows.forEach((row, rowIndex) => {
      const line = doc.createElement('div');
      line.dataset.datavBoardRow = String(rowIndex);
      line.style.cssText = `display:flex;height:${rowHeight}px;align-items:center;border-bottom:1px solid ${borderColor};font:${fontSize}px/1 sans-serif;`;
      data.columns.forEach((column, columnIndex) => {
        const value = row[column.id];
        line.appendChild(
          this.#cell(
            value === null || value === undefined ? '' : String(value),
            columnIndex,
            fontSize,
            columnIndex === data.columns.length - 1,
          ),
        );
      });
      line.addEventListener('click', () => this.#emitRowClick(rowIndex, row));
      track.appendChild(line);
    });
    viewport.appendChild(track);
    root.appendChild(viewport);
    this.replaceChildren(root);

    // 只有真正容纳不下的数据才轮播；一屏能放下时保持静止（也就不会无谓地消耗定时器）。
    if (readBoolean(model.props.autoScroll, true) && data.rows.length > visibleCount) {
      this.#startTimer(viewport, track, rowHeight, visibleCount, model);
    }
  }

  #cell(text: string, columnIndex: number, fontSize: number, alignEnd = false): HTMLElement {
    const cell = this.ownerDocument.createElement('span');
    cell.dataset.datavBoardCell = String(columnIndex);
    cell.textContent = text;
    cell.style.cssText = `flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${fontSize}px;${alignEnd ? 'text-align:right;font-variant-numeric:tabular-nums;' : ''}`;
    return cell;
  }

  #startTimer(
    viewport: HTMLElement,
    track: HTMLElement,
    rowHeight: number,
    visibleCount: number,
    model: DatavMaterialModel,
  ): void {
    const interval = Math.max(200, Math.round(readNumber(model.props.intervalMs, 3000)));
    // 视口高度 = 可见行数 × 行高；读取一次，之后只做 transform，不触碰布局属性。
    viewport.dataset.datavBoardVisibleRows = String(visibleCount);
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

const PLUGIN_DATAV_SCROLL_BOARD_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({
    dataset,
    fields,
  }: {
    readonly dataset: ScreenTabularDataset;
    readonly fields: Readonly<Record<string, readonly ScreenDatasetField[]>>;
  }) {
    const columns = fields.columns;
    if (columns === undefined || columns.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_DATASET_BINDING_INVALID',
            path: [],
            message: 'Scroll board dataset binding is invalid.',
          },
        ],
      };
    }
    return {
      ok: true,
      value: {
        columns: columns.map((field) => ({
          id: field.id,
          label: field.label,
          valueType: field.valueType,
          sortable: false,
          filterable: false,
        })),
        rows: dataset.rows.map((row) =>
          Object.fromEntries(columns.map((field) => [field.id, row[field.id] ?? null])),
        ),
        ...(dataset.totalRowCount === undefined ? {} : { totalRowCount: dataset.totalRowCount }),
      },
      diagnostics: [],
    };
  },
};

Object.defineProperty(PluginDatavScrollBoardElement, 'tabularDataAdapter', {
  value: PLUGIN_DATAV_SCROLL_BOARD_TABULAR_DATA_ADAPTER,
});

export function definePluginDatavScrollBoardMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: PLUGIN_DATAV_SCROLL_BOARD_MANIFEST,
    element: PluginDatavScrollBoardElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}
