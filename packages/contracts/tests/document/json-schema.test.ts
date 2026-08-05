import { describe, expect, it } from 'vitest';
import {
  generateScreenDocumentJsonSchema,
  SCREEN_DOCUMENT_JSON_SCHEMA,
} from '../../src/document/json-schema.js';
import {
  MAX_BACKGROUND_COLOR_CODE_POINTS,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_NAME_CODE_POINTS,
} from '../../src/document/limits.js';
import {
  BLUEPRINT_PATH_SEGMENT_PATTERN,
  COMPONENT_ID_PATTERN,
  MATERIAL_TYPE_PATTERN,
  VARIABLE_NAME_PATTERN,
} from '../../src/document/schema.js';
import goldenSchema from '../../src/screen-document.schema.json';

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
    expect(schema.$id).toBe('urn:base-screen:schema:screen-document');
  });

  it('lists the current document fields', () => {
    expect(Object.keys(propertiesOf(schema))).toEqual([
      'canvas',
      'components',
      'variables',
      'blueprint',
    ]);
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
    const variableSchemas = (variables.items as { anyOf: Record<string, unknown>[] }).anyOf;
    expect(schema.additionalProperties).toBe(false);
    expect(canvas.additionalProperties).toBe(false);
    expect(component.additionalProperties).toBe(false);
    expect(position.additionalProperties).toBe(false);
    expect(size.additionalProperties).toBe(false);
    expect(status.additionalProperties).toBe(false);
    expect((dataSource as Record<string, unknown>).additionalProperties).toBe(false);
    for (const variable of variableSchemas) expect(variable.additionalProperties).toBe(false);
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
    const variable = propertiesOf(
      (variables.items as { anyOf: Record<string, unknown>[] }).anyOf[0]!,
    );
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

  it('expresses Blueprint condition and expression limits', () => {
    const blueprint = propertiesOf(schema).blueprint as Record<string, unknown>;
    const rules = propertiesOf(blueprint).rules as { items: unknown };
    const rule = propertiesOf(rules.items as Record<string, unknown>);
    const condition = rule.condition as { allOf: unknown[] };
    expect(condition.allOf).toEqual([
      {
        if: { properties: { operator: { const: 'exists' } }, required: ['operator'] },
        then: { not: { required: ['right'] } },
        else: { required: ['right'] },
      },
    ]);

    const definitions = schema.$defs as Record<string, unknown>;
    const expressions = definitions.__schema0 as { anyOf: Array<Record<string, unknown>> };
    const eventPayload = expressions.anyOf[1]!;
    const path = propertiesOf(eventPayload).path as { items: { pattern: string } };
    expect(path.items.pattern).toBe(BLUEPRINT_PATH_SEGMENT_PATTERN);
    const object = expressions.anyOf[4]!;
    const expressionProperties = propertiesOf(object).properties as { maxProperties: number };
    expect(expressionProperties.maxProperties).toBe(MAX_BLUEPRINT_EXPRESSION_CONTAINERS);
  });

  it('contains no zod-specific metadata', () => {
    const serialized = JSON.stringify(SCREEN_DOCUMENT_JSON_SCHEMA);
    expect(serialized).not.toContain('__zod');
    expect(serialized).not.toContain('$type');
  });
});
