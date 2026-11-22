import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  applyFieldDataset,
  createDescriptorControl,
  createDescriptorRangeControl,
} from '../../../../src/browser/dom/descriptor/designer-descriptor-control-dom.js';

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

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
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

describe('createDescriptorControl 四边距控件', () => {
  const spacingSchema = {
    kind: 'object',
    properties: {
      top: { kind: 'number', minimum: 0, maximum: 200 },
      right: { kind: 'number', minimum: 0, maximum: 200 },
      bottom: { kind: 'number', minimum: 0, maximum: 200 },
      left: { kind: 'number', minimum: 0, maximum: 200 },
    },
    required: ['top', 'right', 'bottom', 'left'],
  } as unknown as BaseScreenMaterialPropSchema;

  it('四个边共用一个对象值，隐藏 input 是唯一值载体', () => {
    const field: BaseScreenMaterialEditorField = {
      id: 'padding',
      target: 'props',
      path: ['padding'],
      label: '内边距',
      control: 'spacing',
      unit: 'px',
    };
    const handle = createDescriptorControl(
      ownerDocument,
      field,
      spacingSchema,
      { top: 32, right: 24, bottom: 24, left: 48 },
      [],
    );
    const scope = handle.element as unknown as FakeElement;
    expect(scope.className).toBe('designer-spacing-scope');
    const frame = scope.children[0]!;
    const shell = frame.children[0]!;
    const unit = scope.children[1]!;
    const carrier = scope.children[2]!;
    expect(frame.className).toBe('designer-spacing-frame');
    expect(shell.className).toBe('designer-spacing');
    expect(shell.dataset.spacingMode).toBe('split');
    expect(shell.children).toHaveLength(4);
    expect(shell.children.map((cell) => cell.children[1]!.value)).toEqual(['32', '24', '24', '48']);
    expect(unit.className).toBe('designer-spacing-unit');
    expect(unit.textContent).toBe('px');
    expect(carrier.type).toBe('hidden');
    expect(handle.valueTarget).toBe(carrier);
    expect(JSON.parse(carrier.value)).toEqual({ top: 32, right: 24, bottom: 24, left: 48 });
  });

  it('改一条边时夹到 schema 边界，并同步载体后派发 change', () => {
    const field: BaseScreenMaterialEditorField = {
      id: 'padding',
      target: 'props',
      path: ['padding'],
      label: '内边距',
      control: 'spacing',
    };
    const handle = createDescriptorControl(
      ownerDocument,
      field,
      spacingSchema,
      { top: 10, right: 11, bottom: 11, left: 12 },
      [],
    );
    const scope = handle.element as unknown as FakeElement;
    const top = scope.children[0]!.children[0]!.children[0]!.children[1]!;
    const carrier = handle.valueTarget as unknown as FakeElement;
    let changes = 0;
    carrier.addEventListener('change', () => {
      changes += 1;
    });

    top.value = '260';
    top.dispatchEvent({ type: 'change' } as Event);

    expect(top.value).toBe('200');
    expect(JSON.parse(carrier.value)).toEqual({ top: 200, right: 11, bottom: 11, left: 12 });
    expect(changes).toBe(1);
  });

  it('四边相等时收成一个输入，链图标处于联动态', () => {
    const field: BaseScreenMaterialEditorField = {
      id: 'padding',
      target: 'props',
      path: ['padding'],
      label: '内边距',
      control: 'spacing',
    };
    const handle = createDescriptorControl(
      ownerDocument,
      field,
      spacingSchema,
      { top: 32, right: 32, bottom: 32, left: 32 },
      [],
    );
    const scope = handle.element as unknown as FakeElement;
    const shell = scope.children[0]!.children[0]!;
    expect(shell.dataset.spacingMode).toBe('linked');
    expect(shell.children).toHaveLength(1);
    expect(shell.children[0]!.children[1]!.value).toBe('32');
    expect(handle.labelAction?.getAttribute('aria-pressed')).toBe('true');
  });

  it('链图标统一四边只写一次值，再点分开不写文档', () => {
    const field: BaseScreenMaterialEditorField = {
      id: 'padding',
      target: 'props',
      path: ['padding'],
      label: '内边距',
      control: 'spacing',
    };
    const handle = createDescriptorControl(
      ownerDocument,
      field,
      spacingSchema,
      { top: 32, right: 24, bottom: 24, left: 48 },
      [],
      'test:descriptor:padding-link',
    );
    const toggle = handle.labelAction as unknown as FakeElement;
    const carrier = handle.valueTarget as unknown as FakeElement;
    let changes = 0;
    carrier.addEventListener('change', () => {
      changes += 1;
    });

    toggle.dispatchEvent({ type: 'click' } as Event);

    const scope = handle.element as unknown as FakeElement;
    const shell = scope.children[0]!.children[0]!;
    expect(shell.dataset.spacingMode).toBe('linked');
    expect(JSON.parse(carrier.value)).toEqual({ top: 32, right: 32, bottom: 32, left: 32 });
    expect(changes).toBe(1);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    toggle.dispatchEvent({ type: 'click' } as Event);

    expect(shell.dataset.spacingMode).toBe('split');
    expect(shell.children).toHaveLength(4);
    expect(changes).toBe(1);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
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

describe('createDescriptorControl 与扁平面板同形的控件', () => {
  const boundedSchema = {
    kind: 'number',
    minimum: 1,
    maximum: 512,
  } as unknown as BaseScreenMaterialPropSchema;

  it('有界 number 渲染成滑杆 + 数字读数，读数是唯一值载体', () => {
    const handle = createDescriptorRangeControl(
      ownerDocument,
      numericField('number'),
      boundedSchema,
      24,
    );
    expect(handle).toBeDefined();
    const slider = handle!.element as unknown as FakeElement;
    const reading = handle!.trailing as unknown as FakeElement;
    expect(slider.type).toBe('range');
    expect(reading).toBe(handle!.valueTarget);
    expect(reading.className).toContain('designer-field-range-value');
    expect(reading.value).toBe('24');
  });

  it('可选数值未设置时读数留空，滑杆停在下限', () => {
    const handle = createDescriptorRangeControl(
      ownerDocument,
      numericField('number'),
      boundedSchema,
      undefined,
    );
    expect((handle!.valueTarget as unknown as FakeElement).value).toBe('');
    expect((handle!.element as unknown as FakeElement).value).toBe('1');
  });

  it('无界、超大跨度、带单位或非 number 控件都不改成滑杆', () => {
    const wide = { kind: 'number', minimum: 0, maximum: 120000 } as BaseScreenMaterialPropSchema;
    expect(
      createDescriptorRangeControl(ownerDocument, numericField('number'), wide, 1),
    ).toBeUndefined();
    expect(
      createDescriptorRangeControl(ownerDocument, numericField('number'), undefined, 1),
    ).toBeUndefined();
    expect(
      createDescriptorRangeControl(
        ownerDocument,
        numericField('unit-number', 'px'),
        boundedSchema,
        1,
      ),
    ).toBeUndefined();
  });

  it('声明为 select 的三档水平对齐也画成分段，选项带对齐图标', () => {
    const field: BaseScreenMaterialEditorField = {
      id: 'textAlign',
      target: 'style',
      path: ['textAlign'],
      label: '水平对齐',
      control: 'select',
    };
    const handle = createDescriptorControl(ownerDocument, field, alignSchema, 'center', []);
    const shell = handle.element as unknown as FakeElement;
    expect(shell.className).toBe('designer-descriptor-segmented');
    const track = shell.children[0]!;
    expect(track.children.map((button) => button.attributes['aria-label'])).toEqual([
      'left',
      'center',
      'right',
    ]);
  });

  it('顶层 props/style 字段同时挂 data-prop / data-style 钩子，嵌套路径不挂', () => {
    const top = new FakeElement();
    applyFieldDataset(top as unknown as HTMLElement, {
      id: 'fill',
      target: 'style',
      path: ['fill'],
      label: '填充',
      control: 'color',
    });
    expect(top.dataset.style).toBe('fill');
    expect(top.dataset.descriptorFieldId).toBe('fill');
    const nested = new FakeElement();
    applyFieldDataset(nested as unknown as HTMLElement, {
      id: 'titleText',
      target: 'props',
      path: ['title', 'text'],
      label: '标题',
      control: 'text',
    });
    expect(nested.dataset.prop).toBeUndefined();
  });
});
