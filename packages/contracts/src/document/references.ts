import {
  DiagnosticCollector,
  type DiagnosticPhase,
  type DiagnosticSegment,
} from '../diagnostics/collector.js';
import type { ScreenBlueprintValueExpression, ScreenDocument } from '../types/document.js';

export function validateReferences(
  document: ScreenDocument,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  const idToIndex = new Map<string, number>();
  document.components.forEach((component, index) => {
    if (idToIndex.has(component.id)) {
      collector.add(
        'COMPONENT_ID_DUPLICATE',
        at(['components', index, 'id']),
        phase,
        `Duplicate component id "${truncateKey(component.id)}".`,
      );
      clean = false;
    } else {
      idToIndex.set(component.id, index);
    }
  });
  for (let index = 0; index < document.components.length; index++) {
    const component = document.components[index]!;
    const parentId = component.parentId;
    if (parentId === null) {
      continue;
    }
    if (parentId === component.id) {
      collector.add(
        'COMPONENT_PARENT_SELF',
        at(['components', index, 'parentId']),
        phase,
        'Component parentId must not reference itself.',
      );
      clean = false;
    } else if (!idToIndex.has(parentId)) {
      collector.add(
        'COMPONENT_PARENT_MISSING',
        at(['components', index, 'parentId']),
        phase,
        `Component parentId references unknown id "${truncateKey(parentId)}".`,
      );
      clean = false;
    }
  }
  if (!findParentCycles(document, at, collector, phase)) {
    clean = false;
  }
  const names = new Set<string>();
  const variableIds = new Set<string>();
  document.variables.forEach((variable, index) => {
    if (variableIds.has(variable.id)) {
      collector.add(
        'VARIABLE_NAME_DUPLICATE',
        at(['variables', index, 'id']),
        phase,
        `Duplicate variable id "${truncateKey(variable.id)}".`,
      );
      clean = false;
    } else {
      variableIds.add(variable.id);
    }
    if (names.has(variable.name)) {
      collector.add(
        'VARIABLE_NAME_DUPLICATE',
        at(['variables', index, 'name']),
        phase,
        `Duplicate variable name "${truncateKey(variable.name)}".`,
      );
      clean = false;
    } else {
      names.add(variable.name);
    }
  });
  document.components.forEach((component, componentIndex) => {
    const source = component.dataSource;
    if (source?.type === 'variable' && !variableIds.has(source.variableId)) {
      collector.add(
        'VARIABLE_NAME_INVALID',
        at(['components', componentIndex, 'dataSource', 'variableId']),
        phase,
        `Component data source references unknown variable id "${truncateKey(source.variableId)}".`,
      );
      clean = false;
    }
    if (source?.type !== 'host-resource') return;
    for (const [parameterName, parameter] of Object.entries(source.params)) {
      if (parameter.kind === 'variable' && !variableIds.has(parameter.variableId)) {
        collector.add(
          'VARIABLE_NAME_INVALID',
          at(['components', componentIndex, 'dataSource', 'params', parameterName, 'variableId']),
          phase,
          `Host resource parameter references unknown variable id "${truncateKey(parameter.variableId)}".`,
        );
        clean = false;
      }
    }
  });
  const ruleIds = new Set<string>();
  document.blueprint.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) {
      collector.add(
        'DOCUMENT_FIELD_INVALID',
        at(['blueprint', 'rules', index, 'id']),
        phase,
        `Duplicate blueprint rule id "${truncateKey(rule.id)}".`,
      );
      clean = false;
    } else {
      ruleIds.add(rule.id);
    }
    if (rule.trigger.type === 'material-event' && !idToIndex.has(rule.trigger.componentId)) {
      collector.add(
        'COMPONENT_PARENT_MISSING',
        at(['blueprint', 'rules', index, 'trigger', 'componentId']),
        phase,
        `Blueprint trigger references unknown component id "${truncateKey(rule.trigger.componentId)}".`,
      );
      clean = false;
    }
    if (rule.trigger.type === 'variable-event' && !variableIds.has(rule.trigger.variableId)) {
      collector.add(
        'VARIABLE_NAME_INVALID',
        at(['blueprint', 'rules', index, 'trigger', 'variableId']),
        phase,
        `Blueprint trigger references unknown variable id "${truncateKey(rule.trigger.variableId)}".`,
      );
      clean = false;
    }
    if (rule.condition !== undefined) {
      clean =
        validateExpressionVariables(
          rule.condition.left,
          variableIds,
          ['blueprint', 'rules', index, 'condition', 'left'],
          at,
          collector,
          phase,
        ) && clean;
      if (rule.condition.right !== undefined) {
        clean =
          validateExpressionVariables(
            rule.condition.right,
            variableIds,
            ['blueprint', 'rules', index, 'condition', 'right'],
            at,
            collector,
            phase,
          ) && clean;
      }
    }
    rule.actions.forEach((action, actionIndex) => {
      if (
        (action.type === 'set-variable' || action.type === 'request-variable') &&
        !variableIds.has(action.variableId)
      ) {
        collector.add(
          'VARIABLE_NAME_INVALID',
          at(['blueprint', 'rules', index, 'actions', actionIndex, 'variableId']),
          phase,
          `Blueprint action references unknown variable id "${truncateKey(action.variableId)}".`,
        );
        clean = false;
      }
      if (
        (action.type === 'component-visibility' || action.type === 'request-component-data') &&
        !idToIndex.has(action.componentId)
      ) {
        collector.add(
          'COMPONENT_PARENT_MISSING',
          at(['blueprint', 'rules', index, 'actions', actionIndex, 'componentId']),
          phase,
          `Blueprint visibility action references unknown component id "${truncateKey(action.componentId)}".`,
        );
        clean = false;
      }
      const expression =
        action.type === 'set-variable'
          ? action.value
          : action.type === 'emit-host-event' || action.type === 'host-action'
            ? action.payload
            : undefined;
      if (expression !== undefined) {
        clean =
          validateExpressionVariables(
            expression,
            variableIds,
            [
              'blueprint',
              'rules',
              index,
              'actions',
              actionIndex,
              action.type === 'set-variable' ? 'value' : 'payload',
            ],
            at,
            collector,
            phase,
          ) && clean;
      }
    });
  });
  return clean;
}

