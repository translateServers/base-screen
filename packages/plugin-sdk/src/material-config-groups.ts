import type { ScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenMaterialEditorFieldInput,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';

/**
 * 通用配置组（base-screen-docs ADR-0102 §11）：同一类配置在所有物料里是同一组字段、同一顺序、
 * 同一个文档键。物料只选择用哪些组、哪些可选项，把组返回的 schema / 默认值 / 字段并进自己的清单。
 *
 * 字段不写 `control`：由解析期按语义推导（小数位 → 步进器、开关 → 开关、文字 → 文本框），
 * 与手写字段同一张推导表。文档键是平铺的 props 键，不嵌套对象。
 */
export interface BaseScreenMaterialConfigGroup {
  readonly id: BaseScreenMaterialConfigGroupId;
  readonly properties: Readonly<Record<string, BaseScreenMaterialPropSchema>>;
  readonly required: readonly string[];
  readonly defaults: Readonly<Record<string, ScreenJsonValue>>;
  readonly fields: readonly BaseScreenMaterialEditorFieldInput[];
}

export type BaseScreenMaterialConfigGroupId = 'number-format' | 'chart-title' | 'chart-legend';

export interface BaseScreenNumberFormatConfigOptions {
  /** 小数位默认值，缺省 0。 */
  readonly decimals?: number;
  /** 小数位上限，缺省 4；不超过 6。 */
  readonly maxDecimals?: number;
  /** 提供「显示千分位」开关；值是默认值。 */
  readonly thousandsSeparator?: boolean;
  /** 提供「前缀」（货币符号等）。 */
  readonly prefix?: boolean;
  /** 提供「单位」（读数后缀）。 */
  readonly unit?: boolean;
}

const MAX_AFFIX_LENGTH = 16;
const MAX_DECIMALS = 6;

/** 数值格式：前缀 → 单位 → 小数位 → 千分位。小数位必有，其余按需开启。 */
export function createBaseScreenNumberFormatConfig(
  options: BaseScreenNumberFormatConfigOptions = {},
): BaseScreenMaterialConfigGroup {
  const maxDecimals = Math.min(Math.max(Math.trunc(options.maxDecimals ?? 4), 0), MAX_DECIMALS);
  const decimals = Math.min(Math.max(Math.trunc(options.decimals ?? 0), 0), maxDecimals);
  const properties: Record<string, BaseScreenMaterialPropSchema> = {};
  const defaults: Record<string, ScreenJsonValue> = {};
  const fields: BaseScreenMaterialEditorFieldInput[] = [];
  const required: string[] = ['decimals'];
  if (options.prefix === true) {
    properties.prefix = { kind: 'string', maxLength: MAX_AFFIX_LENGTH };
    defaults.prefix = '';
    fields.push(propsField('prefix', '前缀'));
  }
  if (options.unit === true) {
    properties.unit = { kind: 'string', maxLength: MAX_AFFIX_LENGTH };
    defaults.unit = '';
    fields.push(propsField('unit', '单位'));
  }
  properties.decimals = { kind: 'number', minimum: 0, maximum: maxDecimals };
  defaults.decimals = decimals;
  fields.push(propsField('decimals', '小数位'));
  if (options.thousandsSeparator !== undefined) {
    properties.thousandsSeparator = { kind: 'boolean' };
    defaults.thousandsSeparator = options.thousandsSeparator;
    required.push('thousandsSeparator');
    fields.push(propsField('thousandsSeparator', '显示千分位'));
  }
  return { id: 'number-format', properties, required, defaults, fields };
}

/** 图表标题：留空即不显示。 */
export function createBaseScreenChartTitleConfig(): BaseScreenMaterialConfigGroup {
  return {
    id: 'chart-title',
    properties: { titleText: { kind: 'string' } },
    required: ['titleText'],
    defaults: { titleText: '' },
    fields: [propsField('titleText', '标题', { placeholder: '留空不显示' })],
  };
}

/** 图表图例。 */
export function createBaseScreenChartLegendConfig(
  options: { readonly showLegend?: boolean } = {},
): BaseScreenMaterialConfigGroup {
  return {
    id: 'chart-legend',
    properties: { showLegend: { kind: 'boolean' } },
    required: ['showLegend'],
    defaults: { showLegend: options.showLegend ?? true },
    fields: [propsField('showLegend', '显示图例')],
  };
}

/** 把若干配置组并成一份 props schema 片段与默认值；键冲突说明两组重叠，直接抛错。 */
export function mergeBaseScreenMaterialConfigGroups(
  groups: readonly BaseScreenMaterialConfigGroup[],
): {
  readonly properties: Readonly<Record<string, BaseScreenMaterialPropSchema>>;
  readonly required: readonly string[];
  readonly defaults: Readonly<Record<string, ScreenJsonValue>>;
} {
  const properties: Record<string, BaseScreenMaterialPropSchema> = {};
  const defaults: Record<string, ScreenJsonValue> = {};
  const required: string[] = [];
  for (const group of groups) {
    for (const [key, schema] of Object.entries(group.properties)) {
      if (Object.hasOwn(properties, key)) {
        throw new Error(`Material config groups overlap on props key "${key}".`);
      }
      properties[key] = schema;
    }
    Object.assign(defaults, group.defaults);
    required.push(...group.required);
  }
  return { properties, required, defaults };
}

function propsField(
  key: string,
  label: string,
  options: Omit<BaseScreenMaterialEditorFieldInput, 'id' | 'target' | 'path' | 'label'> = {},
): BaseScreenMaterialEditorFieldInput {
  return { id: key, target: 'props', path: [key], label, ...options };
}
