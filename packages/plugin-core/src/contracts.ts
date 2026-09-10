import type {
  ScreenDataBinding,
  ScreenDatasetValueType,
  ScreenDocument,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenMaterialErrorCode,
  ScreenParseResult,
  ScreenSize,
} from '@base-screen/contracts';
import type { BaseScreenMaterialEditorDescriptor } from './editor/editor-descriptor.js';

export const BASE_SCREEN_MATERIAL_EVENT = 'base-screen-material-event' as const;

export const BASE_SCREEN_PLUGIN_PANEL_ACTION_EVENT = 'base-screen-plugin-panel-action' as const;

export type BaseScreenMaterialMode = 'design' | 'preview' | 'viewer';

export type BaseScreenMaterialDataState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: ScreenJsonValue }
  | {
      readonly status: 'error';
      readonly code: ScreenMaterialErrorCode;
      readonly message: string;
    };

export interface BaseScreenMaterialModel {
  readonly componentId: string;
  readonly mode: BaseScreenMaterialMode;
  readonly interactive: boolean;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly size: ScreenSize;
  readonly dataState: BaseScreenMaterialDataState;
}

/** ADR-0059 宿主条件样式端口请求：组件身份与其当前完整数据状态（含 idle/loading/error）。 */
export interface BaseScreenConditionalStyleRequest {
  readonly componentId: string;
  readonly dataState: BaseScreenMaterialDataState;
}

/**
 * ADR-0059 宿主条件样式端口：渲染期同步纯函数，相同 (componentId, dataState) 返回相同结果。
 * 返回样式覆盖键值（merge 语义，同 styleRules 的 style），undefined 表示无覆盖；
 * 非法覆盖与抛异常由 Renderer 同路径 fail-closed 隔离。
 */
export interface BaseScreenConditionalStylePort {
  resolve(request: BaseScreenConditionalStyleRequest): ScreenJsonObject | undefined;
}

export type BaseScreenMaterialPropSchema =
  | BaseScreenMaterialStringSchema
  | BaseScreenMaterialNumberSchema
  | BaseScreenMaterialBooleanSchema
  | BaseScreenMaterialEnumSchema
  | BaseScreenMaterialObjectSchema
  | BaseScreenMaterialArraySchema;

export interface BaseScreenMaterialStringSchema {
  readonly kind: 'string';
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}

