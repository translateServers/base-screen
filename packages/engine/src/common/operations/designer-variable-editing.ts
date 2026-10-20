import {
  isScreenVariableName,
  parseScreenJsonValue,
  type ScreenJsonValue,
  type ScreenVariableEntry,
} from '@base-screen/contracts';
import { isVariableNameTaken } from './designer-variable-operations.js';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export function isDesignerVariableName(value: string): boolean {
  return isScreenVariableName(value);
}

export function normalizeDesignerVariableDescription(source: string): string | undefined | false {
  if (source === '') return undefined;
  if ([...source].length > 4_096 || CONTROL_CHARACTER_PATTERN.test(source)) return false;
  return source;
}

export function parseDesignerStaticVariableValue(source: string): ScreenJsonValue | undefined {
  const normalized = source.trim();
  if (normalized === '') return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    if (normalized.startsWith('{') || normalized.startsWith('[') || normalized.startsWith('"')) {
      return undefined;
    }
    parsed = source;
  }
  const result = parseScreenJsonValue(parsed);
  return result.ok ? result.value : undefined;
}

export function nextDesignerVariableCopyName(
  variables: readonly ScreenVariableEntry[],
  name: string,
): string {
  return nextDesignerVariableName(variables, `${name.slice(0, 123)}Copy`);
}

export function nextDesignerVariableId(variables: readonly ScreenVariableEntry[]): string {
  const ids = new Set(variables.map((variable) => variable.id));
  for (let index = 1; index <= 10_000; index++) {
    const id = `variable-${index}`;
    if (!ids.has(id)) return id;
  }
  return `variable-${variables.length + 1}`;
}

export function nextDesignerVariableName(
  variables: readonly ScreenVariableEntry[],
  preferred: string,
): string {
  const safePreferred = isDesignerVariableName(preferred) ? preferred : 'globalVariable';
  if (!isVariableNameTaken(variables, safePreferred)) return safePreferred;
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const tail = String(suffix);
    const candidate = `${safePreferred.slice(0, 128 - tail.length)}${tail}`;
    if (!isVariableNameTaken(variables, candidate)) return candidate;
  }
  return `variable${variables.length}`;
}
