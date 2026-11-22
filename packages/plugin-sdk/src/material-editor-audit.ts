import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialEditorSection,
  BaseScreenMaterialManifest,
  BaseScreenMaterialObjectSchema,
  BaseScreenMaterialPropSchema,
} from '@base-screen/plugin-core';
import { inferBaseScreenMaterialEditorControl, resolveSchema } from '@base-screen/plugin-core';
import {
  type BaseScreenMaterialConfigGroup,
  createBaseScreenChartLegendConfig,
  createBaseScreenChartTitleConfig,
  createBaseScreenNumberFormatConfig,
} from './material-config-groups.js';

/** 一条范式违规：规则号 + 可读说明（含物料类型与字段）。 */
export interface BaseScreenMaterialEditorFormViolation {
  readonly rule: 'R9' | 'R11' | 'R12' | 'R13' | 'R14';
  readonly materialType: string;
  readonly field?: string;
  readonly message: string;
}

/** 基础密度下一个物料默认可见的字段上限（ADR-0099 R9）。 */
const VISIBLE_FIELD_BUDGET = 12;
/** 标签宽度上限：6 个汉字（ASCII 记 1、CJK 记 2）。 */
const MAX_LABEL_WIDTH = 12;
const ARRAY_CONTROLS = new Set(['array', 'repeatable-array', 'reorderable-array']);

/**
 * 检查器配置表单范式审计（base-screen-docs ADR-0102 §13）。传入解析后的 manifest
 * （描述符字段都已带 control），返回违规清单；空数组表示符合范式。
 *
 * - R9：基础密度下默认可见字段 ≤ 12（不计 advanced 字段与收起 / 高级分区）；
 * - R11：字段控件等于按语义推导的控件。允许的偏离只有：自定义控件、JSON、编组、数组三种变体，
 *   字符串在文本 / 颜色 / 字段选择器之间，≤ 3 项的枚举用分段；
 * - R12：不再声明扁平 `propertyPanel` / `stylePanel`，描述符是唯一的表单来源；
 * - R13：标签 ≤ 6 个汉字，不写「是否」，不带括号或单位，颜色字段以「色」结尾，开关不用否定句；
 * - R14：用到通用配置组的键（小数位、千分位、前缀、单位、标题、图例）必须走配置组：
 *   schema 类型与标签与配置组一致。
 */
export function auditBaseScreenMaterialEditorForm(
  manifest: BaseScreenMaterialManifest,
): readonly BaseScreenMaterialEditorFormViolation[] {
  const violations: BaseScreenMaterialEditorFormViolation[] = [];
  const add = (
    rule: BaseScreenMaterialEditorFormViolation['rule'],
    message: string,
    field?: BaseScreenMaterialEditorField,
  ): void => {
    violations.push({
      rule,
      materialType: manifest.type,
      ...(field === undefined ? {} : { field: field.id }),
      message,
    });
  };
  if ((manifest.propertyPanel ?? []).length > 0 || (manifest.stylePanel ?? []).length > 0) {
    add('R12', '仍声明扁平 propertyPanel / stylePanel；改为 editorDescriptor。');
  }
  const descriptor = manifest.editorDescriptor;
  const zones = [descriptor?.appearance, descriptor?.data, descriptor?.interaction];
  for (const sections of zones) {
    for (const section of sections ?? []) {
      for (const field of section.fields) {
        auditField(field, rootSchema(manifest, field), add);
        const items = itemSchema(manifest, field);
        for (const item of field.itemFields ?? []) {
          const itemRoot =
            item.target === 'interaction'
              ? item.projection === 'style'
                ? manifest.styleSchema
                : manifest.propsSchema
              : item.target === 'props' || item.target === 'style'
                ? items
                : undefined;
          auditField(item, itemRoot, add);
        }
      }
    }
  }
  const visible = (descriptor?.appearance ?? []).flatMap((section) => visibleFields(section));
  if (visible.length > VISIBLE_FIELD_BUDGET) {
    add('R9', `基础密度下可见字段 ${visible.length} 个，超过 ${VISIBLE_FIELD_BUDGET} 个。`);
  }
  auditConfigGroups(manifest, add);
  return violations;
}

type AddViolation = (
  rule: BaseScreenMaterialEditorFormViolation['rule'],
  message: string,
  field?: BaseScreenMaterialEditorField,
) => void;

