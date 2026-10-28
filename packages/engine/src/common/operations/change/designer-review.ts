/**
 * 评审态的人员元信息：只做展示，引擎不建模角色或权限——谁可以批准由平台决定。
 */
export interface DesignerReviewMeta {
  readonly reviewer?: string;
  readonly approver?: string;
}
