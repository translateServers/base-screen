import type { DesignerIntentHandler } from '../../common/operations/intent/designer-intent.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/**
 * 绑定/解绑意图处理器：宿主在这里接入自己的智能体（模型调用、凭证、传输都在宿主侧）。
 * 未绑定时右栏输入区停用并说明原因，不模拟回复。
 */
export function setIntentHandler(
  element: DesignerElementHost,
  handler: DesignerIntentHandler | undefined,
): void {
  getDesignerElementState(element).intentController.setHandler(handler);
}

export function readIntentAvailable(element: DesignerElementHost): boolean {
  return getDesignerElementState(element).intentController.available;
}

/**
 * 指代歧义时把候选摆到画布上请用户点选：候选一起进选区（多选即一起高亮），
 * 等选区收敛到其中一个就返回它。用户取消或按 Esc 时回到提问前的选区并返回 null，
 * 所以「问了但没选」不会留下被改动过的画布，也不留悬挂的等待。
 *
 * 歧义由平台判定，引擎不根据用户那句话去猜是哪一个。
 */
export function requestComponentChoice(
  element: DesignerElementHost,
  candidateIds: readonly string[],
  prompt: string,
): Promise<string | null> {
  return getDesignerElementState(element).intentChoiceController.begin(candidateIds, prompt);
}
