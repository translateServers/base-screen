import type { ScreenBlueprintValueExpression, ScreenDocument } from '@base-screen/contracts';
import {
  MAX_VALUE_REF_PATH_SEGMENTS,
  readScreenBlueprintEventPort,
  VALUE_REF_PATH_SEGMENT_PATTERN,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialObjectSchema,
} from '@base-screen/plugin-core';
import { designerBlueprintEdgeTriggers } from './designer-blueprint-graph.js';

export type DesignerBlueprintSetVariableSource =
  | 'literal'
  | 'event'
  | 'event-field'
  | 'variable'
  | 'advanced';

const EVENT_FIELD_SEGMENT = new RegExp(VALUE_REF_PATH_SEGMENT_PATTERN);

/**
 * 连线能否取事件字段：上游（越过条件节点）至少有一个组件事件触发锚点，
 * 或从画布「已打开」（负载是打开参数）/ 主画布「页面已切换」（负载 `{ from, to }`）锚点。
 */
export function designerBlueprintTriggerSupportsEventField(
  document: ScreenDocument,
  edgeId: string,
): boolean {
  return designerBlueprintEdgeTriggers(document.blueprint, edgeId).some(
    (trigger) =>
      trigger.node.kind === 'component' ||
      (trigger.node.kind === 'sub-canvas' && trigger.port === 'opened') ||
      (trigger.node.kind === 'main-canvas' && trigger.port === 'page-changed'),
  );
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

/** 上游组件事件声明的负载字段（并集，去重）；物料未声明 payloadSchema 时为空。 */
export function designerBlueprintEventFieldPaths(
  document: ScreenDocument,
  edgeId: string,
  catalog: BaseScreenMaterialCatalog | undefined,
): readonly (readonly string[])[] {
  const paths: (readonly string[])[] = [];
  const seen = new Set<string>();
  for (const trigger of designerBlueprintEdgeTriggers(document.blueprint, edgeId)) {
    if (trigger.node.kind !== 'component') continue;
    if (trigger.port === 'state-changed') {
      // 组件状态改变（ADR-0110 §2.3）的负载固定为 `{ from, to, cause }`。
      for (const key of ['from', 'to', 'cause']) {
        if (seen.has(key)) continue;
        seen.add(key);
        paths.push([key]);
      }
      continue;
    }
    const componentId = trigger.node.componentId;
    const eventName = readScreenBlueprintEventPort(trigger.port);
    const component = document.components.find((candidate) => candidate.id === componentId);
    const schema = catalog
      ?.get(component?.type ?? '')
      ?.manifest.editorDescriptor?.events?.find((event) => event.name === eventName)?.payloadSchema;
    if (schema === undefined) continue;
    for (const path of collectObjectPaths(schema)) {
      const key = path.join('.');
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(path);
    }
  }
  return paths;
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
