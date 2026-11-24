import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenChartData,
  type BaseScreenMaterialCatalogEntry,
  type BaseScreenMaterialConstructor,
  type BaseScreenMaterialManifest,
  type BaseScreenMaterialTabularDataAdapter,
  parseBaseScreenChartData,
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

export const BASE_SCREEN_CHART_MATERIAL_MANIFEST: BaseScreenMaterialManifest =
  withOfficialEditorDescriptor(
    {
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
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: ['pointClick'],
      dataCapabilities: ['static', 'dataset', 'variable'],
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
    },
    {
      appearance: [
        {
          id: 'text',
          label: '文字',
          fields: [styleField('color', '文字色', 'color')],
        },
        {
          id: 'surface',
          label: '填充与描边',
          fields: [
            styleField('backgroundColor', '背景色', 'color', { allowGradient: true }),
            styleField('gridColor', '网格色', 'color'),
            styleField('lineWidth', '线宽', 'number'),
          ],
        },
      ],
    },
  );

const CHART_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#4ade80', '#facc15', '#fb7185'];
/** 读屏替代表格的行数上限：数据点上万时整表进 DOM 代价过高，超出部分在标题里说明总数。 */
const CHART_A11Y_TABLE_ROW_LIMIT = 200;
const POINT_RADIUS = 1.4;
/** 聚焦点放大并描边：viewBox 里半径 1.4 的圆点几乎看不见浏览器默认焦点框（WCAG 2.4.7）。 */
const POINT_FOCUS_RADIUS = 2.6;

export class BaseScreenChartMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_CHART_MATERIAL_MANIFEST;
  /** roving tabindex 的当前点（按系列顺序展平后的下标）：重渲染后留在原位。 */
  private activePoint = 0;
  /** 重渲染前焦点在图内：数据刷新会重建 SVG，重建后要把焦点放回当前点。 */
  private restoreFocus = false;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.restoreFocus = hasFocusWithin(this);
    this.replaceChildren();
    // 显隐归渲染器（组件隐藏、画板外组件、蓝图显隐都写 display:none），这里不能覆盖成 block。
    if (this.style.display !== 'none') this.style.display = 'block';
    this.style.overflow = 'hidden';
    applyBackgroundColorOrGradient(this, stringValue(model.style.backgroundColor));
    this.style.color = stringValue(model.style.color);
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', '图表');

    if (model.dataState.status !== 'ready') {
      this.renderDataState(model.dataState);
      return;
    }
    const parsed = parseBaseScreenChartData(model.dataState.value);
    if (!parsed.ok) {
      this.renderInvalidData('HOST_DATASET_INVALID', '图表数据格式无效');
      return;
    }
    if (parsed.value.series.length === 0) {
      this.replaceChildren(createBaseScreenMaterialEmptyView(this.ownerDocument));
      return;
    }
    const pointCount = parsed.value.series.reduce(
      (total, series) => total + series.points.length,
      0,
    );
    this.setAttribute(
      'aria-label',
      `图表，${parsed.value.series.length} 个系列，${pointCount} 个数据点`,
    );
    this.renderChart(parsed.value, model);
  }

  private renderChart(
    data: BaseScreenChartData,
    model: NonNullable<typeof this.materialModel>,
  ): void {
    const svg = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 62');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', '图表数据点');
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
    // 键盘：整张图只占一个 Tab 停靠点，方向键在数据点间移动（按系列顺序展平），Enter / 空格
    // 触发 pointClick。设计态不设 tabindex、不监听按键。
    const interactive = model.interactive;
    const circles: SVGElement[] = [];
    const totalPoints = data.series.reduce((total, series) => total + series.points.length, 0);
    let active = Math.min(this.activePoint, Math.max(0, totalPoints - 1));
    const moveTo = (index: number): void => {
      const next = circles[index];
      if (next === undefined) return;
      circles[active]?.setAttribute('tabindex', '-1');
      next.setAttribute('tabindex', '0');
      active = index;
      this.activePoint = index;
      next.focus();
    };
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
          r: POINT_RADIUS,
          fill: CHART_COLORS[seriesIndex % CHART_COLORS.length]!,
        });
        if (interactive) {
          const index = circles.length;
          circle.setAttribute('tabindex', index === active ? '0' : '-1');
          circle.setAttribute('role', 'button');
          circle.setAttribute(
            'aria-label',
            `${series.label}，${String(point.point.x)}，${point.point.y}`,
          );
          circle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              this.emitPointClick(series, point.point, point.pointIndex);
              return;
            }
            const last = circles.length - 1;
            const target =
              event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? Math.min(index + 1, last)
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? Math.max(index - 1, 0)
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : undefined;
            if (target === undefined) return;
            event.preventDefault();
            moveTo(target);
          });
          circle.addEventListener('focus', () => {
            circle.setAttribute('r', String(POINT_FOCUS_RADIUS));
            circle.setAttribute('stroke', 'currentColor');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('vector-effect', 'non-scaling-stroke');
          });
          circle.addEventListener('blur', () => {
            circle.setAttribute('r', String(POINT_RADIUS));
            circle.removeAttribute('stroke');
            circle.removeAttribute('stroke-width');
          });
          circles.push(circle);
        }
        circle.addEventListener('click', () =>
          this.emitPointClick(series, point.point, point.pointIndex),
        );
        svg.appendChild(circle);
      }
    });
    this.appendChild(svg);
    this.appendChild(createChartDataTable(this.ownerDocument, data));
    if (interactive && this.restoreFocus) circles[active]?.focus({ preventScroll: true });
    this.restoreFocus = false;
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

function createChartDataTable(doc: Document, data: BaseScreenChartData): HTMLElement {
  const wrapper = doc.createElement('div');
  wrapper.style.cssText =
    'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  const table = doc.createElement('table');
  const caption = doc.createElement('caption');
  const head = doc.createElement('thead');
  const headerRow = doc.createElement('tr');
  for (const label of ['系列', 'X', 'Y']) {
    const cell = doc.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.appendChild(cell);
  }
  head.appendChild(headerRow);
  const body = doc.createElement('tbody');
  const entries = data.series.flatMap((series) =>
    series.points.map((point) => [series.label, point.x, point.y] as const),
  );
  for (const values of entries.slice(0, CHART_A11Y_TABLE_ROW_LIMIT)) {
    const row = doc.createElement('tr');
    for (const value of values) {
      const cell = doc.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  const pointCount = entries.length;
  caption.textContent =
    pointCount > CHART_A11Y_TABLE_ROW_LIMIT
      ? `图表数据（仅列出前 ${CHART_A11Y_TABLE_ROW_LIMIT} 个，共 ${pointCount} 个数据点）`
      : '图表数据';
  table.appendChild(caption);
  table.appendChild(head);
  table.appendChild(body);
  wrapper.appendChild(table);
  return wrapper;
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