export interface BaseScreenMaterialNumberSchema {
  readonly kind: 'number';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface BaseScreenMaterialBooleanSchema {
  readonly kind: 'boolean';
}

export interface BaseScreenMaterialEnumSchema {
  readonly kind: 'enum';
  readonly values: readonly (string | number | boolean)[];
}

export interface BaseScreenMaterialObjectSchema {
  readonly kind: 'object';
  readonly properties: Readonly<Record<string, BaseScreenMaterialPropSchema>>;
  readonly required: readonly string[];
}

export interface BaseScreenMaterialArraySchema {
  readonly kind: 'array';
  readonly items: BaseScreenMaterialPropSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface BaseScreenMaterialPropertyPanelField {
  readonly prop: string;
  readonly label: string;
  readonly control: BaseScreenMaterialPanelControl;
  /** `color` 控件是否接受线性/径向渐变；缺省仅接受纯色。 */
  readonly allowGradient?: boolean;
}

export type BaseScreenMaterialPanelControl =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'json';

export interface BaseScreenMaterialStylePanelField {
  readonly style: string;
  readonly label: string;
  readonly control: BaseScreenMaterialPanelControl;
  /** `color` 控件是否接受线性/径向渐变；缺省仅接受纯色。 */
  readonly allowGradient?: boolean;
}

export interface BaseScreenMaterialDesignCapabilities {
  readonly resize: boolean;
  readonly rotate: boolean;
  readonly children: boolean;
}

export interface BaseScreenMaterialDataBindingRole {
  readonly id: string;
  readonly minFields: number;
  readonly maxFields: number;
  readonly valueTypes: readonly ScreenDatasetValueType[];
}

export interface BaseScreenMaterialTabularDataAdapter {
  adapt(request: {
    readonly dataset: import('@base-screen/contracts').ScreenTabularDataset;
    readonly fields: Readonly<
      Record<string, readonly import('@base-screen/contracts').ScreenDatasetField[]>
    >;
  }): ScreenParseResult<ScreenJsonValue>;
}

export type BaseScreenMaterialStaticDataDescriptor =
  | {
      readonly kind: 'scalar';
      readonly valueType: 'string' | 'number' | 'boolean';
      readonly multiline?: boolean;
    }
  | {
      readonly kind: 'tabular';
      readonly defaultBinding: ScreenDataBinding;
    };

export interface BaseScreenMaterialManifest {
  readonly type: string;
  readonly tagName: string;
  readonly name: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly defaultSize: ScreenSize;
  readonly defaultProps: ScreenJsonObject;
  readonly defaultStyle: ScreenJsonObject;
  readonly defaultData?: ScreenJsonValue;
  readonly staticData?: BaseScreenMaterialStaticDataDescriptor;
  readonly propsSchema: BaseScreenMaterialObjectSchema;
  readonly propertyPanel: readonly BaseScreenMaterialPropertyPanelField[];
  readonly styleSchema: BaseScreenMaterialObjectSchema;
  readonly stylePanel: readonly BaseScreenMaterialStylePanelField[];
  readonly events: readonly string[];
  readonly dataCapabilities: readonly ('static' | 'dataset' | 'host-resource' | 'variable')[];
  readonly dataBinding?: { readonly roles: readonly BaseScreenMaterialDataBindingRole[] };
  readonly designCapabilities: BaseScreenMaterialDesignCapabilities;
  readonly libraryVisible?: boolean;
  /** 可选：宿主提供的封面图 URL，仅用于 Designer 物料库卡片展示。 */
  readonly cover?: string;
  /** 可选：JSON-safe 声明式作者描述（appearance/data/interaction/events）。 */
  readonly editorDescriptor?: BaseScreenMaterialEditorDescriptor;
}

export interface BaseScreenMaterialElement extends HTMLElement {
  model: BaseScreenMaterialModel;
}

export interface BaseScreenMaterialConstructor extends CustomElementConstructor {
  readonly manifest: BaseScreenMaterialManifest;
  readonly tabularDataAdapter?: BaseScreenMaterialTabularDataAdapter;
}

export interface BaseScreenMaterialEventDetail {
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface BaseScreenMaterialCatalogEntry {
  readonly manifest: BaseScreenMaterialManifest;
  readonly constructor: BaseScreenMaterialConstructor;
  readonly tabularDataAdapter?: BaseScreenMaterialTabularDataAdapter;
}

export interface BaseScreenMaterialCatalog {
  get(type: string): BaseScreenMaterialCatalogEntry | undefined;
  has(type: string): boolean;
  list(): readonly BaseScreenMaterialCatalogEntry[];
}

export interface BaseScreenPluginDependency {
  readonly id: string;
}

export type BaseScreenPluginCommandMenu =
  | 'commandPalette'
  | 'menu.tools'
  | 'context.canvas'
  | 'context.component'
  | 'context.multi';

export type BaseScreenPluginContribution =
  | { readonly kind: 'material'; readonly type: string; readonly tagName: string }
  | {
      readonly kind: 'command';
      readonly id: string;
      readonly name: string;
      readonly requiredCapability: string;
      /** 省略时仅出现在命令面板。写出时为完整列表；空数组表示不投影到任何 chrome。 */
      readonly menus?: readonly BaseScreenPluginCommandMenu[];
      /** 与内建操作或工具 chord 冲突时忽略快捷键，命令仍可通过菜单或面板调用。 */
      readonly shortcut?: string;
    }
  | {
      readonly kind: 'dataResourceType';
      readonly id: string;
      readonly name: string;
      readonly configSchema: BaseScreenMaterialObjectSchema;
      /** 显式共享声明（Data Runtime Hardening / DRH-R2）：仅 'resource' 开启同实例
       *  in-flight 共享；缺省为组件域，不共享。仅作声明，不含其它运行时语义。 */
      readonly queryScope?: 'resource';
    }
  | { readonly kind: 'blueprintCapability'; readonly id: string; readonly name: string }
  | {
      readonly kind: 'panel';
      readonly id: string;
      readonly name: string;
      /** 由宿主 registry 解析的 custom element 标签；面板元素接收设计快照作为 model。 */
      readonly tagName: string;
    };

export interface BaseScreenRuntimeContributionIndex {
  getResourceType(
    resourceType: string,
  ): (BaseScreenPluginContribution & { readonly kind: 'dataResourceType' }) | undefined;
  hasBlueprintCapability(capability: string): boolean;
}

export interface BaseScreenPluginManifest {
  readonly id: string;
  readonly dependencies: readonly BaseScreenPluginDependency[];
  readonly capabilities: readonly string[];
  readonly contributions: readonly BaseScreenPluginContribution[];
}

export interface PluginCommandRequest {
  readonly commandId: string;
  readonly args: ScreenJsonValue;
}

export interface PluginCommandPort {
  execute(request: PluginCommandRequest): Promise<ScreenParseResult<ScreenJsonValue>>;
}

/** 一次读取内的文档与选区快照：取自同一时刻，避免插件跨两次读取拼出撕裂状态。 */
export interface BaseScreenPluginDesignSnapshot {
  readonly document: ScreenDocument;
  readonly selectedComponentIds: readonly string[];
  readonly focusedComponentId: string | null;
}

/** 只读侧端口；与 PluginCommandPort 同为异步，便于宿主经跨realm代理满足同一形状。 */
export interface PluginDesignReadPort {
  read(): Promise<ScreenParseResult<BaseScreenPluginDesignSnapshot>>;
}

/** 面板派发的动作；`panelId` 用于拒绝某个面板冒充另一个面板。 */
export interface BaseScreenPluginPanelActionDetail {
  readonly panelId: string;
  readonly commandId: string;
  readonly args: ScreenJsonValue;
}

/** 与 BaseScreenMaterialElement 同形：宿主写入 model，元素自行渲染；不得注入 render function 或 DOM 节点。 */
export interface BaseScreenPluginPanelElement extends HTMLElement {
  model: BaseScreenPluginDesignSnapshot;
}

export type BaseScreenPluginCommandHandler = (
  args: ScreenJsonValue,
) => void | ScreenParseResult<ScreenJsonValue> | Promise<void | ScreenParseResult<ScreenJsonValue>>;

export interface BaseScreenPluginActivationContext {
  readonly instanceId: string;
  readonly pluginId: string;
  readonly grantedCapabilities: readonly string[];
  readonly commandPort: PluginCommandPort | undefined;
  readonly designReadPort: PluginDesignReadPort | undefined;
}

export interface BaseScreenPluginRuntime {
  readonly manifest: BaseScreenPluginManifest;
  readonly commands?: Readonly<Record<string, BaseScreenPluginCommandHandler>>;
  activate(context: BaseScreenPluginActivationContext): void | Promise<void>;
  deactivate(): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export interface BaseScreenPluginCatalogEntry {
  readonly manifest: BaseScreenPluginManifest;
  readonly grantedCapabilities: readonly string[];
  readonly contributions: readonly BaseScreenPluginContribution[];
}

export interface BaseScreenPluginCatalog {
  get(pluginId: string): BaseScreenPluginCatalogEntry | undefined;
  has(pluginId: string): boolean;
  list(): readonly BaseScreenPluginCatalogEntry[];
}

export interface BaseScreenPluginPanelConstructor extends CustomElementConstructor {
  new (): BaseScreenPluginPanelElement;
}

export interface BaseScreenPluginPanelCatalogEntry {
  /** 面板归属插件；用于拒绝某个面板冒充另一个面板或另一插件的面板。 */
  readonly pluginId: string;
  readonly contribution: BaseScreenPluginContribution & { readonly kind: 'panel' };
  readonly constructor: BaseScreenPluginPanelConstructor;
}

export interface BaseScreenPluginPanelCatalog {
  get(panelId: string): BaseScreenPluginPanelCatalogEntry | undefined;
  has(panelId: string): boolean;
  list(): readonly BaseScreenPluginPanelCatalogEntry[];
}