function validateExpressionVariables(
  expression: ScreenBlueprintValueExpression,
  variableIds: ReadonlySet<string>,
  base: DiagnosticSegment[],
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  if (expression.kind === 'variable') {
    if (variableIds.has(expression.variableId)) return true;
    collector.add(
      'VARIABLE_NAME_INVALID',
      at([...base, 'variableId']),
      phase,
      `Blueprint expression references unknown variable id "${truncateKey(expression.variableId)}".`,
    );
    return false;
  }
  if (expression.kind === 'array') {
    return expression.items.every((item, index) =>
      validateExpressionVariables(
        item,
        variableIds,
        [...base, 'items', index],
        at,
        collector,
        phase,
      ),
    );
  }
  if (expression.kind === 'object') {
    return Object.entries(expression.properties).every(([key, value]) =>
      validateExpressionVariables(
        value,
        variableIds,
        [...base, 'properties', key],
        at,
        collector,
        phase,
      ),
    );
  }
  return true;
}

function findParentCycles(
  document: ScreenDocument,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  const parentOf = new Map<string, string | null>();
  const idToIndex = new Map<string, number>();
  document.components.forEach((component, index) => {
    parentOf.set(component.id, component.parentId);
    idToIndex.set(component.id, index);
  });
  const processed = new Set<string>();
  let clean = true;
  for (const start of document.components) {
    if (processed.has(start.id)) {
      continue;
    }
    const position = new Map<string, number>();
    const walk: string[] = [];
    const walked = new Set<string>([start.id]);
    let current: string | null = start.id;
    let cycleFound = false;
    while (current !== null) {
      if (processed.has(current)) {
        break;
      }
      const atPosition = position.get(current);
      if (atPosition !== undefined) {
        const cycle = walk.slice(atPosition);
        let minIndex = Infinity;
        for (const id of cycle) {
          minIndex = Math.min(minIndex, idToIndex.get(id) ?? Infinity);
        }
        collector.add(
          'COMPONENT_PARENT_CYCLE',
          at(['components', minIndex, 'parentId']),
          phase,
          'Component parent graph contains a cycle.',
        );
        for (const id of walked) {
          processed.add(id);
        }
        clean = false;
        cycleFound = true;
        break;
      }
      if (!parentOf.has(current)) {
        break;
      }
      const parent = parentOf.get(current);
      if (parent === undefined || parent === null || parent === current) {
        break;
      }
      position.set(current, walk.length);
      walk.push(current);
      walked.add(current);
      current = parent;
    }
    if (!cycleFound) {
      for (const id of walked) {
        processed.add(id);
      }
    }
  }
  return clean;
}

function truncateKey(key: string): string {
  return key.length > 128 ? `${key.slice(0, 128)}…` : key;
}
