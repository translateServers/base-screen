import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createDescriptorControl } from '../../../../src/browser/dom/descriptor/designer-descriptor-control-dom.js';

// 假 DOM：只覆盖数值/分段控件用到的节点 API，不引入 jsdom（与同仓其他 DOM 测试同款）。
class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, ((event: Event) => void)[]>();
  className = '';
  textContent = '';
  type = '';
  value = '';
  min = '';
  max = '';
  step = '';
  ariaLabel = '';
  tabIndex = 0;
  selected = false;
  disabled = false;
  parent: FakeElement | undefined;

  get ariaChecked(): string {
    return this.attributes['aria-checked'] ?? '';
  }

  set ariaChecked(value: string) {
    this.attributes['aria-checked'] = value;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  appendChild(node: FakeElement): FakeElement {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

const ownerDocument = {
  createElement: () => new FakeElement(),
} as unknown as Document;

function numericField(
  control: 'number' | 'unit-number',
  unit?: string,
): BaseScreenMaterialEditorField {
  return {
    id: 'lineWidth',
    target: 'props',
    path: ['lineWidth'],
    label: '线宽',
    control,
    ...(unit === undefined ? {} : { unit }),
  };
}

function segmentedField(): BaseScreenMaterialEditorField {
  return { id: 'align', target: 'props', path: ['align'], label: '对齐', control: 'segmented' };
}

const alignSchema = {
  kind: 'enum',
  values: ['left', 'center', 'right'],
} as unknown as BaseScreenMaterialPropSchema;

function render(field: BaseScreenMaterialEditorField, schema?: BaseScreenMaterialPropSchema) {
  const handle = createDescriptorControl(ownerDocument, field, schema, 12, []);
  return { handle, element: handle.element as unknown as FakeElement };
}

describe('createDescriptorControl 数值控件', () => {
  it('unit-number 把单位渲染成后缀，input 仍是唯一值载体', () => {
    const { handle, element } = render(numericField('unit-number', 'px'));
    expect(element).not.toBe(handle.valueTarget);
    expect(element.className).toBe('designer-unit-input');
    expect(element.children[0]).toBe(handle.valueTarget);
    const suffix = element.children[1]!;
    expect(suffix.className).toBe('designer-unit-input-suffix');
    expect(suffix.textContent).toBe('px');
    expect(suffix.attributes['aria-hidden']).toBe('true');
    expect(handle.valueTarget.type).toBe('number');
    expect(handle.valueTarget.value).toBe('12');
  });

  it('number 不加外壳，元素与值载体同一个', () => {
    const { handle, element } = render(numericField('number'));
    expect(element).toBe(handle.valueTarget);
    expect(element.className).not.toContain('designer-unit-input');
  });

  it('unit-number 未声明单位时退化为普通数值输入', () => {
    const { handle, element } = render(numericField('unit-number'));
    expect(element).toBe(handle.valueTarget);
  });
});

describe('createDescriptorControl 分段控件', () => {
  it('渲染 radio 分段，隐藏 select 仍是唯一值载体', () => {
    const handle = createDescriptorControl(
      ownerDocument,
      segmentedField(),
      alignSchema,
      'center',
      [],
    );
    const shell = handle.element as unknown as FakeElement;
    expect(shell.className).toBe('designer-descriptor-segmented');
    const track = shell.children[0]!;
    expect(track.attributes.role).toBe('radiogroup');
    const select = shell.children[1]!;
    expect(handle.valueTarget).toBe(select);
    expect(select.className).toContain('designer-segmented-native');
    expect(select.value).toBe('center');
    expect(track.children.map((button) => button.attributes['aria-checked'])).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(track.children.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('点击按钮改 select 值、移动选中态并派发一次 change', () => {
    const handle = createDescriptorControl(
      ownerDocument,
      segmentedField(),
      alignSchema,
      'left',
      [],
    );
    const select = handle.valueTarget as unknown as FakeElement;
    let changes = 0;
    select.addEventListener('change', () => {
      changes += 1;
    });
    const track = (handle.element as unknown as FakeElement).children[0]!;
    track.children[2]!.dispatchEvent(new Event('click'));
    expect(select.value).toBe('right');
    expect(changes).toBe(1);
    expect(track.children.map((button) => button.attributes['aria-checked'])).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(track.children.map((button) => button.tabIndex)).toEqual([-1, -1, 0]);
    track.children[2]!.dispatchEvent(new Event('click'));
    expect(changes).toBe(1);
  });

  it('值不在枚举内时落到首项', () => {
    const handle = createDescriptorControl(
      ownerDocument,
      segmentedField(),
      alignSchema,
      'nope',
      [],
    );
    expect((handle.valueTarget as unknown as FakeElement).value).toBe('left');
  });
});
