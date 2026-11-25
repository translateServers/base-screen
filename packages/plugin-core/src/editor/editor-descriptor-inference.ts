import type { BaseScreenMaterialPropSchema } from '../contracts.js';
import type {
  BaseScreenMaterialEditorControl,
  BaseScreenMaterialEditorPathSegment,
  BaseScreenMaterialEditorProjection,
  BaseScreenMaterialEditorTarget,
} from './editor-descriptor-model.js';

/** 推导控件所需的字段信息：与描述符字段同名的那几项。 */
export interface BaseScreenMaterialEditorControlInferenceInput {
  readonly target: BaseScreenMaterialEditorTarget;
  readonly projection?: BaseScreenMaterialEditorProjection;
  readonly path: readonly BaseScreenMaterialEditorPathSegment[];
  readonly tagName?: string;
  readonly allowGradient?: boolean;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** 有界数值改用滑杆的最大跨度；与引擎 `isDesignerRangeEligible` 同一阈值。 */
const MAX_RANGE_SPAN = 1000;
/** 小整数计数（小数位、列数）用步进器的最大跨度。 */
const MAX_STEPPER_SPAN = 24;

/**
 * 按字段语义推导检查器控件（base-screen-docs ADR-0102 §4）。
 *
 * 作者只声明字段是什么（schema 类型、范围、单位），控件由这里决定：同一种语义在所有物料里
 * 是同一种控件。描述符字段省略 `control` 时用它补齐；扁平面板转换成描述符时也走它。
 *
 * - 布尔 → 开关；枚举 → 下拉，恰为 left/center/right 时 → 图标分段；
 * - 字符串 → 键名是 `color` 或以 `Color` 结尾（或声明了 `allowGradient`）时为取色器，否则文本框；
 * - 数字：props 上无单位的小整数计数（schema 两端有界、整数、跨度 ≤ 24）→ 步进器；
 *   其余两端有界且跨度 ≤ 1000 → 滑杆 + 读数（有单位时读数带单位）；无界有单位 → 带单位数字；
 *   其余 → 数字框；
 * - 四边都是数字的对象 → 四边距，其余对象 → JSON；数组 → 数组条目卡片；
 * - `tagName` → 插件自定义控件；数据绑定字段 → 字段选择器。
 *
 * 推不出来（数据参数没有 schema、路径不解析）返回 `undefined`，由调用方要求显式声明。
 */
export function inferBaseScreenMaterialEditorControl(
  field: BaseScreenMaterialEditorControlInferenceInput,
  schema: BaseScreenMaterialPropSchema | undefined,
): BaseScreenMaterialEditorControl | undefined {
  if (field.tagName !== undefined) return 'custom';
  if (field.target === 'data') return field.path[0] === 'binding' ? 'field-selector' : undefined;
  if (schema === undefined) return undefined;
  switch (schema.kind) {
    case 'boolean':
      return 'boolean';
    case 'string':
      return field.allowGradient !== undefined || isColorKey(lastKey(field.path))
        ? 'color'
        : 'text';
    case 'enum':
      return schema.values.join('|') === 'left|center|right' ? 'segmented' : 'select';
    case 'number':
      return inferNumberControl(field, schema);
    case 'object':
      return ['top', 'right', 'bottom', 'left'].every(
        (side) => schema.properties[side]?.kind === 'number',
      )
        ? 'spacing'
        : 'json';
    case 'array':
      return 'array';
  }
}

function inferNumberControl(
  field: BaseScreenMaterialEditorControlInferenceInput,
  schema: Extract<BaseScreenMaterialPropSchema, { readonly kind: 'number' }>,
): BaseScreenMaterialEditorControl {
  const target = field.target === 'interaction' ? field.projection : field.target;
  const minimum = field.min ?? schema.minimum;
  const maximum = field.max ?? schema.maximum;
  const hasUnit = field.unit !== undefined && field.unit !== '';
  // 计数属于结构（props）；长度、字号这类带量纲的值在 style 上，即使跨度小也是滑杆。
  // 步进器要靠 schema 两端的边界禁用按钮，所以只认 schema 自己声明的边界。
  if (
    target === 'props' &&
    !hasUnit &&
    schema.minimum !== undefined &&
    schema.maximum !== undefined &&
    minimum !== undefined &&
    maximum !== undefined &&
    Number.isInteger(minimum) &&
    Number.isInteger(maximum) &&
    (field.step === undefined || Number.isInteger(field.step)) &&
    maximum - minimum <= MAX_STEPPER_SPAN
  ) {
    return 'stepper';
  }
  if (minimum !== undefined && maximum !== undefined && maximum - minimum <= MAX_RANGE_SPAN) {
    return 'number';
  }
  return hasUnit ? 'unit-number' : 'number';
}

function lastKey(path: readonly BaseScreenMaterialEditorPathSegment[]): string {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index];
    if (typeof segment === 'string') return segment;
  }
  return '';
}

/** 颜色键的命名约定（ADR-0099 §2.6 样式键词典）：`color` 或 `xxxColor`。 */
function isColorKey(key: string): boolean {
  return /^(?:color|[a-z][A-Za-z0-9]*Color)$/.test(key);
}
