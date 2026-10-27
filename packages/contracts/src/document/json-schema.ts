import { z } from 'zod';
import type { ScreenJsonObject } from '../types/json.js';
import {
  MAX_BACKGROUND_COLOR_CODE_POINTS,
  MAX_BACKGROUND_IMAGE_CODE_POINTS,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_NAME_CODE_POINTS,
} from './limits.js';
import { documentSchema } from './schema.js';

export const SCREEN_DOCUMENT_JSON_SCHEMA_ID = 'urn:base-screen:schema:screen-document';

export function generateScreenDocumentJsonSchema(): ScreenJsonObject {
  const generated = z.toJSONSchema(documentSchema) as Record<string, unknown>;
  generated.$id = SCREEN_DOCUMENT_JSON_SCHEMA_ID;
  const properties = getObject(generated.properties);
  const canvas = getObject(getObject(properties.canvas).properties);
  getObject(canvas.backgroundColor).maxLength = MAX_BACKGROUND_COLOR_CODE_POINTS;
  getObject(canvas.backgroundImage).maxLength = MAX_BACKGROUND_IMAGE_CODE_POINTS;
  const components = getObject(properties.components);
  const component = getObject(components.items);
  const componentProperties = getObject(component.properties);
  getObject(componentProperties.name).maxLength = MAX_NAME_CODE_POINTS;
  const styleRuleWhen = getObject(
    getObject(getObject(getObject(componentProperties.styleRules).items).properties).when,
  );
  styleRuleWhen.allOf = [
    {
      if: { properties: { operator: { const: 'exists' } }, required: ['operator'] },
      then: { not: { required: ['value'] } },
      else: { required: ['value'] },
    },
  ];
  // 数据源实例的刷新策略交叉约束：auto 必须带 intervalSeconds，其余模式禁止带。
  const updatePolicy = getObject(
    getObject(getObject(getObject(properties.dataSources).items).properties).updatePolicy,
  );
  updatePolicy.allOf = [
    {
      if: { properties: { mode: { const: 'auto' } }, required: ['mode'] },
      then: { required: ['intervalSeconds'] },
      else: { not: { required: ['intervalSeconds'] } },
    },
  ];
  const behaviorRelation = findObjectWithTypeConst(generated, 'behavior');
  const condition = getObject(getObject(behaviorRelation.properties).condition);
  condition.allOf = [
    {
      if: { properties: { operator: { const: 'exists' } }, required: ['operator'] },
      then: { not: { required: ['right'] } },
      else: { required: ['right'] },
    },
  ];
  const expression = findExpressionDefinition(generated);
  const objectExpression = (expression.anyOf as unknown[]).find(
    (branch) => getObject(getObject(getObject(branch).properties).kind).const === 'object',
  );
  const objectProperties = getObject(getObject(objectExpression).properties).properties;
  getObject(objectProperties).maxProperties = MAX_BLUEPRINT_EXPRESSION_CONTAINERS;
  return generated as ScreenJsonObject;
}

function findExpressionDefinition(generated: Record<string, unknown>): Record<string, unknown> {
  const definitions = getObject(generated.$defs);
  for (const value of Object.values(definitions)) {
    if (isExpressionSchema(value)) return getObject(value);
  }
  throw new Error('Blueprint expression definition is missing from the screen document schema.');
}

function isExpressionSchema(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const anyOf = (value as { anyOf?: unknown }).anyOf;
  if (!Array.isArray(anyOf)) return false;
  return anyOf.some((branch) => {
    if (branch === null || typeof branch !== 'object') return false;
    const properties = (branch as { properties?: unknown }).properties;
    if (properties === null || typeof properties !== 'object') return false;
    const kind = (properties as { kind?: unknown }).kind;
    return (
      kind !== null && typeof kind === 'object' && (kind as { const?: unknown }).const === 'object'
    );
  });
}

function findObjectWithTypeConst(root: unknown, constant: string): Record<string, unknown> {
  const found = searchObjectWithTypeConst(root, constant);
  if (found === undefined) {
    throw new Error(`Schema branch with type "${constant}" is missing.`);
  }
  return found;
}

function searchObjectWithTypeConst(
  value: unknown,
  constant: string,
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = searchObjectWithTypeConst(item, constant);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const direct = tryFindObjectWithTypeConst(value, constant);
  if (direct !== undefined) return direct;
  for (const child of Object.values(value)) {
    const found = searchObjectWithTypeConst(child, constant);
    if (found !== undefined) return found;
  }
  return undefined;
}

function tryFindObjectWithTypeConst(
  value: unknown,
  constant: string,
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const properties = (value as { properties?: unknown }).properties;
  if (properties === null || typeof properties !== 'object') return undefined;
  const type = (properties as { type?: unknown }).type;
  if (type === null || typeof type !== 'object') return undefined;
  return (type as { const?: unknown }).const === constant
    ? (value as Record<string, unknown>)
    : undefined;
}

function getObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid JSON Schema structure in screen document schema generation.');
  }
  return value as Record<string, unknown>;
}

export const SCREEN_DOCUMENT_JSON_SCHEMA: ScreenJsonObject = generateScreenDocumentJsonSchema();
