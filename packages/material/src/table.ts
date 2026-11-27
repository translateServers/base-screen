import type {
  ScreenDatasetField,
  ScreenParseResult,
  ScreenTabularDataset,
} from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  type BaseScreenTableData,
  parseBaseScreenTableData,
} from '@base-screen/plugin-core';
import {
  createBaseScreenMaterialEmptyView,
  createMaterialDefinition,
} from '@base-screen/plugin-sdk';
import {
  applyBackgroundColorOrGradient,
  BaseScreenOfficialMaterialElement,
} from './base-material.js';
import { styleField, withOfficialEditorDescriptor } from './editor-descriptor.js';

export const BASE_SCREEN_TABLE_MATERIAL_MANIFEST: BaseScreenMaterialManifest =
  withOfficialEditorDescriptor(
    {
      type: 'base.table',
      tagName: 'base-screen-table',
      name: '表格',
      category: '数据',
      keywords: ['表格', '数据', '明细'],
      defaultSize: { width: 560, height: 320 },
      defaultProps: {},
      defaultData: {
        fields: [
          { id: 'category', label: '区域', valueType: 'string', nullable: false },
          { id: 'amount', label: '金额', valueType: 'number', nullable: false },
          { id: 'orders', label: '订单数', valueType: 'number', nullable: false },
        ],
        rows: [
          { category: 'north', amount: 42, orders: 18 },
          { category: 'south', amount: 36, orders: 15 },
          { category: 'east', amount: 28, orders: 11 },
          { category: 'west', amount: 24, orders: 9 },
          { category: 'central', amount: 19, orders: 7 },
        ],
      },
      staticData: {
        kind: 'tabular',
        defaultBinding: { fields: { columns: ['category', 'amount', 'orders'] } },
      },
      defaultStyle: {
        backgroundColor: '#111827',
        color: '#f9fafb',
        headerBackgroundColor: '#1f2937',
        borderColor: '#374151',
        fontSize: 13,
        rowHeight: 32,
        opacity: 1,
        flipX: false,
        flipY: false,
      },
      styleSchema: {
        kind: 'object',
        properties: {
          backgroundColor: { kind: 'string' },
          color: { kind: 'string' },
          headerBackgroundColor: { kind: 'string' },
          borderColor: { kind: 'string' },
          fontSize: { kind: 'number', minimum: 10, maximum: 32 },
          rowHeight: { kind: 'number', minimum: 20, maximum: 96 },
          opacity: { kind: 'number', minimum: 0, maximum: 1 },
          flipX: { kind: 'boolean' },
          flipY: { kind: 'boolean' },
        },
        required: [
          'backgroundColor',
          'color',
          'headerBackgroundColor',
          'borderColor',
          'fontSize',
          'rowHeight',
        ],
      },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: ['rowClick', 'cellClick'],
      dataCapabilities: ['static', 'dataset', 'variable'],
      dataBinding: {
        roles: [
          {
            id: 'columns',
            minFields: 1,
            maxFields: 256,
            valueTypes: ['string', 'number', 'boolean', 'date'],
          },
        ],
      },
      designCapabilities: { resize: true, rotate: true, children: false },
    },
    {
      // 事件负载（ADR-0115 D3）：蓝图取值与智能体联动按它选字段。
      events: [
        {
          name: 'rowClick',
          label: '点击行',
          hint: '负载带被点的行（键为绑定的字段 id）与行号。',
          payloadSchema: {
            kind: 'object',
            properties: {
              rowIndex: { kind: 'number' },
              row: { kind: 'object', properties: {}, required: [] },
            },
            required: ['rowIndex', 'row'],
          },
        },
        {
          name: 'cellClick',
          label: '点击单元格',
          payloadSchema: {
            kind: 'object',
            properties: {
              rowIndex: { kind: 'number' },
              columnId: { kind: 'string' },
              value: { kind: 'string' },
            },
            required: ['rowIndex', 'columnId'],
          },
        },
      ],
      appearance: [
        {
          id: 'structure',
          label: '结构',
          fields: [styleField('rowHeight', '行高', 'number')],
        },
        {
          id: 'text',
          label: '文字',
          fields: [
            styleField('color', '文字色', 'color'),
            styleField('fontSize', '字号', 'number'),
          ],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            styleField('backgroundColor', '背景色', 'color', { allowGradient: true }),
            styleField('headerBackgroundColor', '表头色', 'color', { allowGradient: true }),
            styleField('borderColor', '边框色', 'color'),
          ],
        },
      ],
    },
  );

