import type {
  ScreenBlueprintValueExpression,
  ScreenDocument,
  ScreenParseResult,
  ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';

export type DesignerVariableReference =
  | {
      readonly kind: 'component-parameter';
      readonly variableId: string;
      readonly componentId: string;
      readonly componentName: string;
      readonly parameterName: string;
    }
  | {
      readonly kind: 'blueprint-condition';
      readonly variableId: string;
      readonly ruleId: string;
      readonly side: 'left' | 'right';
      readonly expressionPath: readonly (string | number)[];
      readonly blueprintTargetId: string;
    }
  | {
      readonly kind: 'blueprint-action-target';
      readonly variableId: string;
      readonly ruleId: string;
      readonly actionIndex: number;
      readonly blueprintTargetId: string;
    }
  | {
      readonly kind: 'blueprint-action-expression';
      readonly variableId: string;
      readonly ruleId: string;
      readonly actionIndex: number;
      readonly field: 'value' | 'payload';
      readonly expressionPath: readonly (string | number)[];
      readonly blueprintTargetId: string;
    }
  | {
      readonly kind: 'blueprint-trigger';
      readonly variableId: string;
      readonly ruleId: string;
      readonly blueprintTargetId: string;
    };

/**
 * 文档内对变量名的全部引用集合（ADR-0054 R4）：
 * - 组件 `host-resource` 数据源参数中 `kind: 'variable'` 的 `name`；
 * - Blueprint 变量事件、表达式与动作中的稳定 `variableId`；
 * - Blueprint 条件与动作表达式中 `kind: 'variable'` 的 `name`（递归）。
 */
export function referencedVariableIds(document: ScreenDocument): ReadonlySet<string> {
  return new Set(variableReferenceCounts(document).keys());
}

/** @deprecated The returned keys are stable ids. */
export const referencedVariableNames = referencedVariableIds;

/** Counts every canonical reference location for variable-panel disclosure. */
export function variableReferenceCounts(document: ScreenDocument): ReadonlyMap<string, number> {
  const referenced = new Map<string, number>();
  for (const reference of collectVariableReferences(document)) {
    referenced.set(reference.variableId, (referenced.get(reference.variableId) ?? 0) + 1);
  }
  return referenced;
}

/** Enumerates every canonical reference with a stable authoring target. */
export function collectVariableReferences(
  document: ScreenDocument,
  variableId?: string,
): readonly DesignerVariableReference[] {
  const references: DesignerVariableReference[] = [];
  const include = (id: string): boolean => variableId === undefined || id === variableId;
  for (const component of document.components) {
    const source = component.dataSource;
    if (source?.type === 'variable' && include(source.variableId)) {
      references.push({
        kind: 'component-parameter',
        variableId: source.variableId,
        componentId: component.id,
        componentName: component.name,
        parameterName: '$data',
      });
    }
    if (source?.type !== 'host-resource') continue;
    for (const [parameterName, parameter] of Object.entries(source.params)) {
      if (parameter?.kind !== 'variable' || !include(parameter.variableId)) continue;
      references.push({
        kind: 'component-parameter',
        variableId: parameter.variableId,
        componentId: component.id,
        componentName: component.name,
        parameterName,
      });
    }
  }
  for (const rule of document.blueprint.rules) {
    if (rule.trigger.type === 'variable-event' && include(rule.trigger.variableId)) {
      references.push({
        kind: 'blueprint-trigger',
        variableId: rule.trigger.variableId,
        ruleId: rule.id,
        blueprintTargetId: `trigger:${rule.id}`,
      });
    }
    if (rule.condition !== undefined) {
      collectExpressionVariableReferences(rule.condition.left, [], (name, expressionPath) => {
        if (!include(name)) return;
        references.push({
          kind: 'blueprint-condition',
          variableId: name,
          ruleId: rule.id,
          side: 'left',
          expressionPath,
          blueprintTargetId: `condition:${rule.id}`,
        });
      });
      if (rule.condition.right !== undefined) {
        collectExpressionVariableReferences(rule.condition.right, [], (name, expressionPath) => {
          if (!include(name)) return;
          references.push({
            kind: 'blueprint-condition',
            variableId: name,
            ruleId: rule.id,
            side: 'right',
            expressionPath,
            blueprintTargetId: `condition:${rule.id}`,
          });
        });
      }
    }
    for (const [actionIndex, action] of rule.actions.entries()) {
      const blueprintTargetId = `action:${rule.id}:${actionIndex}`;
      if (action.type === 'set-variable') {
        if (include(action.variableId)) {
          references.push({
            kind: 'blueprint-action-target',
            variableId: action.variableId,
            ruleId: rule.id,
            actionIndex,
            blueprintTargetId,
          });
        }
        collectExpressionVariableReferences(action.value, [], (name, expressionPath) => {
          if (!include(name)) return;
          references.push({
            kind: 'blueprint-action-expression',
            variableId: name,
            ruleId: rule.id,
            actionIndex,
            field: 'value',
            expressionPath,
            blueprintTargetId,
          });
        });
      } else if (action.type === 'request-variable') {
        if (include(action.variableId)) {
          references.push({
            kind: 'blueprint-action-target',
            variableId: action.variableId,
            ruleId: rule.id,
            actionIndex,
            blueprintTargetId,
          });
        }
      } else if (action.type === 'emit-host-event' || action.type === 'host-action') {
        collectExpressionVariableReferences(action.payload, [], (name, expressionPath) => {
          if (!include(name)) return;
          references.push({
            kind: 'blueprint-action-expression',
            variableId: name,
            ruleId: rule.id,
            actionIndex,
            field: 'payload',
            expressionPath,
            blueprintTargetId,
          });
        });
      }
    }
  }
  return references;
}

/**
 * 变量名是否已被文档其他位置引用（删除/重命名前调用，ADR-0054 R4）。
 */
export function isVariableReferenced(document: ScreenDocument, variableId: string): boolean {
  return referencedVariableIds(document).has(variableId);
}

/**
 * 变量名是否与既有变量重名（ADR-0054 R2/R6）：`exceptIndex` 用于重命名场景
 * （被编辑的变量自身不算冲突）。
 */
export function isVariableNameTaken(
  variables: readonly ScreenVariable[],
  name: string,
  exceptIndex = -1,
): boolean {
  return variables.some((variable, index) => index !== exceptIndex && variable.name === name);
}

/** 构建 `replace-variables` 命令（整组替换，core fail-closed 校验）。 */
export function buildReplaceVariablesCommand(
  variables: readonly ScreenVariable[],
): ScreenParseResult<ScreenDocumentCommand> {
  if (variables.length > 1000) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'DOCUMENT_LIMIT_EXCEEDED',
          path: ['variables'],
          message: 'Document has more than 1000 variables.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: { type: 'replace-variables', variables },
    diagnostics: [],
  };
}

function collectExpressionVariableReferences(
  expression: ScreenBlueprintValueExpression,
  path: readonly (string | number)[],
  add: (variableId: string, path: readonly (string | number)[]) => void,
): void {
  switch (expression.kind) {
    case 'variable':
      add(expression.variableId, path);
      return;
    case 'array':
      for (const [index, item] of expression.items.entries()) {
        collectExpressionVariableReferences(item, [...path, index], add);
      }
      return;
    case 'object':
      for (const [key, item] of Object.entries(expression.properties)) {
        collectExpressionVariableReferences(item, [...path, key], add);
      }
      return;
    default:
      return;
  }
}
