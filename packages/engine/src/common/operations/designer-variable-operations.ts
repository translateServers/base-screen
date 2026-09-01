import type {
  ScreenBlueprintValueExpression,
  ScreenDocument,
  ScreenParseResult,
  ScreenVariable,
} from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';

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
  const add = (name: string): void => {
    referenced.set(name, (referenced.get(name) ?? 0) + 1);
  };
  for (const component of document.components) {
    const source = component.dataSource;
    if (source?.type !== 'host-resource') continue;
    for (const parameter of Object.values(source.params)) {
      if (parameter?.kind === 'variable') add(parameter.name);
    }
  }
  for (const rule of document.blueprint.rules) {
    if (rule.condition !== undefined) {
      collectExpressionVariableReferences(rule.condition.left, add);
      if (rule.condition.right !== undefined) {
        collectExpressionVariableReferences(rule.condition.right, add);
      }
    }
    for (const action of rule.actions) {
      if (action.type === 'set-variable') {
        add(action.variableName);
        collectExpressionVariableReferences(action.value, add);
      } else if (action.type !== 'component-visibility') {
        collectExpressionVariableReferences(action.payload, add);
      }
    }
  }
  return referenced;
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
  add: (name: string) => void,
): void {
  switch (expression.kind) {
    case 'variable':
      add(expression.name);
      return;
    case 'array':
      for (const item of expression.items) {
        collectExpressionVariableReferences(item, add);
      }
      return;
    case 'object':
      for (const item of Object.values(expression.properties)) {
        collectExpressionVariableReferences(item, add);
      }
      return;
    default:
      return;
  }
}
