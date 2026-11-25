import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintHostEvent,
  ScreenBlueprintRule,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostCatalogPort,
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
  type ScreenBlueprintCanvasEffect,
  type ScreenBlueprintDispatchResult,
  type ScreenBlueprintEvent,
  type ScreenBlueprintPlan,
} from '@base-screen/core';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import type {
  BaseScreenCanvasChange,
  BaseScreenMaterialEvent,
  BaseScreenRenderer,
} from '@base-screen/renderer';
import { readDesignerVariableViews } from '../../common/operations/designer-variable-view.js';
import { DesignerBlueprintTimerScheduler } from './blueprint/designer-blueprint-timer-scheduler.js';
import { DesignerCanvasVariableController } from './variables/designer-canvas-variable-controller.js';

export interface DesignerCanvasRuntimeControllerCallbacks {
  readonly getRenderer: () => BaseScreenRenderer | undefined;
  readonly getHostCatalogPort: () => ScreenHostCatalogPort | undefined;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly getBlueprintHostActionPort: () => ScreenBlueprintHostActionPort | undefined;
  readonly emitBlueprintHostEvent: (event: ScreenBlueprintHostEvent) => void;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
  /**
   * 设计态从画布预览（ADR-0108 §2.7、ADR-0109 §2.5）：每次分派后把从画布动作与当前变量交给预览层——
   * 弹框在预览层打开，页面切到对应画板；缺省时这些动作在设计态被忽略。
   */
  readonly applyCanvasEffects?: (
    effects: readonly ScreenBlueprintCanvasEffect[],
    variables: ScreenJsonObject,
  ) => void;
  /** 文档重新渲染时复位弹框预览（与主画布显隐复位同口径）。 */
  readonly resetPopups?: () => void;
}

