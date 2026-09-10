import type { ScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenPluginDesignSnapshot,
  PluginCommandPort,
  PluginDesignReadPort,
} from '@base-screen/plugin-core';
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
  const designReadPort = grantedCapabilities.includes('design.read')
    ? createDesignReadPort(input, candidate, () => valid)
    : undefined;
  return {
    context: Object.freeze({
      instanceId: input.instanceId,
      pluginId: candidate.manifest.id,
      grantedCapabilities: Object.freeze([...grantedCapabilities]),
      commandPort,
      designReadPort,
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

function createDesignReadPort(
  input: ManagerInput,
  candidate: Candidate,
  isValid: () => boolean,
): PluginDesignReadPort {
  const port = input.createDesignReadPort!({
    instanceId: input.instanceId,
    pluginId: candidate.manifest.id,
  }) as unknown;
  if (
    port === null ||
    typeof port !== 'object' ||
    typeof Object.getOwnPropertyDescriptor(port, 'read')?.value !== 'function'
  ) {
    throw new TypeError('Design read port factory returned an invalid port.');
  }
  const read = Object.getOwnPropertyDescriptor(port, 'read')!.value as PluginDesignReadPort['read'];
  return Object.freeze({
    async read() {
      if (!isValid()) {
        return failure<BaseScreenPluginDesignSnapshot>(
          'PLUGIN_CORE_SESSION_INVALID',
          [],
          'Plugin activation session is no longer valid.',
        );
      }
      return read.call(port);
    },
  });
}
