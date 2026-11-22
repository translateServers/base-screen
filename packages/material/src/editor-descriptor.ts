import {
  type BaseScreenMaterialEditorControl,
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialEditorField,
  type BaseScreenMaterialManifest,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';

/**
 * 给官方物料挂上检查器描述符（ADR-0099 §2.4）：按 manifest 自己的 schema 失败关闭校验后并入。
 *
 * 描述符是官方物料唯一的表单来源（base-screen-docs ADR-0102 D1）：分区、顺序、默认收起与控件都在这里；
 * 多选批量、条件样式与宿主条件样式也按它识别可编辑字段，清单里的扁平面板一律为空。
 * 控件可以省略，解析时按字段语义推导；写了就必须与推导一致（门禁 R11）。
 *
 * 描述符是模块内常量，校验失败属于开发期错误，直接抛出便于定位。
 */
export function withOfficialEditorDescriptor(
  manifest: BaseScreenMaterialManifest,
  descriptor: BaseScreenMaterialEditorDescriptor,
): BaseScreenMaterialManifest {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    descriptor,
    manifest.propsSchema,
    manifest.styleSchema,
    manifest.events,
    manifest.dataBinding?.roles,
  );
  if (!parsed.ok) {
    throw new Error(
      `${manifest.type} editor descriptor is invalid: ${parsed.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(', ')}`,
    );
  }
  return { ...manifest, editorDescriptor: parsed.value };
}

type FieldOptions = Omit<
  BaseScreenMaterialEditorField,
  'id' | 'target' | 'path' | 'label' | 'control'
>;

/** 顶层 style 键字段：id 与键同名，检查器搜索与 `data-style` 钩子都按键名定位。 */
export function styleField(
  key: string,
  label: string,
  control: BaseScreenMaterialEditorControl,
  options: FieldOptions = {},
): BaseScreenMaterialEditorField {
  return { id: key, target: 'style', path: [key], label, control, ...options };
}

/** 顶层 props 键字段：id 与键同名。 */
export function propField(
  key: string,
  label: string,
  control: BaseScreenMaterialEditorControl,
  options: FieldOptions = {},
): BaseScreenMaterialEditorField {
  return { id: key, target: 'props', path: [key], label, control, ...options };
}
