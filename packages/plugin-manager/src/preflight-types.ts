import type {
  BaseScreenPluginCommandHandler,
  BaseScreenPluginManifest,
  BaseScreenPluginRuntime,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import type { BaseScreenPluginManagerOptions } from './types.js';

export interface ManagerInput {
  readonly instanceId: string;
  readonly standaloneMaterialTagNames: readonly string[];
  readonly runtimes: readonly unknown[];
  readonly grantedCapabilities: ReadonlyMap<string, readonly string[]>;
  readonly registry: BaseScreenPluginManagerOptions['registry'];
  readonly registryGet: (tagName: string) => unknown;
  readonly createCommandPort: BaseScreenPluginManagerOptions['createCommandPort'];
}

export interface Candidate {
  readonly index: number;
  readonly runtime: BaseScreenPluginRuntime;
  readonly manifest: BaseScreenPluginManifest;
  readonly activate: BaseScreenPluginRuntime['activate'];
  readonly deactivate: BaseScreenPluginRuntime['deactivate'];
  readonly dispose: BaseScreenPluginRuntime['dispose'];
  readonly commands: ReadonlyMap<string, BaseScreenPluginCommandHandler>;
}

export interface ActivationSession {
  readonly context: {
    readonly instanceId: string;
    readonly pluginId: string;
    readonly grantedCapabilities: readonly string[];
    readonly commandPort: PluginCommandPort | undefined;
  };
  isValid(): boolean;
  invalidate(): void;
}
