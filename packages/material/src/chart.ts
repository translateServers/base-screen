import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenChartData,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  parseBaseScreenChartData,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import {
  applyBackgroundColorOrGradient,
  BaseScreenOfficialMaterialElement,
} from './base-material.js';

export const BASE_SCREEN_CHART_MATERIAL_MANIFEST: BaseScreenMaterialManifest = {
  type: 'base.chart',
  tagName: 'base-screen-chart',
  name: '图表',
  category: '数据',
  keywords: ['图表', '趋势', '数据'],
  defaultSize: { width: 480, height: 280 },
  defaultProps: {},
  defaultData: {
    fields: [
      { id: 'region', label: '区域', valueType: 'string', nullable: false },
      { id: 'amount', label: '订单金额', valueType: 'number', nullable: false },
    ],
    rows: [
      { region: 'north', amount: 42 },
      { region: 'south', amount: 36 },
      { region: 'east', amount: 28 },
      { region: 'west', amount: 24 },
      { region: 'central', amount: 19 },
    ],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { dimension: ['region'], measures: ['amount'] } },
  },
  defaultStyle: {
    backgroundColor: '#111827',
    color: '#f9fafb',
    gridColor: '#374151',
    lineWidth: 2,
    opacity: 1,
    flipX: false,
    flipY: false,
  },
  styleSchema: {
    kind: 'object',
    properties: {
      backgroundColor: { kind: 'string' },
      color: { kind: 'string' },
      gridColor: { kind: 'string' },
      lineWidth: { kind: 'number', minimum: 1, maximum: 8 },
      opacity: { kind: 'number', minimum: 0, maximum: 1 },
      flipX: { kind: 'boolean' },
      flipY: { kind: 'boolean' },
    },
    required: ['backgroundColor', 'color', 'gridColor', 'lineWidth'],
  },
  stylePanel: [
    { style: 'backgroundColor', label: '背景色', control: 'color', allowGradient: true },
    { style: 'color', label: '文字色', control: 'color' },
    { style: 'gridColor', label: '网格色', control: 'color' },
    { style: 'lineWidth', label: '线宽', control: 'number' },
  ],
  propsSchema: { kind: 'object', properties: {}, required: [] },
  propertyPanel: [],
  events: ['pointClick'],
  dataCapabilities: ['static', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'dimension',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['string', 'number', 'boolean', 'date'],
      },
      { id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] },
    ],
  },
  designCapabilities: { resize: true, rotate: true, children: false },
};

const CHART_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#4ade80', '#facc15', '#fb7185'];

export class BaseScreenChartMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_CHART_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    applyBackgroundColorOrGradient(this, stringValue(model.style.backgroundColor));
    this.style.color = stringValue(model.style.color);
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', '图表');

    if (model.dataState.status !== 'ready') {
      const state = this.ownerDocument.createElement('div');
      state.textContent =
        model.dataState.status === 'loading'
          ? '加载中'
          : model.dataState.status === 'error'
            ? '数据不可用'
            : '暂无数据';
      state.style.cssText =
        'display: grid; place-items: center; height: 100%; color: currentColor; opacity: .72; font: 13px sans-serif;';
      this.appendChild(state);
      return;
    }
    const parsed = parseBaseScreenChartData(model.dataState.value);
    if (!parsed.ok) {
      this.renderMessage('数据格式无效');
      return;
    }
    this.renderChart(parsed.value, model);
  }

  private renderChart(
    data: BaseScreenChartData,
    model: NonNullable<typeof this.materialModel>,
  ): void {
    const svg = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 62');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText =
      'display: block; width: 100%; height: 100%; padding: 4px 12px 10px; box-sizing: border-box;';
    const gridColor = stringValue(model.style.gridColor);
    for (const y of [12, 24, 36, 48]) {
      const line = this.svgElement('line', {
        x1: 4,
        x2: 96,
        y1: y,
        y2: y,
        stroke: gridColor,
        'stroke-width': 0.35,
      });
      svg.appendChild(line);
    }
    const values = data.series.flatMap((series) => series.points.map((point) => point.y));
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    data.series.forEach((series, seriesIndex) => {
      const points = series.points.map((point, pointIndex) => {
        const x =
          series.points.length <= 1 ? 50 : 6 + (pointIndex * 88) / (series.points.length - 1);
        const y = 52 - ((point.y - min) / (max - min)) * 40;
        return { x, y, point, pointIndex };
      });
      const polyline = this.svgElement('polyline', {
        points: points.map((point) => `${point.x},${point.y}`).join(' '),
        fill: 'none',
        stroke: CHART_COLORS[seriesIndex % CHART_COLORS.length]!,
        'stroke-width': numberValue(model.style.lineWidth, 2),
        'vector-effect': 'non-scaling-stroke',
      });
      svg.appendChild(polyline);
      for (const point of points) {
        const circle = this.svgElement('circle', {
          cx: point.x,
          cy: point.y,
          r: 1.4,
          fill: CHART_COLORS[seriesIndex % CHART_COLORS.length]!,
        });
        circle.addEventListener('click', () =>
          this.emitPointClick(series, point.point, point.pointIndex),
        );
        svg.appendChild(circle);
      }
    });
    this.appendChild(svg);
  }

  private renderMessage(message: string): void {
    const element = this.ownerDocument.createElement('div');
    element.textContent = message;
    element.style.cssText =
      'display: grid; place-items: center; height: 100%; opacity: .72; font: 13px sans-serif;';
    this.appendChild(element);
  }

  private emitPointClick(
    series: BaseScreenChartData['series'][number],
    point: BaseScreenChartData['series'][number]['points'][number],
    pointIndex: number,
  ): void {
    const model = this.materialModel;
    if (model?.interactive !== true) return;
    this.dispatchEvent(
      new CustomEvent('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: {
          name: 'pointClick',
          payload: { seriesId: series.id, pointIndex, x: point.x, y: point.y },
        },
      }),
    );
  }

  private svgElement(name: string, attributes: Record<string, number | string>): SVGElement {
    const element = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function defineBaseScreenChartMaterial(): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const definition = createMaterialDefinition({
    manifest: BASE_SCREEN_CHART_MATERIAL_MANIFEST,
    element: BaseScreenChartMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok ? definition.value.define() : definition;
}

const BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }) {
    const dimension = fields.dimension?.[0];
    const measures = fields.measures;
    if (dimension === undefined || measures === undefined || measures.length === 0) {
      return invalidChartProjection();
    }
    return {
      ok: true,
      value: {
        series: measures.map((measure) => ({
          id: measure.id,
          label: measure.label,
          points: dataset.rows.flatMap((row) => {
            const x = row[dimension.id];
            const y = row[measure.id];
            return x === undefined || x === null || y === null
              ? []
              : typeof y === 'number' && Number.isFinite(y)
                ? [{ x, y }]
                : [];
          }),
        })),
      },
      diagnostics: [],
    };
  },
};

Object.defineProperty(BaseScreenChartMaterialElement, 'tabularDataAdapter', {
  value: BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
});

export { BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER };

function invalidChartProjection(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_BINDING_INVALID',
        path: [],
        message: 'Chart dataset binding is invalid.',
      },
    ],
  };
}
