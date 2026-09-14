import type {
  BaseScreenPluginActivationContext,
  BaseScreenPluginBlueprintActionHandler,
  BaseScreenPluginCommandHandler,
  BaseScreenPluginDataProcessorHandler,
  BaseScreenPluginManifest,
  BaseScreenPluginRuntime,
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
  readonly createDesignReadPort: BaseScreenPluginManagerOptions['createDesignReadPort'];
  readonly activation: 'eager' | 'lazy';
}

export interface Candidate {
  readonly index: number;
  readonly runtime: BaseScreenPluginRuntime;
  readonly manifest: BaseScreenPluginManifest;
  readonly activate: BaseScreenPluginRuntime['activate'];
  readonly deactivate: BaseScreenPluginRuntime['deactivate'];
  readonly dispose: BaseScreenPluginRuntime['dispose'];
  readonly commands: ReadonlyMap<string, BaseScreenPluginCommandHandler>;
  readonly blueprintActions: ReadonlyMap<string, BaseScreenPluginBlueprintActionHandler>;
  readonly dataProcessors: ReadonlyMap<string, BaseScreenPluginDataProcessorHandler>;
}

export interface ActivationSession {
  readonly context: BaseScreenPluginActivationContext;
  isValid(): boolean;
  invalidate(): void;
}
