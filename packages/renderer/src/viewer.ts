import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintRuntimePort,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { parseScreenJsonValue, type ScreenDiagnostic } from '@base-screen/contracts';
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
const HOST_VARIABLE_TIMEOUT_MS = 15_000;

export class BaseScreenViewerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #variablePort: ScreenHostVariablePort | undefined;
  #contributionIndex: BaseScreenRuntimeContributionIndex | undefined;
  #blueprintRuntimePort: ScreenBlueprintRuntimePort | undefined;
  #blueprintHostActionPort: ScreenBlueprintHostActionPort | undefined;
  #document: ScreenDocument | undefined;
  #blueprintPlan: ScreenBlueprintPlan | undefined;
  #blueprintVariables: ScreenJsonObject | undefined;
  #resourceTimeoutMs = 15_000;
  #renderer: BaseScreenRenderer | undefined;
  #mount: HTMLDivElement | undefined;
  #variableController: AbortController | undefined;
  #variableGeneration = 0;
  #variableRefresh: Promise<boolean> | undefined;
  #pendingRefreshAll = false;
  readonly #pendingRefreshComponents = new Set<string>();

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#renderer !== undefined && value !== this.#catalog) {
      this.emitLifecycleDiagnostic(
        'Catalog cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#catalog = value;
    this.initialize();
    this.startVariableRender();
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  get variablePort(): ScreenHostVariablePort | undefined {
    return this.#variablePort;
  }

  get resourceTimeoutMs(): number {
    return this.#resourceTimeoutMs;
  }

  set resourceTimeoutMs(value: number) {
    if (this.#renderer !== undefined && value !== this.#resourceTimeoutMs) {
      this.emitLifecycleDiagnostic(
        'Resource timeout cannot change after initialization. Call unload first.',
      );
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      this.emitLifecycleDiagnostic('Resource timeout must be a positive finite number.');
      return;
    }
    this.#resourceTimeoutMs = value;
  }

  set variablePort(value: ScreenHostVariablePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#variablePort) {
      this.emitLifecycleDiagnostic(
        'Variable port cannot change after initialization. Call unload first.',
      );
      return;
    }
    this.#variablePort = value;
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    if (value === this.#contributionIndex) return;
    this.#contributionIndex = value;
    this.cancelVariableResolution();
    this.disposeRenderer();
    this.compileBlueprint();
    this.initialize();
    this.startVariableRender(undefined, false, true);
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#resourcePort) {
      this.emitLifecycleDiagnostic(
        'Resource port cannot change after initialization. Call unload first.',
      );
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

  get blueprintHostActionPort(): ScreenBlueprintHostActionPort | undefined {
    return this.#blueprintHostActionPort;
  }

  set blueprintHostActionPort(value: ScreenBlueprintHostActionPort | undefined) {
    this.#blueprintHostActionPort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#document;
  }

  set document(value: ScreenDocument | undefined) {
    this.cancelVariableResolution();
    this.#document = value;
    this.compileBlueprint();
    this.initialize();
    this.startVariableRender(undefined, false, true);
  }

  connectedCallback(): void {
    this.initialize();
    this.startVariableRender(undefined, false, true);
  }

  disconnectedCallback(): void {
    this.cancelVariableResolution();
    this.#renderer?.clear();
  }

  unload(): void {
    this.cancelVariableResolution();
    this.disposeRenderer();
    this.#document = undefined;
    this.compileBlueprint();
  }

  refreshData(componentId?: string): void {
    if (this.#variableRefresh !== undefined) {
      if (componentId === undefined) this.#pendingRefreshAll = true;
      else if (!this.#pendingRefreshAll) this.#pendingRefreshComponents.add(componentId);
      return;
    }
    this.startVariableRender(componentId, true);
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
      resourceTimeoutMs: this.#resourceTimeoutMs,
      ...(this.#contributionIndex === undefined
        ? {}
        : { contributionIndex: this.#contributionIndex }),
    });
    this.startVariableRender();
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

  private startVariableRender(componentId?: string, forceRefresh = false, restart = false): void {
    if (this.#variableRefresh !== undefined) {
      if (!restart) return;
      this.cancelVariableResolution();
    }
    const task = this.resolveVariablesAndRender(componentId, forceRefresh);
    this.#variableRefresh = task;
    void task.then((ready) => {
      if (this.#variableRefresh !== task) return;
      this.#variableRefresh = undefined;
      if (!ready) {
        this.#pendingRefreshAll = false;
        this.#pendingRefreshComponents.clear();
        return;
      }
      if (this.#pendingRefreshAll) this.#renderer?.refreshData();
      else {
        for (const id of this.#pendingRefreshComponents) this.#renderer?.refreshData(id);
      }
      this.#pendingRefreshAll = false;
      this.#pendingRefreshComponents.clear();
    });
  }

  private async resolveVariablesAndRender(
    componentId: string | undefined,
    forceRefresh: boolean,
  ): Promise<boolean> {
    const renderer = this.#renderer;
    const document = this.#document;
    const plan = this.#blueprintPlan;
    if (renderer === undefined || document === undefined || plan === undefined) return false;
    const generation = ++this.#variableGeneration;
    const controller = new AbortController();
    this.#variableController = controller;
    renderer.suspendData();
    const variables: Record<string, ScreenJsonValue> = {
      ...plan.initialVariables,
      ...this.#blueprintVariables,
    };
    for (const variable of document.variables) {
      if (variable.type !== 'host') continue;
      if (this.#variablePort === undefined) {
        this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
      try {
        const result = await resolveHostVariable(
          this.#variablePort,
          variable.variableId,
          controller,
        );
        if (result === undefined) {
          this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        if (!result.ok || controller.signal.aborted) {
          if (!controller.signal.aborted) this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        const parsed = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
        if (!parsed.ok) {
          this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
          return false;
        }
        variables[variable.name] = parsed.value;
      } catch {
        if (!controller.signal.aborted) this.emitDiagnostic('HOST_DATASET_VARIABLE_INVALID');
        return false;
      }
    }
    if (
      controller.signal.aborted ||
      generation !== this.#variableGeneration ||
      this.#renderer !== renderer ||
      this.#document !== document
    ) {
      return false;
    }
    this.#blueprintVariables = variables;
    const applied = renderer.setVariables(variables);
    if (!applied.ok) {
      this.emitDiagnostics(applied.diagnostics);
      return false;
    }
    const rendered = renderer.render(document);
    if (!rendered.ok || rendered.diagnostics.length > 0) {
      this.emitDiagnostics(rendered.diagnostics);
      return false;
    }
    if (forceRefresh) renderer.refreshData(componentId);
    return true;
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
      this.emitLifecycleDiagnostic('Blueprint event payload is invalid.');
      return;
    }
    this.#blueprintVariables = result.value.variables;
    const renderer = this.#renderer;
    const document = this.#document;
    if (renderer !== undefined && document !== undefined) {
      const variables = renderer.setVariables(result.value.variables);
      if (variables.ok) {
        const rendered = renderer.render(document);
        if (!rendered.ok || rendered.diagnostics.length > 0)
          this.emitDiagnostics(rendered.diagnostics);
      } else {
        this.emitDiagnostics(variables.diagnostics);
      }
    }
    for (const hostEvent of result.value.hostEvents) {
      if (this.#blueprintRuntimePort === undefined) {
        this.dispatchEvent(new CustomEvent('base-screen-blueprint-event', { detail: hostEvent }));
      } else {
        void Promise.resolve(this.#blueprintRuntimePort.emit(hostEvent)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host event failed.');
        });
      }
    }
    for (const hostAction of result.value.hostActions) {
      if (this.#blueprintHostActionPort === undefined) {
        this.emitLifecycleDiagnostic('Blueprint host action is unavailable.');
      } else {
        void Promise.resolve(this.#blueprintHostActionPort.execute(hostAction)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host action failed.');
        });
      }
    }
  }

  private cancelVariableResolution(): void {
    this.#variableGeneration++;
    this.#variableController?.abort();
    this.#variableController = undefined;
    this.#pendingRefreshAll = false;
    this.#pendingRefreshComponents.clear();
  }

  private emitDiagnostic(code: ScreenDiagnostic['code']): void {
    this.emitDiagnostics([
      { severity: 'error', code, path: [], message: 'Host dataset state is unavailable.' },
    ]);
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    this.dispatchEvent(
      new CustomEvent('base-screen-diagnostic', {
        detail: { diagnostics },
      }),
    );
  }

  private emitLifecycleDiagnostic(message: string): void {
    this.emitDiagnostics([
      { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message },
    ]);
  }
}

async function resolveHostVariable(
  port: ScreenHostVariablePort,
  variableId: string,
  controller: AbortController,
): Promise<ScreenParseResult<ScreenJsonValue> | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, HOST_VARIABLE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([port.resolve({ variableId, signal: controller.signal }), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
