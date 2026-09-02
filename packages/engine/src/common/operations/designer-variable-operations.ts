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
      readonly variableName: string;
      readonly componentId: string;
      readonly componentName: string;
      readonly parameterName: string;
    }
  | {
      readonly kind: 'blueprint-condition';
      readonly variableName: string;
      readonly ruleId: string;
      readonly side: 'left' | 'right';
      readonly expressionPath: readonly (string | number)[];
      readonly blueprintTargetId: string;
    }
  | {
      readonly kind: 'blueprint-action-target';
      readonly variableName: string;
      readonly ruleId: string;
      readonly actionIndex: number;
      readonly blueprintTargetId: string;
    }
  | {
      readonly kind: 'blueprint-action-expression';
      readonly variableName: string;
      readonly ruleId: string;
      readonly actionIndex: number;
      readonly field: 'value' | 'payload';
      readonly expressionPath: readonly (string | number)[];
      readonly blueprintTargetId: string;
    };

/**
 * 文档内对变量名的全部引用集合（ADR-0054 R4）：
 * - 组件 `host-resource` 数据源参数中 `kind: 'variable'` 的 `name`；
 * - Blueprint `set-variable` 动作的 `variableName`；
 * - Blueprint 条件与动作表达式中 `kind: 'variable'` 的 `name`（递归）。
 */
export function referencedVariableNames(document: ScreenDocument): ReadonlySet<string> {
  return new Set(variableReferenceCounts(document).keys());
}

/** Counts every canonical reference location for variable-panel disclosure. */
export function variableReferenceCounts(document: ScreenDocument): ReadonlyMap<string, number> {
  const referenced = new Map<string, number>();
  for (const reference of collectVariableReferences(document)) {
    referenced.set(reference.variableName, (referenced.get(reference.variableName) ?? 0) + 1);
  }
  return referenced;
}

/** Enumerates every canonical reference with a stable authoring target. */
export function collectVariableReferences(
  document: ScreenDocument,
  variableName?: string,
): readonly DesignerVariableReference[] {
  const references: DesignerVariableReference[] = [];
  const include = (name: string): boolean => variableName === undefined || name === variableName;
  for (const component of document.components) {
    const source = component.dataSource;
    if (source?.type !== 'host-resource') continue;
    for (const [parameterName, parameter] of Object.entries(source.params)) {
      if (parameter?.kind !== 'variable' || !include(parameter.name)) continue;
      references.push({
        kind: 'component-parameter',
        variableName: parameter.name,
        componentId: component.id,
        componentName: component.name,
        parameterName,
      });
    }
  }
  for (const rule of document.blueprint.rules) {
    if (rule.condition !== undefined) {
      collectExpressionVariableReferences(rule.condition.left, [], (name, expressionPath) => {
        if (!include(name)) return;
        references.push({
          kind: 'blueprint-condition',
          variableName: name,
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
            variableName: name,
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
        if (include(action.variableName)) {
          references.push({
            kind: 'blueprint-action-target',
            variableName: action.variableName,
            ruleId: rule.id,
            actionIndex,
            blueprintTargetId,
          });
        }
        collectExpressionVariableReferences(action.value, [], (name, expressionPath) => {
          if (!include(name)) return;
          references.push({
            kind: 'blueprint-action-expression',
            variableName: name,
            ruleId: rule.id,
            actionIndex,
            field: 'value',
            expressionPath,
            blueprintTargetId,
          });
        });
      } else if (action.type !== 'component-visibility') {
        collectExpressionVariableReferences(action.payload, [], (name, expressionPath) => {
          if (!include(name)) return;
          references.push({
            kind: 'blueprint-action-expression',
            variableName: name,
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
export function isVariableReferenced(document: ScreenDocument, name: string): boolean {
  return referencedVariableNames(document).has(name);
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
  add: (name: string, path: readonly (string | number)[]) => void,
): void {
  switch (expression.kind) {
    case 'variable':
      add(expression.name, path);
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
