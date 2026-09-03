import type {
  ScreenDataBinding,
  ScreenDatasetValueType,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenMaterialErrorCode,
  ScreenParseResult,
  ScreenSize,
} from '@base-screen/contracts';
import type { BaseScreenMaterialEditorDescriptor } from './editor/editor-descriptor.js';

export const BASE_SCREEN_MATERIAL_EVENT = 'base-screen-material-event' as const;

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
  readonly dataCapabilities: readonly ('static' | 'host-resource' | 'variable')[];
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

export type BaseScreenPluginContribution =
  | { readonly kind: 'material'; readonly type: string; readonly tagName: string }
  | {
      readonly kind: 'command';
      readonly id: string;
      readonly name: string;
      readonly requiredCapability: string;
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
  | { readonly kind: 'blueprintCapability'; readonly id: string; readonly name: string };

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

export interface BaseScreenPluginActivationContext {
  readonly instanceId: string;
  readonly pluginId: string;
  readonly grantedCapabilities: readonly string[];
  readonly commandPort: PluginCommandPort | undefined;
}

export interface BaseScreenPluginRuntime {
  readonly manifest: BaseScreenPluginManifest;
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
