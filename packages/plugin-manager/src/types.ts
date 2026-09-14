import type { ScreenDiagnostic, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenPluginCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenPluginPanelCatalog,
  BaseScreenPluginRuntime,
  BaseScreenRuntimeContributionIndex,
  PluginBlueprintActionRequest,
  PluginCommandPort,
  PluginCommandRequest,
  PluginDataProcessorRequest,
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

/** 单个插件的激活失败记录：失败不扩散，其余插件的贡献照常发布。 */
export interface BaseScreenPluginActivationFailure {
  readonly index: number;
  readonly pluginId: string;
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export interface BaseScreenPluginManagerSnapshot {
  readonly materials: BaseScreenMaterialCatalog;
  readonly panels: BaseScreenPluginPanelCatalog;
  readonly inspectorControls: BaseScreenPluginInspectorControlCatalog;
  readonly plugins: BaseScreenPluginCatalog;
  readonly contributions: BaseScreenRuntimeContributionIndex;
  readonly failures: readonly BaseScreenPluginActivationFailure[];
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
  /** 激活时机：`eager`（缺省）在 activate() 时运行全部插件钩子；`lazy` 把钩子推迟到
   *  该插件贡献首次经 manager 使用（贡献命令、面板动作）或显式 `ensureActive` 时。
   *  预检与目录发布在两种模式下完全一致，授权不因懒激活放松。 */
  readonly activation?: 'eager' | 'lazy';
}

export interface BaseScreenPluginManager {
  readonly status: BaseScreenPluginManagerStatus;
  readonly snapshot: BaseScreenPluginManagerSnapshot | undefined;
  activate(): Promise<ScreenParseResult<BaseScreenPluginManagerSnapshot>>;
  deactivate(): Promise<ScreenParseResult<null>>;
  dispose(): Promise<ScreenParseResult<null>>;
  /** 懒激活模式下显式激活一个尚未运行的插件（含其声明依赖的拓扑前置）。
   *  eager 模式下插件已全部激活，调用等价于空操作。 */
  ensureActive(pluginId: string): Promise<ScreenParseResult<null>>;
  executeContributionCommand(
    request: PluginCommandRequest,
  ): Promise<ScreenParseResult<ScreenJsonValue>>;
  /**
   * 执行一个插件贡献的蓝图动作（ADR-0076）。
   *
   * 宿主把这层接到 `ScreenBlueprintHostActionPort`：Engine 侧只做"该 actionId 是否已声明"
   * 的门禁，实际执行路由到这里——因此未声明的动作失败关闭，而不是落到宿主任意解释。
   */
  executeBlueprintAction(
    request: PluginBlueprintActionRequest,
  ): Promise<ScreenParseResult<ScreenJsonValue>>;
  /**
   * 对上游值应用一个插件贡献的数据处理器（ADR-0076）。
   *
   * 宿主把它组合进自己的变量/数据源解析：`processorId` 命中已声明处理器时路由到这里，
   * 未命中则失败关闭。处理器是同 realm 受信代码，不代表 Base Screen 获得数据加工职责。
   */
  applyDataProcessor(
    request: PluginDataProcessorRequest,
  ): Promise<ScreenParseResult<ScreenJsonValue>>;
}
