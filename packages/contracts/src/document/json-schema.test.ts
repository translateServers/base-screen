import { describe, expect, it } from 'vitest';
import goldenSchema from '../screen-document.schema.json';
import { generateScreenDocumentJsonSchema, SCREEN_DOCUMENT_JSON_SCHEMA } from './json-schema.js';
import { MAX_BACKGROUND_COLOR_CODE_POINTS, MAX_NAME_CODE_POINTS } from './limits.js';
import { COMPONENT_ID_PATTERN, MATERIAL_TYPE_PATTERN, VARIABLE_NAME_PATTERN } from './schema.js';

const schema = SCREEN_DOCUMENT_JSON_SCHEMA as unknown as Record<string, unknown>;

function propertiesOf(node: unknown): Record<string, unknown> {
  return (node as { properties: Record<string, unknown> }).properties;
}

describe('SCREEN_DOCUMENT_JSON_SCHEMA', () => {
  it('matches the committed golden artifact', () => {
    expect(goldenSchema).toEqual(SCREEN_DOCUMENT_JSON_SCHEMA);
  });

  it('is deterministic', () => {
    expect(generateScreenDocumentJsonSchema()).toEqual(SCREEN_DOCUMENT_JSON_SCHEMA);
  });

  it('declares the draft and document id', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('urn:base-screen:schema:screen-document:2');
  });

  it('pins the current schemaVersion as a const', () => {
    const schemaVersion = propertiesOf(schema).schemaVersion as { const: number };
    expect(schemaVersion.const).toBe(2);
  });

  it('marks every canonical object as strict', () => {
    const canvas = propertiesOf(schema).canvas as Record<string, unknown>;
    const components = propertiesOf(schema).components as { items: unknown };
    const component = components.items as Record<string, unknown>;
    const componentFields = propertiesOf(component);
    const position = componentFields.position as Record<string, unknown>;
    const size = componentFields.size as Record<string, unknown>;
    const status = componentFields.status as Record<string, unknown>;
    const dataSource = (componentFields.dataSource as { anyOf: unknown[] }).anyOf.find(
      (entry) => (entry as { type?: string }).type === 'object',
    );
    const variables = propertiesOf(schema).variables as { items: unknown };
    const variable = variables.items as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    expect(canvas.additionalProperties).toBe(false);
    expect(component.additionalProperties).toBe(false);
    expect(position.additionalProperties).toBe(false);
    expect(size.additionalProperties).toBe(false);
    expect(status.additionalProperties).toBe(false);
    expect((dataSource as Record<string, unknown>).additionalProperties).toBe(false);
    expect(variable.additionalProperties).toBe(false);
  });

  it('expresses patterns and geometry bounds', () => {
    const components = propertiesOf(schema).components as { items: unknown };
    const component = propertiesOf(components.items as Record<string, unknown>);
    const id = component.id as { pattern: string };
    const type = component.type as { pattern: string };
    const rotation = component.rotation as { minimum: number; exclusiveMaximum: number };
    const zIndex = component.zIndex as { minimum: number; maximum: number };
    expect(id.pattern).toBe(COMPONENT_ID_PATTERN);
    expect(type.pattern).toBe(new RegExp(MATERIAL_TYPE_PATTERN).source);
    expect(rotation.minimum).toBe(-180);
    expect(rotation.exclusiveMaximum).toBe(180);
    expect(zIndex.minimum).toBe(0);
    expect(zIndex.maximum).toBe(1_000_000);
    const variables = propertiesOf(schema).variables as { items: unknown };
    const variable = propertiesOf(variables.items as Record<string, unknown>);
    expect((variable.name as { pattern: string }).pattern).toBe(VARIABLE_NAME_PATTERN);
  });

  it('applies code point length limits to unicode fields', () => {
    const canvasFields = propertiesOf(propertiesOf(schema).canvas as Record<string, unknown>);
    const backgroundColor = canvasFields.backgroundColor as {
      minLength: number;
      maxLength: number;
    };
    expect(backgroundColor.minLength).toBe(1);
    expect(backgroundColor.maxLength).toBe(MAX_BACKGROUND_COLOR_CODE_POINTS);
    const components = propertiesOf(schema).components as { items: unknown };
    const componentFields = propertiesOf(components.items as Record<string, unknown>);
    const name = componentFields.name as { minLength: number; maxLength: number };
    expect(name.minLength).toBe(1);
    expect(name.maxLength).toBe(MAX_NAME_CODE_POINTS);
  });

  it('contains no zod-specific metadata', () => {
    const serialized = JSON.stringify(SCREEN_DOCUMENT_JSON_SCHEMA);
    expect(serialized).not.toContain('__zod');
    expect(serialized).not.toContain('$type');
  });
});
