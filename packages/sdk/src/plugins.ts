import type { ScreenBlueprintCapabilityId, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenPluginRuntime } from '@base-screen/plugin-core';
import type { BaseScreenPluginManagerOptions } from '@base-screen/plugin-manager';
import { definePlugin } from '@base-screen/plugin-sdk';

export * from '@base-screen/plugin-manager';
export * from '@base-screen/plugin-sdk';

export interface CreateBaseScreenBlueprintCapabilityPluginOptions {
  readonly id: string;
  /** 宿主明确支持并授权的能力；词汇由 contracts 唯一定义。 */
  readonly capabilities: readonly ScreenBlueprintCapabilityId[];
}

export interface BaseScreenBlueprintCapabilityPlugin {
  readonly plugin: BaseScreenPluginRuntime;
  readonly grantedCapabilities: NonNullable<BaseScreenPluginManagerOptions['grantedCapabilities']>;
}

/** 为既有 manager 生成同源的蓝图贡献与授权，返回后仍由宿主决定是否安装。 */
export function createBaseScreenBlueprintCapabilityPlugin(
  options: CreateBaseScreenBlueprintCapabilityPluginOptions,
): ScreenParseResult<BaseScreenBlueprintCapabilityPlugin> {
  const capabilities = [...options.capabilities];
  const plugin = definePlugin({
    manifest: {
      id: options.id,
      dependencies: [],
      capabilities,
      contributions: capabilities.map((id) => ({ kind: 'blueprintCapability', id, name: id })),
    },
    activate() {},
    deactivate() {},
    dispose() {},
  });
  if (!plugin.ok) return plugin;
  return {
    ok: true,
    value: {
      plugin: plugin.value,
      grantedCapabilities: { [options.id]: capabilities },
    },
    diagnostics: [],
  };
}
