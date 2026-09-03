import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenDynamicVariable,
  type ScreenHostVariablePort,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenVariableRefreshOptions,
} from '@base-screen/contracts';
import type { BaseScreenRenderer } from '@base-screen/renderer';

const HOST_VARIABLE_TIMEOUT_MS = 15_000;
const HOST_VARIABLE_VALUE_BYTES = 1024 * 1024;

interface DesignerCanvasVariableCallbacks {
  readonly getRenderer: () => BaseScreenRenderer | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getVariables: () => ScreenJsonObject | undefined;
  readonly setVariables: (variables: ScreenJsonObject) => void;
  readonly getVariablePort: () => ScreenHostVariablePort | undefined;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

/** Owns host-variable resolution, atomic refreshes, cancellation, and queue coalescing. */
export class DesignerCanvasVariableController {
  #controller: AbortController | undefined;
  #generation = 0;
  #pendingAll = false;
  readonly #pendingIds = new Set<string>();
  #pendingTraceId: string | undefined;

  constructor(private readonly callbacks: DesignerCanvasVariableCallbacks) {}

  render(document: ScreenDocument, initialVariables: ScreenJsonObject): ScreenParseResult<void> {
    const renderer = this.callbacks.getRenderer();
    this.cancel();
    if (renderer === undefined) return success();
    const hostVariables = hostVariablesOf(document);
    if (hostVariables.length === 0) {
      const rendered = applyVariablesAndRender(renderer, document, initialVariables);
      if (rendered.ok) this.callbacks.setVariables(initialVariables);
      return rendered;
    }
    renderer.suspendData();
    const mounted = toVoidResult(renderer.render(document));
    if (mounted.ok) this.#startFullResolution(renderer, document, initialVariables);
    return mounted;
  }

  refreshData(componentId?: string): void {
    const renderer = this.callbacks.getRenderer();
    const document = this.callbacks.getDocument();
    if (renderer === undefined || document === undefined) return;
    const hostVariables = hostVariablesOf(document);
    if (hostVariables.length === 0) {
      renderer.refreshData(componentId);
      return;
    }
    const initialVariables = this.callbacks.getVariables();
    if (initialVariables === undefined) return;
    this.cancel();
    this.#startFullResolution(renderer, document, initialVariables, true, componentId);
  }

  refreshVariables(options: ScreenVariableRefreshOptions = {}): void {
    const document = this.callbacks.getDocument();
    if (document === undefined) return;
    const availableIds = new Set(hostVariablesOf(document).map(({ id }) => id));
    const requestedIds =
      options.variableIds === undefined
        ? undefined
        : [...new Set(options.variableIds)].filter((variableId) => availableIds.has(variableId));
    if ((requestedIds?.length ?? availableIds.size) === 0) return;
    if (this.#controller !== undefined) {
      this.#queue(requestedIds, options.traceId);
      return;
    }
    this.#startRefresh(requestedIds, options.traceId);
  }

  clear(): void {
    this.cancel();
  }

