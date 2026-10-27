import {
  DiagnosticCollector,
  type DiagnosticPhase,
  type DiagnosticSegment,
} from '../diagnostics/collector.js';
import type {
  ScreenBlueprintValueExpression,
  ScreenDocument,
  ScreenValueRef,
} from '../types/document.js';
import { diagnoseDataSourceCycles } from './data-source-order.js';

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
  const dataSourceIds = new Set<string>();
  (document.dataSources ?? []).forEach((instance, index) => {
    if (dataSourceIds.has(instance.id)) {
      collector.add(
        'DATA_SOURCE_ID_DUPLICATE',
        at(['dataSources', index, 'id']),
        phase,
        `Duplicate data source id "${truncateKey(instance.id)}".`,
      );
      clean = false;
    } else {
      dataSourceIds.add(instance.id);
    }
  });
  if (
    !validateDataSourceParamReferences(document, variableIds, dataSourceIds, at, collector, phase)
  ) {
    clean = false;
  }
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
    if (source?.type !== 'host-resource' && source?.type !== 'dataset') return;
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
  for (const diagnostic of diagnoseDataSourceCycles(document)) {
    collector.add(diagnostic.code, at([...diagnostic.path]), phase, diagnostic.message);
    clean = false;
  }
  document.components.forEach((component, componentIndex) => {
    if (component.dataValue === undefined || component.dataValue === null) return;
    const valueBase: DiagnosticSegment[] = ['components', componentIndex, 'dataValue'];
    if (
      !validateValueRefTarget(
        component.dataValue,
        valueBase,
        variableIds,
        dataSourceIds,
        at,
        collector,
        phase,
      )
    ) {
      clean = false;
    }
  });
  document.variables.forEach((entry, index) => {
    if ('type' in entry) return;
    const valueBase: DiagnosticSegment[] = ['variables', index, 'value'];
    if (
      !validateValueRefTarget(
        entry.value,
        valueBase,
        variableIds,
        dataSourceIds,
        at,
        collector,
        phase,
      )
    ) {
      clean = false;
    }
  });
  const relationIds = new Set<string>();
  document.blueprint.relations.forEach((relation, index) => {
    const base: DiagnosticSegment[] = ['blueprint', 'relations', index];
    if (relationIds.has(relation.id)) {
      collector.add(
        'DOCUMENT_FIELD_INVALID',
        at([...base, 'id']),
        phase,
        `Duplicate blueprint relation id "${truncateKey(relation.id)}".`,
      );
      clean = false;
    } else {
      relationIds.add(relation.id);
    }
    if (relation.type === 'semantic') {
      if (!idToIndex.has(relation.source.componentId)) {
        collector.add(
          'COMPONENT_PARENT_MISSING',
          at([...base, 'source', 'componentId']),
          phase,
          `Blueprint semantic relation references unknown source component id "${truncateKey(relation.source.componentId)}".`,
        );
        clean = false;
      }
      if (!idToIndex.has(relation.target.componentId)) {
        collector.add(
          'COMPONENT_PARENT_MISSING',
          at([...base, 'target', 'componentId']),
          phase,
          `Blueprint semantic relation references unknown target component id "${truncateKey(relation.target.componentId)}".`,
        );
        clean = false;
      }
      return;
    }
    if (relation.source.kind === 'component') {
      if (!idToIndex.has(relation.source.componentId)) {
        collector.add(
          'COMPONENT_PARENT_MISSING',
          at([...base, 'source', 'componentId']),
          phase,
          `Blueprint relation references unknown source component id "${truncateKey(relation.source.componentId)}".`,
        );
        clean = false;
      }
    } else if (!variableIds.has(relation.source.variableId)) {
      collector.add(
        'VARIABLE_NAME_INVALID',
        at([...base, 'source', 'variableId']),
        phase,
        `Blueprint relation references unknown source variable id "${truncateKey(relation.source.variableId)}".`,
      );
      clean = false;
    }
    const target = relation.target;
    if (target.kind === 'component' && !idToIndex.has(target.componentId)) {
      collector.add(
        'COMPONENT_PARENT_MISSING',
        at([...base, 'target', 'componentId']),
        phase,
        `Blueprint relation references unknown target component id "${truncateKey(target.componentId)}".`,
      );
      clean = false;
    }
    if (target.kind === 'variable' && !variableIds.has(target.variableId)) {
      collector.add(
        'VARIABLE_NAME_INVALID',
        at([...base, 'target', 'variableId']),
        phase,
        `Blueprint relation references unknown target variable id "${truncateKey(target.variableId)}".`,
      );
      clean = false;
    }
    if (relation.condition !== undefined) {
      clean =
        validateExpressionVariables(
          relation.condition.left,
          variableIds,
          [...base, 'condition', 'left'],
          at,
          collector,
          phase,
        ) && clean;
      if (relation.condition.right !== undefined) {
        clean =
          validateExpressionVariables(
            relation.condition.right,
            variableIds,
            [...base, 'condition', 'right'],
            at,
            collector,
            phase,
          ) && clean;
      }
    }
    const effect = relation.effect;
    const expression =
      effect.type === 'set-variable'
        ? effect.value
        : effect.type === 'emit-host-event' || effect.type === 'host-action'
          ? effect.payload
          : undefined;
    if (expression !== undefined) {
      clean =
        validateExpressionVariables(
          expression,
          variableIds,
          [...base, 'effect', effect.type === 'set-variable' ? 'value' : 'payload'],
          at,
          collector,
          phase,
        ) && clean;
    }
  });
  return clean;
}

