import type {
  BaseScreenPluginDesignSnapshot,
  BaseScreenPluginPanelElement,
} from '../../../packages/plugin-core/src/index.ts';
import { BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT } from '../../../packages/plugin-core/src/index.ts';

/**
 * 插件面板最小样例：只接收宿主写入的 JSON-safe model，只经 action 事件回传意图，
 * 不接触 Engine 私有 DOM、Store 或服务对象。modelWrites 让验证脚本能断言文档变更确实
 * 回流到了面板，而不只是面板写过一次就静止。
 */
export class HarnessPluginPanelElement extends HTMLElement implements BaseScreenPluginPanelElement {
  #model: BaseScreenPluginDesignSnapshot | undefined;
  #writes = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  set model(value: BaseScreenPluginDesignSnapshot | undefined) {
    this.#model = value;
    this.#writes += 1;
    this.#render();
  }

  get model(): BaseScreenPluginDesignSnapshot | undefined {
    return this.#model;
  }

  get modelWrites(): number {
    return this.#writes;
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const shadow = this.shadowRoot;
    if (shadow === null) return;
    // 骨架是编译期字面量；所有来自文档的值一律走 textContent，避免把文档内容当 markup 解析。
    shadow.innerHTML = `
      <style>
        :host { display: block; padding: 12px; color: #e5eefb; font: 12px/1.6 system-ui, sans-serif; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        button { margin-top: 10px; padding: 6px 10px; background: #1f6f4a; color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
      </style>
      <p class="row"><span>Components</span><strong data-panel-components></strong></p>
      <p class="row"><span>Selected</span><strong data-panel-selection></strong></p>
      <p class="row"><span>Model writes</span><strong data-panel-writes></strong></p>
      <button type="button" data-panel-action="nudge">Nudge selected by 20</button>
    `;
    const selection = this.#model?.selectedComponentIds ?? [];
    this.#setText(
      shadow,
      '[data-panel-components]',
      String(this.#model?.document.components.length ?? 0),
    );
    this.#setText(shadow, '[data-panel-selection]', selection.join(', ') || 'none');
    this.#setText(shadow, '[data-panel-writes]', String(this.#writes));
    shadow
      .querySelector<HTMLButtonElement>('[data-panel-action="nudge"]')
      ?.addEventListener('click', () => {
        // step 20 与 chrome 触发用的默认 40 不同，因此位移量本身即证明 args 走到了 handler。
        this.#dispatch('harness.nudge-selection', { step: 20 });
      });
  }

  #setText(root: ShadowRoot, selector: string, value: string): void {
    const node = root.querySelector<HTMLElement>(selector);
    if (node !== null) node.textContent = value;
  }

  #dispatch(commandId: string, args: Record<string, unknown>): void {
    this.dispatchEvent(
      new CustomEvent(BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          // 归属 id 由 Engine 写在 dataset 上；面板不自行宣称身份。
          panelId: this.dataset.pluginPanel ?? '',
          commandId,
          args,
        },
      }),
    );
  }
}

export const HARNESS_PLUGIN_PANEL_TAG_NAME = 'harness-plugin-panel';

export function defineHarnessPluginPanel(): void {
  if (customElements.get(HARNESS_PLUGIN_PANEL_TAG_NAME) === undefined) {
    customElements.define(HARNESS_PLUGIN_PANEL_TAG_NAME, HarnessPluginPanelElement);
  }
}
