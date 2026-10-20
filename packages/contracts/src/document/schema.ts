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
  MAX_DATA_SOURCE_NAME_CODE_POINTS,
  MAX_DATA_SOURCE_PARAMS,
  MAX_DATA_SOURCE_UPDATE_INTERVAL_SECONDS,
  MAX_DATA_SOURCES,
  MAX_DESCRIPTION_CODE_POINTS,
  MAX_STYLE_RULE_ID_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENTS,
  MAX_STYLE_RULES_PER_COMPONENT,
  MAX_VALUE_REF_PATH_SEGMENTS,
  MAX_VARIABLES,
  MIN_DATA_SOURCE_UPDATE_INTERVAL_SECONDS,
} from './limits.js';

export const COMPONENT_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
export const MATERIAL_TYPE_PATTERN = SCREEN_MATERIAL_TYPE_PATTERN;
export const VARIABLE_NAME_PATTERN = '^[A-Za-z_][A-Za-z0-9_]{0,127}$';
export const BLUEPRINT_PATH_SEGMENT_PATTERN =
  '^(?!(?:__proto__|prototype|constructor)$)[A-Za-z_][A-Za-z0-9_]{0,127}$';
/** 取值引用 `path` 段与 Blueprint 表达式路径段同一词法（同样排除原型链键）。 */
export const VALUE_REF_PATH_SEGMENT_PATTERN = BLUEPRINT_PATH_SEGMENT_PATTERN;

const COMPONENT_ID_REGEXP = new RegExp(COMPONENT_ID_PATTERN);
const VARIABLE_NAME_REGEXP = new RegExp(VARIABLE_NAME_PATTERN);
const VALUE_REF_PATH_SEGMENT_REGEXP = new RegExp(VALUE_REF_PATH_SEGMENT_PATTERN);
const CONTROL_CHARACTER_REGEXP = /[\u0000-\u001f\u007f-\u009f]/u;

/** 组件 id 词法的唯一谓词：文档契约中 `ComponentId` 一律经它判定。 */
export function isScreenComponentId(value: unknown): value is string {
  return typeof value === 'string' && COMPONENT_ID_REGEXP.test(value);
}

/** 变量名/资源类型/处理器 id 词法的唯一谓词：文档契约中 `VariableName` 一律经它判定。 */
export function isScreenVariableName(value: unknown): value is string {
  return typeof value === 'string' && VARIABLE_NAME_REGEXP.test(value);
}

const variableDescriptionSchema = z
  .string()
  .refine((value) => [...value].length <= MAX_DESCRIPTION_CODE_POINTS, {
    message: `Description must not exceed ${MAX_DESCRIPTION_CODE_POINTS} code points.`,
  })
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value), {
    message: 'Description must not contain control characters.',
  });

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

export const dataBindingSchema = z.strictObject({
  fields: z.record(z.string().min(1).max(128), z.array(z.string().min(1).max(256)).min(1).max(256)),
});

const identifierCodeSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !CONTROL_CHARACTER_REGEXP.test(value), {
    message: 'Identifier must not contain control characters.',
  });

/** 取值引用的三个 kind：判别键固定为 `kind`，每个分支字段白名单独立。 */
export const valueRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('inline'), value: z.any() }),
  z.strictObject({
    kind: z.literal('variable'),
    variableId: z.string().regex(COMPONENT_ID_REGEXP),
  }),
  z.strictObject({
    kind: z.literal('data-source-field'),
    dataSourceId: z.string().regex(COMPONENT_ID_REGEXP),
    path: z.array(z.string().regex(VALUE_REF_PATH_SEGMENT_REGEXP)).max(MAX_VALUE_REF_PATH_SEGMENTS),
  }),
]);

/** 数据源来源四分支；`sourceId` 的命名空间由宿主所有，文档不解释其含义。 */
export const dataSourceSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('dataset'), datasetId: identifierCodeSchema }),
  z.strictObject({
    kind: z.literal('host-resource'),
    resourceType: z.string().regex(VARIABLE_NAME_REGEXP),
    resourceId: identifierCodeSchema,
  }),
  z.strictObject({ kind: z.literal('url-query'), sourceId: identifierCodeSchema }),
  z.strictObject({ kind: z.literal('host-catalog'), sourceId: identifierCodeSchema }),
]);

/**
 * 刷新策略。交叉约束（`auto` 必带 `intervalSeconds`，其余模式禁止带）由
 * `superRefine` 表达，JSON Schema 侧的等价 `allOf` 补丁见 `json-schema.ts`。
 */
