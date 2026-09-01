import type {
  ScreenBlueprint,
  ScreenBlueprintAction,
  ScreenBlueprintCondition,
  ScreenBlueprintValueExpression,
  ScreenComponentNode,
  ScreenDocument,
  ScreenVariable,
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

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const RENAME_VARIABLE_FIELDS = new Set(['type', 'variableName', 'nextName']);

export function applyRenameVariableCommand(
  document: ScreenDocument,
  command: unknown,
): ScreenCommandResult {
  if (
    !isRecord(command) ||
    Object.keys(command).some((key) => !RENAME_VARIABLE_FIELDS.has(key)) ||
    command.type !== 'rename-variable' ||
    typeof command.variableName !== 'string' ||
    typeof command.nextName !== 'string'
  ) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Rename variable command is invalid.', []),
    );
  }
  if (!VARIABLE_NAME_PATTERN.test(command.variableName)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Variable name is invalid.', ['variableName']),
    );
  }
  if (!VARIABLE_NAME_PATTERN.test(command.nextName)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Next variable name is invalid.', ['nextName']),
    );
  }
  const variableName = command.variableName;
  const nextName = command.nextName;
  const target = document.variables.find((variable) => variable.name === variableName);
  if (target === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['variableName'],
        'Variable target does not exist.',
      ),
    );
  }
  if (variableName === nextName) return screenCommandSuccess(document, []);
  if (document.variables.some((variable) => variable.name === nextName)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Next variable name is already in use.', ['nextName']),
    );
  }

  const variables = document.variables.map((variable) =>
    variable === target ? renameVariable(variable, nextName) : variable,
  );
  const changedComponentIds: string[] = [];
  const components = document.components.map((component) => {
    const next = renameComponentVariableReference(component, variableName, nextName);
    if (next !== component) changedComponentIds.push(component.id);
    return next;
  });
  const blueprint = renameBlueprintVariableReferences(document.blueprint, variableName, nextName);
  return finalizeScreenCommand(
    document,
    { ...document, variables, components, blueprint },
    changedComponentIds,
  );
}

function renameVariable(variable: ScreenVariable, nextName: string): ScreenVariable {
  return { ...variable, name: nextName };
}

function renameComponentVariableReference(
  component: ScreenComponentNode,
  variableName: string,
  nextName: string,
): ScreenComponentNode {
  const dataSource = component.dataSource;
  if (dataSource?.type !== 'host-resource') return component;
  let changed = false;
  const params = Object.fromEntries(
    Object.entries(dataSource.params).map(([name, parameter]) => {
      if (parameter.kind !== 'variable' || parameter.name !== variableName) {
        return [name, parameter];
      }
      changed = true;
      return [name, { ...parameter, name: nextName }];
    }),
  );
  return changed ? { ...component, dataSource: { ...dataSource, params } } : component;
}

function renameBlueprintVariableReferences(
  blueprint: ScreenBlueprint,
  variableName: string,
  nextName: string,
): ScreenBlueprint {
  let changed = false;
  const rules = blueprint.rules.map((rule) => {
    const condition =
      rule.condition === undefined
        ? undefined
        : renameCondition(rule.condition, variableName, nextName);
    const actions = rule.actions.map((action) => renameAction(action, variableName, nextName));
    const conditionChanged = condition !== rule.condition;
    const actionsChanged = actions.some((action, index) => action !== rule.actions[index]);
    if (!conditionChanged && !actionsChanged) return rule;
    changed = true;
    return {
      ...rule,
      ...(condition === undefined ? {} : { condition }),
      actions,
    };
  });
  return changed ? { ...blueprint, rules } : blueprint;
}

function renameCondition(
  condition: ScreenBlueprintCondition,
  variableName: string,
  nextName: string,
): ScreenBlueprintCondition {
  const left = renameExpression(condition.left, variableName, nextName);
  const right =
    condition.right === undefined
      ? undefined
      : renameExpression(condition.right, variableName, nextName);
  if (left === condition.left && right === condition.right) return condition;
  return { ...condition, left, ...(right === undefined ? {} : { right }) };
}

function renameAction(
  action: ScreenBlueprintAction,
  variableName: string,
  nextName: string,
): ScreenBlueprintAction {
  if (action.type === 'component-visibility') return action;
  const expression = action.type === 'set-variable' ? action.value : action.payload;
  const renamed = renameExpression(expression, variableName, nextName);
  if (action.type === 'set-variable') {
    const target = action.variableName === variableName ? nextName : action.variableName;
    return target === action.variableName && renamed === action.value
      ? action
      : { ...action, variableName: target, value: renamed };
  }
  return renamed === action.payload ? action : { ...action, payload: renamed };
}

function renameExpression(
  expression: ScreenBlueprintValueExpression,
  variableName: string,
  nextName: string,
): ScreenBlueprintValueExpression {
  if (expression.kind === 'variable') {
    return expression.name === variableName ? { ...expression, name: nextName } : expression;
  }
  if (expression.kind === 'array') {
    const items = expression.items.map((item) => renameExpression(item, variableName, nextName));
    return items.some((item, index) => item !== expression.items[index])
      ? { ...expression, items }
      : expression;
  }
  if (expression.kind === 'object') {
    let changed = false;
    const properties = Object.fromEntries(
      Object.entries(expression.properties).map(([name, value]) => {
        const next = renameExpression(value, variableName, nextName);
        if (next !== value) changed = true;
        return [name, next];
      }),
    );
    return changed ? { ...expression, properties } : expression;
  }
  return expression;
}
