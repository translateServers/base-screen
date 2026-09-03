import type {
  ScreenBlueprintAction,
  ScreenBlueprintComponentVisibilityAction,
  ScreenBlueprintCondition,
  ScreenBlueprintValueExpression,
} from '@base-screen/contracts';
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
  return {
    kind: action.type,
    primary: action.actionId,
    secondary: summarizeExpression(action.payload),
    order: actionIndex + 1,
  };
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
