import {
  parseScreenJsonValue,
  type ScreenBlueprintAction,
  type ScreenBlueprintCondition,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

const CONDITION_OPERATORS = new Set<ScreenBlueprintCondition['operator']>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
]);

export function isDesignerBlueprintConditionOperator(
  value: string,
): value is ScreenBlueprintCondition['operator'] {
  return CONDITION_OPERATORS.has(value as ScreenBlueprintCondition['operator']);
}

export function updateDesignerBlueprintActionFromTarget(
  target: Element,
  document: ScreenDocument,
  action: ScreenBlueprintAction,
): ScreenParseResult<ScreenBlueprintAction | null> {
  if (target.matches('[data-blueprint-visibility-operation]')) {
    const operation = (target as HTMLSelectElement).value;
    return action.type === 'component-visibility' &&
      (operation === 'show' || operation === 'hide' || operation === 'toggle')
      ? success({ ...action, operation })
      : success(null);
  }
  if (target.matches('[data-blueprint-transition-duration]')) {
    const durationMs = Number((target as HTMLInputElement).value);
    if (
      action.type !== 'component-visibility' ||
      !Number.isInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > 60_000
    ) {
      return failure();
    }
    return success({
      ...action,
      transition: {
        effect: action.transition?.effect ?? 'fade',
        durationMs,
        easing: action.transition?.easing ?? 'ease-in-out-quad',
      },
    });
  }
  if (target.matches('[data-blueprint-action-variable]')) {
    const variableName = (target as HTMLSelectElement).value;
    return action.type === 'set-variable' &&
      document.variables.some((variable) => variable.name === variableName)
      ? success({ ...action, variableName })
      : success(null);
  }
  if (target.matches('[data-blueprint-action-value]')) {
    if (action.type !== 'set-variable') return success(null);
    try {
      const parsed = parseScreenJsonValue(JSON.parse((target as HTMLInputElement).value));
      return parsed.ok
        ? success({ ...action, value: { kind: 'literal', value: parsed.value } })
        : { ok: false, diagnostics: parsed.diagnostics };
    } catch {
      return failure('AUTHORING_SOURCE_INVALID');
    }
  }
  if (target.matches('[data-blueprint-action-event]')) {
    const eventName = (target as HTMLInputElement).value.trim();
    return action.type === 'emit-host-event' && eventName.length > 0 && eventName.length <= 256
      ? success({ ...action, eventName })
      : success(null);
  }
  return success(null);
}

function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(
  code: 'AUTHORING_REQUEST_INVALID' | 'AUTHORING_SOURCE_INVALID' = 'AUTHORING_REQUEST_INVALID',
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code,
        path: [],
        message: DESIGNER_UI_TEXT.blueprint.invalidCommand,
      },
    ],
  };
}