function auditField(
  field: BaseScreenMaterialEditorField,
  root: BaseScreenMaterialObjectSchema | undefined,
  add: AddViolation,
): void {
  const schema = root === undefined ? undefined : resolveSchema(field.path, root);
  const inferred = inferBaseScreenMaterialEditorControl(field, schema);
  if (inferred !== undefined && !isAllowedControl(field.control, inferred, schema)) {
    add('R11', `控件是 ${field.control}，按字段语义应为 ${inferred}（可省略 control）。`, field);
  }
  const label = field.label;
  if (labelWidth(label) > MAX_LABEL_WIDTH) add('R13', `标签「${label}」超过 6 个汉字。`, field);
  if (label.includes('是否')) add('R13', `标签「${label}」不写「是否」。`, field);
  if (/[（()）]|\b(?:px|ms)\b|%/.test(label)) {
    add('R13', `标签「${label}」不带括号或单位，单位写进 unit。`, field);
  }
  if (field.control === 'color' && !label.endsWith('色')) {
    add('R13', `颜色字段「${label}」应以「色」结尾。`, field);
  }
  if (field.control === 'boolean' && /^(?:不|禁用|隐藏)/.test(label)) {
    add('R13', `开关「${label}」用正向表述。`, field);
  }
}

function isAllowedControl(
  control: string,
  inferred: string,
  schema: BaseScreenMaterialPropSchema | undefined,
): boolean {
  if (control === inferred) return true;
  if (control === 'custom' || control === 'json' || control === 'group') return true;
  if (ARRAY_CONTROLS.has(control) && schema?.kind === 'array') return true;
  if (
    schema?.kind === 'string' &&
    (control === 'text' || control === 'color' || control === 'field-selector')
  ) {
    return true;
  }
  return schema?.kind === 'enum' && control === 'segmented' && schema.values.length <= 3;
}

function auditConfigGroups(manifest: BaseScreenMaterialManifest, add: AddViolation): void {
  const fields = (manifest.editorDescriptor?.appearance ?? []).flatMap(
    (section) => section.fields,
  );
  for (const [key, canonical] of CONFIG_GROUP_KEYS) {
    const schema = manifest.propsSchema.properties[key];
    if (schema === undefined) continue;
    if (schema.kind !== canonical.schema.kind) {
      add(
        'R14',
        `props.${key} 是配置组「${canonical.group}」的键，类型应为 ${canonical.schema.kind}。`,
      );
      continue;
    }
    const field = fields.find(
      (candidate) =>
        candidate.target === 'props' && candidate.path.length === 1 && candidate.path[0] === key,
    );
    if (field === undefined) {
      add('R14', `props.${key} 属于配置组「${canonical.group}」，检查器里缺少该字段。`);
    } else if (field.label !== canonical.label) {
      add('R14', `props.${key} 的标签应为配置组的「${canonical.label}」。`, field);
    }
  }
}

/** 配置组键 → 所属组、标签与 schema 类型；从配置组工厂本身取，不另抄一份。 */
const CONFIG_GROUP_KEYS: ReadonlyMap<
  string,
  {
    readonly group: string;
    readonly label: string;
    readonly schema: BaseScreenMaterialPropSchema;
  }
> = new Map(
  [
    createBaseScreenNumberFormatConfig({ prefix: true, unit: true, thousandsSeparator: true }),
    createBaseScreenChartTitleConfig(),
    createBaseScreenChartLegendConfig(),
  ].flatMap((group: BaseScreenMaterialConfigGroup) =>
    group.fields.map((field) => {
      const key = String(field.path[0]);
      const schema = group.properties[key] as BaseScreenMaterialPropSchema;
      return [key, { group: group.id, label: field.label, schema }] as const;
    }),
  ),
);

function rootSchema(
  manifest: BaseScreenMaterialManifest,
  field: BaseScreenMaterialEditorField,
): BaseScreenMaterialObjectSchema | undefined {
  const target = field.target === 'interaction' ? field.projection : field.target;
  if (target === 'props') return manifest.propsSchema;
  if (target === 'style') return manifest.styleSchema;
  return undefined;
}

function itemSchema(
  manifest: BaseScreenMaterialManifest,
  field: BaseScreenMaterialEditorField,
): BaseScreenMaterialObjectSchema | undefined {
  const root = rootSchema(manifest, field);
  const schema = root === undefined ? undefined : resolveSchema(field.path, root);
  return schema?.kind === 'array' && schema.items.kind === 'object' ? schema.items : undefined;
}

function visibleFields(
  section: BaseScreenMaterialEditorSection,
): readonly BaseScreenMaterialEditorField[] {
  if (section.collapsed === true || section.advanced === true) return [];
  return section.fields.filter((field) => field.advanced !== true);
}

function labelWidth(label: string): number {
  let width = 0;
  for (const character of label) width += (character.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1;
  return width;
}
