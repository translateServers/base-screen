import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
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
 * 流式落稿第一步（ADR-0112 §2.5）：提交骨架命令并整批试算，成功后草案进入「生成中」，不可采纳。
 *
 * 骨架要一次给全几何：之后的 `extendChangeProposal` 只能填内容，不能再动已出现组件的位置与尺寸，
 * 这样从第一帧起画面就不会抖。
 */
export function beginChangeProposal(
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
  if (!controller.beginStream(prepared.value, input)) {
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
  return { ok: true, value: summarizeChangeProposal(prepared.value), diagnostics: [] };
}

/**
 * 流式落稿：追加命令后整批重算同一份草案。失败时保留上一版草案并返回诊断；
 * 追加的命令若改变了已出现组件的位置或尺寸，按协议错误拒绝（`CHANGE_STREAM_GEOMETRY_CHANGED`）。
 */
export function extendChangeProposal(
  element: DesignerElementHost,
  id: string,
  commands: DesignerChangeProposalInput['commands'],
): ScreenParseResult<BaseScreenDesignerChangeProposalSummary> {
  const elementState = getDesignerElementState(element);
  const controller = elementState.changeController;
  const current = controller.pending;
  const input = controller.pendingInput;
  const document = elementState.session.document;
  if (
    !controller.streaming ||
    current?.id !== id ||
    input === undefined ||
    document === undefined
  ) {
    return {
      ok: false,
      diagnostics: [
        changeDiagnostic(
          'CHANGE_STREAM_NOT_ACTIVE',
          `Change proposal ${id} is not being generated.`,
        ),
      ],
    };
  }
  const next: DesignerChangeProposalInput = {
    ...input,
    commands: [...input.commands, ...commands],
  };
  const prepared = prepareDesignerChangeProposal(document, next, id);
  if (!prepared.ok) return { ok: false, diagnostics: prepared.diagnostics };
  const moved = movedComponentIds(current.candidate, prepared.value.candidate);
  if (moved.length > 0) {
    return {
      ok: false,
      diagnostics: [
        changeDiagnostic(
          'CHANGE_STREAM_GEOMETRY_CHANGED',
          `Streaming commands must not move or resize existing components: ${moved.slice(0, 5).join(', ')}.`,
        ),
      ],
    };
  }
  if (!controller.extendStream(prepared.value, next)) {
    return {
      ok: false,
      diagnostics: [
        changeDiagnostic(
          'CHANGE_PREVIEW_UNAVAILABLE',
          'Change proposal preview could not be mounted.',
        ),
      ],
    };
  }
  return { ok: true, value: summarizeChangeProposal(prepared.value), diagnostics: [] };
}

/**
 * 结束生成：草案变为可采纳，单元照常拆分。
 *
 * `details.rationale` 用来在收尾时换上最终理由——降级告警这类信息只有整份结果到齐才知道，
 * 骨架挂出时写的只能是「生成中」。只换理由、不改命令，几何与内容都不动。
 */
export function finishChangeProposal(
  element: DesignerElementHost,
  id: string,
  details: { readonly rationale?: string } = {},
): ScreenParseResult<BaseScreenDesignerChangeProposalSummary> {
  const elementState = getDesignerElementState(element);
  const controller = elementState.changeController;
  const current = controller.pending;
  const input = controller.pendingInput;
  const document = elementState.session.document;
  const notActive = {
    ok: false as const,
    diagnostics: [
      changeDiagnostic('CHANGE_STREAM_NOT_ACTIVE', `Change proposal ${id} is not being generated.`),
    ],
  };
  if (current === undefined || current.id !== id || !controller.streaming) return notActive;
  if (details.rationale !== undefined && details.rationale !== input?.rationale) {
    if (input === undefined || document === undefined) return notActive;
    const next: DesignerChangeProposalInput = { ...input, rationale: details.rationale };
    const prepared = prepareDesignerChangeProposal(document, next, id);
    if (!prepared.ok) return { ok: false, diagnostics: prepared.diagnostics };
    if (!controller.extendStream(prepared.value, next)) {
      return {
        ok: false,
        diagnostics: [
          changeDiagnostic(
            'CHANGE_PREVIEW_UNAVAILABLE',
            'Change proposal preview could not be mounted.',
          ),
        ],
      };
    }
  }
  if (!controller.finishStream(id)) return notActive;
  return {
    ok: true,
    value: summarizeChangeProposal(controller.pending ?? current),
    diagnostics: [],
  };
}

/** 两版候选里都存在、但位置或尺寸变了的组件。 */
function movedComponentIds(before: ScreenDocument, after: ScreenDocument): readonly string[] {
  const previous = new Map(before.components.map((component) => [component.id, component]));
  return after.components.flatMap((component) => {
    const old = previous.get(component.id);
    if (old === undefined) return [];
    const same =
      old.position.x === component.position.x &&
      old.position.y === component.position.y &&
      old.size.width === component.size.width &&
      old.size.height === component.size.height;
    return same ? [] : [component.id];
  });
}

/**
 * 读当前待决提案的摘要：标题、作用域、理由、单元与归属。
 *
 * 只给摘要，不给候选文档——宿主不需要、也不应该拿它去改文档。
 */
export function readPendingChange(
  element: DesignerElementHost,
): BaseScreenDesignerChangeProposalSummary | undefined {
  const controller = getDesignerElementState(element).changeController;
  const proposal = controller.pending;
  if (proposal === undefined) return undefined;
  const summary = summarizeChangeProposal(proposal);
  return controller.streaming ? { ...summary, streaming: true } : summary;
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
