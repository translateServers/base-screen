import type { ScreenBlueprintRule, ScreenBlueprintValueExpression } from '@base-screen/contracts';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';

export const DESIGNER_BLUEPRINT_CAPABILITIES = {
  materialEvent: 'blueprint.trigger.material-event',
  eventPayload: 'blueprint.value.event-payload',
  variable: 'blueprint.value.variable',
  condition: 'blueprint.condition.compare',
  setVariable: 'blueprint.action.set-variable',
  emitHostEvent: 'blueprint.action.emit-host-event',
  componentVisibility: 'blueprint.action.component-visibility',
} as const;

export function normalizeDesignerBlueprintRuleCapabilities(
  rule: ScreenBlueprintRule,
): ScreenBlueprintRule {
  const capabilities = new Set<string>([DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent]);
  if (rule.condition !== undefined) {
    capabilities.add(DESIGNER_BLUEPRINT_CAPABILITIES.condition);
    collectExpressionCapabilities(rule.condition.left, capabilities);
    if (rule.condition.right !== undefined) {
      collectExpressionCapabilities(rule.condition.right, capabilities);
    }
  }
  for (const action of rule.actions) {
    if (action.type === 'set-variable') {
      capabilities.add(DESIGNER_BLUEPRINT_CAPABILITIES.setVariable);
      collectExpressionCapabilities(action.value, capabilities);
    } else if (action.type === 'emit-host-event') {
      capabilities.add(DESIGNER_BLUEPRINT_CAPABILITIES.emitHostEvent);
      collectExpressionCapabilities(action.payload, capabilities);
    } else if (action.type === 'component-visibility') {
      capabilities.add(DESIGNER_BLUEPRINT_CAPABILITIES.componentVisibility);
    } else {
      collectExpressionCapabilities(action.payload, capabilities);
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
    capabilities.add(DESIGNER_BLUEPRINT_CAPABILITIES.eventPayload);
  } else if (expression.kind === 'variable') {
    capabilities.add(DESIGNER_BLUEPRINT_CAPABILITIES.variable);
  } else if (expression.kind === 'array') {
    for (const item of expression.items) collectExpressionCapabilities(item, capabilities);
  } else if (expression.kind === 'object') {
    for (const item of Object.values(expression.properties)) {
      collectExpressionCapabilities(item, capabilities);
    }
  }
}
