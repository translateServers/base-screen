import type { ScreenJsonValue } from '@base-screen/contracts';
import { type BaseScreenChartData, parseBaseScreenChartData } from '@base-screen/plugin-core';
import {
  applyBackgroundColorOrGradient,
  BaseScreenOfficialMaterialElement,
} from './base-material.js';
import { BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST } from './echarts-manifest.js';

const ECHARTS_COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#4ade80', '#facc15', '#fb7185'];

export class BaseScreenEChartsMaterialElement extends BaseScreenOfficialMaterialElement {
  static readonly manifest = BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST;

  protected renderMaterial(): void {
    const model = this.materialModel;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    applyBackgroundColorOrGradient(this, stringValue(model.style.backgroundColor));
    this.style.color = stringValue(model.style.color);
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', 'ECharts 图表');

    if (model.dataState.status !== 'ready') {
      this.renderState(
        model.dataState.status === 'loading'
          ? '加载中'
          : model.dataState.status === 'error'
            ? '数据不可用'
            : '暂无数据',
      );
      return;
    }
    const parsed = parseBaseScreenChartData(model.dataState.value);
    if (!parsed.ok) {
      this.renderState('数据格式无效');
      return;
    }
    this.renderChart(parsed.value, model);
  }

  private renderChart(
    data: BaseScreenChartData,
    model: NonNullable<typeof this.materialModel>,
  ): void {
    const props = model.props;
    const read = (path: readonly string[]): ScreenJsonValue | undefined => readPath(props, path);
    const svg = this.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 62');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText =
      'display: block; width: 100%; height: 100%; padding: 4px 12px 10px; box-sizing: border-box;';
    const gridColor = stringValue(model.style.gridColor);
    const titleText = stringValue(read(['title', 'text']));
    const showTitle = booleanValue(read(['title', 'show']), false);
    const showGrid = booleanValue(read(['grid', 'show']), true);
    const showDataLabels = booleanValue(read(['advanced', 'showDataLabels']), false);
    const symbolSize = numberValue(read(['advanced', 'symbolSize']), 4);
    const hover = booleanValue(read(['interactions', 'hover']), true);
    const select = booleanValue(read(['interactions', 'select']), false);
    const seriesProps = arrayValue(read(['series']));

    if (showTitle && titleText !== '') {
      const text = this.svgElement('text', {
        x: 50,
        y: 6,
        'text-anchor': 'middle',
        fill: stringValue(read(['title', 'color'])) || 'currentColor',
        'font-size': numberValue(read(['title', 'fontSize']), 16),
        'font-weight': 'bold',
      });
      text.textContent = titleText;
      svg.appendChild(text);
    }
    const plot = { top: 10, right: 92, bottom: 54, left: 8 };
    if (showGrid) {
      for (const y of [16, 28, 40]) {
        svg.appendChild(
          this.svgElement('line', {
            x1: plot.left,
            x2: plot.right,
            y1: y,
            y2: y,
            stroke: gridColor,
            'stroke-width': 0.35,
          }),
        );
      }
    }
    const values = data.series.flatMap((series) => series.points.map((point) => point.y));
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    data.series.forEach((series, seriesIndex) => {
      const seriesConfig = seriesProps[seriesIndex];
      const color = stringValue(seriesConfig?.color) || ECHARTS_COLORS[seriesIndex] || '#38bdf8';
      const lineWidth = numberValue(seriesConfig?.lineWidth, 2);
      const kind = stringValue(seriesConfig?.type) || 'line';
      const points = series.points.map((point, pointIndex) => {
        const x =
          series.points.length <= 1
            ? (plot.left + plot.right) / 2
            : plot.left + (pointIndex * (plot.right - plot.left)) / (series.points.length - 1);
        const y = plot.bottom - ((point.y - min) / (max - min)) * 32;
        return { x, y, point, pointIndex };
      });
      if (kind === 'bar') {
        const barWidth = Math.min(8, (plot.right - plot.left) / (series.points.length * 2.2));
        for (const point of points) {
          svg.appendChild(
            this.svgElement('rect', {
              x: point.x - barWidth / 2,
              y: point.y,
              width: barWidth,
              height: Math.max(1, plot.bottom - point.y),
              fill: color,
              opacity: 0.85,
            }),
          );
        }
      } else {
        if (kind === 'area') {
          svg.appendChild(
            this.svgElement('polygon', {
              points: `${points[0]?.x ?? plot.left},${plot.bottom} ${points
                .map((point) => `${point.x},${point.y}`)
                .join(' ')} ${points[points.length - 1]?.x ?? plot.right},${plot.bottom}`,
              fill: color,
              opacity: numberValue(read(['advanced', 'areaOpacity']), 0.2),
            }),
          );
        }
        svg.appendChild(
          this.svgElement('polyline', {
            points: points.map((point) => `${point.x},${point.y}`).join(' '),
            fill: 'none',
            stroke: color,
            'stroke-width': lineWidth,
            'vector-effect': 'non-scaling-stroke',
          }),
        );
      }
      for (const point of points) {
        const circle = this.svgElement('circle', {
          cx: point.x,
          cy: point.y,
          r: hover || select ? symbolSize / 3 : 1.2,
          fill: color,
        });
        // 原生 CSS/悬停交互（光标与 hover 放大）与点击事件同受 interactive 门控：
        // 设计态「事件」开关关闭时圆点保持静态，开启（或 Viewer）时才出现交互示意。
        if (model.interactive) {
          circle.style.cursor = 'pointer';
          circle.addEventListener('mouseenter', () => {
            circle.setAttribute('r', String(symbolSize / 2));
          });
          circle.addEventListener('mouseleave', () => {
            circle.setAttribute('r', String(hover || select ? symbolSize / 3 : 1.2));
          });
        }
        circle.addEventListener('click', () =>
          this.emitSeriesClick(seriesIndex, series, point.point, point.pointIndex),
        );
        svg.appendChild(circle);
        if (showDataLabels) {
          const label = this.svgElement('text', {
            x: point.x,
            y: point.y - 2,
            'text-anchor': 'middle',
            fill: 'currentColor',
            'font-size': 4,
          });
          label.textContent = String(point.point.y);
          svg.appendChild(label);
        }
      }
    });
    this.appendChild(svg);
  }

  private renderState(message: string): void {
    const element = this.ownerDocument.createElement('div');
    element.textContent = message;
    element.style.cssText =
      'display: grid; place-items: center; height: 100%; opacity: .72; font: 13px sans-serif;';
    this.appendChild(element);
  }

  private emitSeriesClick(
    seriesIndex: number,
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
          name: 'seriesClick',
          payload: {
            seriesIndex,
            seriesName: series.label,
            pointIndex,
            x: String(point.x),
            y: point.y,
          },
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

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function arrayValue(value: unknown): readonly (Record<string, ScreenJsonValue> | undefined)[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, ScreenJsonValue>)
      : undefined,
  );
}

function readPath(
  record: Readonly<Record<string, ScreenJsonValue>>,
  path: readonly string[],
): ScreenJsonValue | undefined {
  let current: unknown = record;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, ScreenJsonValue>>)[segment];
  }
  return current as ScreenJsonValue | undefined;
}
