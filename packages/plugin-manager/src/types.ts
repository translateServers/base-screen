import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenPluginCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenPluginPanelCatalog,
  BaseScreenPluginRuntime,
  BaseScreenRuntimeContributionIndex,
  PluginCommandPort,
  PluginCommandRequest,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';

export type BaseScreenPluginManagerStatus =
  | 'inactive'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'failed'
  | 'disposing'
  | 'disposed';

export interface BaseScreenPluginManagerSnapshot {
  readonly materials: BaseScreenMaterialCatalog;
  readonly panels: BaseScreenPluginPanelCatalog;
  readonly inspectorControls: BaseScreenPluginInspectorControlCatalog;
  readonly plugins: BaseScreenPluginCatalog;
  readonly contributions: BaseScreenRuntimeContributionIndex;
}

export interface BaseScreenCustomElementRegistryPort {
  get(tagName: string): BaseScreenMaterialConstructor | undefined;
}

export interface BaseScreenPluginManagerOptions {
  readonly instanceId: string;
  readonly standaloneMaterialTagNames: readonly string[];
  readonly plugins: readonly BaseScreenPluginRuntime[];
  readonly grantedCapabilities: Readonly<Record<string, readonly string[]>>;
  readonly registry: BaseScreenCustomElementRegistryPort;
  /** 可选：仅当插件声明 `command.execute` 能力时才必须有对应工厂；缺省等价于显式 undefined。 */
  readonly createCommandPort?:
    | ((input: { readonly instanceId: string; readonly pluginId: string }) => PluginCommandPort)
    | undefined;
  readonly createDesignReadPort?:
    | ((input: { readonly instanceId: string; readonly pluginId: string }) => PluginDesignReadPort)
    | undefined;
}

export interface BaseScreenPluginManager {
  readonly status: BaseScreenPluginManagerStatus;
  readonly snapshot: BaseScreenPluginManagerSnapshot | undefined;
  activate(): Promise<ScreenParseResult<BaseScreenPluginManagerSnapshot>>;
  deactivate(): Promise<ScreenParseResult<null>>;
  dispose(): Promise<ScreenParseResult<null>>;
  executeContributionCommand(
    request: PluginCommandRequest,
  ): Promise<ScreenParseResult<ScreenJsonValue>>;
}