  #startFullResolution(
    renderer: BaseScreenRenderer,
    document: ScreenDocument,
    initialVariables: ScreenJsonObject,
    refreshAfterRender = false,
    refreshComponentId?: string,
  ): void {
    const generation = this.#generation;
    const controller = new AbortController();
    this.#controller = controller;
    void this.#resolve(document, controller).then((values) => {
      if (!this.#isCurrent(controller, generation, renderer, document)) return;
      this.#controller = undefined;
      if (values === undefined) {
        this.#emitVariableDiagnostic();
        this.#drain();
        return;
      }
      const variables: Record<string, ScreenJsonValue> = { ...initialVariables };
      for (const variable of hostVariablesOf(document)) {
        const value = values.get(variable.id);
        if (value !== undefined) variables[variable.id] = value;
      }
      const rendered = applyVariablesAndRender(renderer, document, variables, 'variable');
      if (!rendered.ok || rendered.diagnostics.length > 0) {
        this.callbacks.emitDiagnostics(rendered.diagnostics);
        this.#drain();
        return;
      }
      this.callbacks.setVariables(variables);
      if (refreshAfterRender) renderer.refreshData(refreshComponentId);
      this.#drain();
    });
  }

  #startRefresh(requestedIds: readonly string[] | undefined, traceId?: string): void {
    const renderer = this.callbacks.getRenderer();
    const document = this.callbacks.getDocument();
    const previous = this.callbacks.getVariables();
    if (renderer === undefined || document === undefined || previous === undefined) return;
    const generation = this.#generation;
    const controller = new AbortController();
    this.#controller = controller;
    void this.#resolve(document, controller, requestedIds).then((values) => {
      if (
        !this.#isCurrent(controller, generation, renderer, document) ||
        this.callbacks.getVariables() !== previous
      ) {
        return;
      }
      this.#controller = undefined;
      if (values === undefined) {
        this.#emitVariableDiagnostic();
        this.#drain();
        return;
      }
      const variables: Record<string, ScreenJsonValue> = { ...previous };
      let changed = false;
      for (const variable of hostVariablesOf(document)) {
        if (requestedIds !== undefined && !requestedIds.includes(variable.id)) continue;
        const value = values.get(variable.id);
        if (value === undefined) continue;
        const oldValue = variables[variable.id];
        if (oldValue === undefined || !jsonEqual(oldValue, value)) changed = true;
        variables[variable.id] = value;
      }
      if (!changed) {
        this.#drain();
        return;
      }
      const applied = renderer.setVariables(variables);
      if (!applied.ok) {
        this.callbacks.emitDiagnostics(applied.diagnostics);
        this.#drain();
        return;
      }
      const rendered = renderer.render(document, { trigger: 'variable', traceId: traceId ?? '' });
      if (!rendered.ok || rendered.diagnostics.length > 0) {
        renderer.setVariables(previous);
        this.callbacks.emitDiagnostics(rendered.diagnostics);
        this.#drain();
        return;
      }
      this.callbacks.setVariables(variables);
      this.#drain();
    });
  }

  async #resolve(
    document: ScreenDocument,
    controller: AbortController,
    requestedIds?: readonly string[],
  ): Promise<ReadonlyMap<string, ScreenJsonValue> | undefined> {
    const port = this.callbacks.getVariablePort();
    if (port === undefined) return undefined;
    const available = new Map(hostVariablesOf(document).map((variable) => [variable.id, variable]));
    const ids = new Set(
      requestedIds === undefined
        ? available.keys()
        : requestedIds.filter((variableId) => available.has(variableId)),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, HOST_VARIABLE_TIMEOUT_MS);
    });
    try {
      const requests = Promise.all(
        [...ids].map(async (variableId) => {
          const variable = available.get(variableId)!;
          return {
            variableId,
            result: await port.resolve({
              variableId,
              sourceId: variable.sourceId,
              sourceType: variable.type,
              initialValue: variable.initialValue,
              controlled: variable.controlled,
              ...(variable.processorId === undefined ? {} : { processorId: variable.processorId }),
              ...(variable.type === 'data-source' && variable.autoUpdate !== undefined
                ? { autoUpdate: variable.autoUpdate }
                : {}),
              purpose: 'runtime',
              signal: controller.signal,
            }),
          };
        }),
      );
      const settled = await Promise.race([requests, timeout]);
      if (settled === undefined || controller.signal.aborted) return undefined;
      const values = new Map<string, ScreenJsonValue>();
      for (const { variableId, result } of settled) {
        if (!result.ok) return undefined;
        const parsed = parseScreenJsonValue(result.value, { maxBytes: HOST_VARIABLE_VALUE_BYTES });
        if (!parsed.ok) return undefined;
        values.set(variableId, parsed.value);
      }
      return values;
    } catch {
      return undefined;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  #isCurrent(
    controller: AbortController,
    generation: number,
    renderer: BaseScreenRenderer,
    document: ScreenDocument,
  ): boolean {
    return (
      !controller.signal.aborted &&
      this.#controller === controller &&
      generation === this.#generation &&
      renderer === this.callbacks.getRenderer() &&
      document === this.callbacks.getDocument()
    );
  }

  #queue(requestedIds: readonly string[] | undefined, traceId?: string): void {
    if (requestedIds === undefined) {
      this.#pendingAll = true;
      this.#pendingIds.clear();
    } else if (!this.#pendingAll) {
      for (const variableId of requestedIds) this.#pendingIds.add(variableId);
    }
    this.#pendingTraceId = traceId;
  }

  #drain(): void {
    if (this.#controller !== undefined || (!this.#pendingAll && this.#pendingIds.size === 0))
      return;
    const requestedIds = this.#pendingAll ? undefined : [...this.#pendingIds];
    const traceId = this.#pendingTraceId;
    this.#pendingAll = false;
    this.#pendingIds.clear();
    this.#pendingTraceId = undefined;
    this.#startRefresh(requestedIds, traceId);
  }

  private cancel(): void {
    this.#generation++;
    this.#controller?.abort();
    this.#controller = undefined;
    this.#pendingAll = false;
    this.#pendingIds.clear();
    this.#pendingTraceId = undefined;
  }

  #emitVariableDiagnostic(): void {
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

function hostVariablesOf(document: ScreenDocument): readonly ScreenDynamicVariable[] {
  return document.variables.filter(
    (variable): variable is ScreenDynamicVariable => variable.type !== 'static',
  );
}

function jsonEqual(left: ScreenJsonValue, right: ScreenJsonValue): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonEqual(item, right[index]!))
    );
  }
  const leftRecord = left as Readonly<Record<string, ScreenJsonValue>>;
  const rightRecord = right as Readonly<Record<string, ScreenJsonValue>>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonEqual(leftRecord[key]!, rightRecord[key]!),
    )
  );
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
