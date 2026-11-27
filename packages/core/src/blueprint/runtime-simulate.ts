import {
  resolveScreenStartPageId,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
  screenJsonEquals,
} from '@base-screen/contracts';
import { compileScreenBlueprint } from './runtime-compile.js';
import { traceScreenBlueprintEvent } from './runtime-dispatch.js';
import type {
  ScreenBlueprintCapabilityIndex,
  ScreenBlueprintEvent,
  ScreenBlueprintPlan,
  ScreenBlueprintRuleTrace,
  ScreenBlueprintTraceResult,
} from './runtime-types.js';

/**
 * 蓝图级联模拟（ADR-0115 D6，原先只在 engine 的蓝图工作台里展开）：从一个事件出发，逐次分派——
 * 变量值改变后以新值为负载分派它的 `data-updated`；从画布开合与页面导航按查看器的顺序级联
 * 「已打开 / 已关闭」「页面已切换」（先关弹框 → 旧页离开 → 新页进入）。请求类动作只登记，不发出；
 * 不取数、不调宿主动作。纯函数，设计器工作台与智能体的采纳前校验共用这一份。
 *
 * 结果除逐次分派的轨迹外，还给出模拟结束时的状态差：哪些变量变了、哪些组件的显隐变了、
 * 哪些数据源实例的参数（引用了变量的那几个）变了——变了的实例采纳后会重新取数。
 */

/** 与查看器一致的级联上限：超过即判失败（多半是变量之间互相写形成了环）。 */
export const SCREEN_BLUEPRINT_SIMULATION_MAX_DEPTH = 32;

export interface ScreenBlueprintSimulationOptions {
  /** 已授权能力；缺省视为全部授权（作者面的模拟）。 */
  readonly capabilities?: ScreenBlueprintCapabilityIndex;
  /** 起始变量；缺省取文档变量的初值。 */
  readonly variables?: ScreenJsonObject;
  /** 预先编译好的计划（同一份文档模拟多次时省一次编译）。 */
  readonly plan?: ScreenBlueprintPlan;
}

/** 一次分派：`depth` 0 是起点事件，之后每级联一层加一。 */
export interface ScreenBlueprintSimulationDispatch {
  readonly depth: number;
  readonly event: ScreenBlueprintEvent;
  readonly ruleTraces: readonly ScreenBlueprintRuleTrace[];
  readonly result: ScreenBlueprintTraceResult;
}

export interface ScreenBlueprintSimulationParamChange {
  readonly before: ScreenJsonValue;
  readonly after: ScreenJsonValue;
}

export interface ScreenBlueprintSimulation {
  readonly plan: ScreenBlueprintPlan;
  readonly dispatches: readonly ScreenBlueprintSimulationDispatch[];
  /** 级联超限或某次分派求值失败；此时 `dispatches` 截止到失败前。 */
  readonly failure?: {
    readonly kind: 'depth-exceeded' | 'dispatch-failed';
    readonly depth: number;
    readonly message: string;
  };
  readonly variables: ScreenJsonObject;
  /** 值变了的变量 id。 */
  readonly changedVariableIds: readonly string[];
  /** 显隐变了的组件：组件 id → 模拟结束时是否可见（只列与文档初始状态不同的）。 */
  readonly visibility: Readonly<Record<string, boolean>>;
  /** 引用了变量、且求值结果变了的数据源参数：实例 id → 参数名 → 前后取值。 */
  readonly dataSourceChanges: Readonly<
    Record<string, Readonly<Record<string, ScreenBlueprintSimulationParamChange>>>
  >;
  /** 模拟结束时打开着的弹框与当前页面。 */
  readonly openPopupIds: readonly string[];
  readonly currentPageId: string | null;
  /** 请求类动作登记的变量 / 组件（只登记，不发出）。 */
  readonly variableRequests: readonly string[];
  readonly componentDataRequests: readonly string[];
}

