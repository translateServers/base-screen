import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type DesignerChangeProposalInput,
  prepareDesignerChangeProposal,
} from '../../common/operations/change/designer-change-proposal.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export interface BaseScreenDesignerChangeProposalSummary {
  readonly id: string;
  readonly affectedComponentIds: readonly string[];
}

/**
 * 提交一份变更提案：引擎在副本上试算全部命令，成功则挂出幽灵草案。
 *
 * 提案在这里**不写入文档**；采纳是独立的一步（UI 或宿主调用），写入时作为一次
 * 普通事务提交。宿主负责产出提案内容，引擎不调用模型。
 */
export function submitChangeProposal(
  element: DesignerElementHost,
  input: DesignerChangeProposalInput,
): ScreenParseResult<BaseScreenDesignerChangeProposalSummary> {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  if (document === undefined) return { ok: false, diagnostics: [] };
  // 场景预览也是「未写入」提示：提案到达时先静默撤掉它，避免两条提示互相矛盾。
  elementState.sceneController.cancelPreview(true);
  elementState.changeGeneration += 1;
  const id = `change-${elementState.changeGeneration}`;
  const prepared = prepareDesignerChangeProposal(document, input, id);
  if (!prepared.ok) return { ok: false, diagnostics: prepared.diagnostics };
  if (!elementState.changeController.submit(prepared.value, input)) {
    return { ok: false, diagnostics: [] };
  }
  return {
    ok: true,
    value: { id, affectedComponentIds: prepared.value.affectedComponentIds },
    diagnostics: [],
  };
}

/** 撤回未采纳的提案：只清掉幽灵草案，不产生文档或历史副作用。 */
export function discardPendingChange(element: DesignerElementHost): void {
  getDesignerElementState(element).changeController.discard();
}