export class BaseScreenTableMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_TABLE_MATERIAL_MANIFEST;
  /** roving tabindex 的当前格：重渲染（数据刷新）后留在原位，越界时收进表内。 */
  private activeCell = { row: 0, column: 0 };
  /** 重渲染前焦点在表内：数据刷新会整表重建，重建后要把焦点放回当前格，否则键盘焦点掉到 body。 */
  private restoreFocus = false;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    // :focus-within 能穿过 shadow 边界判断（物料挂在查看器的 shadow root 里）。
    this.restoreFocus = hasFocusWithin(this);
    this.replaceChildren();
    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。
    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'auto';
    // 滚动条出现/消失会改变内容宽度；预留轨道避免数据变化时表格抖动。
    this.style.scrollbarGutter = 'stable';
    applyBackgroundColorOrGradient(this, stringValue(model.style.backgroundColor));
    this.style.color = stringValue(model.style.color);
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', '表格');
    if (model.dataState.status !== 'ready') {
      this.renderDataState(model.dataState);
      return;
    }
    const parsed = parseBaseScreenTableData(model.dataState.value);
    if (!parsed.ok) {
      this.renderInvalidData('HOST_DATASET_INVALID', '表格数据格式无效');
      return;
    }
    if (parsed.value.rows.length === 0) {
      this.replaceChildren(createBaseScreenMaterialEmptyView(this.ownerDocument));
      return;
    }
    this.renderTable(parsed.value, model);
  }

  private renderTable(
    data: BaseScreenTableData,
    model: NonNullable<typeof this.materialModel>,
  ): void {
    const table = this.ownerDocument.createElement('table');
    table.style.cssText = 'border-collapse: collapse; width: 100%; table-layout: auto;';
    // 不渲染 `<caption>`：表格物料没有标题类 prop（propsSchema 为空），需要标题时
    // 由文档层另放一个 `base.text` 组合（AGENTS.md 物料原子化约定）。
    const head = this.ownerDocument.createElement('thead');
    const headerRow = this.ownerDocument.createElement('tr');
    for (const column of data.columns) {
      const cell = this.ownerDocument.createElement('th');
      cell.scope = 'col';
      cell.textContent = column.label;
      cell.style.cssText = `height: ${numberValue(model.style.rowHeight, 32)}px; padding: 0 10px; text-align: left; background: ${stringValue(model.style.headerBackgroundColor)}; border: 1px solid ${stringValue(model.style.borderColor)}; font-weight: 600; white-space: nowrap;`;
      headerRow.appendChild(cell);
    }
    head.appendChild(headerRow);
    table.appendChild(head);
    const body = this.ownerDocument.createElement('tbody');
    // 键盘：整张表只占一个 Tab 停靠点（roving tabindex），方向键在格间移动，Enter / 空格触发
    // cellClick。设计态（不可交互）不设 tabindex、不监听按键：方向键要留给设计器微调组件位置。
    const interactive = model.interactive;
    const grid: HTMLTableCellElement[][] = [];
    const active = {
      row: Math.min(this.activeCell.row, data.rows.length - 1),
      column: Math.min(this.activeCell.column, data.columns.length - 1),
    };
    const moveTo = (rowIndex: number, columnIndex: number): void => {
      const next = grid[rowIndex]?.[columnIndex];
      if (next === undefined) return;
      grid[active.row]?.[active.column]?.setAttribute('tabindex', '-1');
      next.setAttribute('tabindex', '0');
      active.row = rowIndex;
      active.column = columnIndex;
      this.activeCell = { row: rowIndex, column: columnIndex };
      next.focus();
    };
    data.rows.forEach((row, rowIndex) => {
      const tableRow = this.ownerDocument.createElement('tr');
      tableRow.addEventListener('click', () => this.emitRowClick(rowIndex, row));
      const cells: HTMLTableCellElement[] = [];
      data.columns.forEach((column, columnIndex) => {
        const cell = this.ownerDocument.createElement('td');
        if (interactive) {
          const isActive = rowIndex === active.row && columnIndex === active.column;
          cell.setAttribute('tabindex', isActive ? '0' : '-1');
        }
        cell.textContent = formatCellValue(row[column.id], column.valueType);
        cell.style.cssText = `height: ${numberValue(model.style.rowHeight, 32)}px; padding: 0 10px; border: 1px solid ${stringValue(model.style.borderColor)}; font-size: ${numberValue(model.style.fontSize, 13)}px; white-space: nowrap;`;
        // 激活单元格（点击 / Enter / 空格）先发 cellClick、再发所在行的 rowClick，顺序同 DOM 冒泡。
        // 单元格铺满整行，若只发 cellClick，rowClick 就永远没有入口（蓝图里连了 rowClick 也不会触发）。
        const activate = (): void => {
          this.emitCellClick(rowIndex, column.id, row[column.id] ?? null);
          this.emitRowClick(rowIndex, row);
        };
        cell.addEventListener('click', (event) => {
          // rowClick 已在 activate 里发过：拦下冒泡，行上的监听不再重复发一次。
          event.stopPropagation();
          activate();
        });
        if (interactive) {
          // 浏览器默认焦点框在深色表格上几乎看不见（WCAG 2.4.7）：聚焦时用文字色画 2px 内描边。
          cell.addEventListener('focus', () => {
            cell.style.outline = `2px solid ${stringValue(model.style.color) || 'currentColor'}`;
            cell.style.outlineOffset = '-2px';
          });
          cell.addEventListener('blur', () => {
            cell.style.outline = '';
            cell.style.outlineOffset = '';
          });
          cell.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              activate();
              return;
            }
            const target = nextGridCell(
              event.key,
              event.ctrlKey,
              rowIndex,
              columnIndex,
              data.rows.length,
              data.columns.length,
            );
            if (target === undefined) return;
            event.preventDefault();
            moveTo(target.row, target.column);
          });
        }
        cells.push(cell);
        tableRow.appendChild(cell);
      });
      grid.push(cells);
      body.appendChild(tableRow);
    });
    table.appendChild(body);
    this.appendChild(table);
    if (interactive && this.restoreFocus) {
      grid[active.row]?.[active.column]?.focus({ preventScroll: true });
    }
    this.restoreFocus = false;
  }

  private emitRowClick(rowIndex: number, row: Readonly<Record<string, unknown>>): void {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: { name: 'rowClick', payload: { rowIndex, row } },
      }),
    );
  }

  private emitCellClick(rowIndex: number, columnId: string, value: unknown): void {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: { name: 'cellClick', payload: { rowIndex, columnId, value } },
      }),
    );
  }
}