/** Keeps the Designer canvas on the same document-variable path as Viewer. */
export class DesignerCanvasRuntimeController {
  #document: ScreenDocument | undefined;
  #blueprintPlan: ScreenBlueprintPlan | undefined;
  #blueprintVariables: ScreenJsonObject | undefined;
  #lifecycleReadyFired = false;
  /** 正在分派的事件深度；分派期间从画布开合产生的事件排队，结束后按深度 +1 再分派。 */
  #dispatchDepth: number | undefined;
  #pendingCanvasEvents: BaseScreenCanvasChange[] = [];
  readonly #variableListeners = new Map<string, Set<(value: ScreenJsonValue) => void>>();
  readonly #variables: DesignerCanvasVariableController;
  readonly #timers = new DesignerBlueprintTimerScheduler({
    dispatch: (intervalSeconds) =>
      this.handleBlueprintEvent({ type: 'timer', name: 'tick', intervalSeconds, payload: null }),
  });

  constructor(private readonly callbacks: DesignerCanvasRuntimeControllerCallbacks) {
    this.#variables = new DesignerCanvasVariableController({
      getRenderer: callbacks.getRenderer,
      getDocument: () => this.#document,
      getVariables: () => this.#blueprintVariables,
      setVariables: (variables) => this.writeBlueprintVariables(variables),
      getHostCatalogPort: callbacks.getHostCatalogPort,
      emitDiagnostics: callbacks.emitDiagnostics,
    });
  }

  render(document: ScreenDocument): ScreenParseResult<void> {
    this.#document = document;
    this.callbacks.getRenderer()?.resetBlueprintVisibility();
    this.callbacks.resetPopups?.();
    this.compileBlueprint(document);
    const rendered = this.#variables.render(document, this.collectRuntimeVariables(document));
    // 就绪一次 per 文档装载：编辑重渲染不重复发射，装载/替换经 resetLifecycleReady 重新武装。
    if (rendered.ok && this.#blueprintPlan !== undefined && !this.#lifecycleReadyFired) {
      this.#lifecycleReadyFired = true;
      this.handleBlueprintEvent({ type: 'lifecycle', name: 'ready', payload: null });
    }
    return rendered;
  }

  resetLifecycleReady(): void {
    this.#lifecycleReadyFired = false;
  }

  /** 当前文档是否已发射过 ready；替换失败时用它回滚，避免错误地重新武装。 */
  isLifecycleReadyFired(): boolean {
    return this.#lifecycleReadyFired;
  }

  /** 恢复 ready 标志（仅用于替换失败回滚；正常流程只经 render 与 reset）。 */
  restoreLifecycleReady(fired: boolean): void {
    this.#lifecycleReadyFired = fired;
  }

  refreshData(componentId?: string): void {
    this.#variables.refreshData(componentId);
  }

  refreshVariables(options?: ScreenVariableRefreshOptions): void {
    this.#variables.refreshVariables(options);
  }

  /** 当前画布上的变量值（静态初值 + 蓝图写入）：参照底图等只读渲染与画布同口径取值。 */
  readVariables(): ScreenJsonObject {
    const document = this.#document;
    return document === undefined ? {} : this.collectRuntimeVariables(document);
  }

  /** 画布按某状态预览组件（ADR-0110）：`default` 即恢复实时判定。设计态不发状态改变事件。 */
  previewComponentState(componentId: string, stateId: string): void {
    this.callbacks
      .getRenderer()
      ?.applyBlueprintStateEffects([
        stateId === 'default'
          ? { componentId, operation: 'reset' }
          : { componentId, operation: 'set', stateId },
      ]);
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

  /** 预览里从画布真正打开 / 关闭、页面切换：分派对应事件（打开参数作为负载）。 */
  handleCanvasChange(change: BaseScreenCanvasChange): void {
    if (this.#dispatchDepth === undefined) {
      this.handleBlueprintEvent(canvasBlueprintEvent(change));
    } else {
      this.#pendingCanvasEvents.push(change);
    }
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
    const outerDepth = this.#dispatchDepth;
    this.#dispatchDepth = depth;
    try {
      this.callbacks.applyCanvasEffects?.(result.value.canvasEffects, {
        ...(document === undefined ? {} : collectStaticVariables(document)),
        ...result.value.variables,
      });
    } finally {
      this.#dispatchDepth = outerDepth;
    }
    const canvasEvents = this.#pendingCanvasEvents;
    this.#pendingCanvasEvents = [];

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
    for (const change of canvasEvents) {
      this.handleBlueprintEvent(canvasBlueprintEvent(change), depth + 1);
    }
  }

  clear(): void {
    this.#document = undefined;
    this.#blueprintPlan = undefined;
    this.#blueprintVariables = undefined;
    this.#lifecycleReadyFired = false;
    this.#timers.stop();
    this.#variableListeners.clear();
    this.#variables.clear();
    this.callbacks.getRenderer()?.resetBlueprintVisibility();
    this.callbacks.getRenderer()?.resetComponentStates();
    this.callbacks.resetPopups?.();
    this.#pendingCanvasEvents = [];
  }

  private compileBlueprint(document: ScreenDocument): void {
    const compiled = compileScreenBlueprint(
      document,
      this.callbacks.getRuntimeContributions() ?? { hasBlueprintCapability: () => false },
    );
    if (!compiled.ok) {
      this.#blueprintPlan = undefined;
      this.#blueprintVariables = undefined;
      this.#timers.sync([]);
      this.callbacks.emitDiagnostics(compiled.diagnostics);
      return;
    }
    this.#blueprintPlan = compiled.value;
    this.#blueprintVariables = compiled.value.initialVariables;
    this.#timers.sync(
      compiled.value.rules.flatMap((rule: ScreenBlueprintRule) =>
        rule.trigger.type === 'timer' ? [rule.trigger.intervalSeconds] : [],
      ),
    );
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

/**
 * 从画布事件的负载：「已打开」带打开参数（未写参数时为 null），「已关闭」恒为 null；
 * 「页面已切换」带 `{ from, to }`。
 */
function canvasBlueprintEvent(change: BaseScreenCanvasChange): ScreenBlueprintEvent {
  if (change.type === 'page-changed') {
    return {
      type: 'page-changed',
      name: 'page-changed',
      payload: { from: change.from, to: change.to },
    };
  }
  return {
    type: 'canvas-event',
    canvasId: change.canvasId,
    name: change.open ? 'opened' : 'closed',
    payload: change.open ? (change.payload ?? null) : null,
  };
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
