import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialElement, BaseScreenMaterialModel } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenChartMaterialElement,
  BaseScreenContainerMaterialElement,
  BaseScreenEChartsMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
} from '../src/index.js';

/**
 * 官方物料原生事件（Designer「事件」开关，ADR-0036）全覆盖：
 * - 声明表：全部官方 element 的事件声明与交互能力一一对应；
 * - 门控：text/echarts/chart/table 只在 model.interactive === true 时派发
 *   base-screen-material-event，关闭时零事件；
 * - payload 形状与 manifest 声明的事件名一致。
 * 无 DOM 环境（node）下以最小 stub 驱动真实物料类：事件监听与派发按浏览器语义模拟。
 */

class StubNode {
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  readonly children: StubNode[] = [];
  readonly style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  textContent = '';
  scope = '';
  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  appendChild(child: StubNode): StubNode {
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

interface MountedMaterialElement {
  readonly created: StubNode[];
  readonly events: CustomEvent[];
  readonly listeners: ReadonlyMap<string, (event: unknown) => void>;
  readonly setModel: (model: BaseScreenMaterialModel) => void;
}

function mountElement(
  ElementConstructor: new () => BaseScreenMaterialElement,
  model: BaseScreenMaterialModel,
): MountedMaterialElement {
  const created: StubNode[] = [];
  const events: CustomEvent[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const element = new ElementConstructor() as unknown as Record<string, unknown> & {
    connectedCallback?: () => void;
    model: BaseScreenMaterialModel;
  };
  element.dataset = {};
  element.ariaBusy = '';
  element.textContent = '';
  element.style = {};
  element.isConnected = true;
  element.setAttribute = () => {};
  element.replaceChildren = () => {};
  element.appendChild = () => {};
  element.dispatchEvent = (event: CustomEvent) => {
    events.push(event);
    return true;
  };
  element.addEventListener = (type: string, listener: (event: unknown) => void) => {
    listeners.set(type, listener);
  };
  element.ownerDocument = {
    createElement: (tagName: string) => {
      const node = new StubNode(tagName);
      created.push(node);
      return node;
    },
    createElementNS: (_namespace: string, tagName: string) => {
      const node = new StubNode(tagName);
      created.push(node);
      return node;
    },
  };
  // 模拟浏览器挂载：text 在 connectedCallback 注册 click 监听（其余元素无覆盖）。
  element.connectedCallback?.();
  element.model = model;
  return {
    created,
    events,
    listeners,
    setModel: (next) => {
      element.model = next;
    },
  };
}

function chartData(): {
  readonly series: readonly {
    readonly id: string;
    readonly label: string;
    readonly points: readonly { readonly x: string; readonly y: number }[];
  }[];
} {
  return { series: [{ id: 's1', label: '系列一', points: [{ x: 'north', y: 42 }] }] };
}

function tableData(): {
  readonly columns: readonly {
    readonly id: string;
    readonly label: string;
    readonly valueType: string;
    readonly sortable: boolean;
    readonly filterable: boolean;
  }[];
  readonly rows: readonly { readonly amount: number }[];
} {
  return {
    columns: [
      { id: 'amount', label: '金额', valueType: 'number', sortable: true, filterable: false },
    ],
    rows: [{ amount: 42 }],
  };
}

function model(
  dataState: BaseScreenMaterialModel['dataState'],
  interactive: boolean,
  props: BaseScreenMaterialModel['props'] = {},
): BaseScreenMaterialModel {
  return {
    componentId: 'c1',
    mode: 'viewer',
    interactive,
    props,
    style: {},
    size: { width: 100, height: 100 },
    dataState,
  };
}

function readyModel(
  value: ScreenJsonValue,
  interactive: boolean,
  props: BaseScreenMaterialModel['props'] = {},
): BaseScreenMaterialModel {
  return model({ status: 'ready', value }, interactive, props);
}

function clickableNode(created: readonly StubNode[], tagName: string): StubNode {
  const node = created.find(
    (candidate) => candidate.tagName === tagName && candidate.listeners.has('click'),
  );
  if (node === undefined) throw new Error(`No clickable ${tagName} node rendered.`);
  return node;
}

function lastClickableNode(created: readonly StubNode[], tagName: string): StubNode {
  const node = [...created]
    .reverse()
    .find((candidate) => candidate.tagName === tagName && candidate.listeners.has('click'));
  if (node === undefined) throw new Error(`No clickable ${tagName} node rendered.`);
  return node;
}

function fireClick(node: StubNode, event: unknown = {}): void {
  for (const listener of node.listeners.get('click') ?? []) listener(event);
}

describe('official material native event declarations', () => {
  it('declares events for exactly the interactive official elements', () => {
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.events).toEqual(['valueClick']);
    expect(BASE_SCREEN_ECHARTS_MATERIAL_MANIFEST.events).toEqual(['seriesClick']);
    expect(BASE_SCREEN_CHART_MATERIAL_MANIFEST.events).toEqual(['pointClick']);
    expect(BASE_SCREEN_TABLE_MATERIAL_MANIFEST.events).toEqual(['rowClick', 'cellClick']);
    expect(BASE_SCREEN_IMAGE_MATERIAL_MANIFEST.events).toEqual([]);
    expect(BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.events).toEqual([]);
    expect(BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST.events).toEqual([]);
    expect(BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST.events).toEqual([]);
  });
});

describe('official material native events (interactive gating)', () => {
  it('text dispatches valueClick only when interactive, with props payload', () => {
    const harness = mountElement(
      BaseScreenTextMaterialElement,
      readyModel('探针文本', false, { label: '标题' }),
    );
    const click = harness.listeners.get('click');
    expect(click).toBeTypeOf('function');

    click?.({});
    expect(harness.events).toHaveLength(0);

    harness.setModel(readyModel('探针文本', true, { label: '标题' }));
    click?.({});
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.detail).toEqual({ name: 'valueClick', payload: { label: '标题' } });
  });

  it('chart dispatches pointClick from its svg circles only when interactive', () => {
    const harness = mountElement(BaseScreenChartMaterialElement, readyModel(chartData(), false));
    const circle = clickableNode(harness.created, 'circle');

    // 基础图表没有原生 CSS/悬停交互：任何 interactive 状态下都不注册 hover 监听与光标。
    expect(circle.listeners.has('mouseenter')).toBe(false);
    expect(circle.listeners.has('mouseleave')).toBe(false);
    expect(circle.style.cursor).toBeUndefined();
    fireClick(circle);
    expect(harness.events).toHaveLength(0);

    harness.setModel(readyModel(chartData(), true));
    fireClick(circle);
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.detail).toEqual({
      name: 'pointClick',
      payload: { seriesId: 's1', pointIndex: 0, x: 'north', y: 42 },
    });
  });

  it('echarts gates native css hover affordances and seriesClick by interactive', () => {
    const props = { interactions: { hover: true, select: false, click: 'host-event' } };
    const harness = mountElement(
      BaseScreenEChartsMaterialElement,
      readyModel(chartData(), false, props),
    );
    const circle = clickableNode(harness.created, 'circle');

    // 关闭：无 hover 监听、无 pointer 光标（原生 CSS 事件同样被门控），点击零事件。
    expect(circle.listeners.has('mouseenter')).toBe(false);
    expect(circle.listeners.has('mouseleave')).toBe(false);
    expect(circle.style.cursor).toBeUndefined();
    fireClick(circle);
    expect(harness.events).toHaveLength(0);

    harness.setModel(readyModel(chartData(), true, props));
    const interactiveCircle = lastClickableNode(harness.created, 'circle');
    expect(interactiveCircle.listeners.has('mouseenter')).toBe(true);
    expect(interactiveCircle.listeners.has('mouseleave')).toBe(true);
    expect(interactiveCircle.style.cursor).toBe('pointer');
    // 开启：hover 放大（symbolSize/2）与离开复位（hover=true → symbolSize/3）生效。
    for (const listener of interactiveCircle.listeners.get('mouseenter') ?? []) listener({});
    expect(interactiveCircle.attributes.r).toBe('2');
    for (const listener of interactiveCircle.listeners.get('mouseleave') ?? []) listener({});
    expect(interactiveCircle.attributes.r).toBe('1.3333333333333333');

    fireClick(interactiveCircle);
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.detail).toEqual({
      name: 'seriesClick',
      payload: { seriesIndex: 0, seriesName: '系列一', pointIndex: 0, x: 'north', y: 42 },
    });
  });

