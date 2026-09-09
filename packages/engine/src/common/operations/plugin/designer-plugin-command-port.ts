import type { ScreenDocument, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import { parseScreenDocumentCommand, type ScreenDocumentCommand } from '@base-screen/core';
import {
  type PluginCommandPort,
  type PluginCommandRequest,
  parsePluginCommandRequest,
} from '@base-screen/plugin-core';

export interface CreateBaseScreenCorePluginCommandPortOptions {
  readonly executeCommand: (
    command: ScreenDocumentCommand,
  ) => ScreenParseResult<ScreenDocument> | Promise<ScreenParseResult<ScreenDocument>>;
}

export function createBaseScreenCorePluginCommandPort(
  options: CreateBaseScreenCorePluginCommandPortOptions,
): PluginCommandPort {
  return Object.freeze({
    async execute(request: PluginCommandRequest): Promise<ScreenParseResult<ScreenJsonValue>> {
      const parsedRequest = parsePluginCommandRequest(request);
      if (!parsedRequest.ok) return parsedRequest;
      const command = materializeDocumentCommand(parsedRequest.value);
      if (!command.ok) return command;
      try {
        const result = await options.executeCommand(command.value);
        if (result.ok) {
          return { ok: true, value: null, diagnostics: [] };
        }
        return { ok: false, diagnostics: result.diagnostics };
      } catch {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
              path: ['commandId'],
              message: 'Plugin core command execution failed.',
            },
          ],
        };
      }
    },
  });
}

function materializeDocumentCommand(
  request: PluginCommandRequest,
): ScreenParseResult<ScreenDocumentCommand> {
  const args = request.args;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'PLUGIN_CORE_COMMAND_ARGUMENT_INVALID',
          path: ['args'],
          message: 'Plugin core command arguments must be an object.',
        },
      ],
    };
  }
  const record = args as Record<string, unknown>;
  if (Object.hasOwn(record, 'type') && record.type !== request.commandId) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'PLUGIN_CORE_COMMAND_UNAUTHORIZED',
          path: ['commandId'],
          message: 'Plugin core command id does not match the command payload.',
        },
      ],
    };
  }
  return parseScreenDocumentCommand({ ...record, type: request.commandId });
}
