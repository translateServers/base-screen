import type {
  DesignerChangeProposalOrigin,
  DesignerChangeUnit,
  DesignerChangeUnitPresentation,
} from './designer-change-proposal.js';

/** 待决提案的计数与状态变化；宿主据此更新未读角标，不需要轮询。 */
export const BASE_SCREEN_CHANGE_STATE_EVENT = 'base-screen-change-state';

export type DesignerChangeUnitKind = DesignerChangeUnit['kind'];

export interface BaseScreenDesignerChangeUnitSummary {
  readonly id: string;
  readonly label: string;
  readonly kind: DesignerChangeUnitKind;
  readonly presentation?: DesignerChangeUnitPresentation;
}

/** 提案的外部摘要：不含候选文档，宿主拿到也不需要能改文档。 */
export interface BaseScreenDesignerChangeProposalSummary {
  readonly id: string;
  readonly title: string;
  readonly scope: string;
  readonly rationale: string;
  readonly affectedComponentIds: readonly string[];
  readonly units: readonly BaseScreenDesignerChangeUnitSummary[];
  readonly origin?: DesignerChangeProposalOrigin;
}

export interface BaseScreenDesignerChangeStateDetail {
  readonly pending: boolean;
  readonly unitCount: number;
  readonly title?: string;
  readonly scope?: string;
  readonly origin?: DesignerChangeProposalOrigin;
}

/** 提案 → 摘要：只暴露展示与定位所需的字段。 */
export function summarizeChangeProposal(proposal: {
  readonly id: string;
  readonly title: string;
  readonly scope: string;
  readonly rationale: string;
  readonly affectedComponentIds: readonly string[];
  readonly units: readonly DesignerChangeUnit[];
  readonly origin?: DesignerChangeProposalOrigin;
}): BaseScreenDesignerChangeProposalSummary {
  return {
    id: proposal.id,
    title: proposal.title,
    scope: proposal.scope,
    rationale: proposal.rationale,
    affectedComponentIds: proposal.affectedComponentIds,
    units: proposal.units.map((unit) => ({
      id: unit.id,
      label: unit.label,
      kind: unit.kind,
      ...(unit.presentation === undefined ? {} : { presentation: unit.presentation }),
    })),
    ...(proposal.origin === undefined ? {} : { origin: proposal.origin }),
  };
}
