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
