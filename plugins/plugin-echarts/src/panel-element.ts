import {
  BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT,
  type BaseScreenPluginDesignSnapshot,
  type BaseScreenPluginPanelElement,
} from '@base-screen/plugin-core';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from './manifest.js';
import { PLUGIN_ECHARTS_PANEL_ID, PLUGIN_ECHARTS_TOGGLE_COMMAND_ID } from './plugin.js';

/**
 * 左栏图表概览面板：宿主写 model（设计快照），元素自渲染聚焦图表的系列类型，
 * 按钮经 base-screen-plugin-panel-action 回调本插件的贡献命令——panelId 与命令
 * 归属由 Engine 校验。不注入 render function、不依赖 Engine 私有 DOM。
 */
export class PluginEchartsPanelElement extends HTMLElement implements BaseScreenPluginPanelElement {
  #model: BaseScreenPluginDesignSnapshot | undefined;

  static get observedAttributes(): readonly string[] {
    return [];
  }

  get model(): BaseScreenPluginDesignSnapshot {
    if (this.#model === undefined) {
      throw new Error('Panel model has not been set.');
    }
    return this.#model;
  }

  set model(value: BaseScreenPluginDesignSnapshot) {
    this.#model = value;
    this.#render();
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const model = this.#model;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const focused = model?.document.components.find(
      (component) => component.id === model.focusedComponentId,
    );
    const isChart = focused?.type === PLUGIN_ECHARTS_MATERIAL_MANIFEST.type;
    const seriesType = isChart
      ? String((focused.props as { seriesType?: unknown }).seriesType ?? 'line')
      : undefined;
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; padding: 12px; font: 12px/1.6 system-ui, sans-serif; color: #cbd5f5; }
      h3 { margin: 0 0 8px; font-size: 12px; color: #f8fafc; }
      p { margin: 0 0 10px; }
      button {
        width: 100%; padding: 6px 10px; border: 1px solid #3b82f6; border-radius: 6px;
        background: #1d4ed8; color: #f8fafc; cursor: pointer;
      }
      button:disabled { opacity: 0.5; cursor: default; }
    `;
    const heading = document.createElement('h3');
    heading.textContent = '图表概览';
    const summary = document.createElement('p');
    if (!isChart) {
      summary.textContent = '选中一个 ECharts 图表组件后可查看与切换其系列类型。';
    } else {
      summary.textContent = `当前系列类型：${seriesType === 'bar' ? '柱状' : '折线'}。`;
    }
    const button = document.createElement('button');
    button.textContent = '切换折线/柱状';
    button.disabled = !isChart;
    button.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent(BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT, {
          bubbles: true,
          composed: true,
          detail: {
            panelId: PLUGIN_ECHARTS_PANEL_ID,
            commandId: PLUGIN_ECHARTS_TOGGLE_COMMAND_ID,
            args: null,
          },
        }),
      );
    });
    root.append(style, heading, summary, button);
  }
}
