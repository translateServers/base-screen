import {
  parseScreenJsonValue,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { type App, type Component, createApp, h, type ShallowRef, shallowRef } from 'vue';
import {
  collectGlobalRules,
  type ReadableStyleRule,
  type ReadableStyleSheet,
} from './global-styles.js';

export * from './components.js';

export interface CreateVueMaterialDefinitionOptions<Props extends object> {
  readonly manifest: BaseScreenMaterialManifest;
  readonly component: Component;
  readonly mapModel?: (model: BaseScreenMaterialModel) => Props;
  readonly eventProps?: Readonly<Record<string, string>>;
}

// 原生 CSS 交互门控（ADR-0036）：与 React 桥接一致，非交互模式下桥接渲染的原生控件
// （button 等）不接收指针事件，hover/active/focus 原生样式静默；指针事件落到物料元素自身，
// 设计器的选择/拖拽命中测试不受影响。规则按属性作用域匹配、按 shadow root（或 document）幂等注入。
const BRIDGE_INTERACTIVE_STYLE_KEY = 'base-screen-bridge-interactive-styles';
const BRIDGE_INTERACTIVE_STYLE_TEXT =
  '[data-base-screen-interactive="false"] * { pointer-events: none; }';

export function createVueMaterialDefinition<Props extends object>(
  options: CreateVueMaterialDefinitionOptions<Props>,
): ScreenParseResult<BaseScreenMaterialCatalogEntry> {
  const ElementBase =
    (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
    (class {} as unknown as typeof HTMLElement);
  const eventProps = options.eventProps ?? {};

  class VueMaterialElement extends ElementBase {
    static readonly manifest = options.manifest;

    #model: BaseScreenMaterialModel | undefined;
    #modelRef: ShallowRef<BaseScreenMaterialModel | undefined> | undefined;
    #app: App | undefined;
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
      if (this.#modelRef !== undefined) {
        this.#modelRef.value = value;
      }
    }

    connectedCallback(): void {
      this.#disconnectScheduled = false;
      if (this.#app === undefined) {
        this.#modelRef = shallowRef(this.#model);
        // 组件库（如 vue-echarts）和宿主项目样式依赖注入到 document 的全局样式，
        // 但物料被挂载在宿主页的 shadow root 内，全局样式无法穿透。桥接层在挂载
        // 组件之前把文档中的全部可读全局规则传播进宿主 shadow root，使组件库
        // 首次初始化就能拿到正确尺寸，嵌套组件树（含 scoped 样式）也能正常布局。
        this.#propagateGlobalStyles();
        this.#ensureInteractiveStyleSheet();
        this.#mountApp();
      }
    }

    #ensureInteractiveStyleSheet(): void {
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

    #mountApp(): void {
      this.#app = createApp({
        render: () => {
          const model = this.#modelRef?.value;
          if (model === undefined) {
            return null;
          }
          const props = {
            ...(options.mapModel === undefined ? (model.props as Props) : options.mapModel(model)),
            ...this.createEventProps(),
          } as Props;
          return h(options.component, props);
        },
      });
      this.#app.mount(this);
    }

    disconnectedCallback(): void {
      if (this.#disconnectScheduled) {
        return;
      }
      this.#disconnectScheduled = true;
      queueMicrotask(() => {
        this.#disconnectScheduled = false;
        if (!this.isConnected && this.#app !== undefined) {
          this.#app.unmount();
          this.#app = undefined;
          this.#modelRef = undefined;
        }
      });
    }

    #propagateGlobalStyles(): void {
      const root = this.getRootNode();
      if (!(root instanceof ShadowRoot)) {
        return;
      }
      // 宿主 shadow root 只注入一次（同一 designer/viewer 内的多个物料共享同一 shadow root）。
      const key = 'base-screen-global-styles';
      if (root.querySelector(`style[data-bridge-style-key="${key}"]`) !== null) {
        return;
      }
      const rules = collectGlobalRules(readDocumentStyleSheets(this.ownerDocument));
      if (rules.length === 0) {
        return;
      }
      const style = this.ownerDocument.createElement('style');
      style.dataset.bridgeStyleKey = key;
      style.textContent = rules.join('\n');
      root.appendChild(style);
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
    element: VueMaterialElement as BaseScreenMaterialConstructor,
  });
  return definition.ok
    ? {
        ok: true,
        value: { manifest: definition.value.manifest, constructor: definition.value.element },
        diagnostics: [],
      }
    : definition;
}

function readDocumentStyleSheets(document: Document): readonly ReadableStyleSheet[] {
  const sheets: ReadableStyleSheet[] = [];
  for (const sheet of document.styleSheets) {
    try {
      sheets.push({ cssRules: [...sheet.cssRules] as ReadableStyleRule[] });
    } catch {
      // 跨域样式表不可读，跳过。
    }
  }
  const adopted = document.adoptedStyleSheets;
  if (adopted !== undefined) {
    for (const sheet of adopted) {
      try {
        sheets.push({ cssRules: [...sheet.cssRules] as ReadableStyleRule[] });
      } catch {
        // 跨域样式表不可读，跳过。
      }
    }
  }
  return sheets;
}

function parseEventPayload(value: unknown): ScreenJsonValue | undefined {
  const parsed = parseScreenJsonValue(value, { maxBytes: 64 * 1024 });
  return parsed.ok ? parsed.value : undefined;
}
