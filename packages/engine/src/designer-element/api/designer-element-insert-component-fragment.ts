import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenComponentFragmentInsertionIntent,
  createBaseScreenComponentFragmentTransaction,
  parseBaseScreenComponentFragmentInsertionIntent,
} from '../../common/operations/material-component/material-component-fragment.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export type { BaseScreenComponentFragmentInsertionIntent };

/**
 * 一次插入一整份组合分片的公开入口。
 *
 * `insertComponent` 只能按 manifest 默认值建单个节点，所以「底座 + 标题 + 读数 + 分隔线」这类
 * 由原子物料组合出来的卡片此前没有合规入口：宿主要么自己把每个物料的全部默认值重新展开一遍，
 * 要么依赖被文档禁止使用的私有拖放 MIME。这里把一次展开收进基座，预设 JSON 的存储仍归宿主。
 *
 * 语义边界：
 * - `anchor` 是组合**包围盒的左上角**，省略时与 `insertComponent` 一致取当前可见画布中心；
 * - 节点位置是相对 anchor 的偏移，整片只平移保证不变形，超出画布时贴边而不是缩放；
 * - `props`/`style` 与 manifest 默认值顶层浅合并后再过 schema，宿主无需自己补齐必填字段；
 * - 一次事务提交，因此可撤销；成功后整片成为选中项，焦点在 shell（若有）。
 */
export function insertComponentFragment(
  element: DesignerElementHost,
  intent: BaseScreenComponentFragmentInsertionIntent,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  if (document === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Component fragment requires a document.');
  }
  const catalog = state.catalog;
  if (catalog === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Component fragment requires a configured catalog.');
  }
  const parsed = parseBaseScreenComponentFragmentInsertionIntent(intent);
  if (!parsed.ok) return parsed;

  const anchor = parsed.value.anchor ??
    state.viewportController.visibleCanvasCenter() ?? {
      x: document.canvas.width / 2,
      y: document.canvas.height / 2,
    };
  const built = createBaseScreenComponentFragmentTransaction({
    document,
    catalog,
    intent: parsed.value,
    anchor,
  });
  if (!built.ok) return built;

  const result = element.executeTransaction(built.value.transaction);
  if (result.ok) {
    state.session.reduceSelection({
      type: 'replace-selection',
      componentIds: built.value.componentIds,
      focusedComponentId: built.value.focusedComponentId,
    });
  }
  return result;
}

/** 供宿主在把预设写入自己的存储之前先行校验；与插入时走的是同一个失败关闭解析器。 */
export { parseBaseScreenComponentFragmentInsertionIntent };

function failure(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<ScreenDocument> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
