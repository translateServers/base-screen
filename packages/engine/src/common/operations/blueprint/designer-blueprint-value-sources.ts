import type { ScreenBlueprintValueExpression, ScreenDocument } from '@base-screen/contracts';
import {
  MAX_VALUE_REF_PATH_SEGMENTS,
  VALUE_REF_PATH_SEGMENT_PATTERN,
} from '@base-screen/contracts';
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

const EVENT_FIELD_SEGMENT = new RegExp(VALUE_REF_PATH_SEGMENT_PATTERN);

/** 触发事件能否提供事件字段：只要不是变量事件，字段路径就由用户自由填写。 */
export function designerBlueprintTriggerSupportsEventField(
  document: ScreenDocument,
  ruleId: string,
): boolean {
  const rule = document.blueprint.rules.find((candidate) => candidate.id === ruleId);
  return rule?.trigger.type === 'material-event';
}

/**
 * 事件字段路径的输入词法：点号分隔，每段与文档取值引用同词法，最多 8 段。
 * 声明字段只是建议，物料没写 payloadSchema 时也允许手填 `row.city`。
 */
export function parseDesignerBlueprintEventFieldPath(input: string): readonly string[] | null {
  const segments = input.split('.').map((segment) => segment.trim());
  if (
    segments.length === 0 ||
    segments.length > MAX_VALUE_REF_PATH_SEGMENTS ||
    segments.some((segment) => segment === '' || !EVENT_FIELD_SEGMENT.test(segment))
  ) {
    return null;
  }
  return segments;
}

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
