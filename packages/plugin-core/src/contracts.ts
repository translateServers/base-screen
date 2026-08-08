import type {
  ScreenDatasetValueType,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenSize,
} from '@base-screen/contracts';

export const BASE_SCREEN_MATERIAL_EVENT = 'base-screen-material-event' as const;

export type BaseScreenMaterialMode = 'design' | 'preview' | 'viewer';

export type BaseScreenMaterialDataState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: ScreenJsonValue }
  | { readonly status: 'error'; readonly code: string; readonly message: string };

export interface BaseScreenMaterialModel {
  readonly componentId: string;
  readonly mode: BaseScreenMaterialMode;
  readonly interactive: boolean;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly size: ScreenSize;
  readonly dataState: BaseScreenMaterialDataState;
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

export interface BaseScreenMaterialManifest {
  readonly type: string;
  readonly tagName: string;
  readonly name: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly defaultSize: ScreenSize;
  readonly defaultProps: ScreenJsonObject;
  readonly defaultStyle: ScreenJsonObject;
  readonly propsSchema: BaseScreenMaterialObjectSchema;
  readonly propertyPanel: readonly BaseScreenMaterialPropertyPanelField[];
  readonly styleSchema: BaseScreenMaterialObjectSchema;
  readonly stylePanel: readonly BaseScreenMaterialStylePanelField[];
  readonly events: readonly string[];
  readonly dataCapabilities: readonly ('static' | 'host-resource')[];
  readonly dataBinding?: { readonly roles: readonly BaseScreenMaterialDataBindingRole[] };
  readonly designCapabilities: BaseScreenMaterialDesignCapabilities;
  readonly libraryVisible?: boolean;
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