/**
 * 数据源实例参数的目标判定：缺失目标、自引用。
 *
 * 自引用先判，避免它同时被当成「长度为 1 的环」重复报告；跨实例成环由
 * `diagnoseDataSourceCycles` 单独产出，路径口径见该函数的注释。
 */
function validateDataSourceParamReferences(
  document: ScreenDocument,
  variableIds: ReadonlySet<string>,
  dataSourceIds: ReadonlySet<string>,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  let clean = true;
  (document.dataSources ?? []).forEach((instance, index) => {
    for (const [parameterName, parameter] of Object.entries(instance.params)) {
      if (parameter.kind === 'variable') {
        if (!variableIds.has(parameter.variableId)) {
          collector.add(
            'VALUE_REF_TARGET_MISSING',
            at(['dataSources', index, 'params', parameterName, 'variableId']),
            phase,
            `Data source parameter references unknown variable id "${truncateKey(parameter.variableId)}".`,
          );
          clean = false;
        }
        continue;
      }
      if (parameter.kind !== 'data-source-field') continue;
      if (parameter.dataSourceId === instance.id) {
        collector.add(
          'DATA_SOURCE_PARAM_SELF_REFERENCE',
          at(['dataSources', index, 'params', parameterName, 'dataSourceId']),
          phase,
          'Data source parameter must not reference its own data source.',
        );
        clean = false;
        continue;
      }
      if (!dataSourceIds.has(parameter.dataSourceId)) {
        collector.add(
          'VALUE_REF_TARGET_MISSING',
          at(['dataSources', index, 'params', parameterName, 'dataSourceId']),
          phase,
          `Data source parameter references unknown data source id "${truncateKey(parameter.dataSourceId)}".`,
        );
        clean = false;
      }
    }
  });
  return clean;
}

/** 取值引用的目标存在性判定（形状已由 `validateValueRef` 保证）。 */
function validateValueRefTarget(
  ref: ScreenValueRef,
  base: DiagnosticSegment[],
  variableIds: ReadonlySet<string>,
  dataSourceIds: ReadonlySet<string>,
  at: (path: DiagnosticSegment[]) => DiagnosticSegment[],
  collector: DiagnosticCollector,
  phase: DiagnosticPhase,
): boolean {
  switch (ref.kind) {
    case 'inline':
      return true;
    case 'variable':
      if (variableIds.has(ref.variableId)) return true;
      collector.add(
        'VALUE_REF_TARGET_MISSING',
        at([...base, 'variableId']),
        phase,
        `Value reference points at unknown variable id "${truncateKey(ref.variableId)}".`,
      );
      return false;
    default:
      if (dataSourceIds.has(ref.dataSourceId)) return true;
      collector.add(
        'VALUE_REF_TARGET_MISSING',
        at([...base, 'dataSourceId']),
        phase,
        `Value reference points at unknown data source id "${truncateKey(ref.dataSourceId)}".`,
      );
      return false;
  }
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
