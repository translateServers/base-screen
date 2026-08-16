import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentCommand } from '@base-screen/core';

// 官方文本物料类型白名单（ADR-0052）：画布内文本直接编辑只对声明为文本语义的物料开放。
// engine 不依赖 @base-screen/material：类型字符串是官方物料公共契约数据，与
// BASE_SCREEN_TEXT_MATERIAL_MANIFEST.type 保持一致。其他物料声明文本编辑能力时扩展此表。
const TEXT_EDITABLE_MATERIAL_TYPES: readonly string[] = ['base.text'];

/**
 * 组件是否支持画布内文本直接编辑（fail-closed，ADR-0052 R1）：
 * 组件为白名单内的文本物料，且 dataSource 为 static 字符串。
 * host-resource 数据驱动文本、null、非字符串值与非文本物料一律不可编辑（数据归宿主）。
 */
export function isTextEditableComponent(document: ScreenDocument, componentId: string): boolean {
  const component = document.components.find((item) => item.id === componentId);
  if (component === undefined) return false;
  return (
    TEXT_EDITABLE_MATERIAL_TYPES.includes(component.type) &&
    component.dataSource?.type === 'static' &&
    typeof component.dataSource.value === 'string'
  );
}

/**
 * 构建文本编辑提交命令：patch dataSource 为 static 字符串（恰一条历史记录）。
 * 值超限或非法由 core 命令应用时的 fail-closed 文档校验（finalize → parseCandidateDocument）
 * 兜底并返回诊断；此处只做可编辑性前置校验，避免对不可编辑组件发起失败事务。
 */
export function buildTextEditCommand(
  document: ScreenDocument,
  componentId: string,
  text: string,
): ScreenParseResult<ScreenDocumentCommand> {
  if (!isTextEditableComponent(document, componentId)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'CORE_COMMAND_INVALID',
          path: ['components', componentId, 'dataSource'],
          message: 'Component does not support canvas text editing.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      type: 'update-components',
      componentIds: [componentId],
      patch: { dataSource: { type: 'static', value: text } },
    },
    diagnostics: [],
  };
}
