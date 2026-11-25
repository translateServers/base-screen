import {
  type BaseScreenMaterialEditorDescriptor,
  type BaseScreenMaterialEditorDescriptorInput,
  type BaseScreenMaterialObjectSchema,
  parseBaseScreenMaterialEditorDescriptor,
} from '@base-screen/plugin-core';

/**
 * 大屏物料的检查器描述符（base-screen-docs ADR-0102）：按物料自己的 schema 失败关闭校验，
 * 省略 `control` 的字段由解析期按语义推导补齐。描述符是模块内常量，校验失败是开发期错误，
 * 直接抛出并带上诊断位置。
 */
export function parseBoardEditorDescriptor(
  materialType: string,
  input: BaseScreenMaterialEditorDescriptorInput,
  propsSchema: BaseScreenMaterialObjectSchema,
  styleSchema: BaseScreenMaterialObjectSchema,
  events?: readonly string[],
  dataBindingRoles?: readonly { readonly id: string }[],
): BaseScreenMaterialEditorDescriptor {
  const parsed = parseBaseScreenMaterialEditorDescriptor(
    input,
    propsSchema,
    styleSchema,
    events,
    dataBindingRoles,
  );
  if (!parsed.ok) {
    throw new Error(
      `${materialType} editor descriptor is invalid: ${parsed.diagnostics
        .map((diagnostic) => `${diagnostic.code}@${diagnostic.path.join('.')}`)
        .join(', ')}`,
    );
  }
  return parsed.value;
}
