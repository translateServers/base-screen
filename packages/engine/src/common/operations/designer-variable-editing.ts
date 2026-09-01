import {
  parseScreenJsonValue,
  type ScreenJsonValue,
  type ScreenVariable,
} from '@base-screen/contracts';
import { isVariableNameTaken } from './designer-variable-operations.js';

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export function isDesignerVariableName(value: string): boolean {
  return VARIABLE_NAME_PATTERN.test(value);
}

export function normalizeDesignerVariableDescription(source: string): string | undefined | false {
  if (source === '') return undefined;
  if ([...source].length > 4_096 || CONTROL_CHARACTER_PATTERN.test(source)) return false;
  return source;
}

export function parseDesignerStaticVariableValue(source: string): ScreenJsonValue | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return undefined;
  }
  const result = parseScreenJsonValue(parsed);
  return result.ok ? result.value : undefined;
}

export function nextDesignerVariableCopyName(
  variables: readonly ScreenVariable[],
  name: string,
): string {
  return nextDesignerVariableName(variables, `${name.slice(0, 123)}Copy`);
}

export function nextDesignerVariableName(
  variables: readonly ScreenVariable[],
  preferred: string,
): string {
  const safePreferred = isDesignerVariableName(preferred) ? preferred : 'hostVariable';
  if (!isVariableNameTaken(variables, safePreferred)) return safePreferred;
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const tail = String(suffix);
    const candidate = `${safePreferred.slice(0, 128 - tail.length)}${tail}`;
    if (!isVariableNameTaken(variables, candidate)) return candidate;
  }
  return `variable${variables.length}`;
}
