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
        this.#app = createApp({
          render: () => {
            const model = this.#modelRef?.value;
            if (model === undefined) {
              return null;
            }
            const props = {
              ...(options.mapModel === undefined
                ? (model.props as Props)
                : options.mapModel(model)),
              ...this.createEventProps(),
            } as Props;
            return h(options.component, props);
          },
        });
        this.#app.mount(this);
      }
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

function parseEventPayload(value: unknown): ScreenJsonValue | undefined {
  const parsed = parseScreenJsonValue(value, { maxBytes: 64 * 1024 });
  return parsed.ok ? parsed.value : undefined;
}
