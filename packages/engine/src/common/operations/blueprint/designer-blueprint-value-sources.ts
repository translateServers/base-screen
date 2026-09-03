import type { ScreenBlueprintValueExpression, ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';

export type DesignerBlueprintSetVariableSource =
  | 'literal'
  | 'event'
  | 'event-field'
  | 'variable'
  | 'advanced';

export function designerBlueprintSetVariableSource(
  expression: ScreenBlueprintValueExpression,
): DesignerBlueprintSetVariableSource {
  if (expression.kind === 'literal') return 'literal';
  if (expression.kind === 'event-payload') {
    return expression.path.length === 0 ? 'event' : 'event-field';
  }
  if (expression.kind === 'variable') return 'variable';
  return 'advanced';
}

export function designerBlueprintEventFieldPaths(
  document: ScreenDocument,
  ruleId: string,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly (readonly string[])[] {
  const rule = document.blueprint.rules.find((candidate) => candidate.id === ruleId);
  if (rule?.trigger.type !== 'material-event') return [];
  const trigger = rule.trigger;
  const component = document.components.find((candidate) => candidate.id === trigger.componentId);
  const schema = catalog
    ?.get(component?.type ?? '')
    ?.manifest.editorDescriptor?.events?.find(
      (event) => event.name === trigger.eventName,
    )?.payloadSchema;
  return schema === undefined ? [] : collectObjectPaths(schema);
}

function collectObjectPaths(
  schema: BaseScreenMaterialObjectSchema,
  prefix: readonly string[] = [],
): readonly (readonly string[])[] {
  return Object.entries(schema.properties).flatMap(([key, child]) => {
    const path = [...prefix, key];
    return child.kind === 'object' ? [path, ...collectObjectPaths(child, path)] : [path];
  });
}
