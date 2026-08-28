import { describe, expect, it } from 'vitest';
import {
  appendDesignerFieldMessage,
  createDesignerButton,
  createDesignerCheckbox,
  createDesignerIconButton,
  createDesignerInput,
  createDesignerSelect,
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
      title: 'Save project',
      variant: 'primary',
    });

    expect(button.type).toBe('button');
    expect(button.className).toBe('designer-control designer-button project-save');
    expect(button.dataset.variant).toBe('primary');
    expect(button.textContent).toBe('Save');
    expect(button.title).toBe('Save project');
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
    expect(button.title).toBe('Open layers');
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
