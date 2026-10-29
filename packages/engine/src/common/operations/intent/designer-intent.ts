import type { ScreenIntentRequest, ScreenParseResult } from '@base-screen/contracts';

/**
 * 宿主的补救动作。引擎只认自己会做的动作，不解析自由文本：
 * - `whole-screen`：这一轮改用整屏作用域重发同一句话（宿主只支持整屏生成时用）。
 */
export type DesignerIntentRemedy = 'whole-screen';

type IntentSuccess = Extract<ScreenParseResult<null>, { ok: true }>;
type IntentFailure = Extract<ScreenParseResult<null>, { ok: false }>;

/**
 * 宿主交回的结果：仍是 `ScreenParseResult<null>`（成功带 `value: null`），
 * 失败时**可以**多带两个字段。
 *
 * 为什么原因放在这里而不是写在引擎里：只有宿主知道为什么没成——是模型报错、是文档结构
 * 不合法、还是它根本不理解这个作用域。引擎猜出来的原因一定会说谎，所以引擎只在宿主
 * 没给原因时兜一句「提交失败」，绝不替宿主编原因。
 */
export type DesignerIntentOutcome =
  | IntentSuccess
  | (IntentFailure & {
      /** 给用户看的一句原因，原样落进右栏常驻状态行。 */
      readonly reason?: string;
      /** 可选：用户还能继续往下走的动作。 */
      readonly remedy?: DesignerIntentRemedy;
    });

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
) => Promise<DesignerIntentOutcome>;
