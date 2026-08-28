import { z } from 'zod';
import { SCREEN_MATERIAL_TYPE_PATTERN } from './identity.js';
import {
  MAX_BACKGROUND_COLOR_CODE_POINTS,
  MAX_BACKGROUND_GRADIENT_STOPS,
  MAX_BLUEPRINT_ACTIONS_PER_RULE,
  MAX_BLUEPRINT_EXPRESSION_CONTAINERS,
  MAX_BLUEPRINT_LAYOUT_NODES,
  MAX_BLUEPRINT_RULES,
  MAX_COMPONENTS,
  MAX_STYLE_RULE_ID_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENTS,
  MAX_STYLE_RULES_PER_COMPONENT,
  MAX_VARIABLES,
} from './limits.js';

export const COMPONENT_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
export const MATERIAL_TYPE_PATTERN = SCREEN_MATERIAL_TYPE_PATTERN;
export const VARIABLE_NAME_PATTERN = '^[A-Za-z_][A-Za-z0-9_]{0,127}$';
export const BLUEPRINT_PATH_SEGMENT_PATTERN =
  '^(?!(?:__proto__|prototype|constructor)$)[A-Za-z_][A-Za-z0-9_]{0,127}$';

const canvasBackgroundColorSchema = z.string().min(1).max(MAX_BACKGROUND_COLOR_CODE_POINTS);
const canvasColorStopSchema = z.strictObject({
  color: canvasBackgroundColorSchema,
  position: z.number().finite().min(0).max(100),
});
const canvasGradientStopsSchema = z
  .array(canvasColorStopSchema)
  .min(2)
  .max(MAX_BACKGROUND_GRADIENT_STOPS)
  .superRefine((stops, context) => {
    for (let index = 1; index < stops.length; index++) {
      if (stops[index - 1]!.position >= stops[index]!.position) {
        context.addIssue({
          code: 'custom',
          path: [index, 'position'],
          message: 'Gradient stop positions must be strictly ascending.',
        });
      }
    }
  });

const canvasBackgroundSchema = z.union([
  z.strictObject({ type: z.literal('solid'), color: canvasBackgroundColorSchema }),
  z.strictObject({
    type: z.literal('linear-gradient'),
    angle: z.number().finite().min(0).max(360),
    stops: canvasGradientStopsSchema,
  }),
  z.strictObject({
    type: z.literal('radial-gradient'),
    position: z.strictObject({
      x: z.number().finite().min(0).max(100),
      y: z.number().finite().min(0).max(100),
    }),
    stops: canvasGradientStopsSchema,
  }),
]);

export const canvasSchema = z.strictObject({
  width: z.number().int().min(1).max(100_000),
  height: z.number().int().min(1).max(100_000),
  backgroundColor: canvasBackgroundColorSchema,
  background: canvasBackgroundSchema.optional(),
  backgroundImage: z.string().min(1).optional(),
  backgroundImageFit: z.enum(['cover', 'contain']).optional(),
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

const styleRuleConditionSchema = z
  .strictObject({
    path: z
      .array(z.string().min(1).max(MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS))
      .max(MAX_STYLE_RULE_PATH_SEGMENTS),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists']),
    value: z.any().optional(),
  })
  .superRefine((condition, context) => {
    if (condition.operator === 'exists' && condition.value !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'exists style rule condition must not define value.',
        path: ['value'],
      });
    }
    if (condition.operator !== 'exists' && condition.value === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'style rule condition requires value.',
        path: ['value'],
      });
    }
  });

const styleRuleSchema = z.strictObject({
  id: z.string().min(1).max(MAX_STYLE_RULE_ID_CODE_POINTS),
  when: styleRuleConditionSchema,
  style: z.record(z.string(), z.any()),
});

const dataBindingSchema = z.strictObject({
  fields: z.record(z.string().min(1).max(128), z.array(z.string().min(1).max(256)).min(1).max(256)),
});

export const staticDataSourceSchema = z.strictObject({
  type: z.literal('static'),
  value: z.any(),
  binding: dataBindingSchema.optional(),
});

