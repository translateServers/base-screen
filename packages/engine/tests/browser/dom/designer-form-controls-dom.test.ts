import { describe, expect, it } from 'vitest';
import { adoptDesignerFormControls } from '../../../src/browser/dom/designer-form-controls-dom.js';

class FakeControl {
  readonly attributes: Record<string, string> = {};
  readonly listeners = new Map<string, (() => void)[]>();
  checked = false;
  className = '';
  type = '';

  constructor(readonly tagName: string) {}

  addEventListener(type: string, listener: () => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  closest(): null {
    return null;
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

function adopt(controls: FakeControl[]): void {
  const root = {
    querySelectorAll: () => controls,
  } as unknown as ParentNode;
  adoptDesignerFormControls(root);
}

describe('adoptDesignerFormControls', () => {
  it('normalizes switches in place and keeps their change pipeline', () => {
    const input = new FakeControl('input');
    input.type = 'text';
    input.className = 'designer-switch';
    input.checked = true;
    adopt([input]);

    expect(input.type).toBe('checkbox');
    expect(input.className).toBe('designer-switch');
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.getAttribute('aria-checked')).toBe('true');

    input.checked = false;
    input.fire('change');
    expect(input.getAttribute('aria-checked')).toBe('false');
    // 原地归一：模板渲染后挂上的监听不会因替换节点丢失。
    expect(input.listeners.get('change')).toHaveLength(1);
  });

  it('normalizes checkboxes in place without adding switch semantics', () => {
    const input = new FakeControl('input');
    input.type = 'text';
    input.className = 'designer-checkbox';
    adopt([input]);

    expect(input.type).toBe('checkbox');
    expect(input.getAttribute('role')).toBeNull();
    expect(input.getAttribute('aria-checked')).toBe('false');
  });

  it('adds the shared control base to template buttons and forces type=button', () => {
    const button = new FakeControl('button');
    button.type = 'submit';
    button.className = 'designer-button custom-action';
    adopt([button]);

    expect(button.className).toBe('designer-button custom-action designer-control');
    expect(button.type).toBe('button');
  });
});
