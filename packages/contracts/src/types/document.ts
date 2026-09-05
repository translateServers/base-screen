import type { ScreenJsonObject, ScreenJsonValue } from './json.js';

export type ScreenCanvasBackgroundImageFit = 'cover' | 'contain';

export type ScreenCanvasBackgroundType = 'solid' | 'linear-gradient' | 'radial-gradient';

export interface ScreenCanvasColorStop {
  readonly color: string;
  readonly position: number;
}

export type ScreenCanvasBackground =
  | { readonly type: 'solid'; readonly color: string }
  | {
      readonly type: 'linear-gradient';
      readonly angle: number;
      readonly stops: readonly ScreenCanvasColorStop[];
    }
  | {
      readonly type: 'radial-gradient';
      readonly position: { readonly x: number; readonly y: number };
      readonly stops: readonly ScreenCanvasColorStop[];
    };

export interface ScreenCanvas {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
  readonly background?: ScreenCanvasBackground;
  readonly backgroundImage?: string;
  readonly backgroundImageFit?: ScreenCanvasBackgroundImageFit;
}

export interface ScreenPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenComponentStatus {
  readonly locked: boolean;
  readonly hidden: boolean;
}

export interface ScreenStaticDataSource {
  readonly type: 'static';
  readonly value: ScreenJsonValue;
  readonly binding?: ScreenDataBinding;
}

export type ScreenHostResourceParameter =
  | { readonly kind: 'literal'; readonly value: ScreenJsonValue }
  | { readonly kind: 'variable'; readonly variableId: string };

export interface ScreenDataBinding {
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export type ScreenHostResourceBinding = ScreenDataBinding;

export interface ScreenDatasetDataSource {
  readonly type: 'dataset';
  readonly datasetId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly binding: ScreenDataBinding | null;
}

export interface ScreenHostResourceDataSource {
  readonly type: 'host-resource';
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly binding: ScreenDataBinding | null;
}

export interface ScreenVariableDataSource {
  readonly type: 'variable';
  readonly variableId: string;
  readonly binding?: ScreenDataBinding;
  readonly processorId?: string;
}

export type ScreenComponentDataSource =
  | ScreenStaticDataSource
  | ScreenDatasetDataSource
  | ScreenHostResourceDataSource
  | ScreenVariableDataSource;

export type ScreenComponentStyleRuleOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'exists';

export interface ScreenComponentStyleRuleCondition {
  readonly path: readonly string[];
  readonly operator: ScreenComponentStyleRuleOperator;
  readonly value?: ScreenJsonValue;
}

export interface ScreenComponentStyleRule {
  readonly id: string;
  readonly when: ScreenComponentStyleRuleCondition;
  readonly style: ScreenJsonObject;
}

export interface ScreenComponentNode {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly position: ScreenPosition;
  readonly size: ScreenSize;
  readonly rotation: number;
  readonly zIndex: number;
  readonly status: ScreenComponentStatus;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly styleRules?: readonly ScreenComponentStyleRule[];
  readonly dataSource: ScreenComponentDataSource | null;
}

export interface ScreenVariableBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly initialValue: ScreenJsonValue;
}

export interface ScreenStaticVariable extends ScreenVariableBase {
  readonly type: 'static';
}

export interface ScreenVariableAutoUpdate {
  readonly intervalSeconds: number;
}

export interface ScreenDataSourceVariable extends ScreenVariableBase {
  readonly type: 'data-source';
  readonly sourceId: string;
  readonly processorId?: string;
  readonly controlled: boolean;
  readonly autoUpdate?: ScreenVariableAutoUpdate;
}

export interface ScreenUrlQueryVariable extends ScreenVariableBase {
  readonly type: 'url-query';
  readonly sourceId: string;
  readonly processorId?: string;
  readonly controlled: boolean;
}

export type ScreenDynamicVariable = ScreenDataSourceVariable | ScreenUrlQueryVariable;

export type ScreenVariable = ScreenStaticVariable | ScreenDynamicVariable;

