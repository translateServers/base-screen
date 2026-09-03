import type {
  ScreenBlueprintComponentVisibilityAction,
  ScreenBlueprintHostEvent,
  ScreenDocument,
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
  readonly name: 'data-updated' | 'request-state';
  readonly payload: ScreenJsonValue;
}

export type ScreenBlueprintEvent = ScreenBlueprintMaterialEvent | ScreenBlueprintVariableEvent;

export interface ScreenBlueprintCapabilityIndex {
  readonly hasBlueprintCapability: (id: string) => boolean;
}

export interface ScreenBlueprintPlan {
  readonly rules: ScreenDocument['blueprint']['rules'];
  readonly initialVariables: ScreenJsonObject;
}

export interface ScreenBlueprintDispatchResult {
  readonly variables: ScreenJsonObject;
  readonly hostEvents: readonly ScreenBlueprintHostEvent[];
  readonly hostActions: readonly ScreenBlueprintHostEvent[];
  readonly visibilityEffects: readonly ScreenBlueprintVisibilityEffect[];
  readonly variableRequests: readonly string[];
  readonly componentDataRequests: readonly string[];
}

export interface ScreenBlueprintVisibilityEffect {
  readonly componentId: string;
  readonly operation: ScreenBlueprintComponentVisibilityAction['operation'];
  readonly transition?: ScreenBlueprintComponentVisibilityAction['transition'];
}

export type ScreenBlueprintConditionTraceState = 'not-evaluated' | 'none' | 'passed' | 'failed';

export interface ScreenBlueprintSetVariableActionTrace {
  readonly type: 'set-variable';
  readonly actionIndex: number;
  readonly variableId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintRequestVariableActionTrace {
  readonly type: 'request-variable';
  readonly actionIndex: number;
  readonly variableId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintRequestComponentDataActionTrace {
  readonly type: 'request-component-data';
  readonly actionIndex: number;
  readonly componentId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintEmitHostEventActionTrace {
  readonly type: 'emit-host-event';
  readonly actionIndex: number;
  readonly eventName: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintHostActionTrace {
  readonly type: 'host-action';
  readonly actionIndex: number;
  readonly actionId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintComponentVisibilityActionTrace {
  readonly type: 'component-visibility';
  readonly actionIndex: number;
  readonly componentId: string;
  readonly operation: ScreenBlueprintComponentVisibilityAction['operation'];
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export type ScreenBlueprintActionTrace =
  | ScreenBlueprintSetVariableActionTrace
  | ScreenBlueprintRequestVariableActionTrace
  | ScreenBlueprintRequestComponentDataActionTrace
  | ScreenBlueprintEmitHostEventActionTrace
  | ScreenBlueprintHostActionTrace
  | ScreenBlueprintComponentVisibilityActionTrace;

export interface ScreenBlueprintRuleTrace {
  readonly ruleId: string;
  readonly triggerMatched: boolean;
  readonly condition: ScreenBlueprintConditionTraceState;
  readonly actions: readonly ScreenBlueprintActionTrace[];
}

export interface ScreenBlueprintTraceResult extends ScreenBlueprintDispatchResult {
  readonly ruleTraces: readonly ScreenBlueprintRuleTrace[];
}
