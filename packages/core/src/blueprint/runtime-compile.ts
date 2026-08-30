import type { ScreenDocument, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import { cloneCondition, cloneExpression, cloneValue, failure } from './runtime-json.js';
import type { ScreenBlueprintCapabilityIndex, ScreenBlueprintPlan } from './runtime-types.js';

export const SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY =
  'blueprint.action.component-visibility';

export function compileScreenBlueprint(
  document: ScreenDocument,
  capabilities: ScreenBlueprintCapabilityIndex = { hasBlueprintCapability: () => true },
): ScreenParseResult<ScreenBlueprintPlan> {
  for (const rule of document.blueprint.rules) {
    for (const capability of rule.requiredCapabilities ?? []) {
      if (!capabilities.hasBlueprintCapability(capability)) {
        return failure('BLUEPRINT_CAPABILITY_UNAVAILABLE', 'Blueprint capability is unavailable.');
      }
    }
    if (
      rule.actions.some((action) => action.type === 'component-visibility') &&
      !capabilities.hasBlueprintCapability(SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY)
    ) {
      return failure('BLUEPRINT_CAPABILITY_UNAVAILABLE', 'Blueprint capability is unavailable.');
    }
  }
  const initialVariables: Record<string, ScreenJsonValue> = {};
  for (const variable of document.variables) {
    if (variable.type === 'static') initialVariables[variable.name] = cloneValue(variable.value);
  }
  return {
    ok: true,
    value: {
      rules: document.blueprint.rules.map((rule) => ({
        ...rule,
        trigger: { ...rule.trigger },
        ...(rule.condition ? { condition: cloneCondition(rule.condition) } : {}),
        actions: rule.actions.map((action) => {
          if (action.type === 'component-visibility') {
            return {
              ...action,
              ...(action.transition === undefined ? {} : { transition: { ...action.transition } }),
            };
          }
          return {
            ...action,
            ...(action.type === 'set-variable'
              ? { value: cloneExpression(action.value) }
              : { payload: cloneExpression(action.payload) }),
          };
        }),
      })),
      initialVariables,
    },
    diagnostics: [],
  };
}