export const hostResourceDataSourceSchema = z.strictObject({
  type: z.literal('host-resource'),
  resourceType: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  resourceId: z.string().min(1).max(256),
  params: z.record(
    z.string().min(1).max(128),
    z.union([
      z.strictObject({ kind: z.literal('literal'), value: z.any() }),
      z.strictObject({
        kind: z.literal('variable'),
        name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
      }),
    ]),
  ),
  binding: z.union([dataBindingSchema, z.null()]),
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
  styleRules: z.array(styleRuleSchema).max(MAX_STYLE_RULES_PER_COMPONENT).optional(),
  dataSource: z.union([staticDataSourceSchema, hostResourceDataSourceSchema, z.null()]),
});

export const staticVariableSchema = z.strictObject({
  type: z.literal('static'),
  name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  value: z.any(),
});

export const hostVariableSchema = z.strictObject({
  type: z.literal('host'),
  name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  variableId: z.string().min(1).max(256),
});

const blueprintTriggerSchema = z.strictObject({
  type: z.literal('material-event'),
  componentId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  eventName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
});

const blueprintValueExpressionSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.strictObject({ kind: z.literal('literal'), value: z.any() }),
    z.strictObject({
      kind: z.literal('event-payload'),
      path: z.array(z.string().regex(new RegExp(BLUEPRINT_PATH_SEGMENT_PATTERN))).max(16),
    }),
    z.strictObject({
      kind: z.literal('variable'),
      name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
    }),
    z.strictObject({
      kind: z.literal('array'),
      items: z.array(blueprintValueExpressionSchema).max(MAX_BLUEPRINT_EXPRESSION_CONTAINERS),
    }),
    z.strictObject({
      kind: z.literal('object'),
      properties: z.record(z.string(), blueprintValueExpressionSchema),
    }),
  ]),
);

const blueprintConditionSchema = z
  .strictObject({
    left: blueprintValueExpressionSchema,
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists']),
    right: blueprintValueExpressionSchema.optional(),
  })
  .superRefine((condition, context) => {
    if (condition.operator === 'exists' && condition.right !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'exists condition must not define right.',
        path: ['right'],
      });
    }
    if (condition.operator !== 'exists' && condition.right === undefined) {
      context.addIssue({ code: 'custom', message: 'condition requires right.', path: ['right'] });
    }
  });

const setVariableActionSchema = z.strictObject({
  type: z.literal('set-variable'),
  variableName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  value: blueprintValueExpressionSchema,
});

const emitHostEventActionSchema = z.strictObject({
  type: z.literal('emit-host-event'),
  eventName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  payload: blueprintValueExpressionSchema,
});

const hostActionSchema = z.strictObject({
  type: z.literal('host-action'),
  actionId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  payload: blueprintValueExpressionSchema,
});

const componentVisibilityActionSchema = z.strictObject({
  type: z.literal('component-visibility'),
  componentId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  operation: z.enum(['show', 'hide', 'toggle']),
  transition: z
    .strictObject({
      effect: z.enum(['appear', 'fade', 'slide-up']),
      durationMs: z.number().int().min(0).max(10_000),
      easing: z.enum(['linear', 'ease-in-out-quad', 'ease-in-out-expo']),
    })
    .optional(),
});

const blueprintRuleSchema = z.strictObject({
  id: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  trigger: blueprintTriggerSchema,
  requiredCapabilities: z.array(z.string().regex(new RegExp(COMPONENT_ID_PATTERN))).optional(),
  condition: blueprintConditionSchema.optional(),
  actions: z
    .array(
      z.union([
        setVariableActionSchema,
        emitHostEventActionSchema,
        hostActionSchema,
        componentVisibilityActionSchema,
      ]),
    )
    .max(MAX_BLUEPRINT_ACTIONS_PER_RULE),
});

const blueprintLayoutSchema = z.strictObject({
  nodes: z
    .array(
      z.strictObject({
        id: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
        x: z.number().finite(),
        y: z.number().finite(),
        collapsed: z.boolean().optional(),
      }),
    )
    .max(MAX_BLUEPRINT_LAYOUT_NODES),
  viewport: z
    .strictObject({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().finite().min(0.1).max(4),
    })
    .optional(),
});

export const blueprintSchema = z.strictObject({
  rules: z.array(blueprintRuleSchema).max(MAX_BLUEPRINT_RULES),
  layout: blueprintLayoutSchema.optional(),
});

export const documentSchema = z.strictObject({
  canvas: canvasSchema,
  components: z.array(componentSchema).max(MAX_COMPONENTS),
  variables: z.array(z.union([staticVariableSchema, hostVariableSchema])).max(MAX_VARIABLES),
  blueprint: blueprintSchema,
});
