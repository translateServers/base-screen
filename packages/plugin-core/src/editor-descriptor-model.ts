import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenMaterialObjectSchema } from './contracts.js';

export const MAX_EDITOR_SECTIONS_PER_ZONE = 16;
export const MAX_EDITOR_FIELDS_PER_SECTION = 64;
export const MAX_EDITOR_PATH_DEPTH = 8;
export const MAX_EDITOR_CONDITIONS = 8;
export const MAX_EDITOR_ITEM_FIELDS = 16;
export const MAX_EDITOR_ITEM_PATH_DEPTH = 6;
export const MAX_EDITOR_EVENTS = 64;
export const MAX_EDITOR_HELP_LENGTH = 1024;
export const MAX_EDITOR_CONDITION_VALUES = 16;
export const MAX_EDITOR_FIELD_KEYWORDS = 16;

export type BaseScreenMaterialEditorTarget = 'props' | 'style' | 'data' | 'interaction';

export type BaseScreenMaterialEditorProjection = 'props' | 'style';

export type BaseScreenMaterialEditorControl =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'
  | 'json'
  | 'group'
  | 'array'
  | 'repeatable-array'
  | 'reorderable-array'
  | 'field-selector'
  | 'unit-number';

export type BaseScreenMaterialEditorConditionOperator =
  | 'eq'
  | 'neq'
  | 'exists'
  | 'not-exists'
  | 'in'
  | 'not-in';

export type BaseScreenMaterialEditorPathSegment = string | number;

export interface BaseScreenMaterialEditorCondition {
  readonly path: readonly BaseScreenMaterialEditorPathSegment[];
  readonly operator: BaseScreenMaterialEditorConditionOperator;
  readonly value?: ScreenJsonValue;
}

export interface BaseScreenMaterialEditorField {
  readonly id: string;
  readonly target: BaseScreenMaterialEditorTarget;
  /** 仅 `interaction` target 必填：把交互字段投影到既有 props/style 语义。 */
  readonly projection?: BaseScreenMaterialEditorProjection;
  readonly path: readonly BaseScreenMaterialEditorPathSegment[];
  readonly label: string;
  readonly control: BaseScreenMaterialEditorControl;
  /** `color` 控件是否接受线性/径向渐变；缺省仅接受纯色。 */
  readonly allowGradient?: boolean;
  readonly help?: string;
  /** 属性搜索别名；仅用于作者界面，不进入 Screen Document。 */
  readonly keywords?: readonly string[];
  readonly when?: readonly BaseScreenMaterialEditorCondition[];
  readonly advanced?: boolean;
  /** 是否允许多选检查器批量写入；未声明时按控件能力保守处理。 */
  readonly batchable?: boolean;
  readonly placeholder?: string;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** 仅 object item 的 array/repeatable-array/reorderable-array 使用；相对 item 的 path。 */
  readonly itemFields?: readonly BaseScreenMaterialEditorField[];
  readonly itemLabel?: string;
}

export interface BaseScreenMaterialEditorSection {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly BaseScreenMaterialEditorField[];
  readonly help?: string;
  readonly collapsed?: boolean;
  /** 高级折叠分组：默认收起且可整体折叠。 */
  readonly advanced?: boolean;
}

export interface BaseScreenMaterialEventDescriptor {
  readonly name: string;
  readonly label?: string;
  readonly hint?: string;
  readonly payloadSchema?: BaseScreenMaterialObjectSchema;
  readonly maxPayloadBytes?: number;
  readonly triggerContexts?: readonly 'blueprint'[];
  readonly requiredCapability?: string;
}

export interface BaseScreenMaterialEditorDescriptor {
  readonly appearance?: readonly BaseScreenMaterialEditorSection[];
  readonly data?: readonly BaseScreenMaterialEditorSection[];
  readonly interaction?: readonly BaseScreenMaterialEditorSection[];
  readonly events?: readonly BaseScreenMaterialEventDescriptor[];
}

export const EDITOR_ZONES = ['appearance', 'data', 'interaction', 'events'] as const;

export const EDITOR_CONTROLS: ReadonlySet<string> = new Set([
  'text',
  'number',
  'boolean',
  'select',
  'color',
  'json',
  'group',
  'array',
  'repeatable-array',
  'reorderable-array',
  'field-selector',
  'unit-number',
]);

export const SCALAR_CONTROLS: ReadonlySet<string> = new Set([
  'text',
  'number',
  'boolean',
  'select',
  'color',
  'unit-number',
]);

export const ARRAY_CONTROLS: ReadonlySet<string> = new Set([
  'array',
  'repeatable-array',
  'reorderable-array',
]);

export const FIELD_KNOWN = new Set([
  'id',
  'target',
  'projection',
  'path',
  'label',
  'control',
  'allowGradient',
  'help',
  'keywords',
  'when',
  'advanced',
  'batchable',
  'placeholder',
  'unit',
  'min',
  'max',
  'step',
  'itemFields',
  'itemLabel',
]);

export const SECTION_KNOWN = new Set(['id', 'label', 'fields', 'help', 'collapsed', 'advanced']);

export const EVENT_KNOWN = new Set([
  'name',
  'label',
  'hint',
  'payloadSchema',
  'maxPayloadBytes',
  'triggerContexts',
  'requiredCapability',
]);

export const CONDITION_KNOWN = new Set(['path', 'operator', 'value']);

export const CONDITION_OPERATORS: ReadonlySet<string> = new Set([
  'eq',
  'neq',
  'exists',
  'not-exists',
  'in',
  'not-in',
]);
