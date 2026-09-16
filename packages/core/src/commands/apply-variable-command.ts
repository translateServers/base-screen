import {
  isScreenComponentId,
  isScreenVariableName,
  type ScreenDocument,
} from '@base-screen/contracts';
import { isRecord } from './command-input.js';
import {
  finalizeScreenCommand,
  invalidScreenCommand,
  screenCommandDiagnostic,
  screenCommandFailure,
  screenCommandSuccess,
} from './command-result.js';
import type { ScreenCommandResult } from './types.js';

const RENAME_VARIABLE_FIELDS = new Set(['type', 'variableId', 'nextName']);

/**
 * Renames only the author-facing label. Canonical references use the immutable variable id,
 * so a rename is atomic without rewriting component data or Blueprint expressions.
 */
export function applyRenameVariableCommand(
  document: ScreenDocument,
  command: unknown,
): ScreenCommandResult {
  if (
    !isRecord(command) ||
    Object.keys(command).some((key) => !RENAME_VARIABLE_FIELDS.has(key)) ||
    command.type !== 'rename-variable' ||
    typeof command.variableId !== 'string' ||
    typeof command.nextName !== 'string'
  ) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Rename variable command is invalid.', []),
    );
  }
  if (!isScreenComponentId(command.variableId)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Variable id is invalid.', ['variableId']),
    );
  }
  if (!isScreenVariableName(command.nextName)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Next variable name is invalid.', ['nextName']),
    );
  }
  const target = document.variables.find((variable) => variable.id === command.variableId);
  if (target === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['variableId'],
        'Variable target does not exist.',
      ),
    );
  }
  if (target.name === command.nextName) return screenCommandSuccess(document, []);
  if (document.variables.some((variable) => variable.name === command.nextName)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Next variable name is already in use.', ['nextName']),
    );
  }
  const variables = document.variables.map((variable) =>
    variable === target ? { ...variable, name: command.nextName } : variable,
  );
  return finalizeScreenCommand(document, { ...document, variables }, []);
}
