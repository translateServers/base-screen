import {
  SCREEN_BLUEPRINT_CAPABILITIES,
  type ScreenBlueprintRule,
  type ScreenBlueprintValueExpression,
} from '@base-screen/contracts';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';

export function normalizeDesignerBlueprintRuleCapabilities(
  rule: ScreenBlueprintRule,
): ScreenBlueprintRule {
  const capabilities = new Set<string>([
    rule.trigger.type === 'material-event'
      ? SCREEN_BLUEPRINT_CAPABILITIES.materialEvent
      : SCREEN_BLUEPRINT_CAPABILITIES.variableEvent,
  ]);
  if (rule.condition !== undefined) {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.condition);
    collectExpressionCapabilities(rule.condition.left, capabilities);
    if (rule.condition.right !== undefined) {
      collectExpressionCapabilities(rule.condition.right, capabilities);
    }
  }
  for (const action of rule.actions) {
    if (action.type === 'set-variable') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.setVariable);
      collectExpressionCapabilities(action.value, capabilities);
    } else if (action.type === 'emit-host-event') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.emitHostEvent);
      collectExpressionCapabilities(action.payload, capabilities);
    } else if (action.type === 'component-visibility') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.componentVisibility);
    } else if (action.type === 'host-action') {
      collectExpressionCapabilities(action.payload, capabilities);
    } else if (action.type === 'request-variable') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestVariable);
    } else if (action.type === 'request-component-data') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestComponentData);
    }
  }
  for (const capability of rule.requiredCapabilities ?? []) capabilities.add(capability);
  return { ...rule, requiredCapabilities: [...capabilities] };
}

export function hasDesignerBlueprintCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  capability: string,
): boolean {
  try {
    return runtimeContributions?.hasBlueprintCapability(capability) === true;
  } catch {
    return false;
  }
}

function collectExpressionCapabilities(
  expression: ScreenBlueprintValueExpression,
  capabilities: Set<string>,
): void {
  if (expression.kind === 'event-payload') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.eventPayload);
  } else if (expression.kind === 'variable') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.variable);
  } else if (expression.kind === 'array') {
    for (const item of expression.items) collectExpressionCapabilities(item, capabilities);
  } else if (expression.kind === 'object') {
    for (const item of Object.values(expression.properties)) {
      collectExpressionCapabilities(item, capabilities);
    }
  }
}
