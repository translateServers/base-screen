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

/** 文档级主题色位（ADR-0098）：固定语义槽，色板具体颜色由文档携带。 */
export type ScreenThemeSlot =
  | 'primary'
  | 'text'
  | 'textSecondary'
  | 'background'
  | 'accent'
  | 'accentSecondary';

export interface ScreenTheme {
  readonly palette: Readonly<Record<ScreenThemeSlot, string>>;
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

export type ScreenUpdatePolicyMode = 'once' | 'manual' | 'auto' | 'push';

/**
 * `push` 实例的保留窗口（ADR-0104 §2.5）。`seconds` 与 `timeField` 必须同时出现或同时省略。
 */
export interface ScreenPushRetainPolicy {
  /** 最多保留的行数，1..10000；省略时运行时取 1000。 */
  readonly rows?: number;
  /** 只保留 `timeField` 落在「最新一行时间 − seconds」之后的行，1..604800。 */
  readonly seconds?: number;
  /** 时间字段 id：取值须为 epoch 毫秒数或 ISO-8601 字符串。 */
  readonly timeField?: string;
}

/**
 * 刷新策略。
 * - `auto` 必须带 `intervalSeconds`，其余模式禁止带；
 * - `fallbackIntervalSeconds` 与 `retain` 只允许出现在 `push`；
 * - `url-query` 来源禁止 `push`（由实例级校验保证）。
 */
export interface ScreenUpdatePolicy {
  readonly mode: ScreenUpdatePolicyMode;
  /** 仅 `mode: 'auto'` 允许出现；1..86400 的整数（秒）。 */
  readonly intervalSeconds?: number;
  /** 仅 `mode: 'push'`：订阅不可用或连接 suspended 时回退轮询的间隔，1..86400 秒。 */
  readonly fallbackIntervalSeconds?: number;
  /** 仅 `mode: 'push'`：`append` 增量下的保留窗口。 */
  readonly retain?: ScreenPushRetainPolicy;
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
  /**
   * 所属从画布（ADR-0109）：只允许写在根组件（`parentId === null`）上，子组件随根组件归属。
   * 缺省即属于主画布。页面从画布与主画布同坐标系；弹框从画布的坐标相对面板左上角。
   */
  readonly canvasId?: string;
  /**
   * 只对主画布根组件有效：置于当前页内容之下（整屏背景装饰等，ADR-0109 D1）。
   * 缺省即在页面之上；只写 `true`。
   */
  readonly belowSubCanvas?: true;
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
  readonly eventName: 'data-updated';
}

/** 实例级触发器：文档装载/替换后就绪一次，不绑定任何组件或变量。 */
export interface ScreenBlueprintLifecycleTrigger {
  readonly type: 'lifecycle';
  readonly eventName: 'ready';
}

/** 实例内定时器触发器：按间隔重复发射 tick，间隔单位为秒。 */
export interface ScreenBlueprintTimerTrigger {
  readonly type: 'timer';
  readonly eventName: 'tick';
  readonly intervalSeconds: number;
}

/** 从画布事件触发器（ADR-0109）：页面进入 / 离开、弹框打开 / 关闭后发射一次。 */
export interface ScreenBlueprintCanvasTrigger {
  readonly type: 'canvas-event';
  readonly canvasId: string;
  readonly eventName: ScreenBlueprintCanvasEventName;
}

export type ScreenBlueprintCanvasEventName = 'opened' | 'closed';

/** 页面切换后发射一次（主画布节点的 `page-changed`），负载 `{ from, to }`。 */
export interface ScreenBlueprintPageChangedTrigger {
  readonly type: 'page-changed';
  readonly eventName: 'page-changed';
}

export type ScreenBlueprintTrigger =
  | ScreenBlueprintMaterialEventTrigger
  | ScreenBlueprintVariableEventTrigger
  | ScreenBlueprintLifecycleTrigger
  | ScreenBlueprintTimerTrigger
  | ScreenBlueprintCanvasTrigger
  | ScreenBlueprintPageChangedTrigger;

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

export type ScreenBlueprintCanvasOperation = 'open' | 'close' | 'toggle';

/**
 * 打开 / 关闭 / 切换从画布（ADR-0109 §2.4）：页面 = 切页 / 返回上一页，弹框 = 打开 / 关闭。
 */
export interface ScreenBlueprintCanvasVisibilityAction {
  readonly type: 'canvas-visibility';
  readonly canvasId: string;
  readonly operation: ScreenBlueprintCanvasOperation;
  /** 打开参数：只在 `open` / `toggle` 上出现，作为该从画布「已打开」事件的负载。 */
  readonly payload?: ScreenBlueprintValueExpression;
}

export type ScreenBlueprintPageNavigationOperation = 'previous' | 'next' | 'back';

/** 页面导航（主画布节点）：按从画布顺序前后翻页，或返回历史中的上一页。 */
export interface ScreenBlueprintPageNavigationAction {
  readonly type: 'page-navigation';
  readonly operation: ScreenBlueprintPageNavigationOperation;
}

export type ScreenBlueprintAction =
  | ScreenBlueprintSetVariableAction
  | ScreenBlueprintRequestVariableAction
  | ScreenBlueprintRequestComponentDataAction
  | ScreenBlueprintEmitHostEventAction
  | ScreenBlueprintHostAction
  | ScreenBlueprintComponentVisibilityAction
  | ScreenBlueprintCanvasVisibilityAction
  | ScreenBlueprintPageNavigationAction;

export type ScreenBlueprintSemanticRole = 'related' | 'detail' | 'group' | 'drill-down';

/** 节点图的节点种类（ADR-0107 §2.1）。 */
export type ScreenBlueprintNodeKind =
  | 'component'
  | 'variable'
  | 'host'
  | 'lifecycle'
  | 'timer'
  | 'condition'
  | 'sub-canvas'
  | 'main-canvas';

interface ScreenBlueprintNodeBase {
  readonly id: string;
  /** 缺省即启用；停用只写 `false`，写 `true` 解析失败。 */
  readonly enabled?: false;
}

export interface ScreenBlueprintComponentNode extends ScreenBlueprintNodeBase {
  readonly kind: 'component';
  readonly componentId: string;
}

export interface ScreenBlueprintVariableNode extends ScreenBlueprintNodeBase {
  readonly kind: 'variable';
  readonly variableId: string;
}

export interface ScreenBlueprintHostNode extends ScreenBlueprintNodeBase {
  readonly kind: 'host';
}

export interface ScreenBlueprintLifecycleNode extends ScreenBlueprintNodeBase {
  readonly kind: 'lifecycle';
}

export interface ScreenBlueprintTimerNode extends ScreenBlueprintNodeBase {
  readonly kind: 'timer';
  readonly intervalSeconds: number;
  readonly name?: string;
}

export interface ScreenBlueprintConditionNode extends ScreenBlueprintNodeBase {
  readonly kind: 'condition';
  readonly condition: ScreenBlueprintCondition;
  readonly name?: string;
}

/**
 * 从画布节点（ADR-0109）：每个从画布至多一个；输入 open / close / toggle，输出 opened / closed。
 * 锚点与显示方式无关，切换页面 / 弹框不影响连线。
 */
export interface ScreenBlueprintSubCanvasNode extends ScreenBlueprintNodeBase {
  readonly kind: 'sub-canvas';
  readonly canvasId: string;
}

/** 主画布节点（单例，页面导航）：输入 previous / next / back，输出 page-changed。 */
export interface ScreenBlueprintMainCanvasNode extends ScreenBlueprintNodeBase {
  readonly kind: 'main-canvas';
}

export type ScreenBlueprintNode =
  | ScreenBlueprintComponentNode
  | ScreenBlueprintVariableNode
  | ScreenBlueprintHostNode
  | ScreenBlueprintLifecycleNode
  | ScreenBlueprintTimerNode
  | ScreenBlueprintConditionNode
  | ScreenBlueprintSubCanvasNode
  | ScreenBlueprintMainCanvasNode;

export interface ScreenBlueprintPortRef {
  readonly node: string;
  readonly port: string;
}

/**
 * 执行流连线：从输出锚点到输入锚点。附加字段只在目标锚点需要时出现：
 * 变量 `set` 必带 `value`，宿主 `event:*` / `action:*` 必带 `payload`，组件显隐可带 `transition`。
 */
export interface ScreenBlueprintFlowEdge {
  readonly kind: 'flow';
  readonly id: string;
  readonly from: ScreenBlueprintPortRef;
  readonly to: ScreenBlueprintPortRef;
  readonly value?: ScreenBlueprintValueExpression;
  readonly payload?: ScreenBlueprintValueExpression;
  readonly transition?: ScreenBlueprintVisibilityTransition;
  readonly requiredCapabilities?: readonly string[];
}

/** 只描述组件之间的业务含义，不参与运行时。 */
export interface ScreenBlueprintSemanticEdge {
  readonly kind: 'semantic';
  readonly id: string;
  readonly from: { readonly node: string };
  readonly to: { readonly node: string };
  readonly role: ScreenBlueprintSemanticRole;
}

export type ScreenBlueprintEdge = ScreenBlueprintFlowEdge | ScreenBlueprintSemanticEdge;

/**
 * 派生运行时形态：不属于文档、不得持久化。一条规则对应一个启用的触发锚点，
 * `steps` 按深度优先顺序排列：条件步骤在到达时求值，再执行 `yes` 或 `no` 分支。
 */
export type ScreenBlueprintRuleStep =
  | {
      readonly type: 'action';
      readonly edgeId: string;
      readonly action: ScreenBlueprintAction;
    }
  | {
      readonly type: 'condition';
      readonly edgeId: string;
      readonly nodeId: string;
      readonly condition: ScreenBlueprintCondition;
      readonly yes: readonly ScreenBlueprintRuleStep[];
      readonly no: readonly ScreenBlueprintRuleStep[];
    };

export interface ScreenBlueprintRule {
  /** `<触发节点 id>/<锚点>`；不持久化。 */
  readonly id: string;
  readonly nodeId: string;
  readonly trigger: ScreenBlueprintTrigger;
  readonly requiredCapabilities?: readonly string[];
  readonly steps: readonly ScreenBlueprintRuleStep[];
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
  readonly nodes: readonly ScreenBlueprintNode[];
  readonly edges: readonly ScreenBlueprintEdge[];
  readonly layout?: ScreenBlueprintLayout;
}

/** 从画布的显示方式（ADR-0109）：页面同一时间只显示一个；弹框以模态浮层盖在最上层。 */
export type ScreenSubCanvasDisplay = 'page' | 'popup';

interface ScreenSubCanvasBase {
  readonly id: string;
  readonly name: string;
}

/** 页面从画布：尺寸与主画布一致；背景可选，缺省透出主画布背景。 */
export interface ScreenPageCanvas extends ScreenSubCanvasBase {
  readonly display: 'page';
  readonly backgroundColor?: string;
  readonly background?: ScreenCanvasBackground;
}

/** 弹框从画布：模态浮层，遮罩铺满画布，面板按位置摆放（ADR-0108 §2.3–§2.6 的行为沿用）。 */
export interface ScreenPopupCanvas extends ScreenSubCanvasBase {
  readonly display: 'popup';
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
  readonly background?: ScreenCanvasBackground;
  /** 面板圆角（px）。 */
  readonly borderRadius: number;
  /** 遮罩颜色。 */
  readonly maskColor: string;
  /** 点击遮罩是否关闭。 */
  readonly closeOnMaskClick: boolean;
  /** 按 Esc 是否关闭（只作用于最上层弹框）。 */
  readonly closeOnEscape: boolean;
  /** 面板在画布上的位置；缺省即居中、无偏移。 */
  readonly placement?: ScreenPopupPlacement;
}

/** 从画布（ADR-0109）：文档里主画布之外的画板；组件经根组件的 `canvasId` 归属。 */
export type ScreenSubCanvas = ScreenPageCanvas | ScreenPopupCanvas;

/** 面板锚点：画布九宫格之一；面板的同名点对齐画布的同名点（ADR-0108 §2.6）。 */
export type ScreenPopupAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface ScreenPopupPlacement {
  readonly anchor: ScreenPopupAnchor;
  /** 对齐后的再偏移（画布像素，向右 / 向下为正）。 */
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ScreenDocument {
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  /** 从画布（页面 / 弹框，ADR-0109）；缺省即单页文档。 */
  readonly subCanvases?: readonly ScreenSubCanvas[];
  /** 起始页：必须是页面从画布；缺省取第一个页面。 */
  readonly startCanvasId?: string;
  /** 文档级数据源实例；缺省视为空集（解析器会补 `[]`）。 */
  readonly dataSources?: readonly ScreenDataSource[];
  readonly variables: readonly ScreenVariableEntry[];
  readonly blueprint: ScreenBlueprint;
  /** 文档级主题色板；缺省表示没有色板，`theme:` 引用此时失败关闭。 */
  readonly theme?: ScreenTheme;
}
