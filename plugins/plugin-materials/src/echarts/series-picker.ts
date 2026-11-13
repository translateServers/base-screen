import type {
  BaseScreenPluginInspectorControlElement,
  BaseScreenPluginInspectorControlModel,
} from '@base-screen/plugin-core';

const SERIES_OPTIONS = [
  { value: 'line', label: '折线' },
  { value: 'area', label: '面积' },
  { value: 'bar', label: '柱状' },
  { value: 'pie', label: '环形' },
] as const;

type SeriesType = (typeof SERIES_OPTIONS)[number]['value'];

/**
 * 属性面板系列类型选择器：与内建控件同一契约——宿主写 model（绑定值），
 * 用户点击后写 value 并派发 change，宿主经既有 props 事务写回（撤销/批量语义继承）。
 */
export class PluginEchartsSeriesPickerElement
  extends HTMLElement
  implements BaseScreenPluginInspectorControlElement
{
  #model: BaseScreenPluginInspectorControlModel | undefined;
  #value: SeriesType | undefined;

  get model(): BaseScreenPluginInspectorControlModel {
    if (this.#model === undefined) {
      throw new Error('Inspector control model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenPluginInspectorControlModel) {
    this.#model = value;
    this.#value = normalizeSeriesType(value.value);
    this.#render();
  }

  get value(): string {
    return this.#value ?? 'line';
  }

  set value(next: string) {
    this.#value = normalizeSeriesType(next);
    this.#render();
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    const sheet = document.createElement('style');
    sheet.textContent = `
      :host { display: flex; flex-wrap: wrap; gap: 6px; }
      button {
        flex: 1 1 calc(50% - 6px); min-width: 56px; padding: 5px 8px; border-radius: 6px;
        cursor: pointer; border: 1px solid #334155; background: transparent; color: #cbd5f5;
        font: 12px/1.4 system-ui, sans-serif;
      }
      button[aria-pressed='true'] { border-color: #3b82f6; background: #1d4ed8; color: #f8fafc; }
    `;
    for (const option of SERIES_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.seriesType = option.value;
      button.textContent = option.label;
      button.setAttribute('aria-pressed', String(this.value === option.value));
      button.addEventListener('click', () => {
        if (this.value === option.value) return;
        this.value = option.value;
        for (const item of root.querySelectorAll('button')) {
          item.setAttribute(
            'aria-pressed',
            String((item as HTMLButtonElement).dataset.seriesType === this.value),
          );
        }
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      });
      root.append(button);
    }
    root.append(sheet);
  }
}

function normalizeSeriesType(value: unknown): SeriesType {
  return SERIES_OPTIONS.some((option) => option.value === value) ? (value as SeriesType) : 'line';
}