/**
 * 网格方向键（WAI-ARIA grid 模式）：左右在行内、上下跨行，Home / End 到行首尾，
 * Ctrl+Home / Ctrl+End 到表首尾；到边不回绕。返回 undefined 表示不处理这个键。
 */
function nextGridCell(
  key: string,
  ctrlKey: boolean,
  row: number,
  column: number,
  rowCount: number,
  columnCount: number,
): { readonly row: number; readonly column: number } | undefined {
  const lastRow = rowCount - 1;
  const lastColumn = columnCount - 1;
  // 到边时返回原格：调用方照样 preventDefault，方向键不会滚动外层页面。
  return key === 'ArrowRight'
    ? { row, column: Math.min(column + 1, lastColumn) }
    : key === 'ArrowLeft'
      ? { row, column: Math.max(column - 1, 0) }
      : key === 'ArrowDown'
        ? { row: Math.min(row + 1, lastRow), column }
        : key === 'ArrowUp'
          ? { row: Math.max(row - 1, 0), column }
          : key === 'Home'
            ? { row: ctrlKey ? 0 : row, column: 0 }
            : key === 'End'
              ? { row: ctrlKey ? lastRow : row, column: lastColumn }
              : undefined;
}

function formatCellValue(value: unknown, valueType: string): string {
  if (value === null || value === undefined) return '';
  if (valueType === 'boolean') return value === true ? '是' : '否';
  return String(value);
}

/** 元素自身或后代持有焦点（可穿过 shadow 边界）；无 DOM 的测试替身没有 matches，按未聚焦处理。 */
function hasFocusWithin(element: Element): boolean {
  return typeof element.matches === 'function' && element.matches(':focus-within');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function defineBaseScreenTableMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
    element: BaseScreenTableMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}

const BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }) {
    const columns = fields.columns;
    if (columns === undefined || columns.length === 0) return invalidTableProjection();
    return {
      ok: true,
      value: {
        columns: columns.map((field) => tableColumn(field)),
        rows: dataset.rows.map((row) => projectRow(row, columns)),
        ...(dataset.totalRowCount === undefined ? {} : { totalRowCount: dataset.totalRowCount }),
      },
      diagnostics: [],
    };
  },
};

Object.defineProperty(BaseScreenTableMaterialElement, 'tabularDataAdapter', {
  value: BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
});

export { BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER };

function tableColumn(field: ScreenDatasetField) {
  return {
    id: field.id,
    label: field.label,
    valueType: field.valueType,
    sortable: false,
    filterable: false,
  } as const;
}

function projectRow(
  row: ScreenTabularDataset['rows'][number],
  fields: readonly ScreenDatasetField[],
) {
  return Object.fromEntries(fields.map((field) => [field.id, row[field.id] ?? null]));
}

function invalidTableProjection(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'Table dataset binding is invalid.',
      },
    ],
  };
}