export const updatePolicySchema = z
  .strictObject({
    mode: z.enum(['once', 'manual', 'auto']),
    intervalSeconds: z
      .number()
      .int()
      .min(MIN_DATA_SOURCE_UPDATE_INTERVAL_SECONDS)
      .max(MAX_DATA_SOURCE_UPDATE_INTERVAL_SECONDS)
      .optional(),
  })
  .superRefine((policy, context) => {
    if (policy.mode === 'auto' && policy.intervalSeconds === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Auto update policy requires intervalSeconds.',
        path: ['intervalSeconds'],
      });
    }
    if (policy.mode !== 'auto' && policy.intervalSeconds !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Only auto update policy may define intervalSeconds.',
        path: ['intervalSeconds'],
      });
    }
  });

export const dataSourceSchema = z.strictObject({
  id: z.string().regex(COMPONENT_ID_REGEXP),
  name: z.string().min(1).max(MAX_DATA_SOURCE_NAME_CODE_POINTS),
  source: dataSourceSourceSchema,
  params: z
    .record(z.string().min(1).max(128), valueRefSchema)
    .refine((params) => Object.keys(params).length <= MAX_DATA_SOURCE_PARAMS, {
      message: `A data source may define at most ${MAX_DATA_SOURCE_PARAMS} params.`,
    }),
  updatePolicy: updatePolicySchema.optional(),
  processorId: z.string().min(1).max(256).optional(),
  readOnly: z.boolean().optional(),
});

export const variableRecordSchema = z.strictObject({
  id: z.string().regex(COMPONENT_ID_REGEXP),
  name: z.string().regex(VARIABLE_NAME_REGEXP),
  description: variableDescriptionSchema.optional(),
  initialValue: z.any(),
  value: valueRefSchema,
  controlled: z.boolean(),
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
        variableId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
      }),
    ]),
  ),
  binding: z.union([dataBindingSchema, z.null()]),
});

export const variableDataSourceSchema = z.strictObject({
  type: z.literal('variable'),
  variableId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  binding: dataBindingSchema.optional(),
  processorId: z.string().min(1).max(256).optional(),
});

export const datasetDataSourceSchema = z.strictObject({
  type: z.literal('dataset'),
  datasetId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u),
  params: hostResourceDataSourceSchema.shape.params,
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
  dataSource: z.union([
    staticDataSourceSchema,
    datasetDataSourceSchema,
    hostResourceDataSourceSchema,
    variableDataSourceSchema,
    z.null(),
  ]),
  dataValue: z.union([valueRefSchema, z.null()]).optional(),
  dataBinding: z.union([dataBindingSchema, z.null()]).optional(),
});

export const staticVariableSchema = z.strictObject({
  type: z.literal('static'),
  id: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  description: variableDescriptionSchema.optional(),
  initialValue: z.any(),
});

const dynamicVariableFields = {
  id: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  name: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  description: variableDescriptionSchema.optional(),
  initialValue: z.any(),
  sourceId: z.string().min(1).max(256),
  processorId: z.string().min(1).max(256).optional(),
  controlled: z.boolean(),
} as const;

export const dataSourceVariableSchema = z.strictObject({
  type: z.literal('data-source'),
  ...dynamicVariableFields,
  autoUpdate: z.strictObject({ intervalSeconds: z.number().int().min(1).max(86_400) }).optional(),
});

export const urlQueryVariableSchema = z.strictObject({
  type: z.literal('url-query'),
  ...dynamicVariableFields,
});

const blueprintTriggerSchema = z.union([
  z.strictObject({
    type: z.literal('material-event'),
    componentId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
    eventName: z.string().regex(new RegExp(VARIABLE_NAME_PATTERN)),
  }),
  z.strictObject({
    type: z.literal('variable-event'),
    variableId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
    eventName: z.enum(['data-updated', 'request-state']),
  }),
]);

const blueprintValueExpressionSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.strictObject({ kind: z.literal('literal'), value: z.any() }),
    z.strictObject({
      kind: z.literal('event-payload'),
      path: z.array(z.string().regex(new RegExp(BLUEPRINT_PATH_SEGMENT_PATTERN))).max(16),
    }),
    z.strictObject({
      kind: z.literal('variable'),
      variableId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
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
  variableId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
  value: blueprintValueExpressionSchema,
});

const requestVariableActionSchema = z.strictObject({
  type: z.literal('request-variable'),
  variableId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
});

const requestComponentDataActionSchema = z.strictObject({
  type: z.literal('request-component-data'),
  componentId: z.string().regex(new RegExp(COMPONENT_ID_PATTERN)),
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
        requestVariableActionSchema,
        requestComponentDataActionSchema,
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
  dataSources: z.array(dataSourceSchema).max(MAX_DATA_SOURCES).optional(),
  variables: z
    .array(
      z.union([
        staticVariableSchema,
        dataSourceVariableSchema,
        urlQueryVariableSchema,
        variableRecordSchema,
      ]),
    )
    .max(MAX_VARIABLES),
  blueprint: blueprintSchema,
});
