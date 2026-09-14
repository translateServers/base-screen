import type {
  ScreenBlueprintAction,
  ScreenBlueprintComponentVisibilityAction,
  ScreenBlueprintCondition,
  ScreenBlueprintValueExpression,
} from '@base-screen/contracts';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';
import type { BaseScreenBlueprintCanvasNode } from './designer-blueprint-protocol.js';

export function summarizeDesignerBlueprintCondition(condition: ScreenBlueprintCondition): {
  readonly kind: 'condition';
  readonly primary: string;
  readonly secondary: string;
} {
  return {
    kind: 'condition',
    primary: summarizeExpression(condition.left),
    secondary: `${condition.operator}${
      condition.right === undefined ? '' : ` · ${summarizeExpression(condition.right)}`
    }`,
  };
}

export function summarizeDesignerBlueprintAction(
  action: Exclude<ScreenBlueprintAction, ScreenBlueprintComponentVisibilityAction>,
  actionIndex: number,
  runtimeContributions?: BaseScreenRuntimeContributionIndex,
): NonNullable<BaseScreenBlueprintCanvasNode['summary']> {
  if (action.type === 'set-variable') {
    return {
      kind: action.type,
      primary: action.variableId,
      secondary: summarizeExpression(action.value),
      order: actionIndex + 1,
    };
  }
  if (action.type === 'emit-host-event') {
    return {
      kind: action.type,
      primary: action.eventName,
      secondary: summarizeExpression(action.payload),
      order: actionIndex + 1,
    };
  }
  if (action.type === 'request-variable') {
    return {
      kind: action.type,
      primary: action.variableId,
      secondary: 'request',
      order: actionIndex + 1,
    };
  }
  if (action.type === 'request-component-data') {
    return {
      kind: action.type,
      primary: action.componentId,
      secondary: 'request',
      order: actionIndex + 1,
    };
  }
  // 宿主动作（ADR-0076）：已声明则显示其清单名，未声明明确标出——作者配了一个永远不会
  // 执行的动作时，摘要里就能看出来，而不是等运行期静默失败。
  const declared = readDeclaredHostAction(runtimeContributions, action.actionId);
  return {
    kind: action.type,
    primary: declared?.name ?? action.actionId,
    secondary: declared === undefined ? '未声明' : summarizeExpression(action.payload),
    order: actionIndex + 1,
  };
}

function readDeclaredHostAction(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  actionId: string,
): { readonly name: string } | undefined {
  try {
    return runtimeContributions?.getBlueprintAction?.(actionId);
  } catch {
    return undefined;
  }
}

function summarizeExpression(expression: ScreenBlueprintValueExpression): string {
  switch (expression.kind) {
    case 'literal':
      return truncate(JSON.stringify(expression.value) ?? 'null');
    case 'event-payload':
      return `event.${expression.path.join('.') || '*'}`;
    case 'variable':
      return `$${expression.variableId}`;
    case 'array':
      return `array(${expression.items.length})`;
    case 'object':
      return `object(${Object.keys(expression.properties).length})`;
  }
}

function truncate(value: string): string {
  return value.length <= 96 ? value : `${value.slice(0, 93)}...`;
}