  it('table dispatches rowClick and cellClick only when interactive, cells stop propagation', () => {
    const harness = mountElement(BaseScreenTableMaterialElement, readyModel(tableData(), false));
    const row = clickableNode(harness.created, 'tr');
    const cell = clickableNode(harness.created, 'td');

    fireClick(row);
    expect(harness.events).toHaveLength(0);

    harness.setModel(readyModel(tableData(), true));
    fireClick(row);
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]?.detail).toEqual({
      name: 'rowClick',
      payload: { rowIndex: 0, row: { amount: 42 } },
    });

    const stopped: unknown[] = [];
    fireClick(cell, { stopPropagation: () => stopped.push(true) });
    expect(stopped).toHaveLength(1);
    expect(harness.events).toHaveLength(2);
    expect(harness.events[1]?.detail).toEqual({
      name: 'cellClick',
      payload: { rowIndex: 0, columnId: 'amount', value: 42 },
    });
  });

  it('keeps non-event elements silent even when interactive', () => {
    for (const ElementConstructor of [
      BaseScreenRectangleMaterialElement,
      BaseScreenEllipseMaterialElement,
      BaseScreenImageMaterialElement,
      BaseScreenContainerMaterialElement,
    ]) {
      const harness = mountElement(ElementConstructor, readyModel('探针', true));
      // 非交互物料不注册任何事件监听（含元素自身与渲染出的子树）。
      expect(harness.listeners.size).toBe(0);
      for (const node of harness.created) {
        expect(node.listeners.size).toBe(0);
      }
    }
  });
});
