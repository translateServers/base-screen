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
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from './renderer.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #contributionIndex: BaseScreenRuntimeContributionIndex | undefined;
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
    if (this.#renderer !== undefined && value !== this.#catalog) {
      this.emitDiagnostics('Catalog cannot change after initialization. Call unload first.');
      return;
    }
    this.#catalog = value;
    this.initialize();
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    this.#contributionIndex = value;
    this.disposeRenderer();
    this.compileBlueprint();
    this.initialize();
    this.renderDocument();
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#resourcePort) {
      this.emitDiagnostics('Resource port cannot change after initialization. Call unload first.');
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
    this.initialize();
    this.renderDocument();
  }

  connectedCallback(): void {
    this.initialize();
  }

  unload(): void {
    this.disposeRenderer();
    this.#document = undefined;
    this.compileBlueprint();
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
      ...(this.#contributionIndex === undefined
        ? {}
        : { contributionIndex: this.#contributionIndex }),
    });
    this.renderDocument();
  }

  private disposeRenderer(): void {
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.#mount?.remove();
    this.#mount = undefined;
  }

  private compileBlueprint(): void {
    if (this.#document === undefined) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      return;
    }
    const compiled = compileScreenBlueprint(
      this.#document,
      this.#contributionIndex ?? { hasBlueprintCapability: () => false },
    );
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
        void Promise.resolve(this.#blueprintRuntimePort.emit(hostEvent)).catch(() => {
          this.emitDiagnostics('Blueprint host event failed.');
        });
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
