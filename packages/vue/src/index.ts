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

export interface CreateVueMaterialDefinitionOptions<Props extends object> {
  readonly manifest: BaseScreenMaterialManifest;
  readonly component: Component;
  readonly mapModel?: (model: BaseScreenMaterialModel) => Props;
  readonly eventProps?: Readonly<Record<string, string>>;
}

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
        this.#mountApp();
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
