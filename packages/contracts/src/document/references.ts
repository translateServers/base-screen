import {
  DiagnosticCollector,
  type DiagnosticPhase,
  type DiagnosticSegment,
} from '../diagnostics/collector.js';
import type { ScreenDocument } from '../types/document.js';

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
  document.variables.forEach((variable, index) => {
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
    if (!idToIndex.has(rule.trigger.componentId)) {
      collector.add(
        'COMPONENT_PARENT_MISSING',
        at(['blueprint', 'rules', index, 'trigger', 'componentId']),
        phase,
        `Blueprint trigger references unknown component id "${truncateKey(rule.trigger.componentId)}".`,
      );
      clean = false;
    }
    rule.actions.forEach((action, actionIndex) => {
      if (action.type === 'set-variable' && !names.has(action.variableName)) {
        collector.add(
          'VARIABLE_NAME_INVALID',
          at(['blueprint', 'rules', index, 'actions', actionIndex, 'variableName']),
          phase,
          `Blueprint action references unknown variable "${truncateKey(action.variableName)}".`,
        );
        clean = false;
      }
      if (action.type === 'component-visibility' && !idToIndex.has(action.componentId)) {
        collector.add(
          'COMPONENT_PARENT_MISSING',
          at(['blueprint', 'rules', index, 'actions', actionIndex, 'componentId']),
          phase,
          `Blueprint visibility action references unknown component id "${truncateKey(action.componentId)}".`,
        );
        clean = false;
      }
    });
  });
  return clean;
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
