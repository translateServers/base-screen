import {
  parseScreenJsonValue,
  type ScreenJsonValue,
  type ScreenParseResult,
} from 'base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from 'base-screen/plugin-core';
import { createMaterialDefinition } from 'base-screen/plugin-sdk';
import { type ComponentType, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export * from './components.js';

export interface CreateReactMaterialDefinitionOptions<Props extends object> {
  readonly manifest: BaseScreenMaterialManifest;
  readonly component: ComponentType<Props>;
  readonly mapModel?: (model: BaseScreenMaterialModel) => Props;
  readonly eventProps?: Readonly<Record<string, string>>;
  /** 每次渲染时包装物料根节点；Provider 和宿主 Store 由调用方持有。 */
  readonly wrapRoot?: (node: ReactNode, model: BaseScreenMaterialModel) => ReactNode;
}

// 原生 CSS 交互门控（ADR-0036）：非交互模式下桥接渲染的原生控件（button 等）不再接收
// 指针事件，hover/active/focus 原生样式静默；指针事件落到物料元素自身，设计器的选择/拖拽
// 命中测试不受影响。规则注入到所在 shadow root（或 light DOM 的 document head），按属性
// 作用域匹配、幂等注入。
const BRIDGE_INTERACTIVE_STYLE_KEY = 'base-screen-bridge-interactive-styles';
const BRIDGE_INTERACTIVE_STYLE_TEXT =
  '[data-base-screen-interactive="false"] * { pointer-events: none; }';

export function createReactMaterialDefinition<Props extends object>(
  options: CreateReactMaterialDefinitionOptions<Props>,
): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const ElementBase =
    (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
    (class {} as unknown as typeof HTMLElement);
  const eventProps = options.eventProps ?? {};

  class ReactMaterialElement extends ElementBase {
    static readonly manifest = options.manifest;

    #model: BaseScreenMaterialModel | undefined;
    #root: Root | undefined;
    #disconnectScheduled = false;

    get model(): BaseScreenMaterialModel {
      if (this.#model === undefined) {
        throw new Error('Material model has not been set.');
      }
      return this.#model;
    }

    set model(value: BaseScreenMaterialModel) {
      this.#model = value;
      this.dataset.baseScreenInteractive = String(value.interactive);
      this.render();
    }

    connectedCallback(): void {
      this.#disconnectScheduled = false;
      if (this.#root === undefined) {
        this.#root = createRoot(this);
      }
      this.render();
    }

    disconnectedCallback(): void {
      if (this.#disconnectScheduled) {
        return;
      }
      this.#disconnectScheduled = true;
      queueMicrotask(() => {
        this.#disconnectScheduled = false;
        if (!this.isConnected && this.#root !== undefined) {
          this.#root.unmount();
          this.#root = undefined;
        }
      });
    }

    private render(): void {
      if (this.#root === undefined || this.#model === undefined) {
        return;
      }
      this.ensureInteractiveStyleSheet();
      const props = {
        ...(options.mapModel === undefined
          ? (this.#model.props as Props)
          : options.mapModel(this.#model)),
        ...this.createEventProps(),
      } as Props;
      const node = createElement(options.component, props);
      this.#root.render(
        options.wrapRoot === undefined ? node : options.wrapRoot(node, this.#model),
      );
    }

    private ensureInteractiveStyleSheet(): void {
      const root = this.getRootNode();
      if (root instanceof ShadowRoot) {
        if (
          root.querySelector(`style[data-bridge-style-key="${BRIDGE_INTERACTIVE_STYLE_KEY}"]`) !==
          null
        ) {
          return;
        }
        const style = this.ownerDocument.createElement('style');
        style.dataset.bridgeStyleKey = BRIDGE_INTERACTIVE_STYLE_KEY;
        style.textContent = BRIDGE_INTERACTIVE_STYLE_TEXT;
        root.appendChild(style);
        return;
      }
      if (root instanceof Document && root.getElementById(BRIDGE_INTERACTIVE_STYLE_KEY) === null) {
        const style = this.ownerDocument.createElement('style');
        style.id = BRIDGE_INTERACTIVE_STYLE_KEY;
        style.textContent = BRIDGE_INTERACTIVE_STYLE_TEXT;
        root.head.appendChild(style);
      }
    }

    private createEventProps(): Record<string, (payload: unknown) => void> {
      const bindings: Record<string, (payload: unknown) => void> = {};
      for (const [eventName, propName] of Object.entries(eventProps)) {
        bindings[propName] = (payload: unknown) => this.dispatchMaterialEvent(eventName, payload);
      }
      return bindings;
    }

    private dispatchMaterialEvent(name: string, payload: unknown): void {
      if (this.#model?.interactive !== true || !options.manifest.events.includes(name)) {
        return;
      }
      const parsed = parseEventPayload(payload);
      if (parsed === undefined) {
        return;
      }
      this.dispatchEvent(
        new CustomEvent('base-screen-material-event', {
          bubbles: true,
          composed: true,
          detail: { name, payload: parsed },
        }),
      );
    }
  }

  const definition = createMaterialDefinition({
    manifest: options.manifest,
    element: ReactMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok
    ? {
        ok: true,
        value: { manifest: definition.value.manifest, constructor: definition.value.element },
        diagnostics: [],
      }
    : definition;
}

function parseEventPayload(value: unknown): ScreenJsonValue | undefined {
  const parsed = parseScreenJsonValue(value, { maxBytes: 64 * 1024 });
  return parsed.ok ? parsed.value : undefined;
}
