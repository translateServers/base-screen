import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { canonicalByteLength } from '../json/canonical.js';
import type { ScreenBlueprintValueExpression } from '../types/document.js';
import type { ScreenJsonValue } from '../types/json.js';
import { validateBlueprintStrictKeys } from './blueprint-strict.js';
import {
  MAX_BLUEPRINT_ACTIONS_PER_RULE,
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
  MAX_BLUEPRINT_RULES,
} from './limits.js';
import { blueprintSchema } from './schema.js';
import { isJsonObject } from './strict-object.js';
import { addZodIssues, type DocumentDiagnosticPath } from './validate-support.js';

export function validateBlueprint(
  blueprint: unknown,
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (!isJsonObject(blueprint)) {
    collector.add(
      'DOCUMENT_FIELD_INVALID',
      at(['blueprint']),
      phase,
      'Blueprint must be an object.',
    );
    return false;
  }
  if (!validateBlueprintStrictKeys(blueprint, at, collector, phase)) return false;
  const result = blueprintSchema.safeParse(blueprint);
  if (!result.success) {
    addZodIssues(
      result.error.issues,
      ['blueprint'],
      () => 'DOCUMENT_FIELD_INVALID',
      at,
      collector,
      phase,
    );
    return false;
  }
  const rules = blueprint.rules as readonly unknown[];
  if (rules.length > MAX_BLUEPRINT_RULES) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['blueprint', 'rules']),
      phase,
      'Blueprint has too many rules.',
    );
    return false;
  }
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index] as {
      readonly actions: readonly unknown[];
      readonly condition?: {
        readonly left: ScreenBlueprintValueExpression;
        readonly right?: ScreenBlueprintValueExpression;
      };
    };
    if (rule.actions.length > MAX_BLUEPRINT_ACTIONS_PER_RULE) {
      collector.add(
        'DOCUMENT_LIMIT_EXCEEDED',
        at(['blueprint', 'rules', index, 'actions']),
        phase,
        'Blueprint rule has too many actions.',
      );
    }
    if (rule.condition) {
      validateBlueprintExpression(
        rule.condition.left,
        ['blueprint', 'rules', index, 'condition', 'left'],
        at,
        collector,
        phase,
      );
      if (rule.condition.right !== undefined) {
        validateBlueprintExpression(
          rule.condition.right,
          ['blueprint', 'rules', index, 'condition', 'right'],
          at,
          collector,
          phase,
        );
      }
    }
    for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex++) {
      const action = rule.actions[actionIndex] as Record<string, unknown>;
      if (action.type === 'component-visibility') continue;
      const field = action.type === 'set-variable' ? 'value' : 'payload';
      validateBlueprintExpression(
        action[field] as ScreenBlueprintValueExpression,
        ['blueprint', 'rules', index, 'actions', actionIndex, field],
        at,
        collector,
        phase,
      );
    }
  }
  return true;
}

function validateBlueprintExpression(
  expression: ScreenBlueprintValueExpression,
  base: DiagnosticSegment[],
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  if (
    canonicalByteLength(expression as unknown as ScreenJsonValue) > MAX_BLUEPRINT_EXPRESSION_BYTES
  ) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(base),
      phase,
      `Blueprint expression exceeds ${MAX_BLUEPRINT_EXPRESSION_BYTES} UTF-8 bytes.`,
    );
    clean = false;
  }
  const budget = { containers: 0 };
  return walkBlueprintExpression(expression, base, 1, budget, at, collector, phase) && clean;
}

function walkBlueprintExpression(
  expression: ScreenBlueprintValueExpression,
  base: DiagnosticSegment[],
  depth: number,
  budget: { containers: number },
  at: DocumentDiagnosticPath,
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (depth > MAX_BLUEPRINT_EXPRESSION_DEPTH) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(base),
      phase,
      `Blueprint expression nesting exceeds ${MAX_BLUEPRINT_EXPRESSION_DEPTH}.`,
    );
    return false;
  }
  if (expression.kind !== 'array' && expression.kind !== 'object') return true;
  budget.containers++;
  if (budget.containers > MAX_BLUEPRINT_EXPRESSION_CONTAINERS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(base),
      phase,
      `Blueprint expression has more than ${MAX_BLUEPRINT_EXPRESSION_CONTAINERS} containers.`,
    );
    return false;
  }
  let clean = true;
  if (expression.kind === 'array') {
    for (let index = 0; index < expression.items.length; index++) {
      if (
        !walkBlueprintExpression(
          expression.items[index]!,
          [...base, 'items', index],
          depth + 1,
          budget,
          at,
          collector,
          phase,
        )
      ) {
        clean = false;
      }
    }
    return clean;
  }
  if (Object.keys(expression.properties).length > MAX_BLUEPRINT_EXPRESSION_CONTAINERS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at([...base, 'properties']),
      phase,
      `Blueprint expression object has more than ${MAX_BLUEPRINT_EXPRESSION_CONTAINERS} properties.`,
    );
    return false;
  }
  for (const [key, value] of Object.entries(expression.properties)) {
    if (
      !walkBlueprintExpression(
        value,
        [...base, 'properties', key],
        depth + 1,
        budget,
        at,
        collector,
        phase,
      )
    ) {
      clean = false;
    }
  }
  return clean;
}
