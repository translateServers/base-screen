import {
  DEFAULT_SCREEN_COMPONENT_STATE_ID,
  resolveScreenComponentState,
  type ScreenJsonValue,
} from '@base-screen/contracts';
import type { ScreenBlueprintStateEffect } from '@base-screen/core';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import type { RendererState } from './renderer-state.js';
import type { RenderCandidate } from './renderer-types.js';

/** 组件生效状态改变（ADR-0110 §2.3）：`cause` 区分自动判定与蓝图设置。 */
export interface BaseScreenComponentStateChange {
  readonly componentId: string;
  readonly from: string;
  readonly to: string;
  readonly cause: 'judge' | 'blueprint';
}

/**
 * 组件状态的会话记忆：判定结果（取值暂不可用时沿用）、蓝图设置、最近一次生效的状态。
 * 不写文档、不进历史；组件卸载（切页、删除）时一并清除。
 */
export class ComponentStateMemory {
  readonly #judged = new Map<string, string>();
  readonly #manual = new Map<string, string>();
  readonly #effective = new Map<string, string>();
  /** 最近一次判定读到的取值（检查器显示「当前 x → 状态」用）。 */
  readonly #values = new Map<string, ScreenJsonValue | undefined>();
  readonly #blueprintCause = new Set<string>();
  #pending: BaseScreenComponentStateChange[] = [];
  #flushScheduled = false;

  /** 当前应生效的状态：蓝图设置优先，其次判定结果，都没有为默认。 */
  resolve(
    state: RendererState,
    candidate: RenderCandidate,
    dataState: BaseScreenMaterialDataState,
  ): string {
    const states = candidate.component.states;
    if (states === undefined) return DEFAULT_SCREEN_COMPONENT_STATE_ID;
    const componentId = candidate.component.id;
    const manual = this.#manual.get(componentId);
    if (manual !== undefined && states.items.some((item) => item.id === manual)) return manual;
    const resolution = resolveScreenComponentState(states, {
      componentData: () => (dataState.status === 'ready' ? dataState.value : undefined),
      variable: (variableId) =>
        Object.hasOwn(state.variables, variableId)
          ? (state.variables[variableId] as ScreenJsonValue)
          : undefined,
      dataSource: (dataSourceId) => {
        const entry = state.dataSources.read(dataSourceId);
        return entry?.dataState.status === 'ready' ? entry.rawValue : undefined;
      },
    });
    if (resolution.status === 'resolved') {
      this.#judged.set(componentId, resolution.stateId);
      this.#values.set(componentId, resolution.value);
      return resolution.stateId;
    }
    return this.#judged.get(componentId) ?? DEFAULT_SCREEN_COMPONENT_STATE_ID;
  }

  /** 记录本次写入物料的状态；与上次不同（含挂载后首次非默认）时排队一个改变事件。 */
  commit(state: RendererState, componentId: string, stateId: string): void {
    const previous = this.#effective.get(componentId) ?? DEFAULT_SCREEN_COMPONENT_STATE_ID;
    const known = this.#effective.has(componentId);
    this.#effective.set(componentId, stateId);
    const cause = this.#blueprintCause.delete(componentId) ? 'blueprint' : 'judge';
    if (previous === stateId && (known || stateId === DEFAULT_SCREEN_COMPONENT_STATE_ID)) return;
    if (state.options.onComponentStateChange === undefined) return;
    this.#pending.push({ componentId, from: previous, to: stateId, cause });
    this.#scheduleFlush(state);
  }

  /** 执行蓝图设置 / 恢复；返回受影响的组件 id。 */
  apply(effects: readonly ScreenBlueprintStateEffect[]): readonly string[] {
    const touched = new Set<string>();
    for (const effect of effects) {
      if (effect.operation === 'set' && effect.stateId !== undefined) {
        this.#manual.set(effect.componentId, effect.stateId);
      } else {
        this.#manual.delete(effect.componentId);
      }
      this.#blueprintCause.add(effect.componentId);
      touched.add(effect.componentId);
    }
    return [...touched];
  }

  read(
    componentId: string,
  ): { readonly stateId: string; readonly value?: ScreenJsonValue } | undefined {
    const stateId = this.#effective.get(componentId);
    if (stateId === undefined) return undefined;
    const value = this.#values.get(componentId);
    return value === undefined ? { stateId } : { stateId, value };
  }

  /** 只保留仍挂载的组件。 */
  retain(componentIds: ReadonlySet<string>): void {
    for (const map of [this.#judged, this.#manual, this.#effective, this.#values] as const) {
      for (const id of [...map.keys()]) if (!componentIds.has(id)) map.delete(id);
    }
    for (const id of [...this.#blueprintCause])
      if (!componentIds.has(id)) this.#blueprintCause.delete(id);
  }

  /** 页面重载 / 文档替换：蓝图设置与判定记忆全部清空。 */
  reset(): void {
    this.#judged.clear();
    this.#manual.clear();
    this.#effective.clear();
    this.#values.clear();
    this.#blueprintCause.clear();
    this.#pending = [];
  }

  #scheduleFlush(state: RendererState): void {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    // 改变事件排到本次渲染之后再交给宿主，避免在物料写入途中重入蓝图分发。
    queueMicrotask(() => {
      this.#flushScheduled = false;
      const pending = this.#pending;
      this.#pending = [];
      if (state.disposed) return;
      for (const change of pending) {
        try {
          state.options.onComponentStateChange?.(change);
        } catch {
          state.options.onDiagnostic?.({
            severity: 'error',
            code: 'PLUGIN_CORE_RENDER_FAILED',
            path: ['components', change.componentId, 'states'],
            message: 'Host component state callback raised an exception.',
          });
        }
      }
    });
  }
}
