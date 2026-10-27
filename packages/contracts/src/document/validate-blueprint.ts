import type {
  DiagnosticCollector,
  DiagnosticPhase,
  DiagnosticSegment,
} from '../diagnostics/collector.js';
import { canonicalByteLength } from '../json/canonical.js';
import type { ScreenBlueprintRelation, ScreenBlueprintValueExpression } from '../types/document.js';
import type { ScreenJsonValue } from '../types/json.js';
import { deriveScreenBlueprintRules } from './blueprint-relations.js';
import { validateBlueprintStrictKeys } from './blueprint-strict.js';
import {
  MAX_BLUEPRINT_EXPRESSION_BYTES,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_EXPRESSION_DEPTH,
  MAX_BLUEPRINT_RELATION_GROUPS,
  MAX_BLUEPRINT_RELATIONS_PER_GROUP,
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
  const relations = result.data.relations as readonly ScreenBlueprintRelation[];
  const derived = deriveScreenBlueprintRules({ relations });
  if (derived.length > MAX_BLUEPRINT_RELATION_GROUPS) {
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['blueprint', 'relations']),
      phase,
      'Blueprint has too many relation groups.',
    );
    return false;
  }
  for (const rule of derived) {
    if (rule.relationIds.length <= MAX_BLUEPRINT_RELATIONS_PER_GROUP) continue;
    const relationIndex = relations.findIndex((relation) => relation.id === rule.id);
    collector.add(
      'DOCUMENT_LIMIT_EXCEEDED',
      at(['blueprint', 'relations', Math.max(0, relationIndex), 'id']),
      phase,
      'Blueprint relation group has too many relations.',
    );
    return false;
  }
  for (let index = 0; index < relations.length; index++) {
    const relation = relations[index]!;
    if (relation.type === 'semantic') continue;
    if (relation.condition !== undefined) {
      validateBlueprintExpression(
        relation.condition.left,
        ['blueprint', 'relations', index, 'condition', 'left'],
        at,
        collector,
        phase,
      );
      if (relation.condition.right !== undefined) {
        validateBlueprintExpression(
          relation.condition.right,
          ['blueprint', 'relations', index, 'condition', 'right'],
          at,
          collector,
          phase,
        );
      }
    }
    const effect = relation.effect;
    if (effect.type === 'set-variable') {
      validateBlueprintExpression(
        effect.value,
        ['blueprint', 'relations', index, 'effect', 'value'],
        at,
        collector,
        phase,
      );
    } else if (effect.type === 'emit-host-event' || effect.type === 'host-action') {
      validateBlueprintExpression(
        effect.payload,
        ['blueprint', 'relations', index, 'effect', 'payload'],
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
