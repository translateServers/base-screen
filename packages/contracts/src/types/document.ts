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

/**
 * 取值引用：全文档唯一的「接值」表述，JSON-safe。
 *
 * - `inline`：常量值，已由解析器校验为 canonical JSON。
 * - `variable`：读一个变量的当前值；变量自身的 `value` 不得为 `variable`（禁止别名链）。
 * - `data-source-field`：读一个数据源实例结果的字段投影；`path` 为空表示取整个结果。
 */
export type ScreenValueRef =
  | { readonly kind: 'inline'; readonly value: ScreenJsonValue }
  | { readonly kind: 'variable'; readonly variableId: string }
  | {
      readonly kind: 'data-source-field';
      readonly dataSourceId: string;
      readonly path: readonly string[];
    };

export type ScreenValueRefKind = ScreenValueRef['kind'];

/** 数据源来源：四选一，宿主按 kind 分派到对应端口。 */
export type ScreenDataSourceSource =
  | { readonly kind: 'dataset'; readonly datasetId: string }
  | {
      readonly kind: 'host-resource';
      readonly resourceType: string;
      readonly resourceId: string;
    }
  | { readonly kind: 'url-query'; readonly sourceId: string }
  | { readonly kind: 'host-catalog'; readonly sourceId: string };

export type ScreenDataSourceSourceKind = ScreenDataSourceSource['kind'];

export type ScreenUpdatePolicyMode = 'once' | 'manual' | 'auto';

/** 刷新策略：`auto` 必须带 `intervalSeconds`，其余模式禁止带。 */
export interface ScreenUpdatePolicy {
  readonly mode: ScreenUpdatePolicyMode;
  /** 仅 `mode: 'auto'` 允许出现；1..86400 的整数（秒）。 */
  readonly intervalSeconds?: number;
}

/** 文档级命名取数管道：请求身份与刷新策略的唯一落点。JSON-safe。 */
export interface ScreenDataSource {
  readonly id: string;
  readonly name: string;
  readonly source: ScreenDataSourceSource;
  readonly params: Readonly<Record<string, ScreenValueRef>>;
  readonly updatePolicy?: ScreenUpdatePolicy;
  readonly processorId?: string;
  /** 宿主在文档写入路径（导入/生成）中声明的只读；Engine 只读不写。 */
  readonly readOnly?: boolean;
}

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
  /** 旧形态：组件自带的数据源配置。与 `dataValue` 互斥，解析期 fail-closed。 */
  readonly dataSource: ScreenComponentDataSource | null;
  /** 取值引用；`null` = 不取值。与 `dataSource` 同一位置只能有一个写入口。 */
  readonly dataValue?: ScreenValueRef | null;
  /** 仅当 `dataValue.kind === 'data-source-field'` 且物料声明数据角色时有意义。 */
  readonly dataBinding?: ScreenDataBinding | null;
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

/**
 * 变量的单形态：值是取值引用，`controlled` 声明是否接受外部写入。
 *
 * 变量值只允许 `inline` 与 `data-source-field` —— 变量之间不能互相别名。
 */
export interface ScreenVariableRecord {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly initialValue: ScreenJsonValue;
  readonly value: ScreenValueRef;
  readonly controlled: boolean;
}

/**
 * 文档 `variables` 的元素：过渡容器，同时容纳旧三形态与单形态记录。
 * 消费者统一经 `readScreenVariableRecord` 读，不直接判别成员形态。
 */
export type ScreenVariableEntry = ScreenVariable | ScreenVariableRecord;

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

export type ScreenBlueprintSemanticRelationRole = 'related' | 'detail' | 'group' | 'drill-down';

export type ScreenBlueprintRelationTarget =
  | { readonly kind: 'component'; readonly componentId: string }
  | { readonly kind: 'variable'; readonly variableId: string }
  | { readonly kind: 'host' };

export type ScreenBlueprintRelationSource =
  | {
      readonly kind: 'component';
      readonly componentId: string;
      readonly event: { readonly type: 'material-event'; readonly eventName: string };
    }
  | {
      readonly kind: 'variable';
      readonly variableId: string;
      readonly event: {
        readonly type: 'variable-event';
        readonly eventName: 'data-updated' | 'request-state';
      };
    };

export type ScreenBlueprintRelationEffect =
  | {
      readonly type: 'component-visibility';
      readonly operation: ScreenBlueprintVisibilityOperation;
      readonly transition?: ScreenBlueprintVisibilityTransition;
    }
  | { readonly type: 'request-component-data' }
  | { readonly type: 'set-variable'; readonly value: ScreenBlueprintValueExpression }
  | { readonly type: 'request-variable' }
  | {
      readonly type: 'emit-host-event';
      readonly eventName: string;
      readonly payload: ScreenBlueprintValueExpression;
    }
  | {
      readonly type: 'host-action';
      readonly actionId: string;
      readonly payload: ScreenBlueprintValueExpression;
    };

/** 一条行为关系恰好产生一个既有 action；目标身份只在 `target` 出现一次。 */
export interface ScreenBlueprintBehaviorRelation {
  readonly type: 'behavior';
  readonly id: string;
  readonly source: ScreenBlueprintRelationSource;
  readonly condition?: ScreenBlueprintCondition;
  readonly target: ScreenBlueprintRelationTarget;
  readonly effect: ScreenBlueprintRelationEffect;
  readonly requiredCapabilities?: readonly string[];
}

/** 只描述组件之间的业务含义，不参与运行时。 */
export interface ScreenBlueprintSemanticRelation {
  readonly type: 'semantic';
  readonly id: string;
  readonly source: { readonly kind: 'component'; readonly componentId: string };
  readonly target: { readonly kind: 'component'; readonly componentId: string };
  readonly role: ScreenBlueprintSemanticRelationRole;
}

export type ScreenBlueprintRelation =
  | ScreenBlueprintBehaviorRelation
  | ScreenBlueprintSemanticRelation;

/**
 * 派生运行时形态：不属于文档、不得持久化。
 * `relationIds[i]` 与 `actions[i]` 一一对应；`id` 是组内首条关系的 id。
 */
export interface ScreenBlueprintRule {
  readonly id: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly requiredCapabilities?: readonly string[];
  readonly condition?: ScreenBlueprintCondition;
  readonly actions: readonly ScreenBlueprintAction[];
  readonly relationIds: readonly string[];
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
  readonly relations: readonly ScreenBlueprintRelation[];
  readonly layout?: ScreenBlueprintLayout;
}

export interface ScreenDocument {
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  /** 文档级数据源实例；缺省视为空集（解析器会补 `[]`）。 */
  readonly dataSources?: readonly ScreenDataSource[];
  readonly variables: readonly ScreenVariableEntry[];
  readonly blueprint: ScreenBlueprint;
}
