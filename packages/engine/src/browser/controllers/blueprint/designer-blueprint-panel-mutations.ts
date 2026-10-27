import {
  parseScreenJsonValue,
  type ScreenBlueprintBehaviorRelation,
  type ScreenBlueprintCondition,
  type ScreenBlueprintRelationEffect,
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

export function updateDesignerBlueprintEffectFromTarget(
  target: Element,
  document: ScreenDocument,
  relation: ScreenBlueprintBehaviorRelation,
  catalog?: BaseScreenMaterialCatalog,
): ScreenParseResult<ScreenBlueprintRelationEffect | null> {
  const effect = relation.effect;
  if (target.matches('[data-blueprint-visibility-operation]')) {
    const operation = (target as HTMLSelectElement).value;
    return effect.type === 'component-visibility' &&
      (operation === 'show' || operation === 'hide' || operation === 'toggle')
      ? success({ ...effect, operation })
      : success(null);
  }
  if (target.matches('[data-blueprint-transition-duration]')) {
    const durationMs = Number((target as HTMLInputElement).value);
    if (
      effect.type !== 'component-visibility' ||
      !Number.isInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > 60_000
    ) {
      return failure();
    }
    return success({
      ...effect,
      transition: {
        effect: effect.transition?.effect ?? 'fade',
        durationMs,
        easing: effect.transition?.easing ?? 'ease-in-out-quad',
      },
    });
  }
  if (target.matches('[data-blueprint-action-value]')) {
    if (effect.type !== 'set-variable') return success(null);
    try {
      const parsed = parseScreenJsonValue(JSON.parse((target as HTMLInputElement).value));
      return parsed.ok
        ? success({ ...effect, value: { kind: 'literal', value: parsed.value } })
        : { ok: false, diagnostics: parsed.diagnostics };
    } catch {
      return failure('AUTHORING_SOURCE_INVALID');
    }
  }
  if (target.matches('[data-blueprint-action-value-source]')) {
    if (effect.type !== 'set-variable') return success(null);
    return updateValueSource(
      (target as HTMLSelectElement).value,
      document,
      effect,
      catalog,
      relation.id,
    );
  }
  if (target.matches('[data-blueprint-action-event-path]')) {
    if (effect.type !== 'set-variable') return success(null);
    const path = parseDesignerBlueprintEventFieldPath((target as HTMLInputElement).value);
    return path === null
      ? failureMessage(DESIGNER_UI_TEXT.blueprint.eventFieldInvalid)
      : success({ ...effect, value: { kind: 'event-payload', path } });
  }
  if (target.matches('[data-blueprint-action-source-variable]')) {
    if (effect.type !== 'set-variable') return success(null);
    const variableId = (target as HTMLSelectElement).value;
    const targetVariableId =
      relation.target.kind === 'variable' ? relation.target.variableId : undefined;
    return variableId !== targetVariableId &&
      document.variables.some((variable) => variable.id === variableId)
      ? success({ ...effect, value: { kind: 'variable', variableId } })
      : failure();
  }
  if (target.matches('[data-blueprint-action-event]')) {
    const eventName = (target as HTMLInputElement).value.trim();
    return effect.type === 'emit-host-event' && eventName.length > 0 && eventName.length <= 256
      ? success({ ...effect, eventName })
      : success(null);
  }
  return success(null);
}

function updateValueSource(
  source: string,
  document: ScreenDocument,
  effect: Extract<ScreenBlueprintRelationEffect, { readonly type: 'set-variable' }>,
  catalog: BaseScreenMaterialCatalog | undefined,
  relationId: string,
): ScreenParseResult<ScreenBlueprintRelationEffect | null> {
  if (source === 'literal') {
    return success({
      ...effect,
      value: effect.value.kind === 'literal' ? effect.value : { kind: 'literal', value: null },
    });
  }
  if (source === 'event') {
    return success({ ...effect, value: { kind: 'event-payload', path: [] } });
  }
  if (source === 'event-field') {
    if (effect.value.kind === 'event-payload' && effect.value.path.length > 0) {
      return success({ ...effect, value: effect.value });
    }
    const path = designerBlueprintEventFieldPaths(document, relationId, catalog)[0];
    return success({
      ...effect,
      value: { kind: 'event-payload', path: path ?? ['row'] },
    });
  }
  if (source === 'variable') {
    const relation = document.blueprint.relations.find((candidate) => candidate.id === relationId);
    const currentTarget =
      relation?.type === 'behavior' && relation.target.kind === 'variable'
        ? relation.target.variableId
        : undefined;
    const variable = document.variables.find((candidate) => candidate.id !== currentTarget);
    return variable === undefined
      ? failure()
      : success({ ...effect, value: { kind: 'variable', variableId: variable.id } });
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
