import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintHostEvent,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintDispatchResult,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import type { BaseScreenMaterialEvent, BaseScreenRenderer } from '@base-screen/renderer';
import { DesignerCanvasVariableController } from './designer-canvas-variable-controller.js';

export interface DesignerCanvasRuntimeControllerCallbacks {
  readonly getRenderer: () => BaseScreenRenderer | undefined;
  readonly getVariablePort: () => ScreenHostVariablePort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly getBlueprintHostActionPort: () => ScreenBlueprintHostActionPort | undefined;
  readonly emitBlueprintHostEvent: (event: ScreenBlueprintHostEvent) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

/** Keeps the Designer canvas on the same document-variable path as Viewer. */
export class DesignerCanvasRuntimeController {
  #document: ScreenDocument | undefined;
  #blueprintPlan: ScreenBlueprintPlan | undefined;
  #blueprintVariables: ScreenJsonObject | undefined;
  readonly #variables: DesignerCanvasVariableController;

  constructor(private readonly callbacks: DesignerCanvasRuntimeControllerCallbacks) {
    this.#variables = new DesignerCanvasVariableController({
      getRenderer: callbacks.getRenderer,
      getDocument: () => this.#document,
      getVariables: () => this.#blueprintVariables,
      setVariables: (variables) => this.writeBlueprintVariables(variables),
      getVariablePort: callbacks.getVariablePort,
      emitDiagnostics: callbacks.emitDiagnostics,
    });
  }

  render(document: ScreenDocument): ScreenParseResult<void> {
    this.#document = document;
    this.callbacks.getRenderer()?.resetBlueprintVisibility();
    this.compileBlueprint(document);
    return this.#variables.render(document, this.collectRuntimeVariables(document));
  }

  refreshData(componentId?: string): void {
    this.#variables.refreshData(componentId);
  }

  refreshVariables(options?: ScreenVariableRefreshOptions): void {
    this.#variables.refreshVariables(options);
  }

  handleMaterialEvent(event: BaseScreenMaterialEvent): void {
    const plan = this.#blueprintPlan;
    const previousVariables = this.#blueprintVariables;
    if (plan === undefined || previousVariables === undefined) return;

    const result = dispatchScreenBlueprintEvent(plan, previousVariables, {
      componentId: event.componentId,
      name: event.name,
      payload: event.payload,
    });
    if (!result.ok) {
      this.emitLifecycleDiagnostic('Blueprint event payload is invalid.');
      return;
    }

    this.#blueprintVariables = result.value.variables;
    const renderer = this.callbacks.getRenderer();
    const document = this.#document;
    if (renderer !== undefined && document !== undefined) {
      const diagnostics = applyBlueprintDispatchToRenderer(
        renderer,
        document,
        previousVariables,
        result.value,
      );
      if (diagnostics.length > 0) this.callbacks.emitDiagnostics(diagnostics);
    }

    for (const hostEvent of result.value.hostEvents) {
      try {
        this.callbacks.emitBlueprintHostEvent(hostEvent);
      } catch {
        this.emitLifecycleDiagnostic('Blueprint host event failed.');
      }
    }
    for (const hostAction of result.value.hostActions) {
      const port = this.callbacks.getBlueprintHostActionPort();
      if (port === undefined) {
        this.emitLifecycleDiagnostic('Blueprint host action is unavailable.');
        continue;
      }
      try {
        void Promise.resolve(port.execute(hostAction)).catch(() => {
          this.emitLifecycleDiagnostic('Blueprint host action failed.');
        });
      } catch {
        this.emitLifecycleDiagnostic('Blueprint host action failed.');
      }
    }
  }

  clear(): void {
    this.#document = undefined;
    this.#blueprintPlan = undefined;
    this.#blueprintVariables = undefined;
    this.#variables.clear();
    this.callbacks.getRenderer()?.resetBlueprintVisibility();
  }

  private compileBlueprint(document: ScreenDocument): void {
    const compiled = compileScreenBlueprint(
      document,
      this.callbacks.getRuntimeContributions() ?? { hasBlueprintCapability: () => false },
    );
    if (!compiled.ok) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.callbacks.emitDiagnostics(compiled.diagnostics);
      return;
    }
    this.#blueprintPlan = compiled.value;
    this.#blueprintVariables = compiled.value.initialVariables;
  }

  private collectRuntimeVariables(document: ScreenDocument): ScreenJsonObject {
    return { ...collectStaticVariables(document), ...this.#blueprintVariables };
  }

  private writeBlueprintVariables(variables: ScreenJsonObject): void {
    if (this.#blueprintPlan !== undefined) this.#blueprintVariables = variables;
  }

  private emitLifecycleDiagnostic(message: string): void {
    this.callbacks.emitDiagnostics([
      { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message },
    ]);
  }
}

function collectStaticVariables(document: ScreenDocument): ScreenJsonObject {
  const variables: Record<string, ScreenJsonValue> = {};
  for (const variable of document.variables) {
    if (variable.type === 'static') variables[variable.name] = variable.value;
  }
  return variables;
}

function applyBlueprintDispatchToRenderer(
  renderer: BaseScreenRenderer,
  document: ScreenDocument,
  previousVariables: ScreenJsonObject,
  result: ScreenBlueprintDispatchResult,
): readonly ScreenDiagnostic[] {
  const diagnostics: ScreenDiagnostic[] = [];
  if (JSON.stringify(previousVariables) !== JSON.stringify(result.variables)) {
    const variables = renderer.setVariables(result.variables);
    if (variables.ok) {
      diagnostics.push(...renderer.render(document, { trigger: 'variable' }).diagnostics);
    } else {
      diagnostics.push(...variables.diagnostics);
    }
  }
  const visibility = renderer.applyBlueprintVisibilityEffects(result.visibilityEffects);
  if (!visibility.ok) diagnostics.push(...visibility.diagnostics);
  return diagnostics;
}
