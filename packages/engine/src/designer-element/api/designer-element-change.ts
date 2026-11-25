import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenDesignerChangeProposalSummary,
  summarizeChangeProposal,
} from '../../common/operations/change/designer-change-events.js';
import {
  changeDiagnostic,
  type DesignerChangeProposalInput,
  prepareDesignerChangeProposal,
} from '../../common/operations/change/designer-change-proposal.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export type { BaseScreenDesignerChangeProposalSummary };

/**
 * 提交一份变更提案：引擎在副本上试算全部命令，成功则挂出幽灵草案。
 *
 * 提案在这里**不写入文档**；采纳是独立的一步（UI 或宿主调用），写入时作为一次
 * 普通事务提交。宿主负责产出提案内容，引擎不调用模型。
 *
 * 不变式（ADR-0111 §2.4）：返回 `ok: false` 时至少带一条诊断——命令非法透传事务诊断，
 * 其余拒绝原因用 `CHANGE_*`，宿主与模型据此修复，不必猜。
 */
export function submitChangeProposal(
  element: DesignerElementHost,
  input: DesignerChangeProposalInput,
): ScreenParseResult<BaseScreenDesignerChangeProposalSummary> {
  const elementState = getDesignerElementState(element);
  const document = elementState.session.document;
  if (document === undefined) {
    return {
      ok: false,
      diagnostics: [
        changeDiagnostic('CHANGE_DOCUMENT_UNAVAILABLE', 'Designer has no document loaded.'),
      ],
    };
  }
  elementState.changeGeneration += 1;
  const id = `change-${elementState.changeGeneration}`;
  const prepared = prepareDesignerChangeProposal(document, input, id);
  if (!prepared.ok) return { ok: false, diagnostics: prepared.diagnostics };
  const controller = elementState.changeController;
  const draftPending = controller.pending !== undefined;
  if (!controller.submit(prepared.value, input)) {
    return {
      ok: false,
      diagnostics: [
        draftPending
          ? changeDiagnostic(
              'CHANGE_DRAFT_PENDING',
              'A pending change proposal must be adopted or discarded first.',
            )
          : changeDiagnostic(
              'CHANGE_PREVIEW_UNAVAILABLE',
              'Change proposal preview could not be mounted.',
            ),
      ],
    };
  }
  return {
    ok: true,
    value: summarizeChangeProposal(prepared.value),
    diagnostics: [],
  };
}

/**
 * 读当前待决提案的摘要：标题、作用域、理由、单元与归属。
 *
 * 只给摘要，不给候选文档——宿主不需要、也不应该拿它去改文档。
 */
export function readPendingChange(
  element: DesignerElementHost,
): BaseScreenDesignerChangeProposalSummary | undefined {
  const proposal = getDesignerElementState(element).changeController.pending;
  return proposal === undefined ? undefined : summarizeChangeProposal(proposal);
}

/** 采纳一个单元：该单元的命令作为一次普通事务提交，其余单元按当前文档重算。 */
export function adoptChangeUnit(element: DesignerElementHost, unitId: string): boolean {
  return getDesignerElementState(element).changeController.adoptUnit(unitId);
}

/** 忽略一个单元：不写文档，只把它从待决集合里去掉。 */
export function rejectChangeUnit(element: DesignerElementHost, unitId: string): boolean {
  return getDesignerElementState(element).changeController.rejectUnit(unitId);
}

/**
 * 全部采纳：整批命令一次事务提交。
 *
 * 这是宿主显式调用，等价于用户完成二次确认；界面仍走「请求 → 确认 → 采纳」。
 */
export function adoptAllChanges(element: DesignerElementHost): boolean {
  return getDesignerElementState(element).changeController.adoptAllDirect();
}

/** 撤回未采纳的提案：只清掉幽灵草案，不产生文档或历史副作用。 */
export function discardPendingChange(element: DesignerElementHost): void {
  getDesignerElementState(element).changeController.discard();
}
