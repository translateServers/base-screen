import type { DesignerElementHost } from '../runtime/designer-element-state.js';
import { getDesignerElementState } from '../runtime/designer-element-state.js';

/**
 * 进入演示锁：只留画布。有待决草案时失败关闭（返回 false），避免把未写入的草案锁在屏上。
 * 退出走二次确认，由界面或 Esc 触发。
 */
export function enterPresentationLock(element: DesignerElementHost): boolean {
  return getDesignerElementState(element).presentationLockController.enter();
}

export function exitPresentationLock(element: DesignerElementHost): void {
  getDesignerElementState(element).presentationLockController.exit();
}

export function readPresentationLocked(element: DesignerElementHost): boolean {
  return getDesignerElementState(element).presentationLockController.locked;
}
