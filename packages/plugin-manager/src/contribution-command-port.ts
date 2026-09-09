import type { PluginCommandPort, PluginCommandRequest } from '@base-screen/plugin-core';
import type { BaseScreenPluginManager } from './types.js';

export function createBaseScreenPluginContributionCommandPort(
  manager: BaseScreenPluginManager,
): PluginCommandPort {
  return Object.freeze({
    execute(request: PluginCommandRequest) {
      return manager.executeContributionCommand(request);
    },
  });
}
