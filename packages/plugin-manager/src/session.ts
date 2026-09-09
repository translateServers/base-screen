import type { ScreenJsonValue } from '@base-screen/contracts';
import type { PluginCommandPort } from '@base-screen/plugin-core';
import { failure } from './diagnostics.js';
import type { ActivationSession, Candidate, ManagerInput } from './preflight-types.js';

export function createActivationSession(
  input: ManagerInput,
  candidate: Candidate,
  grantedCapabilities: readonly string[],
): ActivationSession {
  let valid = true;
  const commandPort = grantedCapabilities.includes('command.execute')
    ? createCommandPort(input, candidate, () => valid)
    : undefined;
  return {
    context: Object.freeze({
      instanceId: input.instanceId,
      pluginId: candidate.manifest.id,
      grantedCapabilities: Object.freeze([...grantedCapabilities]),
      commandPort,
    }),
    isValid() {
      return valid;
    },
    invalidate() {
      valid = false;
    },
  };
}

function createCommandPort(
  input: ManagerInput,
  candidate: Candidate,
  isValid: () => boolean,
): PluginCommandPort {
  const port = input.createCommandPort!({
    instanceId: input.instanceId,
    pluginId: candidate.manifest.id,
  }) as unknown;
  if (
    port === null ||
    typeof port !== 'object' ||
    typeof Object.getOwnPropertyDescriptor(port, 'execute')?.value !== 'function'
  ) {
    throw new TypeError('Command port factory returned an invalid port.');
  }
  const execute = Object.getOwnPropertyDescriptor(port, 'execute')!
    .value as PluginCommandPort['execute'];
  return Object.freeze({
    async execute(request: Parameters<PluginCommandPort['execute']>[0]) {
      if (!isValid()) {
        return failure<ScreenJsonValue>(
          'PLUGIN_CORE_SESSION_INVALID',
          [],
          'Plugin activation session is no longer valid.',
        );
      }
      return execute.call(port, request);
    },
  });
}
