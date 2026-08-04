import { z } from 'zod';
import type { ScreenJsonObject } from '../types/json.js';
import {
  MAX_BACKGROUND_COLOR_CODE_POINTS,
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
  const components = getObject(properties.components);
  const component = getObject(components.items);
  const componentProperties = getObject(component.properties);
  getObject(componentProperties.name).maxLength = MAX_NAME_CODE_POINTS;
  const blueprint = getObject(properties.blueprint);
  const rules = getObject(getObject(blueprint.properties).rules);
  const rule = getObject(rules.items);
  const condition = getObject(getObject(rule.properties).condition);
  condition.allOf = [
    {
      if: { properties: { operator: { const: 'exists' } }, required: ['operator'] },
      then: { not: { required: ['right'] } },
      else: { required: ['right'] },
    },
  ];
  const definitions = getObject(generated.$defs);
  const expression = getObject(definitions.__schema0);
  const objectExpression = (expression.anyOf as unknown[]).find(
    (branch) => getObject(getObject(getObject(branch).properties).kind).const === 'object',
  );
  const objectProperties = getObject(getObject(objectExpression).properties).properties;
  getObject(objectProperties).maxProperties = MAX_BLUEPRINT_EXPRESSION_CONTAINERS;
  return generated as ScreenJsonObject;
}

function getObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid JSON Schema structure in screen document schema generation.');
  }
  return value as Record<string, unknown>;
}

export const SCREEN_DOCUMENT_JSON_SCHEMA: ScreenJsonObject = generateScreenDocumentJsonSchema();
