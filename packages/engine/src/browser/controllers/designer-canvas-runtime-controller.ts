import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintHostEvent,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostVariablePort,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenVariableHandle,
  ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  dispatchScreenBlueprintEvent,
  type ScreenBlueprintDispatchResult,
  type ScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import type { BaseScreenMaterialEvent, BaseScreenRenderer } from '@base-screen/renderer';
import { readDesignerVariableViews } from '../../common/operations/designer-variable-view.js';
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
  readonly #variableListeners = new Map<string, Set<(value: ScreenJsonValue) => void>>();
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

  getVariable(id: string): ScreenVariableHandle | undefined {
    if (!this.#document?.variables.some((variable) => variable.id === id)) return undefined;
    const runtime = this;
    return {
      id,
      get value() {
        return (
          runtime.#blueprintVariables?.[id] ??
          runtime.#document?.variables.find((variable) => variable.id === id)?.initialValue ??
          null
        );
      },
      set(value) {
        return runtime.setVariableValue(id, value);
      },
      onChange(listener) {
        const listeners = runtime.#variableListeners.get(id) ?? new Set();
        listeners.add(listener);
        runtime.#variableListeners.set(id, listeners);
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) runtime.#variableListeners.delete(id);
        };
      },
    };
  }

  handleMaterialEvent(event: BaseScreenMaterialEvent): void {
    this.handleBlueprintEvent({
      type: 'material-event',
      componentId: event.componentId,
      name: event.name,
      payload: event.payload,
    });
  }

  private handleBlueprintEvent(event: ScreenBlueprintEvent, depth = 0): void {
    const plan = this.#blueprintPlan;
    const previousVariables = this.#blueprintVariables;
    if (plan === undefined || previousVariables === undefined) return;
    if (depth > 32) {
      this.emitLifecycleDiagnostic('Blueprint variable event cycle exceeded its limit.');
      return;
    }

    const result = dispatchScreenBlueprintEvent(plan, previousVariables, event);
    if (!result.ok) {
      this.emitLifecycleDiagnostic('Blueprint event payload is invalid.');
      return;
    }

    this.writeBlueprintVariables(result.value.variables, false);
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
    for (const componentId of result.value.componentDataRequests) {
      renderer?.refreshData(componentId);
    }
    if (result.value.variableRequests.length > 0) {
      this.#variables.refreshVariables({
        variableIds: [...new Set(result.value.variableRequests)],
      });
    }
    for (const variableId of changedVariableIds(previousVariables, result.value.variables)) {
      this.handleBlueprintEvent(
        {
          type: 'variable-event',
          variableId,
          name: 'data-updated',
          payload: result.value.variables[variableId] ?? null,
        },
        depth + 1,
      );
    }
  }

  clear(): void {
    this.#document = undefined;
    this.#blueprintPlan = undefined;
    this.#blueprintVariables = undefined;
    this.#variableListeners.clear();
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

  private writeBlueprintVariables(variables: ScreenJsonObject, emitEvents = true): void {
    if (this.#blueprintPlan === undefined) return;
    const previous = this.#blueprintVariables;
    this.#blueprintVariables = variables;
    if (previous === undefined) return;
    const changed = changedVariableIds(previous, variables);
    for (const variableId of changed) {
      const value = variables[variableId] ?? null;
      for (const listener of this.#variableListeners.get(variableId) ?? []) {
        try {
          listener(value);
        } catch {
          this.emitLifecycleDiagnostic('Variable change listener failed.');
        }
      }
    }
    if (emitEvents) {
      for (const variableId of changed) {
        this.handleBlueprintEvent({
          type: 'variable-event',
          variableId,
          name: 'data-updated',
          payload: variables[variableId] ?? null,
        });
      }
    }
  }

  private setVariableValue(id: string, value: ScreenJsonValue): ScreenParseResult<null> {
    const parsed = parseScreenJsonValue(value);
    if (!parsed.ok) return parsed;
    const renderer = this.callbacks.getRenderer();
    const document = this.#document;
    const previous = this.#blueprintVariables;
    if (
      renderer === undefined ||
      document === undefined ||
      previous === undefined ||
      !document.variables.some((variable) => variable.id === id)
    ) {
      return variableFailure('Designer variable is unavailable.');
    }
    if (jsonEqual(previous[id], parsed.value)) {
      return { ok: true, value: null, diagnostics: [] };
    }
    const variables = { ...previous, [id]: parsed.value };
    const applied = renderer.setVariables(variables);
    if (!applied.ok) return applied;
    const rendered = renderer.render(document, { trigger: 'variable' });
    if (!rendered.ok) {
      renderer.setVariables(previous);
      return rendered;
    }
    this.writeBlueprintVariables(variables, false);
    this.handleBlueprintEvent({
      type: 'variable-event',
      variableId: id,
      name: 'data-updated',
      payload: parsed.value,
    });
    return { ok: true, value: null, diagnostics: rendered.diagnostics };
  }

  private emitLifecycleDiagnostic(message: string): void {
    this.callbacks.emitDiagnostics([
      { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message },
    ]);
  }
}

function collectStaticVariables(document: ScreenDocument): ScreenJsonObject {
  const variables: Record<string, ScreenJsonValue> = {};
  for (const variable of readDesignerVariableViews(document)) {
    if (variable.type === 'static') variables[variable.id] = variable.initialValue;
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
  if (result.visibilityEffects.length > 0) {
    const visibility = renderer.applyBlueprintVisibilityEffects(result.visibilityEffects);
    if (!visibility.ok) diagnostics.push(...visibility.diagnostics);
  }
  return diagnostics;
}

function changedVariableIds(previous: ScreenJsonObject, next: ScreenJsonObject): readonly string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(
    (id) => !jsonEqual(previous[id], next[id]),
  );
}

function jsonEqual(left: ScreenJsonValue | undefined, right: ScreenJsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function variableFailure(message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message }],
  };
}