export function simulateScreenBlueprint(
  document: ScreenDocument,
  event: ScreenBlueprintEvent,
  options: ScreenBlueprintSimulationOptions = {},
): ScreenParseResult<ScreenBlueprintSimulation> {
  let plan = options.plan;
  if (plan === undefined) {
    const compiled = compileScreenBlueprint(document, options.capabilities);
    if (!compiled.ok) return compiled;
    plan = compiled.value;
  }
  const start = options.variables ?? plan.initialVariables;
  let variables: ScreenJsonObject = start;
  const dispatches: ScreenBlueprintSimulationDispatch[] = [];
  const visibility = new Map<string, boolean>();
  const variableRequests: string[] = [];
  const componentDataRequests: string[] = [];
  const openPopups = new Set<string>();
  const pageIds = (document.subCanvases ?? [])
    .filter((canvas) => canvas.display === 'page')
    .map((canvas) => canvas.id);
  let currentPage: string | null = resolveScreenStartPageId(document);
  const pageHistory: string[] = [];
  const queue: { readonly event: ScreenBlueprintEvent; readonly depth: number }[] = [
    { event, depth: 0 },
  ];
  const enqueue = (next: ScreenBlueprintEvent, depth: number): void => {
    queue.push({ event: next, depth });
  };
  const goPage = (
    target: string | undefined,
    payload: ScreenJsonValue | undefined,
    remember: boolean,
    depth: number,
  ): void => {
    if (target === undefined || target === currentPage || !pageIds.includes(target)) return;
    for (const popupId of [...openPopups].reverse()) {
      openPopups.delete(popupId);
      enqueue({ type: 'canvas-event', canvasId: popupId, name: 'closed', payload: null }, depth);
    }
    const from = currentPage;
    if (from !== null) {
      if (remember) pageHistory.push(from);
      enqueue({ type: 'canvas-event', canvasId: from, name: 'closed', payload: null }, depth);
    }
    currentPage = target;
    enqueue(
      { type: 'canvas-event', canvasId: target, name: 'opened', payload: payload ?? null },
      depth,
    );
    enqueue({ type: 'page-changed', name: 'page-changed', payload: { from, to: target } }, depth);
  };
  const hiddenAtStart = new Map(
    document.components.map((component) => [component.id, component.status.hidden]),
  );
  const visibleNow = (id: string): boolean =>
    visibility.get(id) ?? !(hiddenAtStart.get(id) ?? false);

  let failure: ScreenBlueprintSimulation['failure'];
  while (queue.length > 0) {
    const { event: current, depth } = queue.shift() as (typeof queue)[number];
    if (depth > SCREEN_BLUEPRINT_SIMULATION_MAX_DEPTH) {
      failure = {
        kind: 'depth-exceeded',
        depth,
        message: 'Blueprint cascade exceeds the depth limit.',
      };
      break;
    }
    const traced = traceScreenBlueprintEvent(plan, variables, current);
    if (!traced.ok) {
      failure = {
        kind: 'dispatch-failed',
        depth,
        message: traced.diagnostics[0]?.message ?? 'Blueprint dispatch failed.',
      };
      break;
    }
    dispatches.push({
      depth,
      event: current,
      ruleTraces: traced.value.ruleTraces,
      result: traced.value,
    });
    const next = traced.value.variables;
    for (const [variableId, value] of Object.entries(next)) {
      if (variableId in variables && screenJsonEquals(value, variables[variableId] ?? null))
        continue;
      enqueue(
        { type: 'variable-event', variableId, name: 'data-updated', payload: value },
        depth + 1,
      );
    }
    variables = next;
    for (const effect of traced.value.visibilityEffects) {
      const now = visibleNow(effect.componentId);
      visibility.set(
        effect.componentId,
        effect.operation === 'show' ? true : effect.operation === 'hide' ? false : !now,
      );
    }
    variableRequests.push(...traced.value.variableRequests);
    componentDataRequests.push(...traced.value.componentDataRequests);
    for (const effect of traced.value.canvasEffects) {
      if (effect.type === 'page-navigation') {
        if (effect.operation === 'back') {
          goPage(pageHistory.pop(), undefined, false, depth + 1);
        } else {
          const index = currentPage === null ? -1 : pageIds.indexOf(currentPage);
          goPage(
            pageIds[effect.operation === 'next' ? index + 1 : index - 1],
            undefined,
            true,
            depth + 1,
          );
        }
        continue;
      }
      if (pageIds.includes(effect.canvasId)) {
        const open =
          effect.operation === 'open' ||
          (effect.operation === 'toggle' && effect.canvasId !== currentPage);
        if (open) goPage(effect.canvasId, effect.payload, true, depth + 1);
        else if (effect.canvasId === currentPage)
          goPage(pageHistory.pop(), undefined, false, depth + 1);
        continue;
      }
      const open =
        effect.operation === 'open'
          ? true
          : effect.operation === 'close'
            ? false
            : !openPopups.has(effect.canvasId);
      if (open === openPopups.has(effect.canvasId)) continue;
      if (open) openPopups.add(effect.canvasId);
      else openPopups.delete(effect.canvasId);
      enqueue(
        {
          type: 'canvas-event',
          canvasId: effect.canvasId,
          name: open ? 'opened' : 'closed',
          payload: open ? (effect.payload ?? null) : null,
        },
        depth + 1,
      );
    }
  }

  const changedVariableIds = Object.keys(variables).filter(
    (id) => !screenJsonEquals(variables[id] ?? null, start[id] ?? null),
  );
  const changedVisibility: Record<string, boolean> = {};
  for (const [id, visible] of visibility) {
    if (visible === (hiddenAtStart.get(id) ?? false)) changedVisibility[id] = visible;
  }
  return {
    ok: true,
    value: {
      plan,
      dispatches,
      ...(failure === undefined ? {} : { failure }),
      variables,
      changedVariableIds,
      visibility: changedVisibility,
      dataSourceChanges: dataSourceChanges(document, start, variables),
      openPopupIds: [...openPopups],
      currentPageId: currentPage,
      variableRequests,
      componentDataRequests,
    },
    diagnostics: [],
  };
}

function dataSourceChanges(
  document: ScreenDocument,
  before: ScreenJsonObject,
  after: ScreenJsonObject,
): Record<string, Record<string, ScreenBlueprintSimulationParamChange>> {
  const output: Record<string, Record<string, ScreenBlueprintSimulationParamChange>> = {};
  for (const source of document.dataSources ?? []) {
    for (const [name, ref] of Object.entries(source.params)) {
      if (ref.kind !== 'variable') continue;
      const from = before[ref.variableId] ?? null;
      const to = after[ref.variableId] ?? null;
      if (screenJsonEquals(from, to)) continue;
      output[source.id] = { ...(output[source.id] ?? {}), [name]: { before: from, after: to } };
    }
  }
  return output;
}
