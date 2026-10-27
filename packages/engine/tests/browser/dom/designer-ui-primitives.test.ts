import { describe, expect, it } from 'vitest';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerCheckbox,
  createDesignerControlShell,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSegmented,
  createDesignerSelect,
  createDesignerSwitch,
  createDesignerTabs,
  createDesignerTextarea,
} from '../../../src/browser/dom/designer-ui-primitives.js';

class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  ariaBusy: string | null = null;
  ariaLabel: string | null = null;
  ariaLive: string | null = null;
  ariaPressed: string | null = null;
  checked = false;
  className = '';
  disabled = false;
  htmlFor = '';
  id = '';
  innerHTML = '';
  max = '';
  min = '';
  placeholder = '';
  readOnly = false;
  selected = false;
  step = '';
  textContent = '';
  title = '';
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

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    this.children.push(...children);
  }

  addEventListener(_type: string, _listener: () => void): void {}

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

describe('private designer UI primitives', () => {
  it('creates semantic buttons with stable classes and state', () => {
    const button = createDesignerButton(ownerDocument(), {
      ariaLabel: 'Save project',
      busy: true,
      className: 'project-save',
      disabled: true,
      pressed: false,
      text: 'Save',
      tip: 'Save project',
      variant: 'primary',
    });

    expect(button.type).toBe('button');
    expect(button.className).toBe('designer-control designer-button project-save');
    expect(button.dataset.variant).toBe('primary');
    expect(button.textContent).toBe('Save');
    expect(button.getAttribute('data-tip')).toBe('Save project');
    expect(button.ariaLabel).toBe('Save project');
    expect(button.ariaPressed).toBe('false');
    expect(button.ariaBusy).toBe('true');
    expect(button.disabled).toBe(true);
  });

  it('creates accessible icon buttons without duplicating base classes', () => {
    const button = createDesignerIconButton(ownerDocument(), {
      className: 'designer-button layer-action',
      icon: 'layers',
      label: 'Open layers',
      variant: 'ghost',
    });

    expect(button.className).toBe(
      'designer-control designer-button designer-icon-button layer-action',
    );
    expect(button.getAttribute('data-tip')).toBe('Open layers');
    expect(button.ariaLabel).toBe('Open layers');
    expect(button.innerHTML).toContain('<svg');
    expect(button.innerHTML).toContain('aria-hidden="true"');
  });

  it('creates consistent inputs, checkboxes, selects, and textareas', () => {
    const document = ownerDocument();
    const number = createDesignerInput(document, {
      appearance: 'number',
      max: 10,
      min: 1,
      step: 0.5,
      value: '4',
    });
    const checkbox = createDesignerCheckbox(document, { checked: true, value: 'true' });
    const select = createDesignerSelect(document, {
      options: [
        { label: 'Automatic', selected: true, value: 'auto' },
        { label: 'Manual', value: 'manual' },
      ],
    });
    const textarea = createDesignerTextarea(document, { value: '{"ok":true}' });

    expect(number.type).toBe('number');
    expect(number.className).toBe('designer-control designer-input designer-number');
    expect([number.min, number.max, number.step, number.value]).toEqual(['1', '10', '0.5', '4']);
    expect(checkbox.type).toBe('checkbox');
    expect(checkbox.className).toBe('designer-checkbox');
    expect(checkbox.checked).toBe(true);
    expect(select.className).toBe('designer-control designer-select');
    expect(select.children).toHaveLength(2);
    expect((select.children[0] as HTMLOptionElement).selected).toBe(true);
    expect(textarea.className).toBe('designer-control designer-textarea');
    expect(textarea.value).toBe('{"ok":true}');
  });

  it('creates a switch on a native checkbox carrier for boolean fields', () => {
    const document = ownerDocument();
    const on = createDesignerSwitch(document, { ariaLabel: 'Show grid', checked: true });
    const off = createDesignerSwitch(document, { checked: false, value: 'false' });

    // 值载体仍是原生 checkbox，描述符读写链路零改动。
    expect(on.type).toBe('checkbox');
    expect(on.className).toBe('designer-switch');
    expect(on.checked).toBe(true);
    // 语义与引擎既有开关同一套：role=switch + aria-checked。
    expect(on.getAttribute('role')).toBe('switch');
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(on.ariaLabel).toBe('Show grid');
    expect(off.getAttribute('aria-checked')).toBe('false');
    expect(off.value).toBe('false');
  });

  it('builds pressed segmented groups with tooltip and dataset hooks', () => {
    const document = ownerDocument();
    const { element, buttons } = createDesignerSegmented(document, {
      ariaLabel: '水平对齐',
      className: 'align-group',
      selected: 'left',
      options: [
        {
          value: 'left',
          label: '左对齐',
          className: 'designer-control designer-button',
          dataset: { segmentedValue: 'left' },
          tip: '左对齐',
        },
        { value: 'center', label: '居中', dataset: { segmentedValue: 'center' } },
      ],
    });

    expect(element.tagName).toBe('span');
    expect(element.className).toBe('designer-segmented align-group');
    expect(element.getAttribute('role')).toBe('group');
    expect(element.getAttribute('aria-label')).toBe('水平对齐');
    expect(buttons.get('left')?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons.get('center')?.getAttribute('aria-pressed')).toBe('false');
    expect(buttons.get('left')?.dataset.segmentedValue).toBe('left');
    expect(buttons.get('left')?.getAttribute('data-tip')).toBe('左对齐');
    expect(buttons.get('left')?.className).toBe(
      'designer-segmented-option designer-control designer-button',
    );
  });

  it('refreshes segmented options and selection without losing the button map', () => {
    const document = ownerDocument();
    const handle = createDesignerSegmented(document, {
      ariaLabel: '数据来源',
      selected: 'inline',
      options: [
        { value: 'inline', label: '固定值' },
        { value: 'variable', label: '变量' },
      ],
    });

    handle.refresh({ selected: 'variable' });
    expect(handle.buttons.get('inline')?.getAttribute('aria-pressed')).toBe('false');
    expect(handle.buttons.get('variable')?.getAttribute('aria-pressed')).toBe('true');

    handle.refresh({
      options: [
        { value: 'inline', label: '固定值' },
        { value: 'source', label: '数据源' },
      ],
      selected: 'source',
    });
    expect(handle.buttons.size).toBe(2);
    expect(handle.buttons.get('variable')).toBeUndefined();
    expect(handle.buttons.get('source')?.getAttribute('aria-pressed')).toBe('true');
    expect(handle.buttons.get('source')?.textContent).toBe('数据源');
  });

  it('projects compact size through data-size on controls and segmented tracks', () => {
    const document = ownerDocument();
    const button = createDesignerButton(document, { size: 'compact', text: '应用' });
    const input = createDesignerInput(document, { size: 'compact' });
    const select = createDesignerSelect(document, { size: 'compact' });
    const segmented = createDesignerSegmented(document, {
      ariaLabel: '密度',
      options: [{ value: 'a', label: 'A' }],
      selected: 'a',
      size: 'compact',
    });
    const shell = createDesignerControlShell(document, { size: 'compact' });

    expect(button.dataset.size).toBe('compact');
    expect(input.dataset.size).toBe('compact');
    expect(select.dataset.size).toBe('compact');
    expect(segmented.element.dataset.size).toBe('compact');
    expect(shell.className).toBe('designer-control-shell');
    expect(shell.dataset.size).toBe('compact');
  });

  it('builds tablists with roving focus and refreshable items', () => {
    const document = ownerDocument();
    const handle = createDesignerTabs(document, {
      ariaLabel: '检查器分区',
      items: [
        { value: 'style', label: '样式' },
        { value: 'data', label: '数据' },
        { value: 'events', label: '事件', disabled: true },
      ],
      orientation: 'vertical',
      selected: 'data',
    });

    expect(handle.element.className).toBe('designer-tablist');
    expect(handle.element.getAttribute('role')).toBe('tablist');
    expect(handle.element.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.buttons.get('data')?.getAttribute('aria-selected')).toBe('true');
    expect(handle.buttons.get('data')?.tabIndex).toBe(0);
    expect(handle.buttons.get('style')?.tabIndex).toBe(-1);
    expect(handle.buttons.get('events')?.disabled).toBe(true);
    expect(handle.buttons.get('style')?.dataset.tabValue).toBe('style');

    handle.refresh({ selected: 'style' });
    expect(handle.buttons.get('data')?.getAttribute('aria-selected')).toBe('false');
    expect(handle.buttons.get('style')?.tabIndex).toBe(0);

    handle.refresh({ items: [{ value: 'style', label: '样式' }], selected: 'style' });
    expect(handle.buttons.size).toBe(1);
    expect(handle.buttons.get('data')).toBeUndefined();
  });

  it('builds radio segmented groups with one roving tab stop', () => {
    const document = ownerDocument();
    const { element, buttons } = createDesignerSegmented(document, {
      ariaLabel: '数据来源',
      selection: 'radio',
      selected: 'variable',
      options: [
        { value: 'inline', label: '固定值' },
        { value: 'variable', label: '变量' },
        { value: 'source', label: '数据源', disabled: true },
      ],
    });

    expect(element.getAttribute('role')).toBe('radiogroup');
    expect(buttons.get('inline')?.getAttribute('role')).toBe('radio');
    expect(buttons.get('variable')?.getAttribute('aria-checked')).toBe('true');
    expect(buttons.get('variable')?.tabIndex).toBe(0);
    expect(buttons.get('inline')?.tabIndex).toBe(-1);
    expect(buttons.get('source')?.disabled).toBe(true);
    expect(buttons.get('source')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('falls back to the first enabled radio option and supports icon-only options', () => {
    const document = ownerDocument();
    const { buttons } = createDesignerSegmented(document, {
      ariaLabel: '对齐',
      selection: 'radio',
      selected: 'missing',
      options: [
        { value: 'first', label: '第一' },
        { value: 'icon', label: '居中', ariaLabel: '居中', icon: 'align-center' },
      ],
    });

    expect(buttons.get('first')?.tabIndex).toBe(0);
    expect(buttons.get('icon')?.tabIndex).toBe(-1);
    expect(buttons.get('icon')?.innerHTML).toContain('<svg');
    expect(buttons.get('icon')?.getAttribute('aria-label')).toBe('居中');
  });

  it('connects fields, controls, and live validation messages', () => {
    const document = ownerDocument();
    const label = document.createElement('label');
    const input = createDesignerInput(document);
    const message = appendDesignerFieldMessage(label, input, 'component-name');

    expect(input.id).toBe('designer-field-component-name');
    expect(input.getAttribute('aria-describedby')).toBe('designer-field-component-name-message');
    expect((label as HTMLLabelElement).htmlFor).toBe(input.id);
    expect(message.id).toBe('designer-field-component-name-message');
    expect(message.dataset.fieldMessage).toBe('true');
    expect(message.ariaLive).toBe('polite');
  });
});
