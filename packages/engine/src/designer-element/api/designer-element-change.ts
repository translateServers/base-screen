import type { ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenDesignerChangeProposalSummary } from '../../common/operations/change/designer-change-events.js';
import {
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
    value: summarize(prepared.value),
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
  return proposal === undefined ? undefined : summarize(proposal);
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

function summarize(proposal: {
  readonly id: string;
  readonly title: string;
  readonly scope: string;
  readonly rationale: string;
  readonly affectedComponentIds: readonly string[];
  readonly units: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: 'added' | 'removed' | 'changed' | 'document';
  }[];
  readonly origin?: { readonly author?: string; readonly approver?: string };
}): BaseScreenDesignerChangeProposalSummary {
  return {
    id: proposal.id,
    title: proposal.title,
    scope: proposal.scope,
    rationale: proposal.rationale,
    affectedComponentIds: proposal.affectedComponentIds,
    units: proposal.units.map((unit) => ({ id: unit.id, label: unit.label, kind: unit.kind })),
    ...(proposal.origin === undefined ? {} : { origin: proposal.origin }),
  };
}
