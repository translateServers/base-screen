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
import { type ComponentType, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface CreateReactMaterialDefinitionOptions<Props extends object> {
  readonly manifest: BaseScreenMaterialManifest;
  readonly component: ComponentType<Props>;
  readonly mapModel?: (model: BaseScreenMaterialModel) => Props;
  readonly eventProps?: Readonly<Record<string, string>>;
}

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
      const props = {
        ...(options.mapModel === undefined
          ? (this.#model.props as Props)
          : options.mapModel(this.#model)),
        ...this.createEventProps(),
      } as Props;
      this.#root.render(createElement(options.component, props));
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
