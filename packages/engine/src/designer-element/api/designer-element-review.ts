import type { DesignerReviewMeta } from '../../common/operations/change/designer-review.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/**
 * 评审态：画布只读，右栏固定为智能体页签，逐条批准/驳回。
 * 人员与角色由平台提供，引擎只做展示与状态切换。
 */
export function enterReviewMode(element: DesignerElementHost, meta: DesignerReviewMeta = {}): void {
  getDesignerElementState(element).changeController.enterReview(meta);
}

export function exitReviewMode(element: DesignerElementHost): void {
  getDesignerElementState(element).changeController.exitReview();
}

export function readReviewing(element: DesignerElementHost): boolean {
  return getDesignerElementState(element).changeController.reviewing;
}
