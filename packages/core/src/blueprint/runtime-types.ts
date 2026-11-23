import type {
  ScreenBlueprintCanvasEventName,
  ScreenBlueprintCanvasOperation,
  ScreenBlueprintComponentVisibilityAction,
  ScreenBlueprintHostEvent,
  ScreenBlueprintPageNavigationOperation,
  ScreenBlueprintRule,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';

export interface ScreenBlueprintMaterialEvent {
  readonly type?: 'material-event';
  readonly componentId: string;
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface ScreenBlueprintVariableEvent {
  readonly type: 'variable-event';
  readonly variableId: string;
  readonly name: 'data-updated';
  readonly payload: ScreenJsonValue;
}

/** 实例就绪事件：文档装载/替换后发射一次，payload 恒为 null。 */
export interface ScreenBlueprintLifecycleEvent {
  readonly type: 'lifecycle';
  readonly name: 'ready';
  readonly payload: ScreenJsonValue;
}

/** 定时器事件：intervalSeconds 标识是哪一个间隔的 tick，不同间隔互不串扰。 */
export interface ScreenBlueprintTimerEvent {
  readonly type: 'timer';
  readonly name: 'tick';
  readonly intervalSeconds: number;
  readonly payload: ScreenJsonValue;
}

/**
 * 从画布事件（ADR-0109）：页面进入 / 离开、弹框打开 / 关闭后由运行时发射。
 * 「已打开」的负载是打开参数（未带参数为 null），「已关闭」恒为 null。
 */
export interface ScreenBlueprintCanvasEvent {
  readonly type: 'canvas-event';
  readonly canvasId: string;
  readonly name: ScreenBlueprintCanvasEventName;
  readonly payload: ScreenJsonValue;
}

/** 页面切换后发射一次，负载 `{ from, to }`（页面 id，无则为 null）。 */
export interface ScreenBlueprintPageChangedEvent {
  readonly type: 'page-changed';
  readonly name: 'page-changed';
  readonly payload: ScreenJsonValue;
}

export type ScreenBlueprintEvent =
  | ScreenBlueprintMaterialEvent
  | ScreenBlueprintVariableEvent
  | ScreenBlueprintLifecycleEvent
  | ScreenBlueprintTimerEvent
  | ScreenBlueprintCanvasEvent
  | ScreenBlueprintPageChangedEvent;

export interface ScreenBlueprintCapabilityIndex {
  readonly hasBlueprintCapability: (id: string) => boolean;
}

export interface ScreenBlueprintPlan {
  readonly rules: readonly ScreenBlueprintRule[];
  readonly initialVariables: ScreenJsonObject;
}

export interface ScreenBlueprintDispatchResult {
  readonly variables: ScreenJsonObject;
  readonly hostEvents: readonly ScreenBlueprintHostEvent[];
  readonly hostActions: readonly ScreenBlueprintHostEvent[];
  readonly visibilityEffects: readonly ScreenBlueprintVisibilityEffect[];
  /** 从画布开合与页面导航（ADR-0109），按执行顺序。 */
  readonly canvasEffects: readonly ScreenBlueprintCanvasEffect[];
  readonly variableRequests: readonly string[];
  readonly componentDataRequests: readonly string[];
}

export interface ScreenBlueprintVisibilityEffect {
  readonly componentId: string;
  readonly operation: ScreenBlueprintComponentVisibilityAction['operation'];
  readonly transition?: ScreenBlueprintComponentVisibilityAction['transition'];
}

export type ScreenBlueprintCanvasEffect =
  | {
      readonly type: 'canvas-visibility';
      readonly canvasId: string;
      readonly operation: ScreenBlueprintCanvasOperation;
      /** 打开参数的求值结果；连线未写参数时缺省。 */
      readonly payload?: ScreenJsonValue;
    }
  | {
      readonly type: 'page-navigation';
      readonly operation: ScreenBlueprintPageNavigationOperation;
    };

/** 一次条件求值：`nodeId` 是条件节点，`edgeId` 是进入其 `judge` 的连线。 */
export interface ScreenBlueprintConditionTrace {
  readonly nodeId: string;
  readonly edgeId: string;
  readonly passed: boolean;
}

export interface ScreenBlueprintSetVariableActionTrace {
  readonly type: 'set-variable';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly variableId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintRequestVariableActionTrace {
  readonly type: 'request-variable';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly variableId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintRequestComponentDataActionTrace {
  readonly type: 'request-component-data';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly componentId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintEmitHostEventActionTrace {
  readonly type: 'emit-host-event';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly eventName: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintHostActionTrace {
  readonly type: 'host-action';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly actionId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintComponentVisibilityActionTrace {
  readonly type: 'component-visibility';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly componentId: string;
  readonly operation: ScreenBlueprintComponentVisibilityAction['operation'];
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintCanvasVisibilityActionTrace {
  readonly type: 'canvas-visibility';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly canvasId: string;
  readonly operation: ScreenBlueprintCanvasOperation;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintPageNavigationActionTrace {
  readonly type: 'page-navigation';
  readonly actionIndex: number;
  /** 执行该动作的连线。 */
  readonly edgeId: string;
  readonly operation: ScreenBlueprintPageNavigationOperation;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export type ScreenBlueprintActionTrace =
  | ScreenBlueprintSetVariableActionTrace
  | ScreenBlueprintRequestVariableActionTrace
  | ScreenBlueprintRequestComponentDataActionTrace
  | ScreenBlueprintEmitHostEventActionTrace
  | ScreenBlueprintHostActionTrace
  | ScreenBlueprintComponentVisibilityActionTrace
  | ScreenBlueprintCanvasVisibilityActionTrace
  | ScreenBlueprintPageNavigationActionTrace;

export interface ScreenBlueprintRuleTrace {
  readonly ruleId: string;
  /** 规则的触发节点。 */
  readonly nodeId: string;
  readonly triggerMatched: boolean;
  /** 按求值顺序排列；只含本次真正到达的条件。 */
  readonly conditions: readonly ScreenBlueprintConditionTrace[];
  readonly actions: readonly ScreenBlueprintActionTrace[];
}

export interface ScreenBlueprintTraceResult extends ScreenBlueprintDispatchResult {
  readonly ruleTraces: readonly ScreenBlueprintRuleTrace[];
}
