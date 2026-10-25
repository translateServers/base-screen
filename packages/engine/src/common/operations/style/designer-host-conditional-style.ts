import type { ScreenJsonValue } from '@base-screen/contracts';
import type {
  BaseScreenHostConditionalStyleBinding,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';

/**
 * 宿主条件样式作者面的纯逻辑：字段推导与绑定增删。
 *
 * 与文档级 `styleRules` 刻意分开：这里只操作宿主持有的绑定列表，不产生文档事务。
 * 渲染层负责把列表交给宿主保存，并在成功后重算条件样式。
 */

export interface DesignerHostStyleField {
  readonly key: string;
  readonly label: string;
  readonly control: 'color' | 'select' | 'text';
  readonly values?: readonly string[];
}

/** 可被宿主覆盖的样式字段 = stylePanel 中 schema 为 string 或 enum（字符串值）的字段。 */
export function designerHostStyleFields(
  manifest: BaseScreenMaterialManifest,
): readonly DesignerHostStyleField[] {
  const fields = new Map<string, DesignerHostStyleField>();
  for (const field of manifest.stylePanel ?? []) {
    const schema = manifest.styleSchema.properties[field.style];
    if (schema === undefined) continue;
    if (schema.kind === 'string') {
      fields.set(field.style, {
        key: field.style,
        label: field.label,
        control: field.control === 'color' ? 'color' : 'text',
      });
      continue;
    }
    if (schema.kind === 'enum') {
      const values = schema.values.filter((value): value is string => typeof value === 'string');
      if (values.length === 0) continue;
      fields.set(field.style, {
        key: field.style,
        label: field.label,
        control: 'select',
        values,
      });
    }
  }
  return [...fields.values()];
}

/** 写入一条覆盖；同源同条件合并样式，其余绑定保持原顺序。 */
export function withHostConditionalStyleBinding(
  bindings: readonly BaseScreenHostConditionalStyleBinding[],
  sourceId: string,
  conditionId: string,
  styleKey: string,
  value: ScreenJsonValue,
): readonly BaseScreenHostConditionalStyleBinding[] {
  const index = bindings.findIndex(
    (binding) => binding.sourceId === sourceId && binding.conditionId === conditionId,
  );
  if (index < 0) {
    return [...bindings, { sourceId, conditionId, style: { [styleKey]: value } }];
  }
  return bindings.map((binding, position) =>
    position === index ? { ...binding, style: { ...binding.style, [styleKey]: value } } : binding,
  );
}

/** 删除一条覆盖；样式清空后整条绑定一起移除。 */
export function withoutHostConditionalStyleBinding(
  bindings: readonly BaseScreenHostConditionalStyleBinding[],
  sourceId: string,
  conditionId: string,
  styleKey: string,
): readonly BaseScreenHostConditionalStyleBinding[] {
  const index = bindings.findIndex(
    (binding) => binding.sourceId === sourceId && binding.conditionId === conditionId,
  );
  if (index < 0) return bindings;
  const style = { ...bindings[index]!.style };
  delete style[styleKey];
  if (Object.keys(style).length === 0) {
    return bindings.filter((_, position) => position !== index);
  }
  return bindings.map((binding, position) =>
    position === index ? { ...binding, style } : binding,
  );
}
