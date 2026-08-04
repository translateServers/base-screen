import { z } from 'zod';
import type { ScreenJsonObject } from '../types/json.js';
import { MAX_BACKGROUND_COLOR_CODE_POINTS, MAX_NAME_CODE_POINTS } from './limits.js';
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
  return generated as ScreenJsonObject;
}

function getObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid JSON Schema structure in screen document schema generation.');
  }
  return value as Record<string, unknown>;
}

export const SCREEN_DOCUMENT_JSON_SCHEMA: ScreenJsonObject = generateScreenDocumentJsonSchema();
