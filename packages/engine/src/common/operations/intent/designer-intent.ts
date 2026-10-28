import type { ScreenIntentRequest, ScreenParseResult } from '@base-screen/contracts';

/**
 * 宿主实现的意图处理器：自行决定是否/如何调用模型，产出提案后调用 `submitChangeProposal`。
 * 引擎只负责把请求结构化后交出去，并如实回显结果。
 */
export type DesignerIntentHandler = (
  request: ScreenIntentRequest,
) => Promise<ScreenParseResult<null>>;
