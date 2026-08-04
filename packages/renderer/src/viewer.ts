import type {
  ScreenBlueprintRuntimePort,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from './renderer.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #blueprintRuntimePort: ScreenBlueprintRuntimePort | undefined;
  #document: ScreenDocument | undefined;
  #blueprintPlan: ScreenBlueprintPlan | undefined;
  #blueprintVariables: ScreenJsonObject | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #mount: HTMLDivElement | undefined;

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    this.#catalog = value;
    this.initialize();
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#document !== undefined && value !== this.#resourcePort) {
      this.emitDiagnostics('Resource port cannot change while a document is loaded.');
      return;
    }
    this.#resourcePort = value;
  }

  get blueprintRuntimePort(): ScreenBlueprintRuntimePort | undefined {
    return this.#blueprintRuntimePort;
  }

  set blueprintRuntimePort(value: ScreenBlueprintRuntimePort | undefined) {
    this.#blueprintRuntimePort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#document;
  }

  set document(value: ScreenDocument | undefined) {
    this.#document = value;
    if (value !== undefined) {
      this.#blueprintPlan = compileScreenBlueprint(value);
      this.#blueprintVariables = this.#blueprintPlan.initialVariables;
    } else {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
    }
    this.renderDocument();
  }

  connectedCallback(): void {
    this.initialize();
  }

  unload(): void {
    this.#renderer?.clear();
    this.#document = undefined;
  }

  private initialize(): void {
    if (!this.isConnected || this.#catalog === undefined || this.#renderer !== undefined) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#mount = this.ownerDocument.createElement('div');
    shadow.appendChild(this.#mount);
    this.#renderer = createBaseScreenRenderer({
      root: this.#mount,
      catalog: this.#catalog,
      mode: 'viewer',
      interactive: true,
      onMaterialEvent: (event) => {
        this.handleMaterialEvent(event);
        this.dispatchEvent(
          new CustomEvent('base-screen-material-event', {
            bubbles: true,
            composed: true,
            detail: event,
          }),
        );
      },
      resourcePort: this.#resourcePort,
    });
    this.renderDocument();
  }

  private renderDocument(): void {
    if (this.#renderer === undefined || this.#document === undefined) {
      return;
    }
    const result = this.#renderer.render(this.#document);
    if (!result.ok) {
      this.dispatchEvent(
        new CustomEvent('base-screen-diagnostic', {
          detail: { diagnostics: result.diagnostics },
        }),
      );
    }
  }

  private handleMaterialEvent(event: {
    readonly componentId: string;
    readonly name: string;
    readonly payload: ScreenJsonValue;
  }): void {
    if (this.#blueprintPlan === undefined || this.#blueprintVariables === undefined) {
      return;
    }
    const result = dispatchScreenBlueprintEvent(this.#blueprintPlan, this.#blueprintVariables, {
      componentId: event.componentId,
      name: event.name,
      payload: event.payload,
    });
    if (!result.ok) {
      this.emitDiagnostics('Blueprint event payload is invalid.');
      return;
    }
    this.#blueprintVariables = result.value.variables;
    for (const hostEvent of result.value.hostEvents) {
      if (this.#blueprintRuntimePort === undefined) {
        this.dispatchEvent(new CustomEvent('base-screen-blueprint-event', { detail: hostEvent }));
      } else {
        void this.#blueprintRuntimePort.emit(hostEvent);
      }
    }
  }

  private emitDiagnostics(message: string): void {
    this.dispatchEvent(
      new CustomEvent('base-screen-diagnostic', {
        detail: {
          diagnostics: [
            { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message },
          ],
        },
      }),
    );
  }
}
