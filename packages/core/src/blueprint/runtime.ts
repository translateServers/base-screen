import {
  parseScreenJsonValue,
  type ScreenBlueprintHostEvent,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';

export interface ScreenBlueprintEvent {
  readonly componentId: string;
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface ScreenBlueprintPlan {
  readonly rules: ScreenDocument['blueprint']['rules'];
  readonly initialVariables: ScreenJsonObject;
}

export interface ScreenBlueprintDispatchResult {
  readonly variables: ScreenJsonObject;
  readonly hostEvents: readonly ScreenBlueprintHostEvent[];
}

export function compileScreenBlueprint(document: ScreenDocument): ScreenBlueprintPlan {
  const initialVariables: Record<string, ScreenJsonValue> = {};
  for (const variable of document.variables) {
    initialVariables[variable.name] = cloneValue(variable.value);
  }
  return {
    rules: document.blueprint.rules.map((rule) => ({
      ...rule,
      trigger: { ...rule.trigger },
      actions: rule.actions.map((action) => ({
        ...action,
        ...(action.type === 'set-variable'
          ? { value: cloneValue(action.value) }
          : { payload: cloneValue(action.payload) }),
      })),
    })),
    initialVariables,
  };
}

export function dispatchScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
): ScreenParseResult<ScreenBlueprintDispatchResult> {
  const parsedPayload = parseScreenJsonValue(event.payload, { maxBytes: 256 * 1024 });
  if (!parsedPayload.ok) {
    return parsedPayload;
  }
  const variables = cloneObject(state);
  const hostEvents: ScreenBlueprintHostEvent[] = [];
  for (const rule of plan.rules) {
    if (rule.trigger.componentId !== event.componentId || rule.trigger.eventName !== event.name) {
      continue;
    }
    for (const action of rule.actions) {
      if (action.type === 'set-variable') {
        variables[action.variableName] = cloneValue(action.value);
      } else {
        hostEvents.push({ name: action.eventName, payload: cloneValue(action.payload) });
      }
    }
  }
  return { ok: true, value: { variables, hostEvents }, diagnostics: [] };
}

function cloneObject(value: ScreenJsonObject): Record<string, ScreenJsonValue> {
  const parsed = parseScreenJsonValue(value, { maxBytes: 2 * 1024 * 1024 });
  if (
    !parsed.ok ||
    parsed.value === null ||
    Array.isArray(parsed.value) ||
    typeof parsed.value !== 'object'
  ) {
    throw new Error('Blueprint variable state must be a JSON object.');
  }
  return { ...(parsed.value as ScreenJsonObject) };
}

function cloneValue(value: ScreenJsonValue): ScreenJsonValue {
  const parsed = parseScreenJsonValue(value, { maxBytes: 2 * 1024 * 1024 });
  if (!parsed.ok) {
    throw new Error('Blueprint plan contains invalid JSON.');
  }
  return parsed.value;
}
