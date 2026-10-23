import {
  parseScreenJsonValue,
  type ScreenBlueprintAction,
  type ScreenBlueprintCondition,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  designerBlueprintEventFieldPaths,
  parseDesignerBlueprintEventFieldPath,
} from '../../../common/operations/blueprint/designer-blueprint-value-sources.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

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
  catalog?: BaseScreenMaterialCatalog,
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
    const variableId = (target as HTMLSelectElement).value;
    return action.type === 'set-variable' &&
      document.variables.some((variable) => variable.id === variableId)
      ? success({ ...action, variableId })
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
  if (target.matches('[data-blueprint-action-value-source]')) {
    if (action.type !== 'set-variable') return success(null);
    const source = (target as HTMLSelectElement).value;
    return updateValueSource(
      source,
      document,
      action,
      catalog,
      (target as HTMLElement).dataset.ruleId,
    );
  }
  if (target.matches('[data-blueprint-action-event-path]')) {
    if (action.type !== 'set-variable') return success(null);
    const path = parseDesignerBlueprintEventFieldPath((target as HTMLInputElement).value);
    return path === null
      ? failureMessage(DESIGNER_UI_TEXT.blueprint.eventFieldInvalid)
      : success({ ...action, value: { kind: 'event-payload', path } });
  }
  if (target.matches('[data-blueprint-action-source-variable]')) {
    if (action.type !== 'set-variable') return success(null);
    const variableId = (target as HTMLSelectElement).value;
    return document.variables.some(
      (variable) => variable.id === variableId && variable.id !== action.variableId,
    )
      ? success({ ...action, value: { kind: 'variable', variableId } })
      : failure();
  }
  if (target.matches('[data-blueprint-action-event]')) {
    const eventName = (target as HTMLInputElement).value.trim();
    return action.type === 'emit-host-event' && eventName.length > 0 && eventName.length <= 256
      ? success({ ...action, eventName })
      : success(null);
  }
  return success(null);
}

function updateValueSource(
  source: string,
  document: ScreenDocument,
  action: Extract<ScreenBlueprintAction, { readonly type: 'set-variable' }>,
  catalog: BaseScreenMaterialCatalog | undefined,
  ruleId: string | undefined,
): ScreenParseResult<ScreenBlueprintAction | null> {
  if (source === 'literal') {
    return success({
      ...action,
      value: action.value.kind === 'literal' ? action.value : { kind: 'literal', value: null },
    });
  }
  if (source === 'event') {
    return success({ ...action, value: { kind: 'event-payload', path: [] } });
  }
  if (source === 'event-field') {
    if (action.value.kind === 'event-payload' && action.value.path.length > 0) {
      return success({ ...action, value: action.value });
    }
    const path =
      ruleId === undefined
        ? undefined
        : designerBlueprintEventFieldPaths(document, ruleId, catalog)[0];
    return success({
      ...action,
      value: { kind: 'event-payload', path: path ?? ['row'] },
    });
  }
  if (source === 'variable') {
    const variable = document.variables.find((candidate) => candidate.id !== action.variableId);
    return variable === undefined
      ? failure()
      : success({ ...action, value: { kind: 'variable', variableId: variable.id } });
  }
  return failure();
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

function failureMessage<T>(message: string): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'AUTHORING_REQUEST_INVALID',
        path: [],
        message,
      },
    ],
  };
}
