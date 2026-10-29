import type { ScreenIntentRequest, ScreenParseResult } from '@base-screen/contracts';

/**
 * 宿主实现的意图处理器：自行决定是否/如何调用模型，产出提案后调用 `submitChangeProposal`。
 * 引擎只负责把请求结构化后交出去，并如实回显结果。
 *
 * `signal` 用于取消：用户点「取消」或按 Esc 时引擎会 abort，宿主应把它透传给模型调用，
 * 尽快停手。忽略 signal 也合法——只是取消要等宿主自己返回才生效。
 */
export type DesignerIntentHandler = (
  request: ScreenIntentRequest,
  signal?: AbortSignal,
) => Promise<ScreenParseResult<null>>;
