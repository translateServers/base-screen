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
  | { readonly kind: 'variable'; readonly name: string };

export interface ScreenDataBinding {
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export type ScreenHostResourceBinding = ScreenDataBinding;

export interface ScreenHostResourceDataSource {
  readonly type: 'host-resource';
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly binding: ScreenDataBinding | null;
}

export type ScreenComponentDataSource = ScreenStaticDataSource | ScreenHostResourceDataSource;

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

export interface ScreenStaticVariable {
  readonly type: 'static';
  readonly name: string;
  readonly value: ScreenJsonValue;
}

export interface ScreenHostVariable {
  readonly type: 'host';
  readonly name: string;
  readonly variableId: string;
}

export type ScreenVariable = ScreenStaticVariable | ScreenHostVariable;

export interface ScreenBlueprintMaterialEventTrigger {
  readonly type: 'material-event';
  readonly componentId: string;
  readonly eventName: string;
}

export type ScreenBlueprintValueExpression =
  | { readonly kind: 'literal'; readonly value: ScreenJsonValue }
  | { readonly kind: 'event-payload'; readonly path: readonly string[] }
  | { readonly kind: 'variable'; readonly name: string }
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
  readonly variableName: string;
  readonly value: ScreenBlueprintValueExpression;
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

export type ScreenBlueprintAction =
  | ScreenBlueprintSetVariableAction
  | ScreenBlueprintEmitHostEventAction
  | ScreenBlueprintHostAction;

export interface ScreenBlueprintRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintMaterialEventTrigger;
  readonly requiredCapabilities?: readonly string[];
  readonly condition?: ScreenBlueprintCondition;
  readonly actions: readonly ScreenBlueprintAction[];
}

export interface ScreenBlueprint {
  readonly rules: readonly ScreenBlueprintRule[];
}

export interface ScreenDocument {
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenVariable[];
  readonly blueprint: ScreenBlueprint;
}
