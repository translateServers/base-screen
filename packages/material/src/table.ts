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
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import {
  applyBackgroundColorOrGradient,
  BaseScreenOfficialMaterialElement,
} from './base-material.js';

export const BASE_SCREEN_TABLE_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
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
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'color', label: '文字色', control: 'color' },
    {
      style: 'headerBackgroundColor',
      label: '表头色',
      control: 'color',
      allowGradient: true,
    },
    { style: 'borderColor', label: '边框色', control: 'color' },
    { style: 'fontSize', label: '字号', control: 'number' },
    { style: 'rowHeight', label: '行高', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: ['rowClick', 'cellClick'],
  dataCapabilities: ['static', 'host-resource', 'variable'],
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
};

export class BaseScreenTableMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_TABLE_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'auto';
    applyBackgroundColorOrGradient(this, stringValue(model.style.backgroundColor));
    this.style.color = stringValue(model.style.color);
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', '表格');
    if (model.dataState.status !== 'ready') {
      this.renderMessage(
        model.dataState.status === 'loading'
          ? '加载中'
          : model.dataState.status === 'error'
            ? '数据不可用'
            : '暂无数据',
      );
      return;
    }
    const parsed = parseBaseScreenTableData(model.dataState.value);
    if (!parsed.ok) {
      this.renderMessage('数据格式无效');
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
    const caption = this.ownerDocument.createElement('caption');
    caption.textContent = stringValue(model.props.title);
    caption.style.cssText = 'text-align: left; padding: 10px 12px; font: 600 14px sans-serif;';
    table.appendChild(caption);
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
    data.rows.forEach((row, rowIndex) => {
      const tableRow = this.ownerDocument.createElement('tr');
      tableRow.addEventListener('click', () => this.emitRowClick(rowIndex, row));
      data.columns.forEach((column) => {
        const cell = this.ownerDocument.createElement('td');
        cell.textContent = formatCellValue(row[column.id], column.valueType);
        cell.style.cssText = `height: ${numberValue(model.style.rowHeight, 32)}px; padding: 0 10px; border: 1px solid ${stringValue(model.style.borderColor)}; font-size: ${numberValue(model.style.fontSize, 13)}px; white-space: nowrap;`;
        cell.addEventListener('click', (event) => {
          event.stopPropagation();
          this.emitCellClick(rowIndex, column.id, row[column.id] ?? null);
        });
        tableRow.appendChild(cell);
      });
      body.appendChild(tableRow);
    });
    table.appendChild(body);
    this.appendChild(table);
  }

  private renderMessage(message: string): void {
    const element = this.ownerDocument.createElement('div');
    element.textContent = message;
    element.style.cssText =
      'display: grid; place-items: center; min-height: 100%; opacity: .72; font: 13px sans-serif;';
    this.appendChild(element);
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

function formatCellValue(value: unknown, valueType: string): string {
  if (value === null || value === undefined) return '';
  if (valueType === 'boolean') return value === true ? '是' : '否';
  return String(value);
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
