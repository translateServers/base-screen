import { describe, expect, it } from 'vitest';
import {
  appendDesignerRangeField,
  createDesignerFieldElement,
  createDesignerFieldRow,
} from '../../../src/browser/dom/designer-field-primitives.js';

class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly dispatched: string[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  ariaLabel: string | null = null;
  className = '';
  max = '';
  min = '';
  placeholder = '';
  step = '';
  textContent = '';
  type = '';
  value = '';

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: () => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  dispatchEvent(event: { type: string }): boolean {
    this.dispatched.push(event.type);
    return true;
  }

  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

function ownerDocument(): Document {
  return new FakeDocument() as unknown as Document;
}

/** 原语返回的是 DOM 类型，运行时是 DOM 替身：测试里统一从这里取替身能力。 */
function fake(element: unknown): FakeElement {
  return element as FakeElement;
}

describe('designer field primitives', () => {
  it('builds the two-column field row with a label text span and control column', () => {
    const document = ownerDocument();
    const { field, control } = createDesignerFieldRow(document, {
      label: 'Font size',
      className: 'custom-field',
      controlClassName: 'custom-controls',
    });

    // `.designer-field` 的标签列必须是 span：文本节点无法参与网格布局。
    expect(field.className).toBe('designer-field designer-field-label custom-field');
    expect(field.children).toHaveLength(2);
    expect(field.children[0]?.className).toBe('designer-field-label-text');
    expect(field.children[0]?.textContent).toBe('Font size');
    // 控件列是字段行的第二个子节点，复合控件共享同一落点。
    expect(field.children[1]).toBe(control);
    expect(control.className).toBe('designer-field-control custom-controls');
  });

  it('supports stacked rows and span containers for long controls', () => {
    const document = ownerDocument();
    const { field } = createDesignerFieldRow(document, {
      label: 'Background',
      tagName: 'span',
      stacked: true,
    });

    // span 容器避免 label 点击激活内部的原生取色器。
    expect(field.tagName).toBe('span');
    expect(field.className).toBe('designer-field designer-field-label designer-field-stacked');
  });

  it('creates a label-only field for switch rows that bypass the control column', () => {
    const document = ownerDocument();
    const field = createDesignerFieldElement(document, { label: 'Auto fill' });

    expect(field.tagName).toBe('label');
    expect(field.className).toBe('designer-field designer-field-label');
    // 没有控件列：开关必须直接挂在字段行上才能命中 `:has(> .designer-switch)`。
    expect(field.children).toHaveLength(1);
    expect(field.children[0]?.className).toBe('designer-field-label-text');
  });

  it('wires the range and number readouts into one value carrier', () => {
    const document = ownerDocument();
    const control = document.createElement('span');
    const { range, number } = appendDesignerRangeField(control, {
      ariaLabel: 'Font size',
      empty: true,
      max: 100,
      min: 0,
      step: 1,
      value: '',
      rangeValue: '0',
    });

    expect(range.type).toBe('range');
    expect(range.className).toBe('designer-control designer-range');
    expect(range.dataset.empty).toBe('true');
    expect(number.type).toBe('number');
    expect(number.className).toBe('designer-control designer-input designer-number');
    expect(number.value).toBe('');
    expect(fake(control).children).toEqual([range, number]);

    // 拖动滑杆：数字读数实时跟随，空态标记在首次交互后清除。
    range.value = '42';
    fake(range).fire('input');
    expect(number.value).toBe('42');
    expect(fake(range).dataset.empty).toBeUndefined();

    // 数字输入反向同步滑杆位置。
    number.value = '17';
    fake(number).fire('input');
    expect(range.value).toBe('17');
  });

  it('forwards the range change to the number carrier only when asked to', () => {
    const document = ownerDocument();
    const forwarding = appendDesignerRangeField(document.createElement('span'), {
      ariaLabel: 'Font size',
      forwardRangeChange: true,
      max: 100,
      min: 0,
      step: 1,
      value: '10',
    });
    forwarding.range.value = '55';
    fake(forwarding.range).fire('change');
    // 样式字段靠这次转发进入统一事务管线。
    expect(forwarding.number.value).toBe('55');
    expect(fake(forwarding.number).dispatched).toEqual(['change']);

    const passive = appendDesignerRangeField(document.createElement('span'), {
      ariaLabel: 'Opacity',
      max: 100,
      min: 0,
      step: 1,
      value: '10',
    });
    passive.range.value = '20';
    fake(passive.range).fire('change');
    // 页面配置由面板监听滑杆自身的 change，不需要二次派发。
    expect(passive.number.value).toBe('20');
    expect(fake(passive.number).dispatched).toEqual([]);
  });

  it('wraps the number readout in a unit field when a symbol is given', () => {
    const document = ownerDocument();
    const control = document.createElement('span');
    const { number } = appendDesignerRangeField(control, {
      ariaLabel: 'Opacity',
      max: 100,
      min: 0,
      numberSymbol: '%',
      step: 1,
      value: '80',
    });

    const symbolField = fake(control).children[1];
    expect(symbolField?.tagName).toBe('label');
    expect(symbolField?.className).toBe('designer-geo-field');
    expect(symbolField?.dataset.symbol).toBe('%');
    expect(symbolField?.children).toEqual([number]);
  });
});
