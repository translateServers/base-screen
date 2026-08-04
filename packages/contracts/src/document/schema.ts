import { z } from 'zod';
import { SCREEN_DOCUMENT_SCHEMA_VERSION } from '../types/document.js';
import { SCREEN_MATERIAL_TYPE_PATTERN } from './identity.js';
import {
  MAX_BLUEPRINT_ACTIONS_PER_RULE,
  MAX_BLUEPRINT_RULES,
  MAX_COMPONENTS,
  MAX_VARIABLES,
} from './limits.js';

export const COMPONENT_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
export const MATERIAL_TYPE_PATTERN = SCREEN_MATERIAL_TYPE_PATTERN;
export const VARIABLE_NAME_PATTERN = '^[A-Za-z_][A-Za-z0-9_]{0,127}$';

export const canvasSchema = z.strictObject({
  width: z.number().int().min(1).max(100_000),
  height: z.number().int().min(1).max(100_000),
  backgroundColor: z.string().min(1),
});

export const positionSchema = z.strictObject({
  x: z.number().min(-1_000_000).max(1_000_000),
  y: z.number().min(-1_000_000).max(1_000_000),
});

export const sizeSchema = z.strictObject({
  width: z.number().gt(0).max(1_000_000),
  height: z.number().gt(0).max(1_000_000),
});

export const componentStatusSchema = z.strictObject({
  locked: z.boolean(),
  hidden: z.boolean(),
});

export const staticDataSourceSchema = z.strictObject({
  type: z.literal('static'),
  value: z.any(),
});

export const hostResourceDataSourceSchema = z.strictObject({
  type: z.literal('host-resource'),
  resourceType: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  resourceId: z.string().min(1).max(256),
  params: z.record(z.string(), z.any()),
});

export const componentSchema = z.strictObject({
  id: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  type: z.string().regex(new RegExp(MATERIAL_TYPE_PATTERN)),
  name: z.string().min(1),
  parentId: z.union([z.string().regex(new RegExp(COMPONENT_ID_PATTERN)), z.null()]),
  position: positionSchema,
  size: sizeSchema,
  rotation: z.number().gte(-180).lt(180),
  zIndex: z.number().int().min(0).max(1_000_000),
  status: componentStatusSchema,
  props: z.record(z.string(), z.any()),
  style: z.record(z.string(), z.any()),
  dataSource: z.union([staticDataSourceSchema, hostResourceDataSourceSchema, z.null()]),
});

export const staticVariableSchema = z.strictObject({
  type: z.literal('static'),
  name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  value: z.any(),
});

const blueprintTriggerSchema = z.strictObject({
  type: z.literal('material-event'),
  componentId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  eventName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
});

const setVariableActionSchema = z.strictObject({
  type: z.literal('set-variable'),
  variableName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  value: z.any(),
});

const emitHostEventActionSchema = z.strictObject({
  type: z.literal('emit-host-event'),
  eventName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  payload: z.any(),
});

const blueprintRuleSchema = z.strictObject({
  id: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  trigger: blueprintTriggerSchema,
  actions: z
    .array(z.union([setVariableActionSchema, emitHostEventActionSchema]))
    .max(MAX_BLUEPRINT_ACTIONS_PER_RULE),
});

export const blueprintSchema = z.strictObject({
  apiVersion: z.literal(1),
  rules: z.array(blueprintRuleSchema).max(MAX_BLUEPRINT_RULES),
});

export const documentSchema = z.strictObject({
  schemaVersion: z.literal(SCREEN_DOCUMENT_SCHEMA_VERSION),
  canvas: canvasSchema,
  components: z.array(componentSchema).max(MAX_COMPONENTS),
  variables: z.array(staticVariableSchema).max(MAX_VARIABLES),
  blueprint: blueprintSchema,
});
