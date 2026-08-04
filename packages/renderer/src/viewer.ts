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
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from './renderer.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #resourceTypes:
    | ReadonlyMap<string, { readonly configSchema: BaseScreenMaterialObjectSchema }>
    | undefined;
  #blueprintCapabilities: ReadonlySet<string> | undefined;
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

  set runtimeContributions(value:
    | {
        readonly resourceTypes: ReadonlyMap<
          string,
          { readonly configSchema: BaseScreenMaterialObjectSchema }
        >;
        readonly blueprintCapabilities: ReadonlySet<string>;
      }
    | undefined,) {
    this.#resourceTypes = value?.resourceTypes;
    this.#blueprintCapabilities = value?.blueprintCapabilities;
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#mount?.replaceChildren();
    this.compileBlueprint();
    this.initialize();
    this.renderDocument();
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
    this.compileBlueprint();
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
      ...(this.#resourceTypes === undefined ? {} : { resourceTypes: this.#resourceTypes }),
    });
    this.renderDocument();
  }

  private compileBlueprint(): void {
    if (this.#document === undefined) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      return;
    }
    const required = this.#document.blueprint.rules.flatMap(
      (rule) => rule.requiredCapabilities ?? [],
    );
    if (required.some((capability) => this.#blueprintCapabilities?.has(capability) !== true)) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.emitDiagnostics('Blueprint capability is unavailable.');
      return;
    }
    const compiled = compileScreenBlueprint(this.#document);
    if (!compiled.ok) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.dispatchEvent(
        new CustomEvent('base-screen-diagnostic', {
          detail: { diagnostics: compiled.diagnostics },
        }),
      );
      return;
    }
    this.#blueprintPlan = compiled.value;
    this.#blueprintVariables = compiled.value.initialVariables;
  }

  private renderDocument(): void {
    if (
      this.#renderer === undefined ||
      this.#document === undefined ||
      this.#blueprintPlan === undefined
    ) {
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
