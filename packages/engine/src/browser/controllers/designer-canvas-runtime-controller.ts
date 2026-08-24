import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostVariablePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenRenderer } from '@base-screen/renderer';

const HOST_VARIABLE_TIMEOUT_MS = 15_000;

export interface DesignerCanvasRuntimeControllerCallbacks {
  readonly getRenderer: () => BaseScreenRenderer | undefined;
  readonly getVariablePort: () => ScreenHostVariablePort | undefined;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

/**
 * Keeps the Designer canvas Renderer on the same document-variable path as Viewer.
 * Static variables are applied synchronously. Host variables suspend resource work
 * until every value has resolved, with cancellation and generation guards preventing
 * stale values from a replaced document from reaching the canvas.
 */
export class DesignerCanvasRuntimeController {
  #document: ScreenDocument | undefined;
  #variableController: AbortController | undefined;
  #variableGeneration = 0;

  constructor(private readonly callbacks: DesignerCanvasRuntimeControllerCallbacks) {}

  render(document: ScreenDocument): ScreenParseResult<void> {
    const renderer = this.callbacks.getRenderer();
    this.#document = document;
    this.cancelVariableResolution();
    if (renderer === undefined) return success();

    const variables = collectStaticVariables(document);
    const hostVariables = document.variables.filter((variable) => variable.type === 'host');
    if (hostVariables.length === 0) {
      return applyVariablesAndRender(renderer, document, variables);
    }

    renderer.suspendData();
    const mounted = toVoidResult(renderer.render(document));
    if (!mounted.ok) return mounted;

    this.startHostVariableResolution(renderer, document, variables);
    return mounted;
  }

  refreshData(componentId?: string): void {
    const renderer = this.callbacks.getRenderer();
    const document = this.#document;
    if (renderer === undefined || document === undefined) return;

    const hostVariables = document.variables.filter((variable) => variable.type === 'host');
    if (hostVariables.length === 0) {
      renderer.refreshData(componentId);
      return;
    }

    this.cancelVariableResolution();
    this.startHostVariableResolution(
      renderer,
      document,
      collectStaticVariables(document),
      true,
      componentId,
    );
  }

  clear(): void {
    this.#document = undefined;
    this.cancelVariableResolution();
  }

  private startHostVariableResolution(
    renderer: BaseScreenRenderer,
    document: ScreenDocument,
    initialVariables: ScreenJsonObject,
    refreshAfterRender = false,
    refreshComponentId?: string,
  ): void {
    const generation = this.#variableGeneration;
    const controller = new AbortController();
    this.#variableController = controller;
    void this.resolveHostVariables(document, initialVariables, controller).then((variables) => {
      if (
        variables === undefined ||
        controller.signal.aborted ||
        generation !== this.#variableGeneration ||
        renderer !== this.callbacks.getRenderer() ||
        document !== this.#document
      ) {
        return;
      }

      this.#variableController = undefined;
      const rendered = applyVariablesAndRender(renderer, document, variables, 'variable');
      if (!rendered.ok || rendered.diagnostics.length > 0) {
        this.callbacks.emitDiagnostics(rendered.diagnostics);
        return;
      }
      if (refreshAfterRender) renderer.refreshData(refreshComponentId);
    });
  }

  private async resolveHostVariables(
    document: ScreenDocument,
    initialVariables: ScreenJsonObject,
    controller: AbortController,
  ): Promise<ScreenJsonObject | undefined> {
    const port = this.callbacks.getVariablePort();
    if (port === undefined) {
      this.emitVariableDiagnostic();
      return undefined;
    }

    const variables: Record<string, ScreenJsonValue> = { ...initialVariables };
    for (const variable of document.variables) {
      if (variable.type !== 'host') continue;
      try {
        const result = await resolveHostVariable(port, variable.variableId, controller);
        if (result === undefined) {
          if (this.#variableController === controller) this.emitVariableDiagnostic();
          return undefined;
        }
        if (controller.signal.aborted) return undefined;
        if (!result.ok) {
          this.emitVariableDiagnostic();
          return undefined;
        }
        const parsed = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
        if (!parsed.ok) {
          this.emitVariableDiagnostic();
          return undefined;
        }
        variables[variable.name] = parsed.value;
      } catch {
        if (!controller.signal.aborted) this.emitVariableDiagnostic();
        return undefined;
      }
    }
    return variables;
  }

  private cancelVariableResolution(): void {
    this.#variableGeneration++;
    this.#variableController?.abort();
    this.#variableController = undefined;
  }

  private emitVariableDiagnostic(): void {
    this.callbacks.emitDiagnostics([
      {
        severity: 'error',
        code: 'HOST_DATASET_VARIABLE_INVALID',
        path: [],
        message: 'Host dataset state is unavailable.',
      },
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

function applyVariablesAndRender(
  renderer: BaseScreenRenderer,
  document: ScreenDocument,
  variables: ScreenJsonObject,
  trigger?: 'variable',
): ScreenParseResult<void> {
  const applied = renderer.setVariables(variables);
  if (!applied.ok) return applied;
  return toVoidResult(renderer.render(document, trigger === undefined ? undefined : { trigger }));
}

function toVoidResult(result: ScreenParseResult<null>): ScreenParseResult<void> {
  return result.ok
    ? { ok: true, value: undefined, diagnostics: result.diagnostics }
    : { ok: false, diagnostics: result.diagnostics };
}

function success(): ScreenParseResult<void> {
  return { ok: true, value: undefined, diagnostics: [] };
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
