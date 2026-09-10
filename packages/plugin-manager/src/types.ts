import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenPluginCatalog,
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
  readonly createCommandPort:
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