export interface ScreenBlueprintMaterialEventTrigger {
  readonly type: 'material-event';
  readonly componentId: string;
  readonly eventName: string;
}

export interface ScreenBlueprintVariableEventTrigger {
  readonly type: 'variable-event';
  readonly variableId: string;
  readonly eventName: 'data-updated' | 'request-state';
}

export type ScreenBlueprintTrigger =
  | ScreenBlueprintMaterialEventTrigger
  | ScreenBlueprintVariableEventTrigger;

export type ScreenBlueprintValueExpression =
  | { readonly kind: 'literal'; readonly value: ScreenJsonValue }
  | { readonly kind: 'event-payload'; readonly path: readonly string[] }
  | { readonly kind: 'variable'; readonly variableId: string }
  | { readonly kind: 'array'; readonly items: readonly ScreenBlueprintValueExpression[] }
  | {
      readonly kind: 'object';
      readonly properties: Readonly<Record<string, ScreenBlueprintValueExpression>>;
    };

export interface ScreenBlueprintCondition {
  readonly left: ScreenBlueprintValueExpression;
  readonly operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  readonly right?: ScreenBlueprintValueExpression;
}

export interface ScreenBlueprintSetVariableAction {
  readonly type: 'set-variable';
  readonly variableId: string;
  readonly value: ScreenBlueprintValueExpression;
}

export interface ScreenBlueprintRequestVariableAction {
  readonly type: 'request-variable';
  readonly variableId: string;
}

export interface ScreenBlueprintRequestComponentDataAction {
  readonly type: 'request-component-data';
  readonly componentId: string;
}

export interface ScreenBlueprintEmitHostEventAction {
  readonly type: 'emit-host-event';
  readonly eventName: string;
  readonly payload: ScreenBlueprintValueExpression;
}

export interface ScreenBlueprintHostAction {
  readonly type: 'host-action';
  readonly actionId: string;
  readonly payload: ScreenBlueprintValueExpression;
}

export type ScreenBlueprintVisibilityOperation = 'show' | 'hide' | 'toggle';

export type ScreenBlueprintVisibilityTransitionEffect = 'appear' | 'fade' | 'slide-up';

export type ScreenBlueprintVisibilityTransitionEasing =
  | 'linear'
  | 'ease-in-out-quad'
  | 'ease-in-out-expo';

export interface ScreenBlueprintVisibilityTransition {
  readonly effect: ScreenBlueprintVisibilityTransitionEffect;
  readonly durationMs: number;
  readonly easing: ScreenBlueprintVisibilityTransitionEasing;
}

export interface ScreenBlueprintComponentVisibilityAction {
  readonly type: 'component-visibility';
  readonly componentId: string;
  readonly operation: ScreenBlueprintVisibilityOperation;
  readonly transition?: ScreenBlueprintVisibilityTransition;
}

export type ScreenBlueprintAction =
  | ScreenBlueprintSetVariableAction
  | ScreenBlueprintRequestVariableAction
  | ScreenBlueprintRequestComponentDataAction
  | ScreenBlueprintEmitHostEventAction
  | ScreenBlueprintHostAction
  | ScreenBlueprintComponentVisibilityAction;

export interface ScreenBlueprintRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly requiredCapabilities?: readonly string[];
  readonly condition?: ScreenBlueprintCondition;
  readonly actions: readonly ScreenBlueprintAction[];
}

export interface ScreenBlueprintLayoutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly collapsed?: boolean;
}

export interface ScreenBlueprintLayoutViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ScreenBlueprintLayout {
  readonly nodes: readonly ScreenBlueprintLayoutNode[];
  readonly viewport?: ScreenBlueprintLayoutViewport;
}

export interface ScreenBlueprint {
  readonly rules: readonly ScreenBlueprintRule[];
  readonly layout?: ScreenBlueprintLayout;
}

export interface ScreenDocument {
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenVariable[];
  readonly blueprint: ScreenBlueprint;
}
