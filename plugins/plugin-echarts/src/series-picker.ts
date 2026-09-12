import type {
  BaseScreenPluginInspectorControlElement,
  BaseScreenPluginInspectorControlModel,
} from '@base-screen/plugin-core';

/**
 * 属性面板系列类型选择器：与内建控件同一契约——宿主写 model（绑定值），
 * 用户点击后写 value 并派发 change，宿主经既有 props 事务写回（撤销/批量语义继承）。
 */
export class PluginEchartsSeriesPickerElement
  extends HTMLElement
  implements BaseScreenPluginInspectorControlElement
{
  #model: BaseScreenPluginInspectorControlModel | undefined;
  #value: string | undefined;

  get model(): BaseScreenPluginInspectorControlModel {
    if (this.#model === undefined) {
      throw new Error('Inspector control model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenPluginInspectorControlModel) {
    this.#model = value;
    this.#value = value.value === 'bar' ? 'bar' : 'line';
    this.#render();
  }

  get value(): string {
    return this.#value ?? 'line';
  }

  set value(next: string) {
    this.#value = next === 'bar' ? 'bar' : 'line';
    this.#render();
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = `
      :host { display: flex; gap: 6px; }
      button {
        flex: 1; padding: 5px 8px; border-radius: 6px; cursor: pointer;
        border: 1px solid #334155; background: transparent; color: #cbd5f5;
        font: 12px/1.4 system-ui, sans-serif;
      }
      button[aria-pressed='true'] { border-color: #3b82f6; background: #1d4ed8; color: #f8fafc; }
    `;
    for (const option of ['line', 'bar'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option === 'line' ? '折线' : '柱状';
      button.setAttribute('aria-pressed', String(this.value === option));
      button.addEventListener('click', () => {
        if (this.value === option) return;
        this.value = option;
        for (const item of root.querySelectorAll('button')) {
          item.setAttribute(
            'aria-pressed',
            String(item.textContent === '柱状' ? this.value === 'bar' : this.value === 'line'),
          );
        }
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
      root.append(button);
    }
  }
}
